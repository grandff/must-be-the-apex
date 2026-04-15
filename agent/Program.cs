using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace MustBeTheApex.Agent;

public class Program
{
    // CLI 인자 이름
    private const string ARG_PORT = "--port";
    private const string ARG_DATA_PATH = "--data-path";

    public static async Task Main(string[] args)
    {
        // 커맨드라인 인자 파싱
        int? cliPort = null;
        string? cliDataPath = null;

        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == ARG_PORT && i + 1 < args.Length)
            {
                cliPort = int.Parse(args[i + 1]);
                i++; // 다음 인자는 이미 소비했으니 스킵
            }
            else if (args[i] == ARG_DATA_PATH && i + 1 < args.Length)
            {
                cliDataPath = args[i + 1];
                i++;
            }
        }

        var builder = Host.CreateApplicationBuilder(args);

        // 1. appsettings.json 로드 (기본값)
        builder.Configuration.AddJsonFile("appsettings.json", optional: false, reloadOnChange: true);

        // 2. CLI 인자가 있으면 appsettings 값을 덮어씁니다
        if (cliPort.HasValue)
        {
            builder.Configuration[$"Agent:UdpPort"] = cliPort.Value.ToString();
        }
        if (!string.IsNullOrEmpty(cliDataPath))
        {
            builder.Configuration[$"Agent:FileSavePath"] = cliDataPath;
        }

        // Worker 서비스 등록 (설정 주입)
        builder.Services.AddHostedService<Worker>();

        var host = builder.Build();

        Console.WriteLine("╔═══════════════════════════════════════════╗");
        Console.WriteLine("║   Must Be The Apex - F1 25 Agent          ║");
        Console.WriteLine("║   데이터 수집 파이프라인 v1.0              ║");
        Console.WriteLine("╚═══════════════════════════════════════════╝");

        // CLI 인자 표시
        if (cliPort.HasValue || !string.IsNullOrEmpty(cliDataPath))
        {
            Console.WriteLine("[CLI] 커맨드라인 인자:");
            if (cliPort.HasValue) Console.WriteLine("  UDP 포트: {0}", cliPort.Value);
            if (!string.IsNullOrEmpty(cliDataPath)) Console.WriteLine("  데이터 경로: {0}", cliDataPath);
            Console.WriteLine();
        }

        await host.RunAsync();
    }
}