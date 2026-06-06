// src/gravity.ts
import { LabCoordinate, TagWithCount, SemanticAnchor } from "./types.ts";

export function computeGravity(
  matchedTags: TagWithCount[],
  stackMap: Map<string, SemanticAnchor>,
  mode: "placement" | "query",
  nudgingScale = 1000.0
): LabCoordinate {
  if (matchedTags.length === 0) {
    return [50, 0, 0]; // Default coordinate
  }

  // Gather anchors
  const anchors: Array<{ coord: LabCoordinate; mass: number }> = [];
  const numTags = matchedTags.length;

  // Determine multiplier for query mode
  let multiplier = 1.0;
  if (mode === "query") {
    if (numTags <= 8) {
      multiplier = 2.0;
    } else if (numTags <= 20) {
      // Linear decay from 2.0 to 1.0 over the range [8, 20]
      multiplier = 2.0 - (numTags - 8) * (1.0 / 12);
    } else {
      multiplier = 1.0;
    }
  }

  for (const t of matchedTags) {
    const anchor = stackMap.get(t.tag);
    if (!anchor) continue;

    // nudge = min(1.0, ln(1 + count) / ln(1 + scale))
    const nudge = Math.min(
      1.0,
      Math.log(1 + t.count) / Math.log(1 + nudgingScale)
    );

    // Adjusted mass = (base_mass + nudge) * multiplier
    // Multiplier scales the full adjusted mass in query mode, not just the nudge.
    // In placement mode multiplier is always 1.0 so this is a no-op there.
    const mass = (anchor.base_mass + nudge) * multiplier;
    anchors.push({
      coord: [anchor.lab_l, anchor.lab_a, anchor.lab_b],
      mass,
    });
  }

  if (anchors.length === 0) {
    return [50, 0, 0];
  }

  // 2. Initial COM = arithmetic mean of anchor coordinates
  let L_c = 0;
  let a_c = 0;
  let b_c = 0;
  for (const a of anchors) {
    L_c += a.coord[0];
    a_c += a.coord[1];
    b_c += a.coord[2];
  }
  L_c /= anchors.length;
  a_c /= anchors.length;
  b_c /= anchors.length;

  // 3. For 3 iterations (or until convergence < 0.01)
  const epsilon = 0.001;
  for (let iter = 0; iter < 3; iter++) {
    let weightedLSum = 0;
    let weightedASum = 0;
    let weightedBSum = 0;
    let totalWeight = 0;

    for (const a of anchors) {
      const dist2 =
        (a.coord[0] - L_c) ** 2 +
        (a.coord[1] - a_c) ** 2 +
        (a.coord[2] - b_c) ** 2;
      const weight = a.mass / (epsilon + dist2);
      
      weightedLSum += weight * a.coord[0];
      weightedASum += weight * a.coord[1];
      weightedBSum += weight * a.coord[2];
      totalWeight += weight;
    }

    if (totalWeight === 0) break;

    const L_new = weightedLSum / totalWeight;
    const a_new = weightedASum / totalWeight;
    const b_new = weightedBSum / totalWeight;

    const diff = Math.sqrt(
      (L_new - L_c) ** 2 + (a_new - a_c) ** 2 + (b_new - b_c) ** 2
    );

    L_c = L_new;
    a_c = a_new;
    b_c = b_new;

    if (diff < 0.01) {
      break;
    }
  }

  // 4. Round each component to nearest integer
  let finalL = Math.round(L_c);
  let finalA = Math.round(a_c);
  let finalB = Math.round(b_c);

  // 5. Clamp to bounds: L* in [0, 100], a* in [-128, 127], b* in [-128, 127]
  finalL = Math.max(0, Math.min(100, finalL));
  finalA = Math.max(-128, Math.min(127, finalA));
  finalB = Math.max(-128, Math.min(127, finalB));

  return [finalL, finalA, finalB];
}
