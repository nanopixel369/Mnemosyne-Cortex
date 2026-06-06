// src/kdtree.ts
import { readFileSync } from "fs";
import { LabCoordinate } from "./types.ts";

export class KDTree {
  private numPoints: number = 0;
  private root: number = -1;
  private coords: Int32Array = new Int32Array(0);
  private leftChild: Int32Array = new Int32Array(0);
  private rightChild: Int32Array = new Int32Array(0);

  constructor(binaryPath: string) {
    this.loadBinary(binaryPath);
  }

  private loadBinary(binaryPath: string) {
    const buffer = readFileSync(binaryPath);
    
    // Read header: [numPoints: int32, root: int32]
    const header = new Int32Array(buffer.buffer, buffer.byteOffset, 2);
    this.numPoints = header[0];
    this.root = header[1];

    let offset = buffer.byteOffset + 8; // 2 * 4 bytes

    // Read coords: numPoints * 3 * int32
    this.coords = new Int32Array(buffer.buffer, offset, this.numPoints * 3);
    offset += this.numPoints * 3 * 4;

    // Read leftChild: numPoints * int32
    this.leftChild = new Int32Array(buffer.buffer, offset, this.numPoints);
    offset += this.numPoints * 4;

    // Read rightChild: numPoints * int32
    this.rightChild = new Int32Array(buffer.buffer, offset, this.numPoints);
  }

  public queryBallPoint(center: LabCoordinate, radius: number): LabCoordinate[] {
    const [L_c, a_c, b_c] = center;
    const radius2 = radius * radius;
    const matchedCoords: LabCoordinate[] = [];

    const search = (i: number, depth: number) => {
      if (i === -1) return;

      const L_val = this.coords[i * 3];
      const a_val = this.coords[i * 3 + 1];
      const b_val = this.coords[i * 3 + 2];

      const dist2 = (L_val - L_c) ** 2 + (a_val - a_c) ** 2 + (b_val - b_c) ** 2;
      if (dist2 <= radius2) {
        matchedCoords.push([L_val, a_val, b_val]);
      }

      const axis = depth % 3;
      const nodeVal = axis === 0 ? L_val : (axis === 1 ? a_val : b_val);
      const targetVal = axis === 0 ? L_c : (axis === 1 ? a_c : b_c);

      const left = this.leftChild[i];
      const right = this.rightChild[i];

      if (targetVal < nodeVal) {
        search(left, depth + 1);
        if (targetVal + radius >= nodeVal) {
          search(right, depth + 1);
        }
      } else {
        search(right, depth + 1);
        if (targetVal - radius <= nodeVal) {
          search(left, depth + 1);
        }
      }
    };

    search(this.root, 0);

    // Enforce determinism contract (KD-Tree determinism):
    // "5. KD-Tree determinism: Query results are returned in a stable order
    // (by coordinate distance ascending, then by L*, a*, b* ascending for ties)."
    matchedCoords.sort((c1, c2) => {
      const dist1 = (c1[0] - L_c) ** 2 + (c1[1] - a_c) ** 2 + (c1[2] - b_c) ** 2;
      const dist2 = (c2[0] - L_c) ** 2 + (c2[1] - a_c) ** 2 + (c2[2] - b_c) ** 2;
      if (dist1 !== dist2) {
        return dist1 - dist2;
      }
      if (c1[0] !== c2[0]) {
        return c1[0] - c2[0];
      }
      if (c1[1] !== c2[1]) {
        return c1[1] - c2[1];
      }
      return c1[2] - c2[2];
    });

    return matchedCoords;
  }
}
