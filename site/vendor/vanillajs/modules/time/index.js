// SPDX-License-Identifier: Apache-2.0
export class FixedClock {
  constructor({step = 1/120, maxFrame = 0.25, maxSteps = 32} = {}) {
    if (!(Number.isFinite(step) && step > 0 && Number.isFinite(maxFrame) && maxFrame > 0 && Number.isInteger(maxSteps) && maxSteps > 0)) {
      throw new RangeError('invalid fixed clock limits');
    }
    Object.assign(this, {step, maxFrame, maxSteps, accumulator:0, paused:false, ticks:0});
  }
  reset() { this.accumulator = 0; this.ticks = 0; }
  setPaused(paused) { this.paused = Boolean(paused); this.accumulator = 0; }
  advance(seconds, update, timeScale = 1) {
    if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(timeScale) || timeScale < 0 || timeScale > 4) {
      throw new RangeError('invalid elapsed time or time scale');
    }
    if (this.paused || timeScale === 0) return {steps:0, alpha:1, dropped:0};
    let dropped = Math.max(0, seconds - this.maxFrame) * timeScale;
    this.accumulator += Math.min(seconds, this.maxFrame) * timeScale;
    let steps = 0;
    while (this.accumulator + 1e-12 >= this.step && steps < this.maxSteps) {
      update(this.step);
      this.accumulator = Math.max(0, this.accumulator - this.step);
      this.ticks++; steps++;
      if (this.paused) return {steps, alpha:1, dropped};
    }
    if (this.accumulator >= this.step) {
      const debt = Math.floor(this.accumulator / this.step) * this.step;
      dropped += debt; this.accumulator -= debt;
    }
    return {steps, alpha:this.accumulator / this.step, dropped};
  }
}
