/**
 * #5108 — le filtre bande-passante `?languages=` de `GET
 * /conversations/:id/messages` canonicalise ses codes, jumeau REST du chemin
 * socket (`normalizeGroupLanguage`, `socketio/utils/message-payload-filter.ts`).
 *
 * Les codes arrivent VERBATIM du client : le SDK iOS envoie la locale
 * appareil (rang 4 du Prisme, `Locale.current.identifier` → `en_US`/`pt_BR`),
 * le web l'`Accept-Language` (`en-US`/`pt-BR`). Les traductions sont stockées
 * sous des clés canoniques 2-lettres (`MessageTranslation` → `'pt'`). Un
 * simple `.toLowerCase()` laissait `'pt-br'` ne jamais matcher `'pt'` : la
 * traduction était prunée et le lecteur retombait sur l'original — violation
 * directe du Prisme sur le cas nominal de la règle 2 (locale appareil ≠
 * langue applicative).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { parseLanguageFilterParam } from '../../../routes/conversations/messages-list-query';

describe('#5108 · parseLanguageFilterParam canonicalise `?languages=`', () => {
  it('réduit un code régional iOS (underscore) à sa forme canonique', () => {
    expect(parseLanguageFilterParam('pt_BR')).toEqual(['pt']);
  });

  it('réduit un code régional web (tiret) à sa forme canonique', () => {
    expect(parseLanguageFilterParam('pt-BR')).toEqual(['pt']);
  });

  it('dédoublonne deux graphies du même code après canonicalisation', () => {
    expect(parseLanguageFilterParam('pt-BR,es-ES,pt_BR')).toEqual(['pt', 'es']);
  });

  it('laisse un code déjà canonique inchangé', () => {
    expect(parseLanguageFilterParam('es')).toEqual(['es']);
  });

  it('rend undefined pour une entrée absente ou vide — comportement historique (toutes langues)', () => {
    expect(parseLanguageFilterParam(undefined)).toBeUndefined();
    expect(parseLanguageFilterParam('')).toBeUndefined();
    expect(parseLanguageFilterParam(' , ,')).toBeUndefined();
  });

  it('borne à 20 entrées après déduplication', () => {
    const codes = Array.from({ length: 25 }, (_, i) => `xx${i}`).join(',');
    expect(parseLanguageFilterParam(codes)).toHaveLength(20);
  });
});
