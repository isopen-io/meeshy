import { describe, expect, test } from 'bun:test';

import type { HttpTransport } from './http';
import {
  decodePublicProfile,
  decodePublicProfileView,
  decodePublicStats,
  decodeServedRelation,
  loadPublicProfile,
  publicProfileQueryKey,
  PUBLIC_PROFILE_STALE_TIME,
} from './public-profile';

/**
 * LE PORT DU PROFIL PUBLIC (#7083) — ce que le décodeur laisse entrer dans le
 * cache PERSISTÉ, et ce qu'il en tient dehors.
 *
 * Deux affirmations portent tout le lot et sont écrites ici plutôt qu'ailleurs :
 * la PRÉSENCE n'entre jamais (loi du 2026-08-25), et un compteur ABSENT n'est
 * pas un compteur à ZÉRO (`servedUserStats` RETIRE les quatre intimes à un
 * tiers — `services/gateway/src/routes/user-stats.ts:220-225`, `:245-251`).
 */

const WIRE_THIRD_PARTY = {
  id: 'u-rich-kwame',
  username: 'kwame-mensah',
  displayName: 'Kwame Mensah',
  avatar: 'media:avatar',
  banner: 'media:banner',
  bio: 'Compte de démonstration.',
  createdAt: '2024-03-08T09:00:00.000Z',
  stats: {
    languagesUsed: 4,
    memberDays: 512,
    postsCount: 7,
    reelsCount: 2,
    storiesCount: 0,
    languages: ['fr', 'en'],
    achievements: [{ id: 'a1' }],
  },
  relation: 'none',
  isSelf: false,
} as const;

describe('decodePublicProfile', () => {
  test('rend la bannière, l’ancienneté, la bio et le nom affiché', () => {
    expect(decodePublicProfile(WIRE_THIRD_PARTY)).toEqual({
      id: 'u-rich-kwame',
      username: 'kwame-mensah',
      displayName: 'Kwame Mensah',
      avatar: 'media:avatar',
      banner: 'media:banner',
      bio: 'Compte de démonstration.',
      createdAt: '2024-03-08T09:00:00.000Z',
    });
  });

  test('une bannière VIDE est `null`, jamais une chaîne à peindre', () => {
    expect(decodePublicProfile({ ...WIRE_THIRD_PARTY, banner: '' })?.banner).toBeNull();
    expect(decodePublicProfile({ ...WIRE_THIRD_PARTY, banner: null })?.banner).toBeNull();
  });

  test('la PRÉSENCE servie par erreur n’entre PAS dans le cache persisté', () => {
    const decoded = decodePublicProfile({ ...WIRE_THIRD_PARTY, isOnline: true, lastActiveAt: '2026-09-19T10:00:00.000Z' });
    expect(decoded).not.toBeNull();
    expect(Object.keys(decoded ?? {}).sort()).toEqual(['avatar', 'banner', 'bio', 'createdAt', 'displayName', 'id', 'username']);
  });

  test('une charge sans `id` ne montre personne — fail-closed', () => {
    const { id: _id, ...sansId } = WIRE_THIRD_PARTY;
    expect(decodePublicProfile(sansId)).toBeNull();
  });
});

describe('decodePublicStats', () => {
  test('charge TIERS — les quatre compteurs intimes valent `null`, jamais `0`', () => {
    const stats = decodePublicStats(WIRE_THIRD_PARTY.stats);
    expect(stats).toEqual({
      languagesUsed: 4,
      memberDays: 512,
      postsCount: 7,
      reelsCount: 2,
      storiesCount: 0,
      totalMessages: null,
      totalConversations: null,
      totalTranslations: null,
      friendRequestsReceived: null,
    });
  });

  test('charge SOI — les quatre intimes portent leur valeur', () => {
    const stats = decodePublicStats({
      ...WIRE_THIRD_PARTY.stats,
      totalMessages: 1204,
      totalConversations: 18,
      totalTranslations: 340,
      friendRequestsReceived: 3,
    });
    expect(stats?.totalMessages).toBe(1204);
    expect(stats?.friendRequestsReceived).toBe(3);
  });

  test('`stats` absent rend `null` — jamais un objet de zéros', () => {
    expect(decodePublicStats(undefined)).toBeNull();
    expect(decodePublicStats(null)).toBeNull();
  });

  test('`0` SERVI et `null` ABSENT sont les deux moitiés du seuil', () => {
    expect(decodePublicStats({ postsCount: 0 })?.postsCount).toBe(0);
    expect(decodePublicStats({ reelsCount: 2 })?.postsCount).toBeNull();
  });
});

describe('decodeServedRelation', () => {
  test('les cinq valeurs de `relationAvec` sont acceptées telles quelles', () => {
    for (const served of ['self', 'friend', 'pending_sent', 'pending_received', 'none'] as const) {
      expect(decodeServedRelation(served)).toBe(served);
    }
  });

  test('un mot inconnu retombe sur `none` — aucun bouton fabriqué sur ce qu’on ne comprend pas', () => {
    expect(decodeServedRelation('bestie')).toBe('none');
    expect(decodeServedRelation(undefined)).toBe('none');
    expect(decodeServedRelation(7)).toBe('none');
  });
});

describe('decodePublicProfileView', () => {
  /**
   * **L'IDENTIFIANT DE LA DEMANDE VOYAGE AVEC LA RELATION** (#7122) — sans lui,
   * « Accepter » / « Refuser » / « Annuler » n'ont rien à envoyer à
   * `PATCH /directory/friend-requests/:id`, et l'écran doit aller chercher la
   * ligne dans un panier. Il est servi à côté de `relation`, jamais dedans :
   * une relation en attente et l'identifiant de SA ligne sont deux questions.
   */
  test('`relationRequestId` est décodé tel quel quand la passerelle le sert', () => {
    const view = decodePublicProfileView({ ...WIRE_THIRD_PARTY, relation: 'pending_received', relationRequestId: 'fr-42' });
    expect(view?.relationRequestId).toBe('fr-42');
  });

  test('absent, vide ou d’un autre type, il vaut `null` — aucun identifiant fabriqué', () => {
    // Même idiome qu'`isSelf` et `blockedByViewer` : une passerelle plus
    // ancienne ne fabrique pas un geste qui partirait dans le vide.
    expect(decodePublicProfileView(WIRE_THIRD_PARTY)?.relationRequestId).toBeNull();
    expect(decodePublicProfileView({ ...WIRE_THIRD_PARTY, relationRequestId: null })?.relationRequestId).toBeNull();
    expect(decodePublicProfileView({ ...WIRE_THIRD_PARTY, relationRequestId: '   ' })?.relationRequestId).toBeNull();
    expect(decodePublicProfileView({ ...WIRE_THIRD_PARTY, relationRequestId: 42 })?.relationRequestId).toBeNull();
  });

  test('la vue porte le profil, les statistiques, la relation et `isSelf`', () => {
    const view = decodePublicProfileView({ ...WIRE_THIRD_PARTY, relation: 'pending_received', isSelf: false });
    expect(view?.relation).toBe('pending_received');
    expect(view?.isSelf).toBe(false);
    expect(view?.profile.username).toBe('kwame-mensah');
    expect(view?.stats?.memberDays).toBe(512);
  });

  test('un profil illisible rend `null` — la vue entière tombe avec lui', () => {
    expect(decodePublicProfileView({ username: 'sans-id' })).toBeNull();
  });

  /**
   * **`blockedByViewer` VOYAGE À CÔTÉ DE LA RELATION, JAMAIS DEDANS** (#7125) —
   * bloquer quelqu'un n'efface pas la ligne d'amitié, et la passerelle continue
   * de servir `friend` : c'est ce qui permet à « Débloquer » de rendre la
   * relation qu'on avait. Une sixième valeur de `relation` l'aurait écrasée.
   */
  test('« ai-je bloqué cette personne » est un champ à part, et la ligne d’amitié lui SURVIT', () => {
    const view = decodePublicProfileView({ ...WIRE_THIRD_PARTY, relation: 'friend', blockedByViewer: true });
    expect(view?.blockedByViewer).toBe(true);
    expect(view?.relation).toBe('friend');
  });

  /* Un champ absent — une passerelle plus ancienne — ou d'un autre type ne
     fabrique pas un blocage : seul un `true` SERVI en est un, exactement comme
     `isSelf` juste à côté. */
  test('rien d’autre qu’un `true` servi ne vaut un blocage', () => {
    expect(decodePublicProfileView(WIRE_THIRD_PARTY)?.blockedByViewer).toBe(false);
    expect(decodePublicProfileView({ ...WIRE_THIRD_PARTY, blockedByViewer: 'oui' })?.blockedByViewer).toBe(false);
    expect(decodePublicProfileView({ ...WIRE_THIRD_PARTY, blockedByViewer: false })?.blockedByViewer).toBe(false);
  });
});

const recordingTransport = (): { readonly transport: HttpTransport; readonly paths: string[] } => {
  const paths: string[] = [];
  const transport = {
    request: async (options: { readonly path: string }) => {
      paths.push(options.path);
      return { ok: true as const, status: 200, data: WIRE_THIRD_PARTY };
    },
  } as unknown as HttpTransport;
  return { transport, paths };
};

describe('loadPublicProfile — ce que la requête demande', () => {
  test('UN aller-retour : `expand=stats,relation`, et JAMAIS `presence`', async () => {
    const { transport, paths } = recordingTransport();
    await loadPublicProfile({ source: 'gateway', transport, handle: 'kwame-mensah' });
    expect(paths).toEqual(['/api/v1/directory/people/kwame-mensah?expand=stats%2Crelation']);
    expect(paths[0]).not.toContain('presence');
  });

  test('le handle est encodé', async () => {
    const { transport, paths } = recordingTransport();
    await loadPublicProfile({ source: 'gateway', transport, handle: 'a b/c' });
    expect(paths[0]).toBe('/api/v1/directory/people/a%20b%2Fc?expand=stats%2Crelation');
  });

  test('la charge servie devient une VUE, pas un profil nu', async () => {
    const { transport } = recordingTransport();
    const result = await loadPublicProfile({ source: 'gateway', transport, handle: 'kwame-mensah' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.profile.id).toBe('u-rich-kwame');
    expect(result.data.stats?.postsCount).toBe(7);
    expect(result.data.relation).toBe('none');
  });
});

describe('publicProfileQueryKey', () => {
  test('la clé est INSENSIBLE À LA CASSE, comme la comparaison du serveur', () => {
    expect(publicProfileQueryKey('@Kwame-Mensah'.slice(1))).toEqual(publicProfileQueryKey('kwame-mensah'));
  });
});

describe('PUBLIC_PROFILE_STALE_TIME', () => {
  /* La charge ne porte plus une seule identité : elle porte une RELATION qui
     change au geste d'un tiers et des COMPTEURS. La route déclare elle-même
     `max-age=60` (`routes/directory/person.ts:299-306`) — s'aligner dessus est
     la seule valeur qui ne mente pas. */
  test('SOIXANTE SECONDES — la fenêtre que la route déclare', () => {
    expect(PUBLIC_PROFILE_STALE_TIME).toBe(60_000);
  });
});
