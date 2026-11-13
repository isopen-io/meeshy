import { describe, expect, test } from 'bun:test';

import {
  APP_PREFERENCE_FIELDS,
  decodeAppPreferences,
  decodeServedPreferences,
  loadAppPreferences,
  patchAppPreferences,
  preferencesPatchBody,
  type AppPreferences,
} from './app-preferences';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

/**
 * LE PORT DES RÉGLAGES D'USAGE (#5563) — `GET`/`PATCH /api/v1/me/preferences`
 * (`services/gateway/src/routes/me/preferences/unified-routes.ts`, #4181).
 *
 * Il ne lit et n'écrit QUE les réglages que l'écran montre, et que la
 * passerelle OBÉIT : le thème (relu par iOS, `ThemeManager.observeRemoteThemeSync`),
 * les notifications poussées et leur son (`PushNotificationService`), et les
 * quatre bascules de visibilité, et la discrétion de la recherche par identifiant (#8105) (`PresenceVisibilityService`,
 * `MeeshySocketIOManager`, `MessageReadStatusService`), et l'annonce « X était
 * sur Meeshy récemment » dans ses deux sens (#8285). Le cache de requêtes
 * est persisté : rien d'autre que ces onze valeurs n'y entre.
 */

const wire = (overrides: Record<string, Record<string, unknown>> = {}) => ({
  application: { theme: 'dark', interfaceLanguage: 'en', fontSize: 'medium', ...overrides.application },
  notification: {
    pushEnabled: false,
    soundEnabled: true,
    contactActivityEnabled: false,
    gameEnabled: false,
    gamePhotoEnabled: false,
    emailEnabled: true,
    dndEnabled: false,
    ...overrides.notification,
  },
  privacy: {
    showOnlineStatus: false,
    showLastSeen: true,
    showReadReceipts: true,
    showTypingIndicator: false,
    hideProfileFromSearch: true,
    acceptCallsFromNonContacts: false,
    notifyContactsOnReturn: false,
    saveMediaToGallery: true,
    allowAnalytics: true,
    ...overrides.privacy,
  },
});

const expected: AppPreferences = {
  theme: 'dark',
  pushEnabled: false,
  soundEnabled: true,
  contactActivityEnabled: false,
  bringEnabled: true,
  gameEnabled: false,
  gamePhotoEnabled: false,
  showOnlineStatus: false,
  showLastSeen: true,
  showReadReceipts: true,
  showTypingIndicator: false,
  hideProfileFromSearch: true,
  acceptCallsFromNonContacts: false,
  notifyContactsOnReturn: false,
  saveMediaToGallery: true,
  allowAnalytics: true,
};

const transportAnswering = (answer: ApiResult<unknown>) => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      calls.push(request);
      return answer;
    },
  } as unknown as HttpTransport;
  return { calls, transport };
};

describe('decodeAppPreferences — une PROJECTION, jamais la charge reçue', () => {
  test('rend exactement les douze réglages de l’écran', () => {
    expect(decodeAppPreferences(wire())).toEqual(expected);
  });

  test('les notifications du jeu : lues sous `notification`, ABSENTES = reçues (un ancien serveur ne les sert pas)', () => {
    expect(decodeAppPreferences(wire({ notification: { gameEnabled: true } }))?.gameEnabled).toBe(true);
    const { gameEnabled: _served, ...withoutGame } = wire().notification;
    expect(decodeAppPreferences({ ...wire(), notification: withoutGame })?.gameEnabled).toBe(true);
  });

  test('« Moments à immortaliser » : lu sous `notification`, ABSENT = reçu (un ancien serveur ne le sert pas, #10268)', () => {
    expect(decodeAppPreferences(wire({ notification: { gamePhotoEnabled: true } }))?.gamePhotoEnabled).toBe(true);
    const { gamePhotoEnabled: _served, ...withoutPhoto } = wire().notification;
    expect(decodeAppPreferences({ ...wire(), notification: withoutPhoto })?.gamePhotoEnabled).toBe(true);
  });

  test('« Moments à immortaliser » de mauvais type rend la lecture illisible, jamais une valeur devinée', () => {
    expect(decodeAppPreferences(wire({ notification: { gamePhotoEnabled: 'oui' } }))).toBeNull();
  });

  test('la bascule « Analytique » est lue sous `privacy` ; ABSENTE (ancien serveur), la charge se décode toujours et la bascule reste inconnue (#10502)', () => {
    expect(decodeAppPreferences(wire({ privacy: { allowAnalytics: false } }))?.allowAnalytics).toBe(false);
    const { allowAnalytics: _served, ...withoutAnalytics } = wire().privacy;
    const decoded = decodeAppPreferences({ ...wire(), privacy: withoutAnalytics });
    expect(decoded).not.toBeNull();
    expect(decoded !== null && 'allowAnalytics' in decoded).toBe(false);
  });

  test('« Sauvegarder média » est lu sous `privacy` ; ABSENT (ancien serveur), il vaut COUPÉ — un média ne rejoint la galerie que si on le veut (#14641)', () => {
    expect(decodeAppPreferences(wire({ privacy: { saveMediaToGallery: false } }))?.saveMediaToGallery).toBe(false);
    const { saveMediaToGallery: _served, ...withoutGallery } = wire().privacy;
    expect(decodeAppPreferences({ ...wire(), privacy: withoutGallery })?.saveMediaToGallery).toBe(false);
  });

  test('« Sauvegarder média » de mauvais type rend la lecture illisible', () => {
    expect(decodeAppPreferences(wire({ privacy: { saveMediaToGallery: 'oui' } }))).toBeNull();
  });

  test('la lecture demande « Sauvegarder média », et son écriture part sous `privacy`', async () => {
    const { calls, transport } = transportAnswering({ ok: true, data: wire() });
    await loadAppPreferences({ source: 'gateway', transport });
    expect(calls[0]?.path).toContain('privacy.saveMediaToGallery');
    expect(preferencesPatchBody({ saveMediaToGallery: true })).toEqual({ privacy: { saveMediaToGallery: true } });
  });

  test('une bascule « Analytique » de mauvais type rend la lecture illisible, jamais un refus ou un accord deviné', () => {
    expect(decodeAppPreferences(wire({ privacy: { allowAnalytics: 'oui' } }))).toBeNull();
  });

  test('la lecture demande la bascule « Analytique » avec les autres', async () => {
    const { calls, transport } = transportAnswering({ ok: true, data: wire() });
    await loadAppPreferences({ source: 'gateway', transport });
    expect(calls[0]?.path).toContain('privacy.allowAnalytics');
  });

  test('un interrupteur du jeu de mauvais type rend la lecture illisible, jamais une valeur devinée', () => {
    expect(decodeAppPreferences(wire({ notification: { gameEnabled: 'oui' } }))).toBeNull();
  });

  test('aucun champ voisin n’entre dans le cache persisté', () => {
    const decoded = decodeAppPreferences(wire());
    expect(Object.keys(decoded ?? {}).sort()).toEqual(Object.keys(APP_PREFERENCE_FIELDS).sort());
  });

  test('un réglage de mauvais type rend la lecture ILLISIBLE, jamais une valeur devinée', () => {
    expect(decodeAppPreferences(wire({ privacy: { showOnlineStatus: 'no' } }))).toBeNull();
    expect(decodeAppPreferences(wire({ application: { theme: 'sepia' } }))).toBeNull();
  });

  test('une catégorie absente rend la lecture illisible', () => {
    const { privacy: _privacy, ...partial } = wire();
    expect(decodeAppPreferences(partial)).toBeNull();
  });
});

describe('decodeServedPreferences — ce qu’une écriture rend, catégorie par catégorie', () => {
  test('ne rend que les réglages des catégories servies', () => {
    expect(
      decodeServedPreferences({ notification: { pushEnabled: true, soundEnabled: false, contactActivityEnabled: false, emailEnabled: true } }),
    ).toEqual({
      pushEnabled: true,
      soundEnabled: false,
      contactActivityEnabled: false,
    });
  });

  test('l’interrupteur du jeu, servi, est rendu ; non servi, il n’est pas inventé', () => {
    expect(decodeServedPreferences({ notification: { pushEnabled: true, soundEnabled: false, contactActivityEnabled: true, gameEnabled: false } })).toEqual({
      pushEnabled: true,
      soundEnabled: false,
      contactActivityEnabled: true,
      gameEnabled: false,
    });
  });

  test('« Moments à immortaliser », servi, est rendu ; non servi, il n’est pas inventé (#10268)', () => {
    expect(decodeServedPreferences({ notification: { pushEnabled: true, soundEnabled: false, contactActivityEnabled: true, gamePhotoEnabled: false } })).toEqual({
      pushEnabled: true,
      soundEnabled: false,
      contactActivityEnabled: true,
      gamePhotoEnabled: false,
    });
  });

  test('une catégorie servie mal formée est illisible', () => {
    expect(decodeServedPreferences({ notification: { pushEnabled: 1, soundEnabled: false } })).toBeNull();
  });
});

describe('preferencesPatchBody — un réglage retrouve SA catégorie', () => {
  test('les réglages se rangent sous la catégorie que la passerelle attend', () => {
    expect(preferencesPatchBody({ pushEnabled: false, showLastSeen: false, theme: 'light' })).toEqual({
      notification: { pushEnabled: false },
      privacy: { showLastSeen: false },
      application: { theme: 'light' },
    });
  });

  test('« ne pas me proposer » part sous `privacy`, là où la recherche par identifiant la lit (#8105)', () => {
    expect(preferencesPatchBody({ hideProfileFromSearch: true })).toEqual({ privacy: { hideProfileFromSearch: true } });
  });

  test('« appels hors contacts » part sous `privacy`, là où la porte de sonnerie la lit (#8073)', () => {
    expect(preferencesPatchBody({ acceptCallsFromNonContacts: true })).toEqual({ privacy: { acceptCallsFromNonContacts: true } });
  });

  test('« prévenir mes contacts quand je reviens » part sous `privacy`, là où l’annonce la lit (#8285)', () => {
    expect(preferencesPatchBody({ notifyContactsOnReturn: false })).toEqual({ privacy: { notifyContactsOnReturn: false } });
  });

  test('« quand un contact revient » part sous `notification`, là où la réception la lit (#8285)', () => {
    expect(preferencesPatchBody({ contactActivityEnabled: false })).toEqual({ notification: { contactActivityEnabled: false } });
  });

  test('« notifications du jeu » part sous `notification`, là où `GameNotifier` la lit (#9490)', () => {
    expect(preferencesPatchBody({ gameEnabled: false })).toEqual({ notification: { gameEnabled: false } });
  });

  test('« Moments à immortaliser » part sous `notification`, là où la porte du push photo la lit (#10268)', () => {
    expect(preferencesPatchBody({ gamePhotoEnabled: false })).toEqual({ notification: { gamePhotoEnabled: false } });
  });

  test('la lecture demande « Moments à immortaliser » avec les autres', async () => {
    const { calls, transport } = transportAnswering({ ok: true, data: wire() });
    await loadAppPreferences({ source: 'gateway', transport });
    expect(calls[0]?.path).toContain('notification.gamePhotoEnabled');
  });

  test('la lecture demande le champ du jeu avec les autres', async () => {
    const { calls, transport } = transportAnswering({ ok: true, data: wire() });
    await loadAppPreferences({ source: 'gateway', transport });
    expect(calls[0]?.path).toContain('notification.gameEnabled');
  });

  test('une catégorie que le geste ne touche pas ne part pas', () => {
    expect(Object.keys(preferencesPatchBody({ soundEnabled: true }))).toEqual(['notification']);
  });
});

describe('loadAppPreferences — une seule lecture, bornée à ce que l’écran montre', () => {
  test('demande les onze champs, et rien d’autre', async () => {
    const { calls, transport } = transportAnswering({ ok: true, data: wire() });
    const result = await loadAppPreferences({ source: 'gateway', transport });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    const url = new URL(calls[0]?.path ?? '', 'https://gate.example');
    expect(url.pathname).toBe('/api/v1/me/preferences');
    expect((url.searchParams.get('fields') ?? '').split(',').sort()).toEqual(
      Object.entries(APP_PREFERENCE_FIELDS)
        .map(([key, category]) => `${category}.${key}`)
        .sort(),
    );
    expect(result).toEqual({ ok: true, data: expected });
  });

  test('une charge illisible est un ÉCHEC, pas des valeurs par défaut', async () => {
    const { transport } = transportAnswering({ ok: true, data: { application: {} } });
    const result = await loadAppPreferences({ source: 'gateway', transport });
    expect(result.ok).toBe(false);
  });

  test('un refus de la passerelle remonte tel quel', async () => {
    const refusal: ApiResult<unknown> = { ok: false, status: 503, error: 'Indisponible' };
    const { transport } = transportAnswering(refusal);
    expect(await loadAppPreferences({ source: 'gateway', transport })).toEqual(refusal);
  });
});

describe('patchAppPreferences — l’écriture fusionne, et rend ce que le serveur a retenu', () => {
  test('PATCH multi-catégories, corps rangé par catégorie', async () => {
    const { calls, transport } = transportAnswering({ ok: true, data: { privacy: wire().privacy } });
    const result = await patchAppPreferences({ source: 'gateway', transport }, { showTypingIndicator: true });
    expect([calls[0]?.method, calls[0]?.path]).toEqual(['PATCH', '/api/v1/me/preferences']);
    expect(calls[0]?.body).toEqual({ privacy: { showTypingIndicator: true } });
    expect(result).toEqual({
      ok: true,
      data: {
        showOnlineStatus: false,
        showLastSeen: true,
        showReadReceipts: true,
        showTypingIndicator: false,
        hideProfileFromSearch: true,
        acceptCallsFromNonContacts: false,
        notifyContactsOnReturn: false,
        saveMediaToGallery: true,
        allowAnalytics: true,
      },
    });
  });

  test('sous les fixtures, l’écriture est tenue en mémoire et relue', async () => {
    const { calls, transport } = transportAnswering({ ok: false, status: 0, error: 'jamais appelé' });
    const written = await patchAppPreferences({ source: 'fixtures', transport }, { soundEnabled: false });
    const read = await loadAppPreferences({ source: 'fixtures', transport });
    expect(calls).toHaveLength(0);
    expect(written.ok && written.data.soundEnabled).toBe(false);
    expect(read.ok && read.data.soundEnabled).toBe(false);
  });
});

/**
 * « RECEVOIR DES BRING » (#16588) — l'interrupteur GLOBAL de la réception du
 * Bring (`notification.bringEnabled`, lu par `BringService.recipientPreferences`).
 * Défaut serveur : activé. Un serveur qui ne le sert pas veut dire « reçu ».
 */
describe('« Recevoir des Bring » — le port le lit, le rend et l’écrit (#16588)', () => {
  test('servi coupé, il est rendu coupé', () => {
    expect(decodeAppPreferences(wire({ notification: { bringEnabled: false } }))?.bringEnabled).toBe(false);
  });

  test('absent (serveur plus ancien), il vaut « reçu »', () => {
    expect(decodeAppPreferences(wire())?.bringEnabled).toBe(true);
  });

  test('de mauvais type, la lecture est illisible plutôt que devinée', () => {
    expect(decodeAppPreferences(wire({ notification: { bringEnabled: 'non' } }))).toBeNull();
  });

  test('la réponse d’une écriture le rend s’il est servi, ne l’invente pas sinon', () => {
    const base = { pushEnabled: true, soundEnabled: true, contactActivityEnabled: true };
    expect(decodeServedPreferences({ notification: { ...base, bringEnabled: false } })).toEqual({ ...base, bringEnabled: false });
    expect(decodeServedPreferences({ notification: base })).toEqual(base);
  });

  test('il part sous `notification`, là où la passerelle le lit', () => {
    expect(preferencesPatchBody({ bringEnabled: false })).toEqual({ notification: { bringEnabled: false } });
  });

  test('la lecture le demande avec les autres', async () => {
    const { calls, transport } = transportAnswering({ ok: true, data: wire() });
    await loadAppPreferences({ source: 'gateway', transport });
    expect(calls[0]?.path).toContain('notification.bringEnabled');
  });
});
