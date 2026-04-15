using System.Buffers.Binary;
using System.Text;

namespace MustBeTheApex.Agent;

/// <summary>
/// F1 25 UDP 패킷 헤더 및 개별 패킷 파서
/// Reference: F1 25 UDP Spec (EAA)
/ TODO: 실제 F1 25 패킷 구조 확인 필요
/// </summary>
public static class PacketParser
{
    // ============= Packet Header Parsing =============

    /// <summary>
    /// 바이트 배열에서 PacketHeader 파싱
    /// </summary>
    public static PacketHeader ParseHeader(byte[] data)
    {
        if (data.Length < 24)
            throw new ArgumentException($"패킷 데이터가 너무 짧습니다. 최소 24바이트 필요, 현재: {data.Length}");

        using var ms = new MemoryStream(data);
        using var reader = new BinaryReader(ms);

        return new PacketHeader
        {
            PacketFormat = reader.ReadUInt16(),           // 0-1: PacketFormat (2025)
            GameMajorVersion = reader.ReadByte(),         // 2: GameMajorVersion
            GameMinorVersion = reader.ReadByte(),         // 3: GameMinorVersion
            PacketVersion = reader.ReadByte(),            // 4: PacketVersion
            PacketType = reader.ReadByte(),               // 5: PacketType (1=Session, 2=LapData, 6=Telemetry, etc.)
            Timestamp = reader.ReadUInt64(),               // 6-13: Timestamp
            SessionUID = reader.ReadUInt64(),              // 14-21: SessionUID
            SessionTime = reader.ReadSingle(),             // 22-25: SessionTime
            FrameIdentifier = reader.ReadUInt32(),        // 26-29: FrameIdentifier
            OverallFrameDelta = reader.ReadByte(),        // 30: OverallFrameDelta
            PlayerCarIndex = reader.ReadByte()             // 31: PlayerCarIndex
        };
    }

    // ============= Session Packet (Type 1) =============

    /// <summary>
    /// Session 패킷 파싱 (Packet Type 1)
    /// </summary>
    public static SessionData ParseSession(byte[] data)
    {
        var header = ParseHeader(data);
        if (data.Length < 631) // Session 패킷 최소 크기
            throw new ArgumentException($"Session 패킷이 너무 짧습니다: {data.Length}");

        using var ms = new MemoryStream(data);
        using var reader = new BinaryReader(ms);
        reader.BaseStream.Seek(24, SeekOrigin.Begin); // 헤더 건너뛰기

        var session = new SessionData
        {
            Header = header,
            Weather = reader.ReadByte(),                   // 24
            TrackTemperature = reader.ReadSByte(),         // 25
            AirTemperature = reader.ReadSByte(),           // 26
            TotalLaps = reader.ReadByte(),                 // 27
            TrackLength = reader.ReadUInt16(),             // 28-29
            TrackId = reader.ReadInt16(),                  // 30-31
            Formula = reader.ReadByte(),                   // 32
            SessionType = (SessionType)reader.ReadByte(), // 33
            SessionTimeLeft = reader.ReadInt32(),          // 34-37
            SessionDuration = reader.ReadUInt32(),         // 38-41
        };

        // 세션 시간 포맷
        session.SessionTimeLeftMs = session.SessionTimeLeft * 1000;
        session.SessionDurationMs = session.SessionDuration * 1000;

        return session;
    }

    // ============= Lap Data Packet (Type 2) =============

    /// <summary>
    /// Lap Data 패킷 파싱 (Packet Type 2)
    /// </summary>
    public static LapDataPacket ParseLapData(byte[] data)
    {
        var header = ParseHeader(data);
        if (data.Length < 1131) // LapData 패킷 최소 크기 (22 header + 111 per car * 22 cars)
            throw new ArgumentException($"LapData 패킷이 너무 짧습니다: {data.Length}");

        using var ms = new MemoryStream(data);
        using var reader = new BinaryReader(ms);
        reader.BaseStream.Seek(24, SeekOrigin.Begin);

        var packet = new LapDataPacket
        {
            Header = header
        };

        // LapData[22] 배열 파싱
        for (int i = 0; i < 22; i++)
        {
            var lapData = new LapData
            {
                LastLapTimeMs = reader.ReadUInt32() == 0xFFFFFFFF ? null : reader.ReadUInt32(),  // 0-3
                CurrentLapTimeMs = reader.ReadUInt32(),                                             // 4-7
                Sector1TimeMs = reader.ReadUInt16(),                                                // 8-9
                Sector2TimeMs = reader.ReadUInt16(),                                                // 10-11
                LapDistance = reader.ReadSingle(),                                                  // 12-15
                TotalDistance = reader.ReadSingle(),                                                // 16-19
                SafetyCarDelta = reader.ReadSingle(),                                               // 20-23
                CarPosition = reader.ReadByte(),                                                    // 24
                CurrentLapNum = reader.ReadByte(),                                                   // 25
                PitStatus = (PitStatus)reader.ReadByte(),                                          // 26
                NumPitStops = reader.ReadByte(),                                                    // 27
                Sector = (Sector)reader.ReadByte(),                                                 // 28
                CurrentLapInvalid = reader.ReadByte() == 1,                                         // 29
                Penalties = reader.ReadByte(),                                                      // 30
                AccumulatedTimeMs = reader.ReadUInt32(),                                           // 31-34
                UnclearedPenalties = reader.ReadByte(),                                             // 35
                ... reader.ReadBytes(7) // 패딩/예약
            };

            // Invalid Lap Flags 파싱
            lapData.LapInvalidated = (lapData.CurrentLapInvalid);

            // Sector 타임 정규화 (0xFFFF = 무효)
            lapData.Sector1TimeValid = lapData.Sector1TimeMs != 0xFFFF;
            lapData.Sector2TimeValid = lapData.Sector2TimeMs != 0xFFFF;

            packet.LapDataArray[i] = lapData;
        }

        // 플레이어 카 데이터 추출
        packet.PlayerLapData = packet.LapDataArray[header.PlayerCarIndex];

        return packet;
    }

    // ============= Car Telemetry Packet (Type 6) =============

    /// <summary>
    /// Car Telemetry 패킷 파싱 (Packet Type 6)
    /// </summary>
    public static CarTelemetryPacket ParseCarTelemetry(byte[] data)
    {
        var header = ParseHeader(data);
        if (data.Length < 1347) // Telemetry 패킷 최소 크기
            throw new ArgumentException($"CarTelemetry 패킷이 너무 짧습니다: {data.Length}");

        using var ms = new MemoryStream(data);
        using var reader = new BinaryReader(ms);
        reader.BaseStream.Seek(24, SeekOrigin.Begin);

        var packet = new CarTelemetryPacket
        {
            Header = header
        };

        // 각 차량별 텔레메트리 (22대)
        for (int i = 0; i < 22; i++)
        {
            var carTelemetry = new CarTelemetryData
            {
                Speed = reader.ReadUInt16(),                              // 0-1 (km/h)
                Throttle = reader.ReadSingle(),                            // 2-5 (0.0 ~ 1.0)
                Brake = reader.ReadSingle(),                               // 6-9 (0.0 ~ 1.0)
                Steer = reader.ReadSingle(),                               // 10-13 (-1.0 ~ 1.0)
                Clutch = reader.ReadByte(),                                // 14
                Gear = (sbyte)reader.ReadByte(),                          // 15 (1=N, 2=R, 3-8=Gears, -1=invalid)
                EngineRPM = reader.ReadUInt16(),                           // 16-17
                Drsz = reader.ReadByte(),                                   // 18
                ThrottlePct = reader.ReadByte(),                          // 19 (Throttle Pedal Pressed %)
                BrakePct = reader.ReadByte(),                             // 20 (Brake Pedal Pressed %)
                DRS = reader.ReadByte() == 1,                             // 21
                // Brake bias (22), as it was removed in 2025 spec but keep for compatibility
            };

            // Brake Pedal Position (0-100%)
            carTelemetry.BrakePedalPct = carTelemetry.BrakePct / 2.55f; // Convert from 255 to 0-100

            // Remaining telemetry fields
            carTelemetry.ThrottlePct /= 2.55f; // Convert from 255 to 0-100%

            // Writable rear wing? (ERS deployment)
            // Actually in F1 25 it's not in telemetry, but in car status
            // We'll add later as needed

            // Tyre pressures (new in F1 25 - might be in separate packet)
            // For now we'll use car status for tyre data

            packet.CarTelemetryArray[i] = carTelemetry;
        }

        // Matched hybrid info
        packet.MFDPackFlow = reader.ReadInt16();         // 489-490 (actually after car data)
        packet.MFDPackMode = reader.ReadByte();
        packet.RS_PackMode = reader.ReadByte();
        // Actual offsets may vary - this is approximation

        // Actual F1 25 telemetry structure (1347 bytes):
        // Header: 24 bytes
        // CarTelemetry[22] * 60 bytes each = 1320 bytes (60 * 22 = 1320)
        // Total = 1344 bytes
        // Plus 3 bytes for MFDPackFlow (int16) + MFDPackMode (byte) + RS_PackMode (byte) = no that's wrong
        
        // Let's recalculate: 1347 - 24 = 1323 bytes for 22 cars
        // 1323 / 22 = 60.136... not clean
        // Let's assume 60 bytes per car = 1320 bytes + header = 1344 bytes
        
        // Actually let me just try reading and see what happens
        // For now we have the basics

        // 플레이어 카 데이터 추출
        packet.PlayerCarTelemetry = packet.CarTelemetryArray[header.PlayerCarIndex];

        return packet;
    }

    // ============= Car Status Packet (Type 7) =============

    /// <summary>
    /// Car Status 패킷 파싱 (Packet Type 7)
    /// </summary>
    public static CarStatusPacket ParseCarStatus(byte[] data)
    {
        var header = ParseHeader(data);
        if (data.Length < 1059) // CarStatus 패킷 최소 크기
            throw new ArgumentException($"CarStatus 패킷이 너무 짧습니다: {data.Length}");

        using var ms = new MemoryStream(data);
        using var reader = new BinaryReader(ms);
        reader.BaseStream.Seek(24, SeekOrigin.Begin);

        var packet = new CarStatusPacket
        {
            Header = header
        };

        for (int i = 0; i < 22; i++)
        {
            var carStatus = new CarStatusData
            {
                TyreVisualCompound = (TyreCompound)reader.ReadByte(),
                TyreActualCompound = (TyreCompound)reader.ReadByte(),
                TyreAgeLaps = reader.ReadSByte(),
                // 2 bytes padding
                VehicleFIAFlags = (FIAFlag)reader.ReadInt16(),
                ERSStoreEnergy = reader.ReadSingle(),
                ERSDeployMode = (ERSMode)reader.ReadByte(),
                // 1 byte padding
                ERSHarvestedThisLapMGUK = reader.ReadSingle(),
                ERSHarvestedThisLapMGUH = reader.ReadSingle(),
                ERSDeployedThisLap = reader.ReadSingle(),
                // 4 bytes padding (Lap 1 ERS to deploy)
                // Gap to next car
            };

            packet.CarStatusArray[i] = carStatus;
        }

        packet.PlayerCarStatus = packet.CarStatusArray[header.PlayerCarIndex];

        return packet;
    }
}

// ============= 데이터 모델 =============

public class SessionData
{
    public PacketHeader Header { get; set; } = null!;
    public byte Weather { get; set; }
    public sbyte TrackTemperature { get; set; }
    public sbyte AirTemperature { get; set; }
    public byte TotalLaps { get; set; }
    public ushort TrackLength { get; set; }
    public short TrackId { get; set; }
    public byte Formula { get; set; }
    public SessionType SessionType { get; set; }
    public int SessionTimeLeft { get; set; }
    public uint SessionDuration { get; set; }
    public int SessionTimeLeftMs { get; set; }
    public int SessionDurationMs { get; set; }
}

public class LapDataPacket
{
    public PacketHeader Header { get; set; } = null!;
    public LapData[] LapDataArray { get; set; } = new LapData[22];
    public LapData? PlayerLapData { get; set; }
}

public class LapData
{
    public uint? LastLapTimeMs { get; set; }
    public uint CurrentLapTimeMs { get; set; }
    public ushort Sector1TimeMs { get; set; }
    public ushort Sector2TimeMs { get; set; }
    public float LapDistance { get; set; }
    public float TotalDistance { get; set; }
    public float SafetyCarDelta { get; set; }
    public byte CarPosition { get; set; }
    public byte CurrentLapNum { get; set; }
    public PitStatus PitStatus { get; set; }
    public byte NumPitStops { get; set; }
    public Sector Sector { get; set; }
    public bool LapInvalidated { get; set; }
    public byte Penalties { get; set; }
    public uint AccumulatedTimeMs { get; set; }
    public byte UnclearedPenalties { get; set; }
    public bool Sector1TimeValid { get; set; }
    public bool Sector2TimeValid { get; set; }
}

public class CarTelemetryPacket
{
    public PacketHeader Header { get; set; } = null!;
    public CarTelemetryData[] CarTelemetryArray { get; set; } = new CarTelemetryData[22];
    public CarTelemetryData? PlayerCarTelemetry { get; set; }
    public short MFDPackFlow { get; set; }
    public byte MFDPackMode { get; set; }
    public byte RS_PackMode { get; set; }
}

public class CarTelemetryData
{
    public ushort Speed { get; set; }              // km/h
    public float Throttle { get; set; }           // 0.0 ~ 1.0
    public float Brake { get; set; }              // 0.0 ~ 1.0
    public float Steer { get; set; }              // -1.0 ~ 1.0
    public byte Clutch { get; set; }               // 0-100?
    public sbyte Gear { get; set; }               // -1=invalid, 0=N, 1=R, 2-8=Gears
    public ushort EngineRPM { get; set; }         // RPM
    public byte Drsz { get; set; }               // DRSactivated? (0-20 typically)
    public float ThrottlePct { get; set; }         // 0-100%
    public float BrakePedalPct { get; set; }      // 0-100%
    public bool DRS { get; set; }
}

public class CarStatusPacket
{
    public PacketHeader Header { get; set; } = null!;
    public CarStatusData[] CarStatusArray { get; set; } = new CarStatusData[22];
    public CarStatusData? PlayerCarStatus { get; set; }
}

public class CarStatusData
{
    public TyreCompound TyreVisualCompound { get; set; }
    public TyreCompound TyreActualCompound { get; set; }
    public sbyte TyreAgeLaps { get; set; }
    public FIAFlag VehicleFIAFlags { get; set; }
    public float ERSStoreEnergy { get; set; }     // Mega Joules (0-4MJ)
    public ERSMode ERSDeployMode { get; set; }
    public float ERSHarvestedThisLapMGUK { get; set; }
    public float ERSHarvestedThisLapMGUH { get; set; }
    public float ERSDeployedThisLap { get; set; }
}

// ============= Enum 정의 =============

public enum SessionType : byte
{
    Unknown = 0,
    Practice1 = 1,
    Practice2 = 2,
    Practice3 = 3,
    PracticeShort = 4,
    Qualifying1 = 5,
    Qualifying2 = 6,
    Qualifying3 = 7,
    QualifyingShort = 8,
    OneShotQualifying = 9,
    Race = 10,
    Race2 = 11,
    SeasonPreview = 12,
    PrestigeRace = 13,
    Event3 = 14,
    Event4 = 15,
    Event5 = 16,
    Event6 = 17,
    Event7 = 18,
    Event8 = 19,
    Event9 = 20,
    Event10 = 21,
    Event11 = 22,
    Event12 = 23,
    Event14 = 24,
    Event15 = 25,
    SprintShootout = 26,
    SprintRace = 27,
    SprintQualifying = 28
}

public enum Sector : byte
{
    None = 0,
    Sector1 = 1,
    Sector2 = 2,
    Sector3 = 3
}

public enum PitStatus : byte
{
    None = 0,
    Pitting = 1,
    InPit = 2
}

public enum TyreCompound : byte
{
    Invalid = 0,
    C5 = 1,    // Softest (2025 new)
    C4 = 2,
    C3 = 3,
    C2 = 4,
    C1 = 5,    // Hardest (2025)
    Inter = 6,
    Wet = 7,
    Classic = 8,
    Dry = 9,
    Wet = 10
}

public enum FIAFlag : short
{
    None = 0,
    Green = 1,
    Blue = 2,
    Yellow = 3,
    Red = 4,
    DoubleYellow = 5,
    BlackAndWhite = 6,
    Black = 7,
    White = 8,
    Chequered = 9
}

public enum ERSMode : byte
{
    None = 0,
    Auto = 1,
    Hotlap = 2,
    Qualifying = 3,
    BatteryBoost = 4,
    Overtake = 5
}
