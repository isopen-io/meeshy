/**
 * L'Atlas des langues (#9388) : une langue est tamponnée quand un message est
 * envoyé ET un reçu avec quelqu'un qui l'écrit.
 */

import { describe, it, expect } from 'vitest';
import { SUPPORTED_LANGUAGE_CODES } from '../../utils/language-codes.js';
import { ATLAS_TOTAL, applyAtlasEvent, atlasLanguage, atlasSummary, foldAtlas, type AtlasState } from '../../utils/game/atlas.js';

const empty: AtlasState = {};

describe('le catalogue de l\'Atlas', () => {
  it('est la source unique des langues servies, pas une liste de plus', () => {
    expect(ATLAS_TOTAL).toBe(SUPPORTED_LANGUAGE_CODES.length);
  });

  it('normalise un code verbatim vers sa langue servie', () => {
    expect(atlasLanguage('FR')).toBe('fr');
    expect(atlasLanguage('en-US')).toBe('en');
    expect(atlasLanguage('pt_BR')).toBe('pt');
    expect(atlasLanguage('bas')).toBe('bas');
  });

  it('refuse une langue hors du catalogue, sans jamais la tronquer en une autre', () => {
    expect(atlasLanguage('xx')).toBeNull();
    expect(atlasLanguage('fil')).toBeNull();
    expect(atlasLanguage('')).toBeNull();
    expect(atlasLanguage(null)).toBeNull();
    expect(atlasLanguage('unknown')).toBeNull();
  });
});

describe('un tampon', () => {
  it('demande un message envoyé ET un reçu', () => {
    const afterSent = applyAtlasEvent({ state: empty, event: { kind: 'sent', language: 'ja' }, dayKey: '2026-10-12' });
    expect(afterSent.stamped).toBeNull();
    expect(afterSent.state.ja).toEqual({ sent: true, received: false, stampedOn: null });
    const afterReceived = applyAtlasEvent({ state: afterSent.state, event: { kind: 'received', language: 'ja' }, dayKey: '2026-10-13' });
    expect(afterReceived.stamped).toBe('ja');
    expect(afterReceived.state.ja).toEqual({ sent: true, received: true, stampedOn: '2026-10-13' });
  });

  it('se pose dans l\'un ou l\'autre ordre', () => {
    const a = applyAtlasEvent({ state: empty, event: { kind: 'received', language: 'sw' }, dayKey: '2026-10-12' });
    const b = applyAtlasEvent({ state: a.state, event: { kind: 'sent', language: 'sw' }, dayKey: '2026-10-12' });
    expect(b.stamped).toBe('sw');
  });

  it('ne se pose qu\'une fois, et garde son jour d\'origine', () => {
    const first = foldAtlas({ state: empty, events: [{ kind: 'sent', language: 'es', dayKey: '2026-10-12' }, { kind: 'received', language: 'es', dayKey: '2026-10-14' }] });
    const again = applyAtlasEvent({ state: first, event: { kind: 'received', language: 'es' }, dayKey: '2026-11-01' });
    expect(again.stamped).toBeNull();
    expect(again.state.es?.stampedOn).toBe('2026-10-14');
  });

  it('n\'inscrit pas une langue inconnue', () => {
    const r = applyAtlasEvent({ state: empty, event: { kind: 'sent', language: 'klingon' }, dayKey: '2026-10-12' });
    expect(r.state).toEqual({});
    expect(r.stamped).toBeNull();
  });

  it('range deux régions de la même langue sous une seule entrée', () => {
    const state = foldAtlas({ state: empty, events: [{ kind: 'sent', language: 'en-US', dayKey: '2026-10-12' }, { kind: 'received', language: 'en-GB', dayKey: '2026-10-12' }] });
    expect(Object.keys(state)).toEqual(['en']);
    expect(state.en?.stampedOn).toBe('2026-10-12');
  });

  it('ne modifie jamais l\'état reçu', () => {
    const frozen: AtlasState = Object.freeze({});
    expect(() => applyAtlasEvent({ state: frozen, event: { kind: 'sent', language: 'fr' }, dayKey: '2026-10-12' })).not.toThrow();
    expect(frozen).toEqual({});
  });
});

describe('le résumé', () => {
  const state = foldAtlas({
    state: empty,
    events: [
      { kind: 'sent', language: 'ja', dayKey: '2026-10-12' },
      { kind: 'received', language: 'ja', dayKey: '2026-10-12' },
      { kind: 'sent', language: 'fr', dayKey: '2026-10-10' },
      { kind: 'received', language: 'fr', dayKey: '2026-10-11' },
      { kind: 'received', language: 'ar', dayKey: '2026-10-13' },
    ],
  });

  it('compte les tampons, ce qui reste, et les échanges à moitié faits', () => {
    const summary = atlasSummary(state);
    expect(summary.stamped).toBe(2);
    expect(summary.total).toBe(ATLAS_TOTAL);
    expect(summary.remaining).toBe(ATLAS_TOTAL - 2);
    expect(summary.pending).toEqual([{ language: 'ar', sent: false, received: true }]);
  });

  it('range les tampons du plus ancien au plus récent', () => {
    expect(atlasSummary(state).stamps).toEqual([
      { language: 'fr', stampedOn: '2026-10-11' },
      { language: 'ja', stampedOn: '2026-10-12' },
    ]);
  });

  it('est vide sans événement', () => {
    expect(atlasSummary(empty)).toEqual({ stamped: 0, total: ATLAS_TOTAL, remaining: ATLAS_TOTAL, stamps: [], pending: [] });
  });
});
