// Existing IDs 0–27 identify decoded exemplars. Exploration IDs encode a
// normalized UMAP position so anchors/history remain compatible with old saves.
const OFFSET = 1_000_000;
const GRID = 10_000;
export function encodePosition(x: number, y: number) {
  const quantize = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * GRID);
  return OFFSET + quantize(x) * (GRID + 1) + quantize(y);
}
export function decodePosition(id: number): [number, number] | null {
  if (id < OFFSET) return null;
  const value = id - OFFSET;
  return [Math.floor(value / (GRID + 1)) / GRID, (value % (GRID + 1)) / GRID];
}
export function validPositionId(id: unknown): id is number {
  return typeof id === 'number' && Number.isSafeInteger(id) && id >= OFFSET && id <= OFFSET + GRID * (GRID + 1) + GRID;
}
export function movePosition(id: number, dx: number, dy: number, fallback: number) {
  const p = decodePosition(id);
  return p ? encodePosition(p[0] + dx, p[1] + dy) : (id + fallback) % 28;
}
