using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace MustBeTheApex.Agent;

/// <summary>
/// 텔레메트리 데이터를 파일로 저장하는 클래스
/// JSON/CSV 형식 지원, Rolling file 로그
/// </summary>
public class TelemetryFileWriter : IDisposable
{
    private readonly string _basePath;
    private readonly TelemetryFormat _format;
    private readonly int _maxFileSizeMb;
    private readonly int _maxFiles;

    private readonly string _telemetryFilePath;
    private readonly string _sessionFilePath;
    private readonly string _lapFilePath;
    private readonly string _eventFilePath;

    private readonly ConcurrentQueue<string> _writeQueue = new();
    private readonly CancellationTokenSource _cts = new();
    private readonly Task _writeTask;
    private readonly object _fileLock = new();

    private long _currentFileSize;
    private int _fileIndex;
    private string _currentLapFilePath = "";
    private DateTime _currentLapStartTime;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = false,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public TelemetryFileWriter(
        string basePath,
        TelemetryFormat format = TelemetryFormat.JsonLines,
        int maxFileSizeMb = 10,
        int maxFiles = 10)
    {
        _basePath = basePath;
        _format = format;
        _maxFileSizeMb = maxFileSizeMb;
        _maxFiles = maxFiles;

        // 디렉토리 생성
        Directory.CreateDirectory(_basePath);

        // 파일 경로 설정
        var timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
        _telemetryFilePath = Path.Combine(_basePath, $"telemetry_{timestamp}");
        _sessionFilePath = Path.Combine(_basePath, $"session_{timestamp}");
        _lapFilePath = Path.Combine(_basePath, $"laps_{timestamp}");
        _eventFilePath = Path.Combine(_basePath, $"events_{timestamp}");

        // 파일 확장자
        var ext = _format switch
        {
            TelemetryFormat.JsonLines => ".jsonl",
            TelemetryFormat.Csv => ".csv",
            TelemetryFormat.JsonPretty => ".json",
            _ => ".jsonl"
        };

        _telemetryFilePath += ext;
        _sessionFilePath += ext;
        _lapFilePath += ext;
        _eventFilePath += ext;

        // CSV 헤더 작성
        if (_format == TelemetryFormat.Csv)
        {
            WriteCsvHeader();
        }

        // 백그라운드 쓰기 태스크 시작
        _writeTask = Task.Run(WriteLoop);

        Console.WriteLine($"[TelemetryFileWriter] Initialized: {_basePath}");
        Console.WriteLine($"  Format: {_format}");
        Console.WriteLine($"  Max file size: {_maxFileSizeMb}MB");
        Console.WriteLine($"  Telemetry: {_telemetryFilePath}");
    }

    // ============= Public API =============

    /// <summary>
    /// 실시간 텔레메트리 데이터 저장
    /// </summary>
    public void WriteTelemetry(TelemetryLive telemetry)
    {
        var line = FormatTelemetry(telemetry);
        _writeQueue.Enqueue(line);
        _currentFileSize += Encoding.UTF8.GetByteCount(line);
    }

    /// <summary>
    /// 세션 정보 저장
    /// </summary>
    public void WriteSession(SessionData session)
    {
        var line = FormatSession(session);
        EnqueueToFile(line, _sessionFilePath);
    }

    /// <summary>
    /// 랩 완료 이벤트 저장
    /// </summary>
    public void WriteLap(int lapNumber, uint lapTimeMs, bool isPersonalBest, bool invalidated)
    {
        var record = new LapRecord
        {
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            LapNumber = lapNumber,
            LapTimeMs = lapTimeMs,
            LapTimeFormatted = FormatLapTime(lapTimeMs),
            IsPersonalBest = isPersonalBest,
            Invalidated = invalidated
        };

        var line = FormatLapRecord(record);
        EnqueueToFile(line, _lapFilePath);
    }

    /// <summary>
    /// 일반 이벤트 저장 (플래시백, 트래픽 등)
    /// </summary>
    public void WriteEvent(string eventType, object? data = null)
    {
        var record = new EventRecord
        {
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            EventType = eventType,
            Data = data
        };

        var json = JsonSerializer.Serialize(record, JsonOptions);
        var line = _format == TelemetryFormat.JsonPretty
            ? JsonSerializer.Serialize(record, new JsonSerializerOptions { WriteIndented = true })
            : json;
        
        EnqueueToFile(line, _eventFilePath);
    }

    /// <summary>
    /// 플래시백 감지 시 호출
    /// </summary>
    public void OnFlashbackDetected(float oldLapDistance, float newLapDistance, uint currentLapTimeMs)
    {
        WriteEvent("flashback", new
        {
            OldLapDistance = oldLapDistance,
            NewLapDistance = newLapDistance,
            CurrentLapTimeMs = currentLapTimeMs,
            Note = "Lap data reset - possible flashback detected"
        });
    }

    /// <summary>
    /// 트래픽 감지 시 호출
    /// </summary>
    public void OnTrafficDetected(float lapDistance, string reason)
    {
        WriteEvent("traffic", new
        {
            LapDistance = lapDistance,
            Reason = reason
        });
    }

    // ============= Formatting =============

    private string FormatTelemetry(TelemetryLive telemetry)
    {
        return _format switch
        {
            TelemetryFormat.JsonLines => JsonSerializer.Serialize(telemetry, JsonOptions),
            TelemetryFormat.JsonPretty => JsonSerializer.Serialize(telemetry, new JsonSerializerOptions { WriteIndented = true }),
            TelemetryFormat.Csv => FormatTelemetryCsv(telemetry),
            _ => JsonSerializer.Serialize(telemetry, JsonOptions)
        };
    }

    private string FormatTelemetryCsv(TelemetryLive telemetry)
    {
        var d = telemetry.Data;
        return string.Join(",",
            telemetry.Timestamp,
            d.TrackId,
            d.LapNumber,
            d.LapDistance.ToString("F2"),
            d.SpeedKmh,
            d.Gear,
            d.Throttle.ToString("F3"),
            d.Brake.ToString("F3"),
            d.Steer.ToString("F3"),
            d.Coordinates.X.ToString("F4"),
            d.Coordinates.Y.ToString("F4"),
            d.Coordinates.Z.ToString("F4"),
            d.TyreTemperature[0],
            d.TyreTemperature[1],
            d.TyreTemperature[2],
            d.TyreTemperature[3]
        );
    }

    private string FormatSession(SessionData session)
    {
        var record = new
        {
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            TrackId = session.TrackId,
            TrackLength = session.TrackLength,
            Weather = session.Weather,
            TrackTemp = session.TrackTemperature,
            AirTemp = session.AirTemperature,
            SessionType = session.SessionType.ToString(),
            SessionDurationMs = session.SessionDurationMs
        };

        return _format switch
        {
            TelemetryFormat.JsonLines => JsonSerializer.Serialize(record, JsonOptions),
            TelemetryFormat.JsonPretty => JsonSerializer.Serialize(record, new JsonSerializerOptions { WriteIndented = true }),
            TelemetryFormat.Csv => $"{record.Timestamp},{record.TrackId},{record.SessionType},{record.SessionDurationMs}",
            _ => JsonSerializer.Serialize(record, JsonOptions)
        };
    }

    private string FormatLapRecord(LapRecord record)
    {
        return _format switch
        {
            TelemetryFormat.JsonLines => JsonSerializer.Serialize(record, JsonOptions),
            TelemetryFormat.JsonPretty => JsonSerializer.Serialize(record, new JsonSerializerOptions { WriteIndented = true }),
            TelemetryFormat.Csv => $"{record.Timestamp},{record.LapNumber},{record.LapTimeMs},{record.IsPersonalBest},{record.Invalidated}",
            _ => JsonSerializer.Serialize(record, JsonOptions)
        };
    }

    private void WriteCsvHeader()
    {
        var header = "timestamp,trackId,lapNumber,lapDistance,speedKmh,gear,throttle,brake,steer,x,y,z,tyreTempFL,tyreTempFR,tyreTempRL,tyreTempRR";
        File.AppendAllText(_telemetryFilePath, header + Environment.NewLine);
        File.AppendAllText(_sessionFilePath, "timestamp,trackId,sessionType,durationMs\n");
        File.AppendAllText(_lapFilePath, "timestamp,lapNumber,lapTimeMs,isPersonalBest,invalidated\n");
    }

    // ============= Background Write Loop =============

    private async Task WriteLoop()
    {
        while (!_cts.Token.IsCancellationRequested)
        {
            try
            {
                // 큐에서 데이터 꺼내서 파일에 쓰기
                if (_writeQueue.TryDequeue(out var line))
                {
                    WriteLineToFile(line, _telemetryFilePath);
                }
                else
                {
                    // 큐가 비었으면 잠시 대기
                    await Task.Delay(10, _cts.Token);
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TelemetryFileWriter] Write error: {ex.Message}");
            }
        }

        // 종료 전 남은 큐 비우기
        while (_writeQueue.TryDequeue(out var line))
        {
            try
            {
                WriteLineToFile(line, _telemetryFilePath);
            }
            catch { /* ignore */ }
        }
    }

    private void EnqueueToFile(string line, string filePath)
    {
        _writeQueue.Enqueue(line);
        _currentFileSize += Encoding.UTF8.GetByteCount(line);

        // 롤링 체크
        CheckAndRollFile(filePath);
    }

    private void WriteLineToFile(string line, string filePath)
    {
        lock (_fileLock)
        {
            File.AppendAllText(filePath, line + Environment.NewLine);

            // 파일 크기 체크
            if (_currentFileSize > _maxFileSizeMb * 1024 * 1024)
            {
                RollFile(filePath);
            }
        }
    }

    private void CheckAndRollFile(string filePath)
    {
        if (_currentFileSize > _maxFileSizeMb * 1024 * 1024)
        {
            lock (_fileLock)
            {
                RollFile(filePath);
            }
        }
    }

    private void RollFile(string filePath)
    {
        if (!File.Exists(filePath)) return;

        _fileIndex++;
        _currentFileSize = 0;

        var dir = Path.GetDirectoryName(filePath)!;
        var name = Path.GetFileNameWithoutExtension(filePath);
        var ext = Path.GetExtension(filePath);
        var newPath = Path.Combine(dir, $"{name}_{_fileIndex:D3}{ext}");

        // 최대 파일 수 초과 시 가장 오래된 것 삭제
        var existingFiles = Directory.GetFiles(dir, $"{name}*{ext}")
            .OrderBy(f => File.GetCreationTime(f))
            .ToList();

        while (existingFiles.Count >= _maxFiles)
        {
            var oldest = existingFiles.First();
            try
            {
                File.Delete(oldest);
                Console.WriteLine($"[TelemetryFileWriter] Deleted old file: {oldest}");
            }
            catch { /* ignore */ }
            existingFiles.RemoveAt(0);
        }

        // 현재 파일 리네임
        try
        {
            File.Move(filePath, newPath);
            Console.WriteLine($"[TelemetryFileWriter] Rolled file: {newPath}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[TelemetryFileWriter] Roll failed: {ex.Message}");
        }

        // CSV 헤더 다시 작성
        if (_format == TelemetryFormat.Csv && filePath == _telemetryFilePath)
        {
            WriteCsvHeader();
        }
    }

    private static string FormatLapTime(uint ms)
    {
        var min = ms / 60000;
        var sec = (ms % 60000) / 1000;
        var mil = ms % 1000;
        return $"{min}:{sec:D2}.{mil:D3}";
    }

    // ============= IDisposable =============

    public void Dispose()
    {
        _cts.Cancel();
        _writeTask.Wait(TimeSpan.FromSeconds(5));
        _cts.Dispose();
    }
}

// ============= 데이터 레코드 =============

public class LapRecord
{
    public long Timestamp { get; set; }
    public int LapNumber { get; set; }
    public uint LapTimeMs { get; set; }
    public string? LapTimeFormatted { get; set; }
    public bool IsPersonalBest { get; set; }
    public bool Invalidated { get; set; }
}

public class EventRecord
{
    public long Timestamp { get; set; }
    public string EventType { get; set; } = "";
    public object? Data { get; set; }
}

// ============= 설정 Enum =============

public enum TelemetryFormat
{
    JsonLines,     // 한 줄에 하나씩 JSON (NDJSON)
    JsonPretty,    // 사람이 읽기 쉬운 JSON
    Csv            // CSV 형식
}
