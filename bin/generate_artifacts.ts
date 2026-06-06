// bin/generate_artifacts.ts
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

console.log("Starting artifact generation...");

// --- Part 1: Halton Sequence (10k points) ---
console.log("Generating Halton 10k sequence...");

function halton(index: number, base: number): number {
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

interface HaltonEntry {
  index: number;
  lab_l: number;
  lab_a: number;
  lab_b: number;
  base_mass: number;
  zone: "core" | "mid" | "outer";
}

const haltonEntries: HaltonEntry[] = [];
for (let i = 1; i <= 10000; i++) {
  const x = halton(i, 2);
  const y = halton(i, 3);
  const z = halton(i, 5);

  const L = Math.floor(x * 101);
  const a = Math.floor(y * 256) - 128;
  const b = Math.floor(z * 256) - 128;

  // Calculate distance from center (50, 0, 0)
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

  haltonEntries.push({
    index: i,
    lab_l: L,
    lab_a: a,
    lab_b: b,
    base_mass: parseFloat(base_mass.toFixed(4)),
    zone,
  });
}

writeFileSync("halton_10k.json", JSON.stringify(haltonEntries, null, 2));
console.log("halton_10k.json generated successfully.");

// --- Part 2: KD-Tree over 6.6M CIELAB points ---
console.log("Generating KD-Tree points...");
const L_LIMIT = 101;
const AB_LIMIT = 256;
const numPoints = L_LIMIT * AB_LIMIT * AB_LIMIT;

const coords = new Int32Array(numPoints * 3);
let idx = 0;
for (let L = 0; L < L_LIMIT; L++) {
  for (let a = -128; a < 128; a++) {
    for (let b = -128; b < 128; b++) {
      coords[idx * 3] = L;
      coords[idx * 3 + 1] = a;
      coords[idx * 3 + 2] = b;
      idx++;
    }
  }
}

const indices = new Int32Array(numPoints);
for (let i = 0; i < numPoints; i++) {
  indices[i] = i;
}

const leftChild = new Int32Array(numPoints);
const rightChild = new Int32Array(numPoints);
leftChild.fill(-1);
rightChild.fill(-1);

function swap(arr: Int32Array, i: number, j: number) {
  const temp = arr[i];
  arr[i] = arr[j];
  arr[j] = temp;
}

function quickselect(arr: Int32Array, left: number, right: number, k: number, axis: number) {
  while (left < right) {
    const pivotIdx = left + Math.floor(Math.random() * (right - left + 1));
    const pivotCoordIdx = arr[pivotIdx];
    const pivotVal = coords[pivotCoordIdx * 3 + axis];
    
    swap(arr, pivotIdx, right);
    let i = left;
    for (let j = left; j < right; j++) {
      const coordIdx = arr[j];
      const val = coords[coordIdx * 3 + axis];
      if (val < pivotVal) {
        swap(arr, i, j);
        i++;
      }
    }
    swap(arr, i, right);
    
    if (i === k) {
      return;
    } else if (i < k) {
      left = i + 1;
    } else {
      right = i - 1;
    }
  }
}

console.log("Building balanced KD-Tree structure...");
const start = Date.now();

function buildTree(left: number, right: number, depth: number): number {
  if (left > right) return -1;
  const axis = depth % 3;
  const mid = (left + right) >> 1;
  
  quickselect(indices, left, right, mid, axis);
  
  const nodeIdx = indices[mid];
  leftChild[nodeIdx] = buildTree(left, mid - 1, depth + 1);
  rightChild[nodeIdx] = buildTree(mid + 1, right, depth + 1);
  return nodeIdx;
}

const root = buildTree(0, numPoints - 1, 0);
console.log(`KD-Tree built in ${Date.now() - start}ms. Root: ${root}`);

console.log("Serializing KD-Tree to binary...");
// Binary format:
// [numPoints: int32] (4 bytes)
// [root: int32] (4 bytes)
// [coords: int32 * numPoints * 3] (79.43 MB)
// [leftChild: int32 * numPoints] (26.48 MB)
// [rightChild: int32 * numPoints] (26.48 MB)

const header = new Int32Array(2);
header[0] = numPoints;
header[1] = root;

const headerBuf = Buffer.from(header.buffer);
const coordsBuf = Buffer.from(coords.buffer);
const leftChildBuf = Buffer.from(leftChild.buffer);
const rightChildBuf = Buffer.from(rightChild.buffer);

const totalSize = headerBuf.length + coordsBuf.length + leftChildBuf.length + rightChildBuf.length;
console.log(`Writing binary file: kdtree_cielab.bin (size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB)...`);

const finalBuffer = Buffer.concat([headerBuf, coordsBuf, leftChildBuf, rightChildBuf], totalSize);
writeFileSync("kdtree_cielab.bin", finalBuffer);

console.log("Artifact generation complete!");
