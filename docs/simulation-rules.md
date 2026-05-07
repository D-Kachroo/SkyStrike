# Simulation Rules

SkyStrike currently uses deterministic seeded behavior designed for a polished first playable dashboard.

## Time

- Scenario time starts at `08:42` in the frontend to match the target dashboard state.
- The C# simulation state starts at `08:42`.
- The frontend loops the visual scenario from minute 42 to minute 52 so engagements continue to appear during demos.
- Speed multipliers affect frontend animation progression.

## Movement

- Ships move slowly from seeded positions using heading, speed, and a small lateral drift.
- Ships turn gradually with sinusoidal heading variation.
- Aircraft follow cubic Bezier paths created from seeded waypoints.
- Aircraft move faster than ships and leave faint contrails.

## Sensors And Overlays

- Friendly ships emit pulsing radar rings.
- Range rings can be toggled independently.
- Enemy ships project red threat zones.
- All major ships project translucent targeting cones.
- Waypoint paths use force-colored dashed curves.

## Events

The event timeline is seeded in `database/seed/scenarios.json`.

Initial events:

- `08:12` F-35C launched from CVN-91
- `08:15` E-7 Wedgetail airborne
- `08:21` Contact! Enemy aircraft detected
- `08:24` MQ-25 locked on target
- `08:31` Missile launched from CG-72
- `08:38` Enemy aircraft responding
- `08:41` F-35C engaging targets

Later events are included so the live log continues updating after load.

## Attrition

Strength bars decrease slightly after engagement milestones:

- After `08:43`, Blue loses 1 point and Red loses 2 points.
- After `08:46`, Blue loses 2 total points and Red loses 4 total points.

These rules are mirrored in the frontend visual model and C# simulation service.
