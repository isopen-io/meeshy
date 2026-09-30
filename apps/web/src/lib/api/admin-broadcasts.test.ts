import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { describe, expect, test } from 'bun:test';

import { OBJECT_ID, servedBroadcast, servedBroadcastRow, servedPerson, servedPreview, servedReadyBroadcast } from '@/lib/admin/broadcast-fixtures';
import { resultatServi } from '@/test-support/served-pagination';

import {
  ADMIN_BROADCAST_PREPARE_TIMEOUT_MS,
  ADMIN_BROADCASTS_KEY,
  ADMIN_BROADCASTS_LISTS_KEY,
  adminBroadcastKey,
  adminBroadcastPreviewKey,
  adminBroadcastsListKey,
  createAdminBroadcast,
  decodeAdminBroadcast,
  decodeAdminBroadcastRow,
  decodeBroadcastPreview,
  decodeBroadcastTargeting,
  deleteAdminBroadcast,
  loadAdminBroadcast,
  loadAdminBroadcasts,
  prepareAdminBroadcast,
  publishAdminBroadcastInApp,
  sendAdminBroadcast,
  updateAdminBroadcast,
  type AdminBroadcastBody,
} from './admin-broadcasts';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { estClefNonPersistable } from './souverain';

/**
 * **LES DIFFUSIONS, DÉCODÉES CHAMP PAR CHAMP** (#8876, #6731) — la liste sert une
 * projection étroite, la fiche la ligne entière avec trois personnes NOMMÉES. Un
 * décodeur qui étalerait la charge recopierait, le jour où la passerelle
 * l'élargirait, des identifiants d'acteurs que l'écran ne doit jamais peindre.
 */

function recording(result: ApiResult<unknown>): { readonly deps: { readonly source: 'gateway'; readonly transport: HttpTransport }; readonly calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      calls.push(request);
      return result;
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, calls };
}

describe('decodeAdminBroadcastRow — la ligne de liste, forme figée', () => {
  test('garde exactement les champs affichés par la liste', () => {
    const decoded = decodeAdminBroadcastRow(
      servedBroadcastRow({
        status: 'SENT',
        totalRecipients: 120,
        sentCount: 110,
        failedCount: 4,
        sentAt: '2026-09-29T12:00:00.000Z',
        inAppSentCount: 118,
        inAppSentAt: '2026-09-29T13:00:00.000Z',
      }),
    );

    expect(decoded).toEqual({
      id: OBJECT_ID(1),
      name: 'Lancement de l’automne',
      subject: 'Nouveautés de septembre',
      status: 'SENT',
      totalRecipients: 120,
      sentCount: 110,
      failedCount: 4,
      inAppSentCount: 118,
      inAppSentAt: '2026-09-29T13:00:00.000Z',
      createdAt: '2026-09-29T10:00:00.000Z',
      sentAt: '2026-09-29T12:00:00.000Z',
    });
  });

  test('n’étale rien : un champ que la passerelle ajouterait ne passe pas', () => {
    const decoded = decodeAdminBroadcastRow({ ...servedBroadcastRow(), body: 'corps entier', createdById: OBJECT_ID(3), secret: 'x' });

    expect(decoded).not.toBeNull();
    expect(Object.keys(decoded ?? {}).sort()).toEqual(
      ['createdAt', 'failedCount', 'id', 'inAppSentAt', 'inAppSentCount', 'name', 'sentAt', 'sentCount', 'status', 'subject', 'totalRecipients'].sort(),
    );
  });

  test('écarte une ligne sans identifiant, sans statut ou sans date de création', () => {
    expect(decodeAdminBroadcastRow(servedBroadcastRow({ id: '' }))).toBeNull();
    expect(decodeAdminBroadcastRow(servedBroadcastRow({ status: undefined }))).toBeNull();
    expect(decodeAdminBroadcastRow(servedBroadcastRow({ createdAt: undefined }))).toBeNull();
    expect(decodeAdminBroadcastRow(null)).toBeNull();
    expect(decodeAdminBroadcastRow('x')).toBeNull();
  });

  test('un compteur illisible vaut zéro, jamais NaN', () => {
    const decoded = decodeAdminBroadcastRow(servedBroadcastRow({ totalRecipients: 'beaucoup', sentCount: -3, failedCount: null }));

    expect(decoded?.totalRecipients).toBe(0);
    expect(decoded?.sentCount).toBe(0);
    expect(decoded?.failedCount).toBe(0);
  });
});

describe('decodeBroadcastTargeting — le ciblage, lu avec prudence', () => {
  test('un ciblage vide ou absent vise tous les comptes', () => {
    const everyone = { activity: 'all', inactiveDays: null, languages: [], countries: [] };

    expect(decodeBroadcastTargeting({})).toEqual(everyone);
    expect(decodeBroadcastTargeting(null)).toEqual(everyone);
    expect(decodeBroadcastTargeting('x')).toEqual(everyone);
  });

  test('une activité inconnue retombe sur « tous », jamais sur une valeur brute', () => {
    expect(decodeBroadcastTargeting({ activityStatus: 'legendary' }).activity).toBe('all');
    expect(decodeBroadcastTargeting({ activityStatus: 'new' }).activity).toBe('new');
  });

  test('inactiveDays n’existe que pour un entier positif', () => {
    expect(decodeBroadcastTargeting({ activityStatus: 'inactive', inactiveDays: 45 }).inactiveDays).toBe(45);
    expect(decodeBroadcastTargeting({ activityStatus: 'inactive', inactiveDays: 0 }).inactiveDays).toBeNull();
    expect(decodeBroadcastTargeting({ activityStatus: 'inactive', inactiveDays: 2.5 }).inactiveDays).toBeNull();
    expect(decodeBroadcastTargeting({ activityStatus: 'inactive', inactiveDays: '30' }).inactiveDays).toBeNull();
  });

  test('les langues et les pays sont dédupliqués et ne gardent que des textes non vides', () => {
    const decoded = decodeBroadcastTargeting({ languages: ['fr', 'fr', ' es ', '', 4, null], countries: ['SN', 'sn', 'FR', {}] });

    expect(decoded.languages).toEqual(['fr', 'es']);
    expect(decoded.countries).toEqual(['SN', 'FR']);
  });
});

describe('decodeAdminBroadcast — la fiche, forme figée, personnes nommées', () => {
  test('garde exactement les champs affichés, traductions et personnes comprises', () => {
    const decoded = decodeAdminBroadcast(
      servedReadyBroadcast({
        status: 'SENT',
        sentCount: 1100,
        failedCount: 4,
        sentById: OBJECT_ID(4),
        sentBy: servedPerson(4),
        sentAt: '2026-09-29T12:00:00.000Z',
        completedAt: '2026-09-29T12:20:00.000Z',
        inAppSentById: OBJECT_ID(5),
        inAppSentBy: servedPerson(5),
        inAppSentAt: '2026-09-29T13:00:00.000Z',
        inAppCompletedAt: '2026-09-29T13:05:00.000Z',
        inAppSentCount: 1190,
        inAppFailedCount: 2,
      }),
    );

    expect(decoded).toEqual({
      id: OBJECT_ID(1),
      name: 'Lancement de l’automne',
      subject: 'Nouveautés de septembre',
      body: 'Bonjour,\nvoici ce qui change ce mois-ci.',
      sourceLanguage: 'fr',
      targeting: { activity: 'active', inactiveDays: null, languages: ['fr', 'es'], countries: ['SN', 'FR'] },
      translations: [
        { language: 'es', subject: 'Novedades de septiembre', body: 'Hola,\nesto es lo que cambia este mes.' },
        { language: 'en', subject: 'September news', body: 'Hello,\nhere is what changes this month.' },
      ],
      targetLanguages: ['es', 'en'],
      status: 'SENT',
      totalRecipients: 1204,
      sentCount: 1100,
      failedCount: 4,
      errorMessage: null,
      sentAt: '2026-09-29T12:00:00.000Z',
      completedAt: '2026-09-29T12:20:00.000Z',
      inAppSentAt: '2026-09-29T13:00:00.000Z',
      inAppCompletedAt: '2026-09-29T13:05:00.000Z',
      inAppSentCount: 1190,
      inAppFailedCount: 2,
      createdAt: '2026-09-29T10:00:00.000Z',
      updatedAt: '2026-09-29T11:00:00.000Z',
      createdBy: { id: OBJECT_ID(3), username: 'membre3', displayName: 'Membre 3', avatar: null },
      sentBy: { id: OBJECT_ID(4), username: 'membre4', displayName: 'Membre 4', avatar: null },
      inAppSentBy: { id: OBJECT_ID(5), username: 'membre5', displayName: 'Membre 5', avatar: null },
    });
  });

  test('les identifiants d’acteurs ne sont PAS gardés quand les objets nommés sont servis', () => {
    const decoded = decodeAdminBroadcast(servedBroadcast({ sentById: OBJECT_ID(4), inAppSentById: OBJECT_ID(5) }));

    expect(decoded).not.toBeNull();
    const keys = Object.keys(decoded ?? {});
    expect(keys).not.toContain('createdById');
    expect(keys).not.toContain('sentById');
    expect(keys).not.toContain('inAppSentById');
  });

  test('n’étale rien : un champ voisin de la ligne ne passe pas', () => {
    const decoded = decodeAdminBroadcast({ ...servedBroadcast(), __v: 3, secret: 'x' });

    expect(Object.keys(decoded ?? {})).not.toContain('secret');
    expect(Object.keys(decoded ?? {})).not.toContain('__v');
  });

  test('un compte supprimé (personne non servie) donne null, pas une personne inventée', () => {
    const decoded = decodeAdminBroadcast(servedBroadcast({ createdBy: null }));

    expect(decoded?.createdBy).toBeNull();
  });

  test('les traductions se rangent dans l’ordre des langues cibles, puis par code', () => {
    const decoded = decodeAdminBroadcast(
      servedReadyBroadcast({
        targetLanguages: ['en', 'es'],
        translatedSubjects: { es: 'S es', de: 'S de', en: 'S en' },
        translatedBodies: { es: 'B es', de: 'B de', en: 'B en' },
      }),
    );

    expect(decoded?.translations.map((translation) => translation.language)).toEqual(['en', 'es', 'de']);
  });

  test('une traduction sans texte lisible est écartée ; une moitié seulement se garde', () => {
    const decoded = decodeAdminBroadcast(
      servedReadyBroadcast({
        targetLanguages: [],
        translatedSubjects: { es: 'Solo asunto', pt: '', de: 4 },
        translatedBodies: { fr: null, it: 'Solo corpo' },
      }),
    );

    expect(decoded?.translations).toEqual([
      { language: 'es', subject: 'Solo asunto', body: null },
      { language: 'it', subject: null, body: 'Solo corpo' },
    ]);
  });

  test('l’erreur d’envoi est gardée ; un message vide devient null', () => {
    expect(decodeAdminBroadcast(servedBroadcast({ status: 'FAILED', errorMessage: 'SMTP refusé' }))?.errorMessage).toBe('SMTP refusé');
    expect(decodeAdminBroadcast(servedBroadcast({ errorMessage: '  ' }))?.errorMessage).toBeNull();
  });

  test('une fiche sans identifiant, statut ou date de création est illisible', () => {
    expect(decodeAdminBroadcast(servedBroadcast({ id: undefined }))).toBeNull();
    expect(decodeAdminBroadcast(servedBroadcast({ status: 4 }))).toBeNull();
    expect(decodeAdminBroadcast(servedBroadcast({ createdAt: null }))).toBeNull();
    expect(decodeAdminBroadcast([])).toBeNull();
  });
});

describe('decodeBroadcastPreview — ce que la préparation rapporte', () => {
  test('garde le nombre de destinataires et les deux répartitions, triées par effectif', () => {
    const decoded = decodeBroadcastPreview(servedPreview({ recipientsByLanguage: [{ language: 'en', count: 4 }, { language: 'fr', count: 9 }] }));

    expect(decoded).toEqual({
      recipientCount: 1204,
      byLanguage: [
        { language: 'fr', count: 9 },
        { language: 'en', count: 4 },
      ],
      byCountry: [
        { country: 'SN', count: 700 },
        { country: 'FR', count: 400 },
        { country: null, count: 104 },
      ],
    });
  });

  test('un pays absent ou vide se regroupe en UNE entrée « inconnu » (null)', () => {
    const decoded = decodeBroadcastPreview(
      servedPreview({ recipientsByCountry: [{ country: null, count: 3 }, { country: '', count: 2 }, { country: 'FR', count: 1 }] }),
    );

    expect(decoded?.byCountry).toEqual([
      { country: null, count: 5 },
      { country: 'FR', count: 1 },
    ]);
  });

  test('écarte les entrées illisibles, n’emporte ni les traductions ni la ligne', () => {
    const decoded = decodeBroadcastPreview(servedPreview({ recipientsByLanguage: [{ language: 'fr', count: 'x' }, { count: 2 }, { language: 'es', count: 2 }] }));

    expect(decoded?.byLanguage).toEqual([{ language: 'es', count: 2 }]);
    expect(Object.keys(decoded ?? {}).sort()).toEqual(['byCountry', 'byLanguage', 'recipientCount']);
  });

  test('une charge sans nombre de destinataires est illisible', () => {
    expect(decodeBroadcastPreview({ recipientsByLanguage: [] })).toBeNull();
    expect(decodeBroadcastPreview(null)).toBeNull();
  });
});

describe('les lectures', () => {
  test('la liste part vers la passerelle avec sa requête et se lit en page V2 imbriquée', async () => {
    const { deps, calls } = recording(
      resultatServi({ data: { broadcasts: [servedBroadcastRow(), { junk: true }], pagination: { total: 41, offset: 0, limit: 20, hasMore: true } } }),
    );

    const result = await loadAdminBroadcasts({ ...deps, query: new URLSearchParams({ offset: '0', limit: '20', status: 'DRAFT' }) });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.path).toBe(`${adminEndpoints.broadcasts}?offset=0&limit=20&status=DRAFT`);
    expect(result.ok && result.data.rows.map((row) => row.id)).toEqual([OBJECT_ID(1)]);
    expect(result.ok && result.data.total).toBe(41);
    expect(result.ok && result.data.hasMore).toBe(true);
  });

  test('la fiche se lit par son identifiant ; une charge illisible est un échec', async () => {
    const good = recording(resultatServi(servedBroadcast()));
    const loaded = await loadAdminBroadcast({ ...good.deps, broadcastId: OBJECT_ID(1) });
    expect(good.calls[0]?.path).toBe(adminEndpoints.broadcastsById(OBJECT_ID(1)));
    expect(loaded.ok && loaded.data.name).toBe('Lancement de l’automne');

    const bad = recording(resultatServi({ nope: 1 }));
    const failed = await loadAdminBroadcast({ ...bad.deps, broadcastId: OBJECT_ID(1) });
    expect(failed.ok).toBe(false);
  });

  test('un échec du transport est rendu tel quel', async () => {
    const { deps } = recording({ ok: false, status: 403, error: 'Interdit' });

    const result = await loadAdminBroadcasts({ ...deps, query: new URLSearchParams() });

    expect(result).toEqual({ ok: false, status: 403, error: 'Interdit' });
  });
});

describe('les écritures', () => {
  const body: AdminBroadcastBody = {
    name: 'Lancement',
    subject: 'Nouveautés',
    body: 'Bonjour',
    sourceLanguage: 'fr',
    targeting: { activityStatus: 'inactive', inactiveDays: 45, languages: ['es'], countries: ['SN'] },
  };

  test('créer : POST du corps exact, et seul l’identifiant de la diffusion revient', async () => {
    const { deps, calls } = recording(resultatServi(servedBroadcast({ id: OBJECT_ID(7) })));

    const result = await createAdminBroadcast({ ...deps, body });

    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.path).toBe(adminEndpoints.broadcasts);
    expect(calls[0]?.body).toEqual(body);
    expect(result).toEqual({ ok: true, data: { id: OBJECT_ID(7) }, status: 200 });
  });

  test('créer : une réponse sans identifiant est un échec, pas un succès muet', async () => {
    const { deps } = recording(resultatServi({ name: 'x' }));

    const result = await createAdminBroadcast({ ...deps, body });

    expect(result.ok).toBe(false);
  });

  test('modifier : PUT sur la diffusion, accusé seul', async () => {
    const { deps, calls } = recording(resultatServi(servedBroadcast()));

    const result = await updateAdminBroadcast({ ...deps, broadcastId: OBJECT_ID(1), body });

    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.path).toBe(adminEndpoints.broadcastsById(OBJECT_ID(1)));
    expect(calls[0]?.body).toEqual(body);
    expect(result.ok && result.data).toEqual({ acknowledged: true });
  });

  test('supprimer : DELETE sur la diffusion', async () => {
    const { deps, calls } = recording(resultatServi(undefined));

    const result = await deleteAdminBroadcast({ ...deps, broadcastId: OBJECT_ID(1) });

    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.path).toBe(adminEndpoints.broadcastsById(OBJECT_ID(1)));
    expect(result.ok && result.data).toEqual({ acknowledged: true });
  });

  test('préparer : POST preview avec un délai de garde long (la traduction prend son temps)', async () => {
    const { deps, calls } = recording(resultatServi(servedPreview()));

    const result = await prepareAdminBroadcast({ ...deps, broadcastId: OBJECT_ID(1) });

    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.path).toBe(adminEndpoints.broadcastsByIdPreview(OBJECT_ID(1)));
    expect(calls[0]?.timeoutMs).toBe(ADMIN_BROADCAST_PREPARE_TIMEOUT_MS);
    expect(ADMIN_BROADCAST_PREPARE_TIMEOUT_MS).toBeGreaterThan(15_000);
    expect(result.ok && result.data.recipientCount).toBe(1204);
  });

  test('préparer : une charge illisible est un échec', async () => {
    const { deps } = recording(resultatServi({}));

    expect((await prepareAdminBroadcast({ ...deps, broadcastId: OBJECT_ID(1) })).ok).toBe(false);
  });

  test('envoyer par e-mail et publier dans l’application : deux POST distincts, accusés seuls', async () => {
    const sent = recording(resultatServi(undefined));
    const sentResult = await sendAdminBroadcast({ ...sent.deps, broadcastId: OBJECT_ID(1) });
    expect(sent.calls[0]?.method).toBe('POST');
    expect(sent.calls[0]?.path).toBe(adminEndpoints.broadcastsByIdSend(OBJECT_ID(1)));
    expect(sentResult.ok && sentResult.data).toEqual({ acknowledged: true });

    const published = recording(resultatServi(undefined));
    const publishedResult = await publishAdminBroadcastInApp({ ...published.deps, broadcastId: OBJECT_ID(1) });
    expect(published.calls[0]?.method).toBe('POST');
    expect(published.calls[0]?.path).toBe(adminEndpoints.broadcastsByIdSendInapp(OBJECT_ID(1)));
    expect(publishedResult.ok && publishedResult.data).toEqual({ acknowledged: true });
  });

  test('un refus de la passerelle est rendu tel quel', async () => {
    const { deps } = recording({ ok: false, status: 400, error: 'Le broadcast doit etre en statut READY' });

    const result = await sendAdminBroadcast({ ...deps, broadcastId: OBJECT_ID(1) });

    expect(result).toEqual({ ok: false, status: 400, error: 'Le broadcast doit etre en statut READY' });
  });
});

describe('les clés de requête — jamais écrites sur le disque', () => {
  test('toutes vivent sous [admin, broadcast] et sont non persistables', () => {
    const keys = [ADMIN_BROADCASTS_KEY, ADMIN_BROADCASTS_LISTS_KEY, adminBroadcastsListKey('status=DRAFT'), adminBroadcastKey(OBJECT_ID(1)), adminBroadcastPreviewKey(OBJECT_ID(1))];

    for (const key of keys) {
      expect(key[0]).toBe('admin');
      expect(key[1]).toBe('broadcast');
      expect(estClefNonPersistable(key)).toBe(true);
    }
  });

  test('la liste, la fiche et l’aperçu de préparation ont chacun leur sous-arbre', () => {
    expect(adminBroadcastsListKey('q=x').slice(0, 3)).toEqual([...ADMIN_BROADCASTS_LISTS_KEY]);
    expect(adminBroadcastKey(OBJECT_ID(1))).not.toEqual(adminBroadcastPreviewKey(OBJECT_ID(1)));
  });
});
