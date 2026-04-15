using System.Net;
using System.Net.Sockets;

namespace MustBeTheApex.Agent;

/// <summary>
/// F1 25 UDP 패킷을 수신하는 클래스
/// </summary>
public class F1UdpListener : IDisposable
{
    private readonly UdpClient _udpClient;
    private bool _disposed;

    public F1UdpListener(int port)
    {
        _udpClient = new UdpClient(port);
        _udpClient.Client.ReceiveBufferSize = 64 * 1024; // 64KB 버퍼
    }

    /// <summary>
    /// UDP 패킷 수신 (blocking 없음, null 반환 시 패킷 없음)
    /// </summary>
    public byte[]? ReceivePacket()
    {
        if (_disposed) return null;

        try
        {
            if (_udpClient.Available > 0)
            {
                var endPoint = new IPEndPoint(IPAddress.Any, 0);
                var data = _udpClient.Receive(ref endPoint);
                return data;
            }
        }
        catch (SocketException)
        {
            // 패킷 없음 (정상 동작)
        }

        return null;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _udpClient.Close();
        _udpClient.Dispose();
    }
}
