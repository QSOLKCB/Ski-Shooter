// SPDX-License-Identifier: Apache-2.0
// Game-owned frame pacing in front of the pinned VANILLAJS FixedClock (as in QSOLKCB/BLOAT-OPS
// and ARCADE). Browsers round frame timestamps (often to 0.1 ms), so a 60 Hz display reports
// 16.7, 16.6, 16.7 ms. At 120 Hz that leaves the accumulator a hair short or over, and frames
// alternate between 1, 2 and 3 simulation ticks: visible judder. A frame close to a whole number
// of ticks is treated as exactly that many ticks, but the time removed or added is carried as
// drift: a frame is only snapped while the total drift stays within the tolerance, and the
// next unsnapped frame pays it back. Simulation time therefore never runs ahead of or behind
// wall time by more than the tolerance, even at a steady 125 Hz or 61 Hz display.
export const SNAP_TOLERANCE = 5e-4;
export class FrameSnapper {
  constructor(step, tolerance = SNAP_TOLERANCE) { this.step = step; this.tolerance = tolerance; this.drift = 0; }
  reset() { this.drift = 0; }
  snap(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return seconds;
    const whole = Math.round(seconds / this.step), target = whole * this.step, drift = this.drift + seconds - target;
    if (whole >= 1 && Math.abs(drift) < this.tolerance) { this.drift = drift; return target; }
    const paid = Math.max(0, seconds + this.drift); this.drift = 0; return paid;
  }
}
