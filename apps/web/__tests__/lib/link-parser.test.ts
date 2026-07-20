import { parseMessageLinks, type ParsedLink } from '@/lib/utils/link-parser';

/**
 * Couverture réelle de `parseMessageLinks` — le cœur de la détection de liens de
 * CHAQUE message texte web (URL nue, lien de tracking `…/l/<token>` sur n'importe
 * quel domaine, format court `m+TOKEN`). Jusqu'ici seul son comportement indirect
 * via `preprocessContent` (iter 126) était couvert ; aucun test ne garde
 * directement la priorité mshy > tracking > url, le dédoublonnage par index, ni
 * l'invariant de reconstruction sans perte (F91).
 *
 * Environnement Jest = `jsdom`, donc `window.location.origin` vaut
 * `http://localhost` : les liens `m+TOKEN` pointent vers `http://localhost/l/<token>`.
 */
describe('parseMessageLinks', () => {
  const reconstruct = (parts: ParsedLink[]): string =>
    parts.map((p) => p.content).join('');

  describe('texte simple', () => {
    it('retourne une unique part texte couvrant tout le message', () => {
      const parts = parseMessageLinks('bonjour tout le monde');
      expect(parts).toEqual([
        { type: 'text', content: 'bonjour tout le monde', start: 0, end: 21 },
      ]);
    });

    it('retourne une part texte vide pour une chaîne vide', () => {
      expect(parseMessageLinks('')).toEqual([
        { type: 'text', content: '', start: 0, end: 0 },
      ]);
    });
  });

  describe('lien court m+TOKEN (priorité la plus haute)', () => {
    it('détecte un m+TOKEN seul et pointe vers window.location.origin', () => {
      const parts = parseMessageLinks('m+abc123');
      expect(parts).toEqual([
        {
          type: 'mshy-link',
          content: 'm+abc123',
          trackingUrl: 'http://localhost/l/abc123',
          token: 'abc123',
          start: 0,
          end: 8,
        },
      ]);
    });

    it('isole le m+TOKEN du texte environnant sans altérer le texte', () => {
      const parts = parseMessageLinks('voir m+abc123 stp');
      expect(parts.map((p) => p.type)).toEqual(['text', 'mshy-link', 'text']);
      expect(parts[0].content).toBe('voir ');
      expect(parts[1].token).toBe('abc123');
      expect(parts[2].content).toBe(' stp');
    });

    it('détecte plusieurs m+TOKEN dans le même message', () => {
      const parts = parseMessageLinks('m+aaa11 et m+bbb22');
      const links = parts.filter((p) => p.type === 'mshy-link');
      expect(links.map((l) => l.token)).toEqual(['aaa11', 'bbb22']);
    });

    it('ignore un token trop court (< 2 caractères) — reste du texte', () => {
      expect(parseMessageLinks('m+a')).toEqual([
        { type: 'text', content: 'm+a', start: 0, end: 3 },
      ]);
    });

    it('exige une frontière de mot avant m+ (pas de match dans xm+abc12)', () => {
      const parts = parseMessageLinks('xm+abc12');
      expect(parts.every((p) => p.type === 'text')).toBe(true);
    });
  });

  describe('lien de tracking …/l/<token> (priorité sur URL nue)', () => {
    it('classe un lien de tracking comme tracking-link, pas url', () => {
      const parts = parseMessageLinks('https://meeshy.me/l/tok99');
      expect(parts).toEqual([
        {
          type: 'tracking-link',
          content: 'https://meeshy.me/l/tok99',
          trackingUrl: 'https://meeshy.me/l/tok99',
          token: 'tok99',
          start: 0,
          end: 25,
        },
      ]);
    });

    it('reconnaît un lien de tracking sur un domaine arbitraire', () => {
      const parts = parseMessageLinks('http://autre.example/l/xy_12');
      expect(parts[0].type).toBe('tracking-link');
      expect(parts[0].token).toBe('xy_12');
    });
  });

  describe('URL nue', () => {
    it('classe une URL http(s) ordinaire comme url avec originalUrl', () => {
      const parts = parseMessageLinks('voir https://example.com/page ok');
      const url = parts.find((p) => p.type === 'url');
      expect(url).toMatchObject({
        type: 'url',
        content: 'https://example.com/page',
        originalUrl: 'https://example.com/page',
      });
    });
  });

  describe('tri, priorités et invariants', () => {
    it('trie les parts par position même quand les regex tournent dans un autre ordre', () => {
      const parts = parseMessageLinks('https://a.com/x et m+tok99');
      expect(parts.map((p) => p.type)).toEqual(['url', 'text', 'mshy-link']);
    });

    it('coexistence tracking + mshy dans un même message, chacun bien typé', () => {
      const parts = parseMessageLinks('m+aaa11 puis https://meeshy.me/l/bbb22');
      const types = parts.filter((p) => p.type !== 'text').map((p) => p.type);
      expect(types).toEqual(['mshy-link', 'tracking-link']);
    });

    it('reconstruit exactement le message d’origine (concat des contents)', () => {
      const message =
        'Salut m+aaa11 regarde https://example.com/x et https://meeshy.me/l/bbb22 fin';
      expect(reconstruct(parseMessageLinks(message))).toBe(message);
    });

    it('produit des intervalles [start,end] contigus et croissants', () => {
      const parts = parseMessageLinks('a m+aaa11 b https://ex.com/y c');
      let cursor = 0;
      parts.forEach((p) => {
        expect(p.start).toBe(cursor);
        expect(p.end).toBe(p.start + p.content.length);
        cursor = p.end;
      });
      expect(cursor).toBe('a m+aaa11 b https://ex.com/y c'.length);
    });
  });

  describe('chevauchement m+TOKEN à l’intérieur d’une URL (régression F91)', () => {
    it('une URL contenant m+TOKEN dans son chemin reste une seule part url', () => {
      const parts = parseMessageLinks('https://ex.com/m+abcde');
      expect(parts).toEqual([
        {
          type: 'url',
          content: 'https://ex.com/m+abcde',
          originalUrl: 'https://ex.com/m+abcde',
          start: 0,
          end: 22,
        },
      ]);
    });

    it('une URL avec m+TOKEN en query string ne produit pas de chip mshy parasite', () => {
      const parts = parseMessageLinks('https://ex.com/x?ref=m+promo');
      expect(parts.filter((p) => p.type === 'mshy-link')).toEqual([]);
      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({ type: 'url', content: 'https://ex.com/x?ref=m+promo' });
    });

    it('préserve l’invariant de reconstruction sans perte malgré le m+ interne', () => {
      const message = 'clique https://ex.com/m+abcde maintenant';
      expect(reconstruct(parseMessageLinks(message))).toBe(message);
    });

    it('produit des intervalles non chevauchants et croissants avec un m+ interne', () => {
      const parts = parseMessageLinks('https://ex.com/m+abcde');
      let cursor = 0;
      parts.forEach((p) => {
        expect(p.start).toBe(cursor);
        expect(p.end).toBe(p.start + p.content.length);
        cursor = p.end;
      });
      expect(cursor).toBe('https://ex.com/m+abcde'.length);
    });

    it('un m+TOKEN autonome hors URL reste bien un mshy-link', () => {
      const parts = parseMessageLinks('salut m+abcde et https://ex.com/m+xyzab fin');
      const nonText = parts.filter((p) => p.type !== 'text');
      expect(nonText.map((p) => p.type)).toEqual(['mshy-link', 'url']);
      expect(nonText[0]).toMatchObject({ type: 'mshy-link', token: 'abcde' });
      expect(nonText[1]).toMatchObject({ type: 'url', content: 'https://ex.com/m+xyzab' });
    });
  });
});
