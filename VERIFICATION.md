# Verification — UPDRAFT 0.1

## Executed locally

- 32 Node tests passed, including the independent ray/triangle terrain oracle and an input-driven completion of the full flight-school mission. The pilot does not teleport the player, kill targets directly, refill fuel or bypass the mission state machine.
- Input regressions execute the real entrypoint handlers with a small DOM boundary and model Pointer Events' first-button/last-button transitions. They cover all LMB/RMB press/release orders, short clicks while jetting, input cancellation and the pointer-lock capture click. Physics regressions reproduce a grounded downward disc shot in training and raid, then verify lift-off, continued airborne motion and the existing self-damage/fuel behavior. The affected cases failed before the fixes and pass afterward.
- Upstream file SHA-256 and Git blob identities verified. Both model/skin conversions regenerate byte-for-byte with Python’s standard library.
- JavaScript syntax checks passed. The static build uses a fixed allowlist and emits a SHA-256/size manifest.
- Optimized effect streams match every Float32 bit of the frozen reference across 720 idle, flight and maximum-population frames. Upload tests cover unchanged values, signed zero, growth/shrink, empty/restart and injected failure; entrypoint tests cover idle graphics/viewport/density/lifecycle invalidation. Seven paired CPU observations per workload are retained in [the optimization report](docs/OPTIMIZATION.md).
- The managed preview browser was opened, but it cannot create a WebGL context. The game’s visible unsupported-graphics message appeared; visual rendering and hardware play feel could not be checked in that environment.

## Controller, pacing, persistence and simulation broadphase (this upgrade)

- 40 Node tests pass (8 new). The real entrypoint runs with a mock standard
  gamepad. A pad held at launch is ignored until neutral. Sticks steer and look;
  A/LB ski and LT/RB jet. A trigger tap released before the next tick fires exactly
  one disc. Start pauses and resumes only on fresh presses, and a trigger held
  through a pause does not fire after resume.
- With frame snapping, rounded 60 Hz timestamps produce exactly two 120 Hz ticks
  on all 3,600 frames; without it, more than 100 frames are uneven.
- Settings survive a reload through a mock store, and a finished run records
  validated personal bests. Corrupt or out-of-range stored values fall back to
  defaults.
- The broadphase equivalence tests and the full-state A/B parity run are
  described in [the optimization notes](docs/OPTIMIZATION.md#simulation-broadphase-exact).
- Executed locally in Chromium (pre-installed, SwiftShader WebGL):
  - `scripts/browser_smoke.py` passed in full.
  - A separate mocked-controller session confirmed that the first D-pad press
    focuses Start raid and A launches it. Stick plus A skis to 52 km/h, LT jets,
    an RT tap fires, and Start pauses then resumes, with no page errors.
- A physical controller was not available; real hardware feel remains unverified.

## CI coverage

The workflow repeats the simulation, source and packaging checks. Its Chromium check uses explicitly selected **SwiftShader software WebGL**, loads the actual LibreQuake meshes/textures, checks for GL errors and varied framebuffer pixels, and exercises launch, flight school, pause, focus loss and narrow layout. It retains the assertion result, browser stderr, screenshot and package manifest as `ski-shooter-verification`.

The OPT upgrade adds fresh-versus-retained framebuffer equality across idle,
flight and maximum-effect fixtures, zero-upload checks for unchanged geometry,
and native idle/settings/pause redraw assertions. CI also retains paired CPU
timings and work counts; consult the PR's current-head result for execution status.

The first [CI verification run](https://github.com/QSOLKCB/Ski-Shooter/actions/runs/41561720656) passed on source `a20438310bd91abdd354d0baefcc946c34c5a244`, including all 18 tests, source/derived-asset checks, packaging, and all 13 rendering/UI assertions. Its menu screenshot was inspected. The terrain-following landing-zone markers and flight screenshot capture were added after that run; consult the PR’s current-head checks for the final revision.

Physical GPU performance, Firefox/Safari, real touchscreen ergonomics, real pointer-lock aim feel and human play balance remain unverified. This is a solo prototype; no networking or multiplayer latency tests exist.

## Limits

- Terrain and pylon collision are arcade approximations documented in README.
- Replay tests apply to the tested JavaScript runtime, not bit-identical execution across browsers or architectures.
- A static first-frame model is used for each enemy and the view weapon. Movement, jets and weapon recoil supply motion; full original model animation is not implemented.
- No benchmark or guaranteed frame-rate claim is made.
