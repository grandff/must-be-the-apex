using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace MustBeTheApex.Agent;

/// <summary>
/// WebSocket 클라이언트 (Remix 서버로 텔레메트리 전송)
/// 자동 재연결 기능 포함
/// </summary>
public class WebSocketClient : IDisposable
{
    private ClientWebSocket? _webSocket;
    private readonly string _serverUrl;
    private bool _disposed;
    private readonly object _lock = new();
    private bool _isConnected;
    private readonly ILogger<WebSocketClient>? _logger;

    public WebSocketClient(string serverUrl, ILogger<WebSocketClient>? logger = null)
    {
        _serverUrl = serverUrl;
        _logger = logger;
    }

    public bool IsConnected => _isConnected && _webSocket?.State == WebSocketState.Open;

    public async Task ConnectAsync(CancellationToken cancellationToken)
    {
        lock (_lock)
        {
            if (_disposed) return;
            _webSocket?.Dispose();
            _webSocket = new ClientWebSocket();
        }

        await _webSocket!.ConnectAsync(new Uri(_serverUrl), cancellationToken);
        _isConnected = true;
    }

    public async Task SendAsync(string message, CancellationToken cancellationToken)
    {
        if (!IsConnected)
        {
            throw new InvalidOperationException("WebSocket이 연결되어 있지 않습니다.");
        }

        try
        {
            var bytes = Encoding.UTF8.GetBytes(message);
            var segment = new ArraySegment<byte>(bytes);
            await _webSocket!.SendAsync(segment, WebSocketMessageType.Text, true, cancellationToken);
        }
        catch (SocketException ex)
        {
            _isConnected = false;
            _logger?.LogWarning("WebSocket 전송 실패 (연결 끊김): {Message}", ex.Message);
            throw;
        }
    }

    public async Task SendTelemetryAsync(TelemetryLive telemetry, CancellationToken cancellationToken)
    {
        var json = JsonSerializer.Serialize(telemetry, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });
        await SendAsync(json, cancellationToken);
    }

    /// <summary>
    /// WebSocket 연결 상태 확인 및 자동 재연결
    /// </summary>
    public async Task<bool> EnsureConnectedAsync(CancellationToken cancellationToken)
    {
        if (IsConnected) return true;

        try
        {
            await ConnectAsync(cancellationToken);
            return true;
        }
        catch (Exception ex)
        {
            _logger?.LogWarning("WebSocket 재연결 실패: {Message}", ex.Message);
            _isConnected = false;
            return false;
        }
    }

    public void Disconnect()
    {
        _isConnected = false;
        lock (_lock)
        {
            _webSocket?.Dispose();
            _webSocket = null;
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _isConnected = false;
        lock (_lock)
        {
            _webSocket?.Dispose();
            _webSocket = null;
        }
    }
}
