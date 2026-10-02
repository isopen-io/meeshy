import { beforeAll, describe, expect, test } from 'bun:test';

import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import { communityGestureOptions, communityGestureWords, communityStateOf, communityVisibilityOf, withCommunityChange } from './community-state';

beforeAll(async () => {
  await loadAdminInterfaceCatalog('fr');
});

/**
 * L'ÉTAT D'UNE COMMUNAUTÉ, DIT EN MOTS (#8876) — la visibilité et l'activation
 * ne sont pas des énumérations servies (deux booléens) : c'est ici qu'ils
 * deviennent un mot, un ton et une phrase qui dit ce que l'état CHANGE pour les
 * lecteurs.
 */
describe('communityVisibilityOf', () => {
  test('privée : hors de la recherche, sur invitation', () => {
    const value = communityVisibilityOf(true, 'fr');
    expect(value).toMatchObject({ label: 'Privée', tone: 'neutral', raw: 'private' });
    expect(value.explain).toContain('invitation');
  });

  test('publique : dans la recherche, ouverte à tous', () => {
    const value = communityVisibilityOf(false, 'fr');
    expect(value).toMatchObject({ label: 'Publique', raw: 'public' });
    expect(value.explain).toContain('recherche');
  });
});

describe('communityStateOf', () => {
  test('active : succès, sans explication à donner', () => {
    expect(communityStateOf(true, 'fr')).toMatchObject({ label: 'Active', tone: 'success', explain: null, raw: 'active' });
  });

  test('désactivée : alerte, avec ce que l’état change — retirée des lecteurs, conversations intactes', () => {
    const value = communityStateOf(false, 'fr');
    expect(value).toMatchObject({ label: 'Désactivée', tone: 'warning', raw: 'inactive' });
    expect(value.explain).toContain('conversations');
  });
});

describe('communityGestureOptions — les gestes que l’état courant offre', () => {
  test('une communauté active et privée : désactiver, rendre publique', () => {
    expect(communityGestureOptions({ isActive: true, isPrivate: true }).map((gesture) => gesture.id)).toEqual(['deactivate', 'makePublic']);
  });

  test('une communauté active et publique : désactiver, rendre privée', () => {
    expect(communityGestureOptions({ isActive: true, isPrivate: false }).map((gesture) => gesture.id)).toEqual(['deactivate', 'makePrivate']);
  });

  test('une communauté désactivée : réactiver — et rien qui ne changerait pas ce que le lecteur voit', () => {
    expect(communityGestureOptions({ isActive: false, isPrivate: true }).map((gesture) => gesture.id)).toEqual(['reactivate', 'makePublic']);
  });

  test('chaque geste dit le changement qu’il envoie à la passerelle', () => {
    const changes = Object.fromEntries(communityGestureOptions({ isActive: true, isPrivate: true }).map((gesture) => [gesture.id, gesture.change]));
    expect(changes).toEqual({ deactivate: { isActive: false }, makePublic: { isPrivate: false } });
  });
});

describe('communityGestureWords — le verbe exact de chaque geste, jamais « OK »', () => {
  test('désactiver : le corps dit ce qui disparaît ET ce qui reste', () => {
    const words = communityGestureWords('deactivate', 'fr');
    expect(words).toMatchObject({ action: 'Désactiver la communauté', confirm: 'Désactiver la communauté', done: 'admin.community.done.deactivated' });
    expect(words.body).toContain('recherche');
    expect(words.body).toContain('conversations');
  });

  test('réactiver, rendre privée, rendre publique : chacun son titre, son corps et son message de succès', () => {
    expect(communityGestureWords('reactivate', 'fr')).toMatchObject({ confirm: 'Réactiver la communauté', done: 'admin.community.done.reactivated' });
    expect(communityGestureWords('makePrivate', 'fr')).toMatchObject({ confirm: 'Rendre privée', done: 'admin.community.done.private' });
    expect(communityGestureWords('makePublic', 'fr')).toMatchObject({ confirm: 'Rendre publique', done: 'admin.community.done.public' });
  });
});

describe('withCommunityChange — l’effet optimiste sur la fiche en cache', () => {
  const fiche = { id: 'x', name: 'Club', isActive: true, isPrivate: true, deletedAt: null, activeMemberCount: 4 };
  const AT = '2026-09-30T12:00:00.000Z';

  test('désactiver pose la date de désactivation, comme la passerelle', () => {
    expect(withCommunityChange(fiche, { isActive: false }, AT)).toEqual({ ...fiche, isActive: false, deletedAt: AT });
  });

  test('réactiver efface la date de désactivation', () => {
    expect(withCommunityChange({ ...fiche, isActive: false, deletedAt: AT }, { isActive: true }, AT)).toEqual({ ...fiche, isActive: true, deletedAt: null });
  });

  test('la visibilité ne touche ni l’activation ni la date', () => {
    expect(withCommunityChange(fiche, { isPrivate: false }, AT)).toEqual({ ...fiche, isPrivate: false });
  });

  test('l’original n’est pas muté, et un cache illisible est rendu tel quel', () => {
    withCommunityChange(fiche, { isActive: false }, AT);
    expect(fiche.isActive).toBe(true);
    expect(withCommunityChange(null, { isActive: false }, AT)).toBeNull();
  });
});
