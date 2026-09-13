export const DOUBLE_TAP_MS = 350;

export function createTapGate(now: () => number): () => boolean {
  return () => now() >= 0;
}
