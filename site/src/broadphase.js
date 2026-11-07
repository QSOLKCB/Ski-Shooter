// SPDX-License-Identifier: Apache-2.0
// Game-owned broadphase in front of the pinned VANILLAJS collision queries
// (OPT-REDUCE-001: reject work that provably cannot change the result). The
// vendored functions are called unchanged; only colliders that cannot be reached
// are left out, in their original order, so equal-time tie-breaks are unchanged.

// Far larger than the rounding of any slab entry time in this world (|x| < 600,
// travel < 2 m per tick) and the 1e-6 skins applied by moveAndSlide.
export const MARGIN = 1e-3;

/**
 * Colliders a cast/castMovingSegment of `origin + delta` (cube halfSize) could hit.
 * A hit at time t in [0, 1] puts origin + (delta - motion) * t inside the
 * collider's expanded box, so on every axis the segment's range must overlap it.
 * Started-inside hits are covered by t = 0.
 */
export function segmentCandidates(origin, delta, colliders, halfSize = 0, moving = false) {
  const out = [];
  for (const c of colliders) {
    const motion = moving ? c.displacement : undefined, min = c.box.min, max = c.box.max;
    let reachable = true;
    for (let i = 0; i < 3; i++) {
      const a = origin[i], b = a + delta[i] - (motion ? motion[i] : 0);
      const lo = a < b ? a : b, hi = a < b ? b : a;
      if (hi < min[i] - halfSize - MARGIN || lo > max[i] + halfSize + MARGIN) { reachable = false; break; }
    }
    if (reachable) out.push(c);
  }
  return out;
}

/**
 * Boxes a moveAndSlideAABB of `center` by `delta` (half extents) could touch.
 * Sliding only zeroes velocity components and consumes the remaining time, so the
 * whole path stays inside the first sweep's axis range (plus 1e-6 skins). A start
 * inside a box would be pushed out by penetration recovery, which can travel
 * further, so any possible start overlap returns the complete list instead.
 */
export function sweptBoxCandidates(center, delta, extents, boxes) {
  const out = [];
  for (const box of boxes) {
    let reachable = true, startInside = true;
    for (let i = 0; i < 3; i++) {
      const a = center[i], b = a + delta[i], lo = a < b ? a : b, hi = a < b ? b : a;
      const min = box.min[i] - extents[i] - MARGIN, max = box.max[i] + extents[i] + MARGIN;
      if (hi < min || lo > max) { reachable = false; break; }
      if (a < min || a > max) startInside = false;
    }
    if (reachable && startInside) return boxes;
    if (reachable) out.push(box);
  }
  return out;
}
