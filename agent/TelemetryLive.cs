namespace MustBeTheApex.Agent;

/// <summary>
/// 실시간 텔레메트리 데이터 모델
/// WebSocket으로 전달되는 핵심 데이터
/// </summary>
public class TelemetryLive
{
    public string Type => "telemetry_live";
    public long Timestamp { get; set; }
    public TelemetryData Data { get; set; } = new();
}

public class TelemetryData
{
    public int TrackId { get; set; }
    public int LapNumber { get; set; }
    public float LapDistance { get; set; }
    public int SpeedKmh { get; set; }
    public int Gear { get; set; }
    public float Throttle { get; set; }   // 0.0 ~ 1.0
    public float Brake { get; set; }      // 0.0 ~ 1.0
    public float Steer { get; set; }      // -1.0 ~ 1.0
    public Coordinates Coordinates { get; set; } = new();
    public int[] TyreTemperature { get; set; } = new int[4];
}

public class Coordinates
{
    public float X { get; set; }
    public float Y { get; set; }
    public float Z { get; set; }
}