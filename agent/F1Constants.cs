namespace MustBeTheApex.Agent;

/// <summary>
/// F1 25 UDP 패킷 파싱을 위한 상수 및 구조체 정의
/// </summary>
public static class F1Constants
{
    // F1 25 UDP 포트 (기본값)
    public const int DEFAULT_UDP_PORT = 20777;

    // 타겟 패킷 ID들
    public const byte PACKET_ID_SESSION = 1;
    public const byte PACKET_ID_LAP_DATA = 2;
    public const byte PACKET_ID_CAR_TELEMETRY = 6;
    public const byte PACKET_ID_CAR_STATUS = 7;

    // 샘플링 레이트
    public const int TELEMETRY_SAMPLE_RATE_HZ = 10; // 10Hz
    public const int TELEMETRY_INTERVAL_MS = 100;    // 100ms interval
}