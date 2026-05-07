namespace SkyStrike.Simulation.Models;

public sealed record TickRequest(double? DeltaMinutes);

public sealed class UnitSummary
{
    public string Id { get; set; } = "";
    public string Designation { get; set; } = "";
    public string? Type { get; set; }
    public int? Quantity { get; set; }
}

public sealed class Force
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string TaskForce { get; set; } = "";
    public string Affiliation { get; set; } = "";
    public string Color { get; set; } = "";
    public string Accent { get; set; } = "";
    public int Strength { get; set; }
    public List<UnitSummary> Ships { get; set; } = [];
    public List<UnitSummary> AirWing { get; set; } = [];
}

public sealed class Point
{
    public double X { get; set; }
    public double Y { get; set; }
}

public sealed class ShipUnit
{
    public string Id { get; set; } = "";
    public string Force { get; set; } = "";
    public string Designation { get; set; } = "";
    public string Name { get; set; } = "";
    public string Type { get; set; } = "";
    public string ClassName { get; set; } = "";
    public Point Position { get; set; } = new();
    public double Heading { get; set; }
    public double Speed { get; set; }
    public double RadarRange { get; set; }
    public double ThreatRange { get; set; }
    public int Health { get; set; }
}

public sealed class AircraftUnit
{
    public string Id { get; set; } = "";
    public string Force { get; set; } = "";
    public string Callsign { get; set; } = "";
    public string Model { get; set; } = "";
    public string Role { get; set; } = "";
    public int Quantity { get; set; }
    public double Speed { get; set; }
    public int Altitude { get; set; }
    public Point Position { get; set; } = new();
    public List<Point> Path { get; set; } = [];
}

public sealed class ScenarioEvent
{
    public string Time { get; set; } = "";
    public string Kind { get; set; } = "";
    public string Force { get; set; } = "";
    public string Message { get; set; } = "";
}

public sealed class Weather
{
    public string Condition { get; set; } = "";
    public int WindKts { get; set; }
    public string Visibility { get; set; } = "";
    public string SeaState { get; set; } = "";
    public int CloudBaseFt { get; set; }
    public int PressureMb { get; set; }
    public string Precipitation { get; set; } = "";
    public string UpdatedAt { get; set; } = "";
}

public sealed class ScenarioIsland
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public double X { get; set; }
    public double Y { get; set; }
    public double Scale { get; set; }
    public double Rotation { get; set; }
}

public sealed class ScenarioMap
{
    public double Width { get; set; }
    public double Height { get; set; }
    public Point Center { get; set; } = new();
    public List<ScenarioIsland> Islands { get; set; } = [];
}

public sealed class Scenario
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string StartTime { get; set; } = "";
    public int DurationMinutes { get; set; }
    public ScenarioMap Map { get; set; } = new();
    public List<ScenarioEvent> Timeline { get; set; } = [];
}

public sealed class SimulationSnapshot
{
    public string Time { get; set; } = "08:42";
    public double ElapsedMinutes { get; set; } = 42;
    public bool Running { get; set; } = true;
    public int Speed { get; set; } = 2;
    public List<Force> Forces { get; set; } = [];
    public List<ShipUnit> Ships { get; set; } = [];
    public List<AircraftUnit> Aircraft { get; set; } = [];
    public List<ScenarioEvent> Events { get; set; } = [];
    public Weather Weather { get; set; } = new();
}
