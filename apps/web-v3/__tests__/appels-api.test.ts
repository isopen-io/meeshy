/**
 * @jest-environment node
 */

import { journalDesAppels } from '@/lib/api/appels';
import { duree } from '@/lib/contenu/appels';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la LECTURE de `GET /calls/history`, contre la
 * forme que la passerelle sert RÉELLEMENT.
 *
 * Les charges ci-dessous copient les clés du schéma de réponse
 * (`services/gateway/src/routes/calls-consultation.ts:465-514`), pas une
 * mémoire de ce qu'elles devraient être. Quatre choses qu'aucune assertion de
 * rendu n'attraperait seule :
 *
 *   - `direction`, `isVideo`, `durationSec` sont LUS, jamais recalculés ici —
 *     `deriveCallDirection`/`callIsVideo`/`deriveDurationSec` sont des
 *     fonctions du GATEWAY, ce module ne les réécrit pas ;
 *   - un appel de GROUPE (`peer: null`) se nomme par `conversationTitle` ; un
 *     DIRECT sans titre se nomme par son correspondant ;
 *   - un manqué (`durationSec: 0`) ne rend AUCUNE durée en toutes lettres —
 *     « 0 min » raconterait un appel qui n'a pas eu lieu ;
 *   - une ligne malformée est ÉCARTÉE, jamais inventée — une panne PARTIELLE
 *     reste une réponse à servir, pas une raison de tout jeter.
 */

const json = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), { status: statut });

const passerelle = (parChemin: Readonly<Record<string, () => Response>>) => {
  const vus: string[] = [];
  const recuperer = async (url: string): Promise<Response> => {
    vus.push(url);
    const trouve = Object.entries(parChemin).find(([chemin]) => url.includes(chemin));
    if (trouve === undefined) throw new Error(`chemin non bouchonné : ${url}`);
    return trouve[1]();
  };
  return { recuperer, vus };
};

/** Une ligne de `CallHistoryItem` (`callHistory.ts:31-52`) — toutes les clés du contrat REST. */
const ligneServie = (extra: Record<string, unknown> = {}) => ({
  callId: 'c-1',
  conversationId: 'conv-1',
  conversationType: 'direct',
  conversationTitle: null,
  conversationAvatar: null,
  mode: 'audio',
  status: 'ended',
  endReason: null,
  direction: 'incoming',
  isVideo: false,
  startedAt: '2026-09-04T12:00:00.000Z',
  answeredAt: '2026-09-04T12:00:05.000Z',
  endedAt: '2026-09-04T12:12:05.000Z',
  durationSec: 720,
  bytesSent: 12_000,
  bytesReceived: 14_000,
  peer: {
    userId: 'u-marta',
    username: 'marta',
    displayName: 'Marta Ruiz',
    avatar: null,
    phoneNumber: '+33600000000',
    isOnline: true,
  },
  ...extra,
});

describe('la lecture de GET /calls/history', () => {
  it('demande la route canonique, sur le préfixe /api/v1', async () => {
    const { recuperer, vus } = passerelle({
      '/calls/history': () => json({ success: true, data: [], pagination: { limit: 30, hasMore: false } }),
    });

    await journalDesAppels({ jeton: 'j', recuperer });

    expect(vus).toHaveLength(1);
    expect(vus[0]).toContain('/api/v1/calls/history');
    expect(vus[0]).toContain('limit=30');
  });

  it('projette la charge nominale : direction, vidéo et durée LUES, jamais recalculées', async () => {
    const { recuperer } = passerelle({
      '/calls/history': () =>
        json({ success: true, data: [ligneServie()], pagination: { limit: 30, hasMore: false } }),
    });

    const journal = await journalDesAppels({ jeton: 'j', recuperer });
    if (journal.genre !== 'journal') throw new Error(journal.genre);

    expect(journal.appels).toHaveLength(1);
    expect(journal.appels[0]).toMatchObject({
      id: 'c-1',
      conversationId: 'conv-1',
      direction: 'incoming',
      video: false,
      dureeSec: 720,
      debutA: '2026-09-04T12:00:00.000Z',
    });
  });

  it('sert peer:null (appel de groupe) ET conversationTitle:null (direct) tous les deux', async () => {
    const { recuperer } = passerelle({
      '/calls/history': () =>
        json({
          success: true,
          data: [
            ligneServie({ callId: 'c-groupe', conversationType: 'group', conversationTitle: 'Équipe Lagos', isVideo: true, peer: null, direction: 'outgoing' }),
            ligneServie({ callId: 'c-direct', conversationTitle: null }),
          ],
          pagination: { limit: 30, hasMore: false },
        }),
    });

    const journal = await journalDesAppels({ jeton: 'j', recuperer });
    if (journal.genre !== 'journal') throw new Error(journal.genre);

    const groupe = journal.appels.find((a) => a.id === 'c-groupe');
    expect(groupe?.titre).toBe('Équipe Lagos');

    const direct = journal.appels.find((a) => a.id === 'c-direct');
    expect(direct?.titre).toBe('Marta Ruiz');
  });

  it('nomme « Conversation » une ligne sans titre ET sans correspondant', async () => {
    const { recuperer } = passerelle({
      '/calls/history': () =>
        json({
          success: true,
          data: [ligneServie({ conversationTitle: null, peer: null })],
          pagination: { limit: 30, hasMore: false },
        }),
    });

    const journal = await journalDesAppels({ jeton: 'j', recuperer });
    if (journal.genre !== 'journal') throw new Error(journal.genre);

    expect(journal.appels[0]?.titre).toBe('Conversation');
  });

  it('dit « session-expiree » sur un 401', async () => {
    const { recuperer } = passerelle({ '/calls/history': () => json({ success: false }, 401) });

    expect((await journalDesAppels({ jeton: 'j', recuperer })).genre).toBe('session-expiree');
  });

  it('dit « panne » quand le réseau ne répond pas', async () => {
    const recuperer = async (): Promise<Response> => {
      throw new Error('réseau coupé');
    };

    expect((await journalDesAppels({ jeton: 'j', recuperer })).genre).toBe('panne');
  });

  it('dit « panne » sur une enveloppe success:false', async () => {
    const { recuperer } = passerelle({ '/calls/history': () => json({ success: false }) });

    expect((await journalDesAppels({ jeton: 'j', recuperer })).genre).toBe('panne');
  });

  it('écarte une ligne malformée plutôt que de tout jeter', async () => {
    const { recuperer } = passerelle({
      '/calls/history': () =>
        json({
          success: true,
          data: [ligneServie(), { callId: 'c-cassé' }],
          pagination: { limit: 30, hasMore: false },
        }),
    });

    const journal = await journalDesAppels({ jeton: 'j', recuperer });
    if (journal.genre !== 'journal') throw new Error(journal.genre);

    expect(journal.appels.map((a) => a.id)).toEqual(['c-1']);
  });

  it('relaie `nextCursor` quand `hasMore` est vrai, rend `null` sinon', async () => {
    const { recuperer: avecSuite } = passerelle({
      '/calls/history': () =>
        json({ success: true, data: [], pagination: { limit: 30, hasMore: true, nextCursor: 'c-3' } }),
    });
    const avecSuiteJournal = await journalDesAppels({ jeton: 'j', recuperer: avecSuite });
    if (avecSuiteJournal.genre !== 'journal') throw new Error(avecSuiteJournal.genre);
    expect(avecSuiteJournal.curseurSuivant).toBe('c-3');

    const { recuperer: sansSuite } = passerelle({
      '/calls/history': () => json({ success: true, data: [], pagination: { limit: 30, hasMore: false } }),
    });
    const sansSuiteJournal = await journalDesAppels({ jeton: 'j', recuperer: sansSuite });
    if (sansSuiteJournal.genre !== 'journal') throw new Error(sansSuiteJournal.genre);
    expect(sansSuiteJournal.curseurSuivant).toBeNull();
  });

  it('relaie `cursor` à la passerelle quand il est fourni', async () => {
    const { recuperer, vus } = passerelle({
      '/calls/history': () => json({ success: true, data: [], pagination: { limit: 30, hasMore: false } }),
    });

    await journalDesAppels({ jeton: 'j', curseur: 'c-2', recuperer });

    expect(vus[0]).toContain('cursor=c-2');
  });

  it('durée : rien pour un manqué (0), « 12 min » à 720 s, « 59 s » à 59 s — les deux moitiés du seuil', async () => {
    const { recuperer } = passerelle({
      '/calls/history': () =>
        json({
          success: true,
          data: [
            ligneServie({ callId: 'c-manque', direction: 'missed', durationSec: 0 }),
            ligneServie({ callId: 'c-720', durationSec: 720 }),
            ligneServie({ callId: 'c-59', durationSec: 59 }),
          ],
          pagination: { limit: 30, hasMore: false },
        }),
    });

    const journal = await journalDesAppels({ jeton: 'j', recuperer });
    if (journal.genre !== 'journal') throw new Error(journal.genre);

    expect(journal.appels.find((a) => a.id === 'c-manque')?.dureeSec).toBe(0);
    expect(journal.appels.find((a) => a.id === 'c-720')?.dureeSec).toBe(720);
    expect(journal.appels.find((a) => a.id === 'c-59')?.dureeSec).toBe(59);

    // La MISE EN TEXTE (`duree`, `lib/contenu/appels.ts`) est le site unique
    // que la vue appelle — les deux moitiés du seuil d'une minute.
    expect(duree(0)).toBe('');
    expect(duree(720)).toBe('12 min');
    expect(duree(59)).toBe('59 s');
  });

  /**
   * `status` N'EST PAS UN CHAMP DÉCORATIF : un sortant `rejected`/`failed`
   * (jamais répondu, `answeredAt: null`) reste `direction:'outgoing'` —
   * `deriveCallDirection` ne DÉRIVE `'missed'` que pour un appel REÇU
   * (`callHistory.ts:92-100`), jamais pour celui qui a composé. Sans lire
   * `status`, un tel appel projetait `dureeSec: 0` en silence — la même forme
   * qu'un appel RÉPONDU de durée nulle, une confusion qu'aucune ligne
   * n'aurait pu distinguer.
   */
  it('projette `nonAbouti:true` pour un sortant `rejected` ou `failed`, jamais pour un `ended`', async () => {
    const { recuperer } = passerelle({
      '/calls/history': () =>
        json({
          success: true,
          data: [
            ligneServie({ callId: 'c-rejete', direction: 'outgoing', status: 'rejected', durationSec: 0, answeredAt: null, endedAt: null }),
            ligneServie({ callId: 'c-echec', direction: 'outgoing', status: 'failed', durationSec: 0, answeredAt: null, endedAt: null }),
            ligneServie({ callId: 'c-ok', direction: 'outgoing', status: 'ended', durationSec: 30 }),
          ],
          pagination: { limit: 30, hasMore: false },
        }),
    });

    const journal = await journalDesAppels({ jeton: 'j', recuperer });
    if (journal.genre !== 'journal') throw new Error(journal.genre);

    expect(journal.appels.find((a) => a.id === 'c-rejete')?.nonAbouti).toBe(true);
    expect(journal.appels.find((a) => a.id === 'c-echec')?.nonAbouti).toBe(true);
    expect(journal.appels.find((a) => a.id === 'c-ok')?.nonAbouti).toBe(false);
  });
});
