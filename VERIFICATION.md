# Verification — UPDRAFT 0.1

## Executed locally

- 18 Node tests passed, including the independent ray/triangle terrain oracle and an input-driven completion of the full flight-school mission. The pilot does not teleport the player, kill targets directly, refill fuel or bypass the mission state machine.
- Upstream file SHA-256 and Git blob identities verified. Both model/skin conversions regenerate byte-for-byte with Python’s standard library.
- JavaScript syntax checks passed. The static build uses a fixed allowlist and emits a SHA-256/size manifest.
- The managed preview browser was opened, but it cannot create a WebGL context. The game’s visible unsupported-graphics message appeared; visual rendering and hardware play feel could not be checked in that environment.

## CI coverage

The workflow repeats the simulation, source and packaging checks. Its Chromium check uses explicitly selected **SwiftShader software WebGL**, loads the actual LibreQuake meshes/textures, checks for GL errors and varied framebuffer pixels, and exercises launch, flight school, pause, focus loss and narrow layout. It retains the assertion result, browser stderr, screenshot and package manifest as `ski-shooter-verification`.

The workflow’s actual conclusion is authoritative. See the PR checks for this revision’s result; a configured check is not itself evidence that it passed. Physical GPU performance, Firefox/Safari, real touchscreen ergonomics, real pointer-lock aim feel and human play balance remain unverified. This is a solo prototype; no networking or multiplayer latency tests exist.

## Limits

- Terrain and pylon collision are arcade approximations documented in README.
- Replay tests apply to the tested JavaScript runtime, not bit-identical execution across browsers or architectures.
- A static first-frame model is used for each enemy and the view weapon. Movement, jets and weapon recoil supply motion; full original model animation is not implemented.
- No benchmark or guaranteed frame-rate claim is made.
