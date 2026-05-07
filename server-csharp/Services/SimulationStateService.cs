using System.Text.Json;
using SkyStrike.Simulation.Models;
using MongoDB.Bson;
using MongoDB.Driver;

namespace SkyStrike.Simulation.Services;

public sealed class SimulationStateService
{
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly object _lock = new();
    private IMongoCollection<BsonDocument>? _snapshotCollection;
    private SimulationSnapshot _state = new();
    private List<Force> _baseForces = [];
    private List<ShipUnit> _baseShips = [];
    private List<AircraftUnit> _baseAircraft = [];
    private List<Scenario> _scenarios = [];
    private Weather _weather = new();

    public bool MongoConnected => _snapshotCollection is not null;

    public async Task InitializeAsync()
    {
        _baseForces = await ReadSeedAsync<List<Force>>("forces.json") ?? [];
        _baseShips = await ReadSeedAsync<List<ShipUnit>>("ships.json") ?? [];
        _baseAircraft = await ReadSeedAsync<List<AircraftUnit>>("aircraft.json") ?? [];
        _scenarios = await ReadSeedAsync<List<Scenario>>("scenarios.json") ?? [];
        _weather = await ReadSeedAsync<Weather>("weather.json") ?? new Weather();

        _state = BuildInitialState();
        await TryConnectMongoAsync();
        await PersistSnapshotAsync("initial");
    }

    public SimulationSnapshot GetState()
    {
        lock (_lock)
        {
            return Clone(_state);
        }
    }

    public async Task<SimulationSnapshot> StartAsync()
    {
        lock (_lock)
        {
            _state.Running = true;
        }

        await PersistSnapshotAsync("start");
        return GetState();
    }

    public async Task<SimulationSnapshot> PauseAsync()
    {
        lock (_lock)
        {
            _state.Running = false;
        }

        await PersistSnapshotAsync("pause");
        return GetState();
    }

    public async Task<SimulationSnapshot> TickAsync(TickRequest? request)
    {
        lock (_lock)
        {
            if (_state.Running)
            {
                var delta = request?.DeltaMinutes ?? 0.25;
                _state.ElapsedMinutes += delta;

                if (_state.ElapsedMinutes > 52)
                {
                    _state.ElapsedMinutes = 42;
                    _state.Forces = Clone(_baseForces);
                    _state.Ships = Clone(_baseShips);
                }

                ApplySimulationStep(_state.ElapsedMinutes);
                _state.Time = FormatMissionTime(_state.ElapsedMinutes);
            }
        }

        await PersistSnapshotAsync("tick");
        return GetState();
    }

    public async Task<SimulationSnapshot> ResetAsync()
    {
        lock (_lock)
        {
            _state = BuildInitialState();
        }

        await PersistSnapshotAsync("reset");
        return GetState();
    }

    private SimulationSnapshot BuildInitialState()
    {
        var scenario = _scenarios.FirstOrDefault();

        return new SimulationSnapshot
        {
            Time = "08:42",
            ElapsedMinutes = 42,
            Running = true,
            Speed = 2,
            Forces = Clone(_baseForces),
            Ships = Clone(_baseShips),
            Aircraft = Clone(_baseAircraft),
            Events = scenario?.Timeline ?? [],
            Weather = Clone(_weather)
        };
    }

    private void ApplySimulationStep(double elapsedMinutes)
    {
        foreach (var force in _state.Forces)
        {
            var attrition = force.Id == "blue"
                ? elapsedMinutes > 46 ? 2 : elapsedMinutes > 43 ? 1 : 0
                : elapsedMinutes > 46 ? 4 : elapsedMinutes > 43 ? 2 : 0;

            var baseline = _baseForces.FirstOrDefault(item => item.Id == force.Id)?.Strength ?? force.Strength;
            force.Strength = Math.Max(0, baseline - attrition);
        }

        foreach (var ship in _state.Ships)
        {
            var baseShip = _baseShips.FirstOrDefault(item => item.Id == ship.Id);
            if (baseShip is null) continue;

            var heading = baseShip.Heading + Math.Sin((elapsedMinutes + ship.Designation.Length) / 4) * 4;
            var radians = heading * Math.PI / 180;
            var move = (elapsedMinutes - 42) * baseShip.Speed * 0.42;

            ship.Heading = heading;
            ship.Position = new Point
            {
                X = Clamp(baseShip.Position.X + Math.Cos(radians) * move, 5, 95),
                Y = Clamp(baseShip.Position.Y + Math.Sin(radians) * move, 14, 88)
            };
        }
    }

    private async Task<T?> ReadSeedAsync<T>(string fileName)
    {
        var seedPath = Path.Combine(AppContext.BaseDirectory, "../../../../database/seed", fileName);
        await using var stream = File.OpenRead(seedPath);
        return await JsonSerializer.DeserializeAsync<T>(stream, _jsonOptions);
    }

    private async Task TryConnectMongoAsync()
    {
        var uri = Environment.GetEnvironmentVariable("MONGODB_URI") ?? "mongodb://localhost:27017";
        var dbName = Environment.GetEnvironmentVariable("MONGODB_DB") ?? "skystrike";

        try
        {
            var settings = MongoClientSettings.FromConnectionString(uri);
            settings.ServerSelectionTimeout = TimeSpan.FromMilliseconds(1500);
            var client = new MongoClient(settings);
            var database = client.GetDatabase(dbName);
            await database.RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1));
            _snapshotCollection = database.GetCollection<BsonDocument>("simulationSnapshots");
        }
        catch
        {
            _snapshotCollection = null;
        }
    }

    private async Task PersistSnapshotAsync(string reason)
    {
        if (_snapshotCollection is null) return;

        var snapshot = GetState();
        var json = JsonSerializer.Serialize(snapshot, _jsonOptions);
        var document = BsonDocument.Parse(json);
        document["reason"] = reason;
        document["createdAt"] = DateTimeOffset.UtcNow.ToString("O");
        await _snapshotCollection.InsertOneAsync(document);
    }

    private T Clone<T>(T value)
    {
        var json = JsonSerializer.Serialize(value, _jsonOptions);
        return JsonSerializer.Deserialize<T>(json, _jsonOptions)!;
    }

    private static double Clamp(double value, double min, double max)
    {
        return Math.Max(min, Math.Min(max, value));
    }

    private static string FormatMissionTime(double elapsedMinutes)
    {
        var rounded = (int)Math.Floor(elapsedMinutes);
        var hour = 8 + rounded / 60;
        var minute = rounded % 60;
        return $"{hour:00}:{minute:00}";
    }
}
