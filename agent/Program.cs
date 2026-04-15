using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace MustBeTheApex.Agent;

public class Program
{
    public static async Task Main(string[] args)
    {
        var builder = Host.CreateApplicationBuilder(args);

        // appsettings.json 로드
        builder.Configuration.AddJsonFile("appsettings.json", optional: false, reloadOnChange: true);

        // Worker 서비스 등록 (설정 주입)
        builder.Services.AddHostedService<Worker>();

        var host = builder.Build();

        Console.WriteLine("╔═══════════════════════════════════════════╗");
        Console.WriteLine("║   Must Be The Apex - F1 25 Agent          ║");
        Console.WriteLine("║   데이터 수집 파이프라인 v1.0              ║");
        Console.WriteLine("╚═══════════════════════════════════════════╝");

        await host.RunAsync();
    }
}
