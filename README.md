# Ski-Shooter — UPDRAFT

**Ski the ridges. Burn for altitude. Bring the core home.**

A standalone, original browser aerial shooter built with [VANILLAJS v1.0.0](https://github.com/QSOLKCB/VANILLAJS/releases/tag/v1.0.0) and credited [LibreQuake](https://github.com/lavenderdotpet/LibreQuake) art and sound. Native HTML, CSS and JavaScript. **No NPM, install, CDN, account, telemetry or game server.**

## Play locally

```sh
python3 -m http.server 8000 --directory site
# Open http://localhost:8000
```

Use a browser with WebGL and hardware acceleration. Serve over HTTP(S); opening `index.html` with `file://` does not support the module/asset loading. Once downloaded, local play needs no internet. Hosted offline reload/service-worker support is not included.

**Raid:** clear six airborne sentries, collect the orange core across the basin, and return to the cyan landing zone. The landing zone repairs armour. **Flight school** uses the same mission, with passive sentries and no self-splash damage.

| Action | Control |
| --- | --- |
| Move / strafe | WASD |
| Ski and preserve momentum | Hold Space |
| Jet upward | Hold right mouse, Shift or E |
| Aim | Captured mouse; arrow keys or drag fallback |
| Fire a travelling disc | Left mouse or F |
| Pause and release cursor | Escape or Pause |

Release jets to recharge. Aim at the optional hollow diamond to intercept a moving target; the guide accounts for partial inheritance of your velocity. Jets provide upward thrust, not unconstrained flight. Touch buttons and drag aiming are included; competitive touch ergonomics are unverified.

The mission is session-only. Restarting or reloading resets the run. Enemy respawns, saving, CTF teams and multiplayer are not included in 0.1.

## What is implemented

- A 512 × 512 metre terrain basin, skiing, slope acceleration, air steering, energy-limited jets and speed/altitude instrumentation.
- Six moving airborne sentries with projectile attacks, full-volume projectile sweeps, terrain obstruction, splash damage, midair bonuses, self-splash impulse and an optional lead guide.
- A complete solo mission with armour, failure, core collection, return and debrief; passive-enemy training mode.
- Actual LibreQuake first-frame Enforcer and rocket-launcher meshes with original skins, concrete textures and weapon sounds. Static first frames are intentional; original skeletal/frame animation is not implemented.
- VANILLAJS fixed clocks, vector/camera math, swept AABBs/moving-target queries and the release’s retained-buffer WebGL renderer. Terrain and gameplay extensions are game-owned.
- Pause on Escape, lost focus, hidden tab and pointer-lock loss; held inputs are cancelled. Catch-up is capped, and render positions interpolate between physics ticks.
- Local Web Audio, settings for sensitivity/FOV/resolution/lead guide/reduced motion, and a visible WebGL failure message.

The physics is an arcade approximation: an upright 1 × 1.8 × 1 metre body against pylons, feet contact against a piecewise planar heightfield, capped velocity and substepped terrain motion. Decorative rocks outside the central corridor do not collide. The ground sampler uses the exact rendered triangles. Terrain projectile sweeps split at grid and triangle boundaries; targets use translating AABBs. The lead marker assumes constant target velocity, while sentry tracks curve. Splash has terrain/pylon occlusion and distance falloff; terrain contact radius is a vertical offset approximation.

## Development and verification

Python 3 and Node 22+ are used for developer checks; there are **no packages to install**. Node is not required to play or to build the static package.

```sh
node --test tests/*.test.mjs
python3 scripts/verify.py
python3 scripts/build.py
python3 -m http.server 8000 --directory dist
```

`scripts/verify.py` checks upstream hashes, regenerates first-frame model conversions byte-for-byte and checks JavaScript syntax. `scripts/build.py` copies only allowlisted runtime files and generates a SHA-256 manifest. `UPSTREAM.json` records source commits, file paths and hashes. The full originals remain in the source tree; runtime packaging excludes source MDLs and the palette.

Tests cover terrain/mesh agreement, an independent ray/triangle intersection oracle, intermediate-ridge hits, momentum, finite fuel, partial fuel exhaustion, high-speed landings, pylon collision, moving targets, projectile lifetime/capacity, inherited-velocity aiming, pause, replay, training, death and mission ordering. An input-driven pilot completes the entire training mission without teleportation or injected damage. This is an automated simulation test, not evidence of human play feel.

CI additionally runs a Chromium software-WebGL smoke test of real shaders, model/texture loading, drawing and UI controls. See [VERIFICATION.md](VERIFICATION.md) for executed checks and limits. Fixed inputs replay identically in the tested JavaScript runtime; cross-browser bit-exactness and physical GPU performance are not claimed.

## GitHub Pages

The workflow validates PRs and uploads a static site artifact. On `main` it deploys the same package to GitHub Pages. In repository Settings → Pages, select **GitHub Actions** as the source if Pages is not already configured. This is static hosting; no paid backend is needed.

## Provenance and licences

- Original game code: the repository’s **Apache-2.0** licence.
- VANILLAJS: unmodified modules at `1f965f4e5b6669de0f954e3a39b11aa679e56720` (v1.0.0), Apache-2.0, with original NOTICE.
- LibreQuake: selected assets at `347cb27eba57f1965d7c884c2bfd2857b4cde71f`, BSD-3-Clause, with full COPYING and CREDITS. Models are converted with the included standard-library-only script; the Quake/FTE engine and QuakeC game code are not included.

[In-game credits](site/credits.html) list asset use and source links. This is an original momentum/jetpack shooter; it contains no Tribes assets or game code and is not an official Tribes or LibreQuake product.

## Next useful milestones

Tune movement and visibility from real play feedback, add better enemy manoeuvres and weapon animation, then build team/CTF rules. Multiplayer needs a separately designed authoritative server, prediction/reconciliation and measured latency testing; it is not obtained merely by adding WebSockets to this solo simulation.
