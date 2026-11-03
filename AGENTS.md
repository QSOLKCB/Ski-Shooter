# Ski-Shooter engineering rules

- Keep the runtime buildless native HTML/CSS/ES modules and WebGL/Web Audio. No NPM packages, runtime CDNs, telemetry, accounts or backend.
- Retain the Apache-2.0 project licence, immutable VANILLAJS source pins and LibreQuake asset licence/credits. Never present third-party assets as original work.
- Keep game-specific terrain, physics, fiction and layout outside the vendored framework. A vendor update requires explicit provenance and relevant regression checks.
- Simulation is fixed at 120 Hz with bounded catch-up. Preserve pause/focus cancellation and deliberate resume. The world uses SI units, +Y up and -Z forward.
- Run `node --test tests/*.test.mjs`, `python3 scripts/verify.py`, and `python3 scripts/build.py`. CI also exercises Chromium with software WebGL; that does not validate hardware performance or all browsers.
- Keep deployment allowlisted. Do not include tests, browser profiles, source MDL files, temporary preview configuration or secrets in dist/.
- The current game is a solo prototype. Do not imply multiplayer, network fairness or cross-engine bit-exact determinism.
- Submit changes through PRs. Do not merge or publish releases without owner authorization.
