import { describe, expect, test } from 'bun:test';

import { partagerInvitation, TEXTE_INVITATION, type PortailPartage } from './invitation';

const LIEN = 'https://meeshy.me';

describe('partagerInvitation', () => {
  test('passe par la feuille du système quand elle existe', async () => {
    const vues: Array<{ title: string; text: string; url: string }> = [];
    const portail: PortailPartage = { share: async (d) => void vues.push(d) };

    expect(await partagerInvitation(LIEN, portail)).toBe('partage');
    expect(vues).toEqual([{ title: 'Meeshy', text: TEXTE_INVITATION, url: LIEN }]);
  });

  test('retombe sur le presse-papier quand le partage natif manque', async () => {
    const copies: string[] = [];
    const portail: PortailPartage = { copier: async (t) => void copies.push(t) };

    expect(await partagerInvitation(LIEN, portail)).toBe('copie');
    expect(copies).toEqual([LIEN]);
  });

  /**
   * Le cas qui distingue une décision d'une panne. Sans lui, fermer la feuille
   * de partage copierait quand même le lien : un effet que personne n'a
   * demandé, au moment précis où l'utilisateur venait de dire non.
   */
  test('une annulation ne copie RIEN', async () => {
    const copies: string[] = [];
    const abandon = new Error('annulé');
    abandon.name = 'AbortError';
    const portail: PortailPartage = {
      share: async () => { throw abandon; },
      copier: async (t) => void copies.push(t),
    };

    expect(await partagerInvitation(LIEN, portail)).toBe('annule');
    expect(copies).toEqual([]);
  });

  test('un partage EN PANNE retombe bien sur le presse-papier', async () => {
    const copies: string[] = [];
    const portail: PortailPartage = {
      share: async () => { throw new Error('NotAllowedError'); },
      copier: async (t) => void copies.push(t),
    };

    expect(await partagerInvitation(LIEN, portail)).toBe('copie');
    expect(copies).toEqual([LIEN]);
  });

  test('sans aucun portail, le résultat le DIT — il ne se tait pas', async () => {
    expect(await partagerInvitation(LIEN, {})).toBe('indisponible');
  });
});

describe('RETOUR_INVITATION', () => {
  test('ne parle QUE des issues muettes', async () => {
    const { RETOUR_INVITATION } = await import('./invitation');
    // La feuille du système a déjà parlé : redoubler serait du bruit.
    expect(RETOUR_INVITATION.partage).toBeNull();
    expect(RETOUR_INVITATION.annule).toBeNull();
    // Rien n'a bougé à l'écran : sans un mot, « c'est fait » et « rien ne
    // s'est passé » sont indiscernables.
    expect(RETOUR_INVITATION.copie).toBeTruthy();
    expect(RETOUR_INVITATION.indisponible).toBeTruthy();
  });
});
