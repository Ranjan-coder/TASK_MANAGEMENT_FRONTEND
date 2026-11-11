/**
 * lib/chat/fenwick.ts — Fenwick tree (binary indexed tree) over row heights,
 * used by the virtualised message list (chat-features-plan.md CH-V).
 *
 *  - top of row i            prefix(i)       O(log n)
 *  - a row's height changes  set(i, h)       O(log n)
 *  - row at scroll offset y  indexAt(y)      O(log n)  (descends the tree)
 *  - build from n heights    constructor     O(n)
 */
export class Fenwick {
  private readonly tree: Float64Array;
  private readonly values: Float64Array;
  readonly size: number;

  constructor(heights: ArrayLike<number>) {
    const n = heights.length;
    this.size = n;
    this.values = Float64Array.from(heights);
    // Linear-time build: each node passes its sum up to its parent once
    this.tree = new Float64Array(n + 1);
    for (let i = 1; i <= n; i++) {
      this.tree[i] += this.values[i - 1];
      const parent = i + (i & -i);
      if (parent <= n) this.tree[parent] += this.tree[i];
    }
  }

  get(i: number): number {
    return this.values[i];
  }

  /** Sets row i's height. */
  set(i: number, height: number): void {
    const delta = height - this.values[i];
    if (delta === 0) return;
    this.values[i] = height;
    for (let j = i + 1; j <= this.size; j += j & -j) this.tree[j] += delta;
  }

  /** Sum of heights of rows [0, i) — the top edge of row i. */
  prefix(i: number): number {
    let sum = 0;
    for (let j = Math.min(i, this.size); j > 0; j -= j & -j) sum += this.tree[j];
    return sum;
  }

  total(): number {
    return this.prefix(this.size);
  }

  /**
   * The row that covers offset y (0 for y < 0; size - 1 past the end; 0 when empty).
   * Smallest i with prefix(i + 1) > y.
   */
  indexAt(y: number): number {
    if (this.size === 0 || y < 0) return 0;
    let pos = 0;
    let rem = y;
    let step = 1;
    while (step * 2 <= this.size) step *= 2;
    for (; step > 0; step >>= 1) {
      const next = pos + step;
      if (next <= this.size && this.tree[next] <= rem) {
        pos = next;
        rem -= this.tree[next];
      }
    }
    return Math.min(pos, this.size - 1);
  }
}
