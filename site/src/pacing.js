// SPDX-License-Identifier: Apache-2.0
// Game-owned frame pacing in front of the pinned VANILLAJS FixedClock (as in QSOLKCB/BLOAT-OPS
// and ARCADE). Browsers round frame timestamps (often to 0.1 ms), so a 60 Hz display reports
// 16.7, 16.6, 16.7 ms. At 120 Hz that leaves the accumulator a hair short or over, and frames
// alternate between 1, 2 and 3 simulation ticks: visible judder. A frame within half a
// millisecond of a whole number of ticks is treated as exactly that many ticks.
export const SNAP_TOLERANCE = 5e-4;
export function snapElapsed(seconds, step, tolerance = SNAP_TOLERANCE) {
  if (!Number.isFinite(seconds) || seconds <= 0) return seconds;
  const whole = Math.round(seconds / step);
  return whole >= 1 && Math.abs(seconds - whole * step) < tolerance ? whole * step : seconds;
}
