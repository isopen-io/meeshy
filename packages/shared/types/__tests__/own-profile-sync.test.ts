/**
 * #18924 — MON PROFIL SE SYNCHRONISE ENTRE MES APPAREILS : `profile:updated`,
 * sur la room PERSONNELLE de l'auteur, porte les champs qui changent ce que ses
 * autres appareils affichent (le Prisme, le nom, la photo, la bannière).
 *
 * Le contrat se lit ici, la passerelle l'émet (`routes/users/own-profile-sync.ts`).
 * Ces témoins gardent ce qu'un client lira : la forme, ce qui y a le droit d'être
 * nul, la tolérance aux clés d'un serveur plus récent, et la règle d'arbitrage
 * contre une relecture de `GET /me` plus fraîche que l'événement.
 */
import { describe, expect, it } from 'vitest';

import { SERVER_EVENTS } from '../socketio-events';
import {
  OWN_PROFILE_FIELDS,
  ownProfileSnapshotIsStale,
  profileUpdatedEventDataSchema,
  type ProfileUpdatedEventData,
} from '../own-profile-sync';

const event = (): ProfileUpdatedEventData => ({
  userId: '507f1f77bcf86cd799439011',
  updatedAt: '2026-11-17T09:30:00.000Z',
  profile: {
    systemLanguage: 'en',
    regionalLanguage: null,
    customDestinationLanguage: null,
    displayName: 'Alice C.',
    firstName: 'Alice',
    lastName: 'Cooper',
    username: 'alice',
    avatar: '2026/11/507f1f77bcf86cd799439011/avatar_3.webp',
    banner: null,
  },
});

describe('profile:updated — le nom suit la convention du contrat', () => {
  it('entité:action-mot, avec des traits d’union', () => {
    expect(SERVER_EVENTS.PROFILE_UPDATED).toBe('profile:updated');
    expect(SERVER_EVENTS.PROFILE_UPDATED).toMatch(/^[a-z]+:[a-z]+(-[a-z]+)*$/);
  });
});

describe('profile:updated — la charge est l’instantané des champs que mes appareils affichent', () => {
  it('les trois langues du Prisme, les quatre composants du nom, la photo et la bannière — rien d’autre', () => {
    expect([...OWN_PROFILE_FIELDS].sort()).toEqual(
      [
        'avatar',
        'banner',
        'customDestinationLanguage',
        'displayName',
        'firstName',
        'lastName',
        'regionalLanguage',
        'systemLanguage',
        'username',
      ].sort(),
    );
    expect(Object.keys(profileUpdatedEventDataSchema.shape.profile.shape).sort()).toEqual([...OWN_PROFILE_FIELDS].sort());
  });

  it('une charge de la passerelle se lit telle quelle', () => {
    expect(profileUpdatedEventDataSchema.parse(event())).toEqual(event());
  });

  it('une langue secondaire, une destination, un nom affiché, une photo et une bannière effacés se disent `null`', () => {
    const cleared = { ...event(), profile: { ...event().profile, displayName: null, avatar: null, banner: null } };
    expect(profileUpdatedEventDataSchema.safeParse(cleared).success).toBe(true);
  });

  it('la langue principale ne peut pas être nulle : le Prisme part d’elle', () => {
    const broken = { ...event(), profile: { ...event().profile, systemLanguage: null } };
    expect(profileUpdatedEventDataSchema.safeParse(broken).success).toBe(false);
  });

  it('un instant qui n’est pas ISO 8601 est refusé : il sert à arbitrer', () => {
    expect(profileUpdatedEventDataSchema.safeParse({ ...event(), updatedAt: 'hier' }).success).toBe(false);
  });

  it('une clé ajoutée par un serveur plus récent ne fait pas tomber la trame — elle est ignorée', () => {
    const newer = { ...event(), revision: 4, profile: { ...event().profile, bio: 'nouveau champ' } };
    const parsed = profileUpdatedEventDataSchema.safeParse(newer);

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.profile).not.toHaveProperty('bio');
  });
});

describe('ownProfileSnapshotIsStale — un événement plus ancien que ce que je tiens ne s’applique pas', () => {
  it('plus ancien que la session relue : périmé', () => {
    expect(ownProfileSnapshotIsStale('2026-11-17T09:31:00.000Z', '2026-11-17T09:30:00.000Z')).toBe(true);
  });

  it('plus récent : appliqué', () => {
    expect(ownProfileSnapshotIsStale('2026-11-17T09:29:00.000Z', '2026-11-17T09:30:00.000Z')).toBe(false);
  });

  it('le même instant (la réponse du PATCH, puis son écho) : appliqué, l’instantané est identique', () => {
    expect(ownProfileSnapshotIsStale('2026-11-17T09:30:00.000Z', '2026-11-17T09:30:00.000Z')).toBe(false);
  });

  it('rien de connu, ou un instant illisible : appliqué — on n’écarte que ce qu’on PROUVE plus ancien', () => {
    expect(ownProfileSnapshotIsStale(null, '2026-11-17T09:30:00.000Z')).toBe(false);
    expect(ownProfileSnapshotIsStale(undefined, '2026-11-17T09:30:00.000Z')).toBe(false);
    expect(ownProfileSnapshotIsStale('pas une date', '2026-11-17T09:30:00.000Z')).toBe(false);
  });

  it('les décalages horaires se comparent en instants, pas en chaînes', () => {
    expect(ownProfileSnapshotIsStale('2026-11-17T10:31:00.000+01:00', '2026-11-17T09:30:00.000Z')).toBe(true);
  });
});
