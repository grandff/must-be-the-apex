using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MustBeTheApex.Agent;

/// <summary>
/// F1 25 UDP 패킷을 수신하고 WebSocket + 파일로 전달하는 백그라운드 서비스
/// </summary>
public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly F1UdpListener _udpListener;
    private readonly WebSocketClient _webSocketClient;
    private readonly TelemetryFileWriter _fileWriter;

    // 설정값
    private readonly int _udpPort;
    private readonly string _webSocketUrl;
    private readonly int _sampleRateHz;
    private readonly int _sampleIntervalMs;
    private readonly bool _saveToFile;
    private readonly string _fileSavePath;

    // 상태
    private readonly ConcurrentDictionary<string, object?> _sessionState = new();
    private TelemetryLive? _lastTelemetry;
    private DateTime _lastSampleTime = DateTime.MinValue;
    private uint _lastLapTimeMs;
    private float _lastLapDistance;
    private uint _bestLapTimeMs = 0xFFFFFFFF;
    private int _currentLap = 1;
    private bool _isFlashbackRecovery = false;

    // 플래시백 감지: lapDistance가 급격히 줄어드는 것
    private const float FLASHBACK_THRESHOLD_METERS = 100f;

    public Worker(ILogger<Worker> logger, IConfiguration configuration)
    {
        _logger = logger;

        // 설정 로드
        _udpPort = configuration.GetValue<int>("Agent:UdpPort", F1Constants.DEFAULT_UDP_PORT);
        _webSocketUrl = configuration.GetValue<string>("Agent:WebSocketUrl") ?? "ws://localhost:3000/ws";
        _sampleRateHz = configuration.GetValue<int>("Agent:TelemetrySampleRateHz", 10);
        _sampleIntervalMs = 1000 / _sampleRateHz; // 10Hz = 100ms
        _saveToFile = configuration.GetValue<bool>("Agent:SaveToFile", true);
        _fileSavePath = configuration.GetValue<string>("Agent:FileSavePath") ?? "./telemetry_data";

        _udpListener = new F1UdpListener(_udpPort);
        _webSocketClient = new WebSocketClient(_webSocketUrl);
        _fileWriter = new TelemetryFileWriter(_fileSavePath);

        _logger.LogInformation("=== MustBeTheApex Agent 설정 ===");
        _logger.LogInformation("  UDP 포트: {Port}", _udpPort);
        _logger.LogInformation("  WebSocket 서버: {Url}", _webSocketUrl);
        _logger.LogInformation("  샘플레이트: {Rate}Hz ({Interval}ms)", _sampleRateHz, _sampleIntervalMs);
        _logger.LogInformation("  파일 저장: {Enabled} ({Path})", _saveToFile, _fileSavePath);
        _logger.LogInformation("================================");
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("MustBeTheApex Agent 시작됨. UDP 포트: {Port}", _udpPort);

        // WebSocket 연결 시도 (재연결 로직 포함)
        await ConnectWebSocketWithRetryAsync(stoppingToken);

        // 메인 루프
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var packetData = _udpListener.ReceivePacket();

                if (packetData != null && packetData.Length > 0)
                {
                    ProcessPacket(packetData);
                }

                await Task.Delay(_sampleIntervalMs, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "패킷 처리 중 오류 발생");
            }
        }
    }

    private async Task ConnectWebSocketWithRetryAsync(CancellationToken stoppingToken)
    {
        var retryCount = 0;
        const int maxRetries = 100; // 계속 재연결 시도
        const int retryDelayMs = 2000;

        while (!stoppingToken.IsCancellationRequested && retryCount < maxRetries)
        {
            try
            {
                await _webSocketClient.ConnectAsync(stoppingToken);
                _logger.LogInformation("WebSocket 서버에 연결됨: {Url}", _webSocketUrl);
                
                // 연결 성공 시 세션 시작 알림
                await SendSessionStartAsync(stoppingToken);
                return;
            }
            catch (Exception ex)
            {
                retryCount++;
                _logger.LogWarning("WebSocket 연결 실패 ({Retry}/{MaxRetries}): {Message}",
                    retryCount, maxRetries, ex.Message);

                if (retryCount < maxRetries)
                {
                    await Task.Delay(retryDelayMs, stoppingToken);
                }
            }
        }

        _logger.LogWarning("WebSocket 서버 연결 실패. UDP 수신 + 파일 저장만 계속합니다.");
    }

    private async Task SendSessionStartAsync(CancellationToken stoppingToken)
    {
        try
        {
            var sessionStart = new
            {
                type = "session_start",
                data = new
                {
                    agentVersion = "1.0.0",
                    trackId = _sessionState.TryGetValue("trackId", out var t) ? t : 0,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                }
            };

            var json = JsonSerializer.Serialize(sessionStart);
            await _webSocketClient.SendAsync(json, stoppingToken);
            _logger.LogInformation("세션 시작 알림 전송됨");
        }
        catch (Exception ex)
        {
            _logger.LogWarning("세션 시작 알림 전송 실패: {Message}", ex.Message);
        }
    }

    private void ProcessPacket(byte[] data)
    {
        if (data.Length < 24) return;

        try
        {
            var header = PacketParser.ParseHeader(data);
            var packetType = header.PacketType;

            switch (packetType)
            {
                case F1Constants.PACKET_ID_SESSION:
                    ProcessSession(data);
                    break;
                case F1Constants.PACKET_ID_LAP_DATA:
                    ProcessLapData(data);
                    break;
                case F1Constants.PACKET_ID_CAR_TELEMETRY:
                    ProcessCarTelemetry(data);
                    break;
                case F1Constants.PACKET_ID_CAR_STATUS:
                    // Car Status는 나중에 필요시
                    break;
                default:
                    // 다른 패킷은 무시
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug("패킷 파싱 실패: {Message}", ex.Message);
        }
    }

    private void ProcessSession(byte[] data)
    {
        try
        {
            var session = PacketParser.ParseSession(data);
            _sessionState["trackId"] = session.TrackId;
            _sessionState["trackLength"] = session.TrackLength;
            _sessionState["sessionType"] = session.SessionType;

            // 파일에 저장
            _fileWriter.WriteSession(session);

            _logger.LogInformation(
                "세션 수신: Track={TrackId}, Type={SessionType}, Duration={Duration}ms",
                session.TrackId, session.SessionType, session.SessionDurationMs);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Session 파싱 오류: {Message}", ex.Message);
        }
    }

    private void ProcessLapData(byte[] data)
    {
        try
        {
            var lapDataPacket = PacketParser.ParseLapData(data);
            var playerLap = lapDataPacket.PlayerLapData;
            if (playerLap == null) return;

            // 플래시백 감지
            CheckFlashback(playerLap);

            // 랩 완료 감지
            CheckLapCompletion(playerLap);

            // 현재 랩 정보 저장
            _lastLapTimeMs = playerLap.CurrentLapTimeMs;
            _lastLapDistance = playerLap.LapDistance;
        }
        catch (Exception ex)
        {
            _logger.LogDebug("LapData 파싱 오류: {Message}", ex.Message);
        }
    }

    private void ProcessCarTelemetry(byte[] data)
    {
        try
        {
            var telemetryPacket = PacketParser.ParseCarTelemetry(data);
            var playerTelemetry = telemetryPacket.PlayerCarTelemetry;
            if (playerTelemetry == null) return;

            // 10Hz 샘플링
            var now = DateTime.UtcNow;
            if ((now - _lastSampleTime).TotalMilliseconds < _sampleIntervalMs)
            {
                return;
            }
            _lastSampleTime = now;

            // TelemetryLive 구성
            var telemetry = new TelemetryLive
            {
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Data = new TelemetryData
                {
                    TrackId = _sessionState.TryGetValue("trackId", out var t) ? (int)(t ?? 0) : 0,
                    LapNumber = _currentLap,
                    LapDistance = _lastLapDistance,
                    SpeedKmh = playerTelemetry.Speed,
                    Gear = playerTelemetry.Gear,
                    Throttle = playerTelemetry.Throttle,
                    Brake = playerTelemetry.Brake,
                    Steer = playerTelemetry.Steer,
                    // 좌표는 LapData에서 가져와야 하지만 일단 0
                    Coordinates = new Coordinates { X = 0, Y = 0, Z = 0 },
                    TyreTemperature = new[] { 0, 0, 0, 0 } // CarStatus에서 가져옴
                }
            };

            _lastTelemetry = telemetry;

            // WebSocket 전송
            _ = SendTelemetryAsync(telemetry);

            // 파일 저장
            if (_saveToFile)
            {
                _fileWriter.WriteTelemetry(telemetry);
            }

            // 로그 (1초에 한 번)
            if (now.Second != (now - TimeSpan.FromMilliseconds(_sampleIntervalMs)).Second)
            {
                _logger.LogDebug(
                    "Speed={Speed}km/h Gear={Gear} T={Throttle:F0}% B={Brake:F0}% Dist={Distance}m",
                    telemetry.Data.SpeedKmh,
                    telemetry.Data.Gear,
                    telemetry.Data.Throttle * 100,
                    telemetry.Data.Brake * 100,
                    telemetry.Data.LapDistance);
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug("CarTelemetry 파싱 오류: {Message}", ex.Message);
        }
    }

    private async Task SendTelemetryAsync(TelemetryLive telemetry)
    {
        try
        {
            await _webSocketClient.SendTelemetryAsync(telemetry);
        }
        catch (Exception ex)
        {
            _logger.LogDebug("WebSocket 전송 실패: {Message}", ex.Message);
        }
    }

    private void CheckFlashback(LapData playerLap)
    {
        // lapDistance가 이전보다 100m 이상 줄어들면 플래시백으로 판단
        if (_lastLapDistance > 0 && playerLap.LapDistance < _lastLapDistance - FLASHBACK_THRESHOLD_METERS)
        {
            _isFlashbackRecovery = true;
            _logger.LogWarning(
                "⚠️ 플래시백 감지! Distance {Old} -> {New}",
                _lastLapDistance, playerLap.LapDistance);

            _fileWriter.OnFlashbackDetected(_lastLapDistance, playerLap.LapDistance, playerLap.CurrentLapTimeMs);

            // 새 랩 카운트 시작
            _currentLap = playerLap.CurrentLapNum;

            // 플래시백 Recovery flag는 다음 샘플에서クリア
            Task.Delay(2000).ContinueWith(_ => _isFlashbackRecovery = false);
        }
    }

    private void CheckLapCompletion(LapData playerLap)
    {
        // 이전 Distance가 더 컸고, 현재 Distance가 작으면 랩 완료
        // + trackLength 이상이면 한 바퀴 완료
        if (_sessionState.TryGetValue("trackLength", out var trackLengthObj) && trackLengthObj != null)
        {
            var trackLength = (ushort)trackLengthObj;

            // 방법 1: LapNumber가 증가했는지 확인
            if (playerLap.CurrentLapNum > _currentLap)
            {
                var completedLap = _currentLap;
                var lapTime = playerLap.CurrentLapTimeMs; // 새 랩의 CurrentLapTime은 바로 이전 랩 시간

                // 베스트 랩 체크
                var isPersonalBest = lapTime < _bestLapTimeMs;
                if (isPersonalBest)
                {
                    _bestLapTimeMs = lapTime;
                }

                // 랩 완료 이벤트
                _fileWriter.WriteLap(completedLap, lapTime, isPersonalBest, playerLap.LapInvalidated);

                _logger.LogInformation(
                    "🏁 Lap {Lap} 완료: {Time}{Best}",
                    completedLap,
                    FormatLapTime(lapTime),
                    isPersonalBest ? " (NEW BEST!)" : "");

                // 새 랩 시작
                _currentLap = playerLap.CurrentLapNum;

                // WebSocket으로 랩 완료 이벤트 전송
                _ = SendLapCompletedEvent(completedLap, lapTime, isPersonalBest);
            }
        }
    }

    private async Task SendLapCompletedEvent(int lapNumber, uint lapTimeMs, bool isPersonalBest)
    {
        try
        {
            var lapEvent = new
            {
                type = "lap_completed",
                data = new
                {
                    lapNumber,
                    lapTimeMs,
                    lapTimeFormatted = FormatLapTime(lapTimeMs),
                    isPersonalBest,
                    bestLapTimeMs = _bestLapTimeMs,
                    bestLapTimeFormatted = _bestLapTimeMs != 0xFFFFFFFF ? FormatLapTime(_bestLapTimeMs) : null
                }
            };

            var json = JsonSerializer.Serialize(lapEvent);
            await _webSocketClient.SendAsync(json, CancellationToken.None);
        }
        catch { /* ignore */ }
    }

    private static string FormatLapTime(uint ms)
    {
        var min = ms / 60000;
        var sec = (ms % 60000) / 1000;
        var mil = ms % 1000;
        return $"{min}:{sec:D2}.{mil:D3}";
    }

    public override async Task StopAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("MustBeTheApex Agent 종료 중...");
        _udpListener.Dispose();
        _webSocketClient.Dispose();
        _fileWriter.Dispose();
        await base.StopAsync(stoppingToken);
    }
}
