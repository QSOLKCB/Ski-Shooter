# OPT / VANILLAJS rendering adaptation

Sources: [OPT at 7556dd3](https://github.com/QSOLKCB/OPT/tree/7556dd36acd53ed3ed538fd03b1db44e5c1ec869),
especially OPT-INV-001 and OPT-INC-001; and VANILLAJS's
[rendering reuse implementation](https://github.com/QSOLKCB/VANILLAJS/blob/1f965f4e5b6669de0f954e3a39b11aa679e56720/docs/OPTIMIZATION.md).
VANILLAJS remains pinned and unmodified. This is original game-owned code using
those patterns, with no new package or donor dependency. No OPT theorem proves it.

## Contract declared before measurement

| Field | Contract |
| --- | --- |
| X | Fresh arrays versus reusable typed staging, repeated versus byte-identical upload elision, continuous versus invalidated idle rendering |
| F | Native ES modules and WebGL 1; current bounded game population; no visual-detail, physics, input or asset changes |
| f / direction | Minimize CPU geometry preparation, temporary allocations, submitted bytes and redundant idle draws |
| C | Exact Float32 XYZ/RGB bits, primitive order and live vertex counts; unchanged 120 Hz simulation, aim, hits, movement and mission behavior |
| B | Two warm-up pairs and seven alternating measured pairs of 240 frames per idle, flight and maximum-population fixture; separate real Chromium conformance |
| S | Stop after the matrix. Require parity and lower deterministic redundant-work counts; report local timing observations without a noisy CI timing threshold |

Categorical local choices; deterministic work counts and noisy latency;
derivative-free measurement; moderate cost; semantic/resource constraints;
sequential execution; exact output with no approximation.

The frozen reference comes from Ski-Shooter main
`17e3604fdea879c885aed5d36ae427b59648d025`. It remains test-only. Timing covers
geometry preparation and upload-call preparation, including cold staging and
mesh construction per trial, but excludes simulation, module loading, actual
GPU work and UI. Node timings are not frame rates.

## Ownership and invalidation

Effect geometry uses cached circle samples and two reusable Float32 streams.
Arithmetic and vertex order match the original builder. Only the live prefix
is uploaded/drawn; geometric capacity growth amortizes allocation. Current game
caps (six enemies, 96 discs and 64 explosions) bound the two staging arrays to
262,144 bytes combined. Uploaded-byte snapshots add the same bound; GPU buffer
capacity has the same bound, excluding driver overhead. No historical states
are retained, and clearing renderer meshes releases GPU buffers.

Each effect mesh has one writer, separate from VANILLAJS's copying `update` API.
The uploader compares all live Float32 bits against its owned successful-upload
snapshot; camera/tick identity alone never permits reuse. Shrink, empty, colour,
life, interpolation and reduced-motion changes participate through actual output.
Failed JavaScript upload calls leave reuse invalid. Context loss remains fatal
and requires reload. This is synchronous ordinary game data, with no shared
memory, async publisher or persistent cache.

Menu and pause stop simulation already. They now retain their composited canvas
frame until resize, device-pixel-ratio change, visibility/pageshow, graphics
settings, launch, pause or debrief invalidates it. Active play still draws each
animation frame. Overlay/HUD visibility and input cancellation stay immediate.

Any parity failure blocks promotion. Keep the fresh reference and repair the
optimization rather than reducing rendering detail, dropping effects or weakening
the existing physics/mission tests. Performance evidence is scoped to the named
fixtures and execution environment, not a general FPS or hardware guarantee.

## Executed local observations

Node v24.22.1, Linux x64, AMD EPYC 9V74. Each row reports the median of seven
paired 240-frame trials after two warm-up pairs. All raw observations are in
[OPT_RENDER_LOCAL.json](OPT_RENDER_LOCAL.json). Both paths use the same fixtures;
every Float32 vertex bit is compared before measurement.

| Workload | Fresh CPU ms | Retained CPU ms | Uploaded bytes, fresh → retained |
| --- | ---: | ---: | ---: |
| Idle geometry | 39.60 | 1.74 | 4,561,920 → 19,008 |
| Input-driven flight | 50.15 | 1.85 | 4,949,904 → 4,949,904 |
| 96 discs + 64 explosions | 512.38 | 14.43 | 45,453,312 → 45,453,312 |

Moving effects still upload their changed vertices: the active-play gain is
less CPU construction/copying, not reduced detail or a lower simulation rate.
Geometric growth trades retained capacity for fewer reallocations: maximum-effect
GPU capacity is 262,144 versus 189,504 bytes in the reference API model. These are
requested buffer sizes, not driver-memory measurements; process heap/RSS was not
measured. The idle application separately skips scene/overlay rendering entirely
after its first frame until invalidation, while keeping the animation callback
alive for lifecycle and display-density checks.

Run `node scripts/bench-render.mjs` to reproduce paired observations and emit
`artifacts/opt-render.json`. CI retains that report alongside real Chromium
framebuffer comparisons, GL-error checks, idle/settings/pause checks and screenshots.
Exact parity and work-count assertions are gates; timing values are observations.
Physical-GPU FPS, human play feel and other browser engines remain unmeasured.
