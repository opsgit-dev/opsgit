// Isometric helpers shared by the hero doodles and the lattice. 30° projection, y down.
const DX = Math.cos(Math.PI / 6);
const DY = 0.5;

export type Pt = [number, number];

/** Point on an isometric plane: i runs down-right, j runs down-left, u is the unit size. */
export function iso(ox: number, oy: number, i: number, j: number, u: number): Pt {
  return [ox + (i - j) * u * DX, oy + (i + j) * u * DY];
}

export function f(p: Pt): string {
  return `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
}

/** The four corners of a w×d rhombus starting at (ox, oy). */
export function rhombus(ox: number, oy: number, w: number, d: number, u: number): [Pt, Pt, Pt, Pt] {
  return [iso(ox, oy, 0, 0, u), iso(ox, oy, w, 0, u), iso(ox, oy, w, d, u), iso(ox, oy, 0, d, u)];
}

/** Closed path for a rhombus. */
export function face(r: [Pt, Pt, Pt, Pt]): string {
  return `M${f(r[0])}L${f(r[1])}L${f(r[2])}L${f(r[3])}Z`;
}

/** The two visible front edges of a slab of thickness t under a rhombus. */
export function skirt(r: [Pt, Pt, Pt, Pt], t: number): string {
  const [, b, c, e] = r;
  return `M${f(e)}l0 ${t}L${c[0].toFixed(1)} ${(c[1] + t).toFixed(1)}L${f(c)} M${c[0].toFixed(1)} ${(c[1] + t).toFixed(1)}L${b[0].toFixed(1)} ${(b[1] + t).toFixed(1)}L${f(b)}`;
}
