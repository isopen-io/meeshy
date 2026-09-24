import { describe, expect, test } from 'bun:test';

import { partagerInvitation, partagerLien, TEXTE_INVITATION, type PortailPartage } from './invitation';

const DONNEES = { title: 'Meeshy', text: 'Une publication de Léa', url: 'https://meeshy.me/feeds/post/p1' };

describe('partagerLien — le partage GÉNÉRIQUE, dont l’invitation n’est qu’un cas (#6278)', () => {
  test('la feuille du système reçoit EXACTEMENT les données passées', async () => {
    const recus: unknown[] = [];
    const portail: PortailPartage = { share: async (d) => void recus.push(d) };

    expect(await partagerLien(DONNEES, portail)).toBe('partage');
    expect(recus).toEqual([DONNEES]);
  });

  test('fermer la feuille est une DÉCISION : aucune copie dans le dos', async () => {
    const copies: string[] = [];
    const portail: PortailPartage = {
      share: async () => {
        throw Object.assign(new Error('annulé'), { name: 'AbortError' });
      },
      copier: async (t) => void copies.push(t),
    };

    expect(await partagerLien(DONNEES, portail)).toBe('annule');
    expect(copies).toEqual([]);
  });

  /** Safari refuse `navigator.share` hors activation (`NotAllowedError`) : ce
   * n'est pas une décision du lecteur, le presse-papier prend le relais. */
  test('une feuille REFUSÉE par le navigateur retombe sur le presse-papier, avec l’URL', async () => {
    const copies: string[] = [];
    const portail: PortailPartage = {
      share: async () => {
        throw Object.assign(new Error('refusé'), { name: 'NotAllowedError' });
      },
      copier: async (t) => void copies.push(t),
    };

    expect(await partagerLien(DONNEES, portail)).toBe('copie');
    expect(copies).toEqual([DONNEES.url]);
  });

  test('ni feuille ni presse-papier ⇒ indisponible', async () => {
    expect(await partagerLien(DONNEES, {})).toBe('indisponible');
  });

  test('l’invitation passe TOUJOURS par le même chemin, avec son texte', async () => {
    const recus: { title: string; text: string; url: string }[] = [];
    const portail: PortailPartage = { share: async (d) => void recus.push(d) };

    expect(await partagerInvitation('https://meeshy.me/join', portail)).toBe('partage');
    expect(recus).toEqual([{ title: 'Meeshy', text: TEXTE_INVITATION, url: 'https://meeshy.me/join' }]);
  });
});
