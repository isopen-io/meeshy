import { describe, expect, test } from 'bun:test';

import { decodeAdminTrackingLinkRow, type AdminTrackingLinkRow } from '@/lib/api/admin-tracking-links';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { OBJECT_ID, servedTrackingLink } from './tracking-link-fixtures';
import {
  mergeByLabel,
  topDatum,
  trackingConversationRef,
  trackingCountryData,
  trackingDaySeries,
  trackingDeviceData,
  trackingDeviceLabel,
  trackingLinkGesture,
  trackingLinkState,
  trackingPlainData,
  trackingPlainLabel,
  trackingRedirectData,
  trackingTargetRef,
} from './tracking-link-model';

/**
 * **CE QU'UN LIEN DE SUIVI DIT, EN MOTS** (#8876, #6729) — sa cible nommée, ses
 * agrégats nommés, sa courbe aux jours réels, son état, son geste.
 */

setupAdminKitTests({ languages: ['fr', 'en'] });

const NOW = new Date('2026-09-30T12:00:00.000Z');

const row = (overrides: Readonly<Record<string, unknown>> = {}): AdminTrackingLinkRow => {
  const decoded = decodeAdminTrackingLinkRow(servedTrackingLink(overrides));
  if (decoded === null) throw new Error('fixture illisible');
  return decoded;
};

describe('trackingLinkState — désactivé > expiré > actif', () => {
  test('actif', () => {
    expect(trackingLinkState(row(), NOW, 'fr').label).toBe('Actif');
  });

  test('désactivé à la main l’emporte sur l’expiration', () => {
    expect(trackingLinkState(row({ isActive: false, expiresAt: '2026-01-01T00:00:00.000Z' }), NOW, 'fr').label).toBe('Désactivé');
  });

  test('expiré', () => {
    expect(trackingLinkState(row({ expiresAt: '2026-09-01T00:00:00.000Z' }), NOW, 'fr').label).toBe('Expiré');
  });

  test('sans date limite, jamais expiré', () => {
    expect(trackingLinkState(row({ expiresAt: null }), NOW, 'fr').label).toBe('Actif');
  });
});

describe('trackingTargetRef — la cible, nommée', () => {
  test('une publication : « Publication de Awa Diop », qui mène à sa fiche', () => {
    expect(trackingTargetRef(row(), 'fr')).toEqual({ kind: 'post', id: OBJECT_ID(4), label: 'Publication de Awa Diop' });
  });

  test('un reel, une story, un statut : le genre est nommé', () => {
    expect(trackingTargetRef(row({ targetType: 'REEL', target: { type: 'REEL', id: OBJECT_ID(4), label: 'Awa Diop' } }), 'fr')?.label).toBe('Reel de Awa Diop');
    expect(trackingTargetRef(row({ targetType: 'STORY', target: { type: 'STORY', id: OBJECT_ID(4), label: 'Awa Diop' } }), 'fr')?.label).toBe('Story de Awa Diop');
    expect(trackingTargetRef(row({ targetType: 'STATUS', target: { type: 'STATUS', id: OBJECT_ID(4), label: 'Awa Diop' } }), 'fr')?.label).toBe('Statut de Awa Diop');
  });

  test('une publication disparue : le genre seul, barré — jamais un auteur inventé', () => {
    expect(trackingTargetRef(row({ target: { type: 'POST', id: OBJECT_ID(4), label: null } }), 'fr')).toEqual({
      kind: 'post',
      id: OBJECT_ID(4),
      label: 'Publication',
      deleted: true,
    });
  });

  test('une conversation : son titre ; sans titre, « Conversation sans titre » (et reste cliquable)', () => {
    const titled = trackingTargetRef(row({ targetType: 'CONVERSATION', target: { type: 'CONVERSATION', id: OBJECT_ID(5), label: 'Les voisins' } }), 'fr');
    const untitled = trackingTargetRef(row({ targetType: 'CONVERSATION', target: { type: 'CONVERSATION', id: OBJECT_ID(5), label: null } }), 'fr');

    expect(titled).toEqual({ kind: 'conversation', id: OBJECT_ID(5), label: 'Les voisins' });
    expect(untitled).toEqual({ kind: 'conversation', id: OBJECT_ID(5), label: 'Conversation sans titre' });
  });

  test('un profil : le nom ; disparu, « Personne inconnue » barré', () => {
    const known = trackingTargetRef(row({ targetType: 'PROFILE', target: { type: 'PROFILE', id: OBJECT_ID(6), label: 'Léa Moreau' } }), 'fr');
    const gone = trackingTargetRef(row({ targetType: 'PROFILE', target: { type: 'PROFILE', id: OBJECT_ID(6), label: null } }), 'fr');

    expect(known).toEqual({ kind: 'user', id: OBJECT_ID(6), label: 'Léa Moreau' });
    expect(gone).toEqual({ kind: 'user', id: OBJECT_ID(6), label: 'Personne inconnue', deleted: true });
  });

  test('un site externe n’a aucune cible à nommer', () => {
    expect(trackingTargetRef(row({ targetType: 'EXTERNAL', target: null }), 'fr')).toBeNull();
    expect(trackingTargetRef(row({ targetType: 'EXTERNAL', target: { type: 'EXTERNAL', id: OBJECT_ID(4), label: null } }), 'fr')).toBeNull();
  });

  test('la conversation d’où le lien a été posé est nommée', () => {
    expect(trackingConversationRef(row({ conversation: { id: OBJECT_ID(5), title: 'Les voisins' } }), 'fr')).toEqual({
      kind: 'conversation',
      id: OBJECT_ID(5),
      label: 'Les voisins',
    });
    expect(trackingConversationRef(row(), 'fr')).toBeNull();
  });
});

describe('trackingDaySeries — les jours sans clic comptent ZÉRO', () => {
  test('comble les jours manquants entre le premier et le dernier, en jours UTC', () => {
    const series = trackingDaySeries(
      [
        { date: '2026-09-27', count: 10 },
        { date: '2026-09-30', count: 25 },
      ],
      'fr',
    );

    expect(series.points.map((point) => point.value)).toEqual([10, 0, 0, 25]);
    expect(series.points.map((point) => point.x)).toEqual(['dim. 27 sept.', 'lun. 28 sept.', 'mar. 29 sept.', 'mer. 30 sept.']);
    expect(series.total).toBe(35);
  });

  test('le pic est le jour le plus chargé', () => {
    expect(trackingDaySeries([{ date: '2026-09-27', count: 10 }, { date: '2026-09-29', count: 40 }], 'fr').peak).toEqual({ day: 'mar. 29 sept.', count: 40 });
  });

  test('l’ordre servi ne compte pas : les jours sont triés', () => {
    const series = trackingDaySeries([{ date: '2026-09-30', count: 1 }, { date: '2026-09-28', count: 2 }], 'fr');

    expect(series.points.map((point) => point.value)).toEqual([2, 0, 1]);
  });

  test('au-delà de 90 jours, on garde les plus récents', () => {
    const series = trackingDaySeries([{ date: '2026-01-01', count: 5 }, { date: '2026-09-30', count: 7 }], 'fr');

    expect(series.points).toHaveLength(90);
    expect(series.points[89]?.value).toBe(7);
    expect(series.total).toBe(7);
  });

  test('aucun clic : une série vide, pas de pic', () => {
    expect(trackingDaySeries([], 'fr')).toEqual({ points: [], total: 0, peak: null });
    expect(trackingDaySeries([{ date: '2026-09-30', count: 0 }], 'fr').peak).toBeNull();
  });
});

describe('les agrégats nommés', () => {
  test('les pays sont des NOMS, du plus grand au plus petit ; un code inconnu devient « Pays inconnu »', () => {
    const data = trackingCountryData(
      [
        { key: 'SN', count: 300 },
        { key: 'FR', count: 700 },
        { key: 'QQ', count: 4 },
        { key: 'XX', count: 2 },
      ],
      'fr',
    );

    expect(data.map((entry) => [entry.label, entry.value])).toEqual([
      ['France', 700],
      ['Sénégal', 300],
      ['Pays inconnu', 6],
    ]);
  });

  test('les appareils sont nommés — mobile, tablette, ordinateur ; un modèle servi reste lisible', () => {
    const data = trackingDeviceData(
      [
        { key: 'mobile', count: 800 },
        { key: 'desktop', count: 380 },
        { key: 'tablet', count: 24 },
        { key: 'smart-tv', count: 3 },
        { key: '', count: 1 },
      ],
      'fr',
    );

    expect(data.map((entry) => entry.label)).toEqual(['Mobile', 'Ordinateur', 'Tablette', 'Smart-tv', 'Non renseigné']);
    expect(trackingDeviceLabel('MOBILE', 'en')).toBe('Mobile');
    expect(trackingDeviceLabel('desktop', 'en')).toBe('Computer');
  });

  test('navigateurs, systèmes, sources : posés tels que servis, « Non renseigné » quand ils manquent', () => {
    expect(trackingPlainData([{ key: 'Chrome', count: 2 }, { key: ' ', count: 1 }], 'fr').map((entry) => entry.label)).toEqual(['Chrome', 'Non renseigné']);
    expect(trackingPlainLabel(null, 'fr')).toBe('Non renseigné');
    expect(trackingPlainLabel(' Safari ', 'fr')).toBe('Safari');
  });

  test('les redirections sont NOMMÉES, avec le ton de leur état — et un statut inconnu se dit « Non reconnu »', () => {
    const { data, tones } = trackingRedirectData(
      [
        { key: 'confirmed', count: 900 },
        { key: 'pending', count: 200 },
        { key: 'failed', count: 104 },
        { key: 'weird', count: 1 },
      ],
      'fr',
    );

    expect(data.map((entry) => entry.label)).toEqual(['Redirection réussie', 'En attente de confirmation', 'Redirection échouée', 'Non reconnu']);
    expect(tones).toMatchObject({ confirmed: 'success', failed: 'danger' });
  });

  test('mergeByLabel fusionne les libellés identiques et trie du plus grand au plus petit', () => {
    expect(
      mergeByLabel([
        { key: 'a', label: 'X', value: 1 },
        { key: 'b', label: 'Y', value: 5 },
        { key: 'c', label: 'X', value: 2 },
      ]),
    ).toEqual([
      { key: 'b', label: 'Y', value: 5 },
      { key: 'a', label: 'X', value: 3 },
    ]);
  });

  test('topDatum : le premier, ou rien', () => {
    expect(topDatum([{ key: 'a', label: 'X', value: 1 }])).toEqual({ key: 'a', label: 'X', value: 1 });
    expect(topDatum([])).toBeNull();
  });
});

describe('le geste offert', () => {
  test('un lien actif se désactive, un lien désactivé se réactive — au rang d’administration seulement', () => {
    expect(trackingLinkGesture({ isActive: true }, { hasAdminRank: true })).toBe('deactivate');
    expect(trackingLinkGesture({ isActive: false }, { hasAdminRank: true })).toBe('reactivate');
  });

  test('sans le rang d’administration (un auditeur), aucun geste n’est dessiné', () => {
    expect(trackingLinkGesture({ isActive: true }, { hasAdminRank: false })).toBeNull();
    expect(trackingLinkGesture({ isActive: false }, { hasAdminRank: false })).toBeNull();
  });
});
