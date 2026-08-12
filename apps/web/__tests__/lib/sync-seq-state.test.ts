/**
 * Tests — `SyncSeqState` (miroir web de `SyncSeqState.swift`).
 *
 * La règle testée ici est la MÊME que celle du SDK iOS ; ces témoins sont donc
 * aussi le contrat cross-plateforme. Un comportement qui diverge du Swift est
 * un défaut, pas une variante.
 */

import {
  detectSyncSeqGap,
  initialSyncSeqState,
  observeSyncSeq,
  recordSyncSeq,
  type SyncSeqState,
} from '@/lib/sync/sync-seq-state';

const stateAt = (lastSeq: number | null): SyncSeqState => ({ lastSeq });

describe('detectSyncSeqGap', () => {
  it('reports no gap on the very first event (no reference point)', () => {
    expect(detectSyncSeqGap(initialSyncSeqState, 91230)).toBe(false);
  });

  it('reports no gap on the immediate successor', () => {
    expect(detectSyncSeqGap(stateAt(91230), 91231)).toBe(false);
  });

  it('reports a gap when the next seq skips ahead', () => {
    expect(detectSyncSeqGap(stateAt(91230), 91234)).toBe(true);
  });

  it('reports no gap on a duplicate seq (socket redelivery)', () => {
    expect(detectSyncSeqGap(stateAt(91230), 91230)).toBe(false);
  });

  it('reports no gap on a reordered older seq — a hole is only ever forward', () => {
    expect(detectSyncSeqGap(stateAt(91230), 91228)).toBe(false);
  });
});

describe('recordSyncSeq', () => {
  it('advances the cursor to the observed seq', () => {
    expect(recordSyncSeq(initialSyncSeqState, 7).lastSeq).toBe(7);
  });

  it('never regresses on an older seq — a regression would fabricate a false gap next event', () => {
    const advanced = recordSyncSeq(stateAt(91230), 91228);
    expect(advanced.lastSeq).toBe(91230);
    expect(detectSyncSeqGap(advanced, 91231)).toBe(false);
  });

  it('leaves the input state untouched (value semantics)', () => {
    const before = stateAt(10);
    recordSyncSeq(before, 99);
    expect(before.lastSeq).toBe(10);
  });
});

describe('observeSyncSeq', () => {
  it('detects the gap BEFORE advancing the cursor', () => {
    const observed = observeSyncSeq(stateAt(91230), 91234);
    expect(observed.gap).toBe(true);
    expect(observed.state.lastSeq).toBe(91234);
  });

  it('is a no-op on a payload with no _seq (gateway that predates emitWithSeq)', () => {
    const before = stateAt(91230);
    const observed = observeSyncSeq(before, undefined);
    expect(observed.gap).toBe(false);
    expect(observed.state).toBe(before);
  });

  it('is a no-op when the gateway degraded and emitted without _seq mid-stream', () => {
    // `emitWithSeq` émet SANS `_seq` si l'allocation rejette ou traîne. Ce
    // chemin dégradé est normal : le compter comme un trou déclencherait une
    // resync à chaque hoquet Mongo.
    const after = observeSyncSeq(stateAt(5), null);
    expect(after.gap).toBe(false);
    expect(after.state.lastSeq).toBe(5);
  });

  it('is a no-op on a non-numeric _seq (payload is an untyped socket frame)', () => {
    expect(observeSyncSeq(stateAt(5), '9').gap).toBe(false);
    expect(observeSyncSeq(stateAt(5), NaN).state.lastSeq).toBe(5);
  });

  it('reports no gap across a contiguous stream', () => {
    const seqs = [4, 5, 6, 7];
    const gaps = seqs.reduce<{ state: SyncSeqState; gaps: boolean[] }>(
      (acc, seq) => {
        const observed = observeSyncSeq(acc.state, seq);
        return { state: observed.state, gaps: [...acc.gaps, observed.gap] };
      },
      { state: initialSyncSeqState, gaps: [] }
    );
    expect(gaps.gaps).toEqual([false, false, false, false]);
    expect(gaps.state.lastSeq).toBe(7);
  });

  it('reports the gap exactly once, then resumes clean on the following event', () => {
    const first = observeSyncSeq(stateAt(10), 14);
    const second = observeSyncSeq(first.state, 15);
    expect(first.gap).toBe(true);
    expect(second.gap).toBe(false);
  });
});
