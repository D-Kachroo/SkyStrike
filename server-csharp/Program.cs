using SkyStrike.Simulation.Models;
using SkyStrike.Simulation.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    options.SerializerOptions.PropertyNameCaseInsensitive = true;
});

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyHeader()
            .AllowAnyMethod()
            .AllowAnyOrigin());
});

builder.Services.AddSingleton<SimulationStateService>();

var app = builder.Build();

app.UseCors();

var simulation = app.Services.GetRequiredService<SimulationStateService>();
await simulation.InitializeAsync();

app.MapGet("/health", () => new
{
    ok = true,
    service = "skystrike-simulation",
    mongo = simulation.MongoConnected
});

app.MapGet("/api/simulation/state", (SimulationStateService service) => service.GetState());
app.MapPost("/api/simulation/start", async (SimulationStateService service) => await service.StartAsync());
app.MapPost("/api/simulation/pause", async (SimulationStateService service) => await service.PauseAsync());
app.MapPost("/api/simulation/tick", async (SimulationStateService service, HttpRequest request) =>
{
    var tick = request.ContentLength > 0
        ? await request.ReadFromJsonAsync<TickRequest>()
        : null;

    return await service.TickAsync(tick);
});
app.MapPost("/api/simulation/reset", async (SimulationStateService service) => await service.ResetAsync());

app.Run();
