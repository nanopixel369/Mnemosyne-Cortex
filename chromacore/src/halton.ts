// src/halton.ts
import { LabCoordinate } from "./types.ts";

export function halton(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f = f / base;
  }
  return result;
}

export function getHaltonCoordinate(index: number): LabCoordinate {
  const x = halton(index, 2);
  const y = halton(index, 3);
  const z = halton(index, 5);

  const L = Math.floor(x * 101);
  const a = Math.floor(y * 256) - 128;
  const b = Math.floor(z * 256) - 128;
  return [L, a, b];
}

export function getZoneAndBaseMass(L: number, a: number, b: number): { zone: "core" | "mid" | "outer"; base_mass: number } {
  const dist = Math.sqrt((L - 50) ** 2 + a ** 2 + b ** 2);
  let zone: "core" | "mid" | "outer";
  let base_mass: number;

  if (dist < 86.6) {
    zone = "core";
    const t = dist / 86.6;
    base_mass = 0.6 + t * 0.4;
  } else if (dist < 169.7) {
    zone = "mid";
    const t = (dist - 86.6) / (169.7 - 86.6);
    base_mass = 1.5 + t * 1.0;
  } else {
    zone = "outer";
    const t = Math.min(1.0, (dist - 169.7) / (186.7 - 169.7));
    base_mass = 1.0 + t * 0.5;
  }

  return {
    zone,
    base_mass: parseFloat(base_mass.toFixed(4)),
  };
}
