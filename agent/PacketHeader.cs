namespace MustBeTheApex.Agent;

/// <summary>
/// UDP 패킷 헤더 구조체
/// F1 25 UDP 패킷의 공통 헤더 파싱용
/// </summary>
public struct PacketHeader
{
    public ushort PacketFormat;      // 2024
    public byte GameMajorVersion;     // 게임 메이저 버전
    public byte GameMinorVersion;     // 게임 마이너 버전
    public byte PacketVersion;        // 패킷 버전
    public byte PacketType;           // 패킷 ID (1=Session, 2=LapData, 6=Telemetry, 7=CarStatus)
    public ulong Timestamp;           // timestamp
    public ulong SessionUID;          // 세션 고유 ID
    public float SessionTime;         // 세션 시간
    public uint FrameIdentifier;      // 프레임 ID
    public byte OverallFrameDelta;    // 프레임 델타
    public byte PlayerCarIndex;       // 내 차량 인덱스
}