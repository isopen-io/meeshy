/**
 * @jest-environment node
 */

import { boiteDuLecteur } from '@/lib/api/notifications';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la PROJECTION de ce que la passerelle sert,
 * jamais une forme inventée ici. Chaque charge de bouchon copie
 * `NotificationFormatter.formatNotification`
 * (`services/gateway/src/services/notifications/NotificationFormatter.ts:63-95`)
 * et l'enveloppe du handler de liste (`routes/notifications.ts:190-217`) : un
 * vert obtenu contre une charge qui ne ressemble pas au serveur ne prouve rien.
 *
 * Les deux témoins qui comptent vraiment sont ceux des DEUX PIÈGES de forme,
 * tous deux trouvés en lisant la passerelle plutôt qu'en devinant :
 *
 *   - l'état vit sous `state`, pas à la racine — `brut.isRead` rendrait
 *     `undefined` pour TOUTES les lignes, donc « non lue » partout, et un
 *     compteur qui ne descend jamais ;
 *   - `unreadCount` est à la RACINE de l'enveloppe, pas sous `meta` — le lire
 *     ailleurs rendrait zéro en permanence, et une pastille éteinte.
 *
 * Un témoin qui n'éprouverait que « la liste rend trois lignes » serait vert
 * avec l'une et l'autre erreur en place.
 */

const JETON = 'jeton-de-test';
const BASE = 'https://passerelle.test';

const servi = (corps: unknown, statut = 200) =>
  jest.fn(async () =>
    new Response(JSON.stringify(corps), {
      status: statut,
      headers: { 'content-type': 'application/json' },
    }),
  );

/** Une ligne telle que `formatNotification` la sert : l'état sous `state`. */
const ligne = (surcharge: Record<string, unknown> = {}) => ({
  id: 'n1',
  userId: 'u1',
  type: 'message',
  priority: 'normal',
  title: 'Alice vous a répondu',
  subtitle: null,
  content: 'On se voit demain ?',
  actor: { id: 'u2', displayName: 'Alice' },
  context: {},
  metadata: {},
  state: { isRead: false, readAt: null, createdAt: '2026-09-02T20:00:00.000Z', expiresAt: undefined },
  delivery: { emailSent: false, pushSent: true },
  ...surcharge,
});

const enveloppe = (data: unknown[], extra: Record<string, unknown> = {}) => ({
  success: true,
  data,
  pagination: { total: 42, offset: 0, limit: 30, hasMore: true, form: 'offset' },
  unreadCount: 7,
  ...extra,
});

describe('la boîte du lecteur', () => {
  it('projette une notification servie sans en relayer ni l’acteur ni la livraison', async () => {
    const recuperer = servi(enveloppe([ligne()]));

    const boite = await boiteDuLecteur({ jeton: JETON, base: BASE, recuperer });

    expect(boite.genre).toBe('liste');
    if (boite.genre !== 'liste') return;

    expect(boite.notifications).toHaveLength(1);
    const n = boite.notifications[0];
    if (n === undefined) throw new Error('une notification attendue');
    expect(n).toEqual({
      id: 'n1',
      genre: 'message',
      titre: 'Alice vous a répondu',
      sousTitre: null,
      corps: 'On se voit demain ?',
      nomDeLActeur: 'Alice',
      lue: false,
      creeeA: '2026-09-02T20:00:00.000Z',
    });

    // Ce qui n'est pas projeté ne peut pas fuir par un rendu distrait.
    expect(Object.keys(n)).not.toContain('delivery');
    expect(Object.keys(n)).not.toContain('metadata');
    expect(Object.keys(n)).not.toContain('userId');
  });

  it('lit l’état SOUS `state` — une ligne lue est rendue lue', async () => {
    const recuperer = servi(
      enveloppe([
        ligne({ id: 'lue', state: { isRead: true, readAt: '2026-09-02T21:00:00.000Z', createdAt: '2026-09-02T20:00:00.000Z' } }),
        ligne({ id: 'fraiche' }),
      ]),
    );

    const boite = await boiteDuLecteur({ jeton: JETON, base: BASE, recuperer });
    if (boite.genre !== 'liste') throw new Error('liste attendue');

    expect(boite.notifications.map((n) => [n.id, n.lue])).toEqual([
      ['lue', true],
      ['fraiche', false],
    ]);
  });

  it('accepte AUSSI la forme racine, celle qu’un événement socket porte', async () => {
    const brute = ligne({ id: 'socket' }) as Record<string, unknown>;
    delete brute.state;
    const recuperer = servi(enveloppe([{ ...brute, isRead: true, createdAt: '2026-09-02T19:00:00.000Z' }]));

    const boite = await boiteDuLecteur({ jeton: JETON, base: BASE, recuperer });
    if (boite.genre !== 'liste') throw new Error('liste attendue');

    const [n] = boite.notifications;
    expect(n?.lue).toBe(true);
    expect(n?.creeeA).toBe('2026-09-02T19:00:00.000Z');
  });

  it('lit `unreadCount` à la RACINE de l’enveloppe, et le total dans la pagination', async () => {
    const recuperer = servi(enveloppe([ligne()]));

    const boite = await boiteDuLecteur({ jeton: JETON, base: BASE, recuperer });
    if (boite.genre !== 'liste') throw new Error('liste attendue');

    expect(boite.nonLues).toBe(7);
    expect(boite.total).toBe(42);
  });

  it('rend zéro quand la forme par CURSEUR ne porte aucun total, sans l’inventer', async () => {
    const recuperer = servi({
      success: true,
      data: [ligne()],
      pagination: { limit: 30, hasMore: true, nextCursor: 'c2', form: 'cursor' },
      unreadCount: 3,
    });

    const boite = await boiteDuLecteur({ jeton: JETON, base: BASE, recuperer });
    if (boite.genre !== 'liste') throw new Error('liste attendue');

    expect(boite.nonLues).toBe(3);
    expect(boite.total).toBe(0);
  });

  it('rend « session expirée » sur un 401, jamais une panne', async () => {
    const recuperer = servi({ success: false }, 401);

    const boite = await boiteDuLecteur({ jeton: JETON, base: BASE, recuperer });

    expect(boite.genre).toBe('session-expiree');
  });

  it('rend « panne » quand la passerelle ne répond pas', async () => {
    const recuperer = jest.fn(async () => {
      throw new Error('réseau coupé');
    });

    const boite = await boiteDuLecteur({ jeton: JETON, base: BASE, recuperer });

    expect(boite.genre).toBe('panne');
  });

  it('écarte une ligne sans identifiant plutôt que de rendre la liste entière en panne', async () => {
    const recuperer = servi(enveloppe([{ type: 'message' }, ligne({ id: 'bonne' })]));

    const boite = await boiteDuLecteur({ jeton: JETON, base: BASE, recuperer });
    if (boite.genre !== 'liste') throw new Error('liste attendue');

    expect(boite.notifications.map((n) => n.id)).toEqual(['bonne']);
  });

  it('passe une limite EXPLICITE — la passerelle n’en déclare aucune par défaut (#4175)', async () => {
    const recuperer = servi(enveloppe([]));

    await boiteDuLecteur({ jeton: JETON, base: BASE, recuperer });

    expect(recuperer).toHaveBeenCalledWith(
      `${BASE}/api/v1/notifications?limit=30`,
      expect.objectContaining({ headers: expect.objectContaining({ authorization: `Bearer ${JETON}` }) }),
    );
  });
});
