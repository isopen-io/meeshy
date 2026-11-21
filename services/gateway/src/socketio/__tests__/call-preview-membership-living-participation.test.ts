import { describe, expect, it } from '@jest/globals';

import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { CallControlAck } from '@meeshy/shared/types/call-controls';

import { matchesMongoWhere } from '../../__tests__/helpers/mongo-where';
import { callPreviewDependencies, registerCallPreviewEvents } from '../call-preview-events';

/**
 * **L'APERÇU AVANT DÉCROCHÉ LIT LA PARTICIPATION VIVANTE** (#20261).
 *
 * ## Ce que ce témoin garde
 *
 * `isMember` est le SEUL contrôle d'appartenance de `calleeRefusal`, et
 * `calleeRefusal` gouverne les DEUX verbes de l'aperçu —
 * `CALL_PREVIEW_REQUEST` et `CALL_PREVIEW_SIGNAL` — c'est-à-dire le relais
 * WebRTC de la caméra et du micro de l'appelant AVANT tout décroché. Rien ne
 * relit `Participant` en aval : `loadCall` ne lit que `CallSession`.
 *
 * Sous `where: { conversationId, userId, isActive: true }` nu, un participant
 * `isActive: true, bannedAt ≠ null` le franchissait.
 *
 * ## Pourquoi le témoin porte sur la CLAUSE et pas sur `isMember` stubbé
 *
 * Le harnais voisin (`call-preview-events.test.ts`) remplace `isMember` par une
 * liste de membres : il garde le CÂBLAGE des deux verbes, et par construction
 * il ne peut rien dire de la clause. Un témoin qui stube la garde atteste un
 * contrat que personne ne respecte.
 *
 * Celui-ci passe donc par `callPreviewDependencies` — la vraie fabrique — et
 * fait évaluer le `where` RÉEL par `matchesMongoWhere`, la sémantique Mongo
 * UNIQUE du dépôt, qui sait qu'un champ ABSENT n'est pas un champ à `null`.
 * Comparer le `where` à une copie écrite à la main mentirait par ce qu'elle
 * refuse (leçon du 2026-11-21, #20209).
 *
 * ## L'état qui compte est l'état HÉRITÉ, pas `isActive: false`
 *
 * Mesuré en livrant ce lot : `resolveBanWrite` écrit TOUJOURS `isActive: false`
 * à côté de `bannedAt`, donc un bannissement d'aujourd'hui ne produit PAS
 * l'état vulnérable — la clause nue l'excluait déjà. Seules les lignes
 * HÉRITÉES d'avant #19688 / #10436 le portent, et aucune migration ne les a
 * reprises. C'est donc un PIÈGE ARMÉ et non une panne vivante — ce qui ne
 * change rien à la conclusion (règle du cycle 84 : on ne laisse pas un piège
 * armé au motif que personne n'a encore marché dessus) et tout au récit.
 *
 * Un témoin écrit sur `isActive: false` ne garderait RIEN : il passe déjà sous
 * la clause nue.
 */

const CONVERSATION = '64b7f0c2a1b2c3d4e5f60718';

type Ligne = {
  readonly conversationId: string;
  readonly userId: string;
  readonly isActive: boolean;
  readonly bannedAt?: Date | null;
};

/** Le membre ordinaire : actif, jamais banni — `bannedAt` ABSENT, comme en base. */
const VIVANT: Ligne = { conversationId: CONVERSATION, userId: 'bob', isActive: true };

/** L'état HÉRITÉ, celui que la loi existe pour attraper (#19688, #10436). */
const ACTIF_ET_BANNI: Ligne = {
  conversationId: CONVERSATION,
  userId: 'mallory',
  isActive: true,
  bannedAt: new Date('2026-11-01T00:00:00.000Z'),
};

/** Le banni du chemin NOMINAL — déjà exclu par la clause nue, donc sans pouvoir de garde. */
const BANNI_INACTIF: Ligne = {
  conversationId: CONVERSATION,
  userId: 'trent',
  isActive: false,
  bannedAt: new Date('2026-11-01T00:00:00.000Z'),
};

const isMemberSur = (lignes: readonly Ligne[]) => {
  const prisma = {
    participant: {
      count: async ({ where }: { where: Record<string, unknown> }) =>
        lignes.filter(l => matchesMongoWhere(l as never, where as never)).length,
    },
  };
  return callPreviewDependencies({
    io: {} as never,
    prisma: prisma as never,
    callService: { getCallSession: async () => null } as never,
    rateLimiter: { checkLimit: async () => true },
  }).isMember;
};

describe("l'aperçu avant décroché n'admet qu'une participation VIVANTE (#20261)", () => {
  it('admet le membre vivant — sans quoi le resserrement casserait le cas nominal', async () => {
    await expect(isMemberSur([VIVANT])(CONVERSATION, 'bob')).resolves.toBe(true);
  });

  it("REFUSE le membre actif-et-BANNI — c'est la caméra et le micro de l'appelant qui en dépendent", async () => {
    await expect(isMemberSur([ACTIF_ET_BANNI])(CONVERSATION, 'mallory')).resolves.toBe(false);
  });

  it('refuse le banni du chemin nominal (déjà exclu par `isActive` nu)', async () => {
    await expect(isMemberSur([BANNI_INACTIF])(CONVERSATION, 'trent')).resolves.toBe(false);
  });

  it("refuse quelqu'un d'une AUTRE conversation — la portée reste écrite", async () => {
    const ailleurs: Ligne = { ...VIVANT, conversationId: '64b7f0c2a1b2c3d4e5f60719' };
    await expect(isMemberSur([ailleurs])(CONVERSATION, 'bob')).resolves.toBe(false);
  });

  /**
   * La loi se juge sur DEUX colonnes, et `bannedAt` est ABSENT sur la plupart
   * des lignes. Ce témoin fige que l'absence vaut « jamais banni » : une
   * orthographe qui exigerait `bannedAt: null` STRICT retirerait l'aperçu à
   * tout le monde, et c'est le défaut symétrique de celui qu'on corrige.
   */
  it('traite un `bannedAt` ABSENT comme « jamais banni », pas comme une inconnue', async () => {
    const sansColonne = { conversationId: CONVERSATION, userId: 'bob', isActive: true } as Ligne;
    expect('bannedAt' in sansColonne).toBe(false);
    await expect(isMemberSur([sansColonne])(CONVERSATION, 'bob')).resolves.toBe(true);
  });
});

/**
 * **Et la clause RÉELLE refuse les DEUX verbes, bout en bout.**
 *
 * Les témoins ci-dessus gardent la clause ; celui-ci garde qu'elle ATTEINT les
 * deux chemins. La distinction n'est pas rhétorique : le dépôt a déjà payé
 * « une garde d'admission se pose sur CHAQUE chemin, pas sur le plus
 * fréquenté » (cycle 127), où la garde protégeait la population la plus
 * NOMBREUSE et manquait la plus EXPOSÉE.
 *
 * Ici les deux verbes partagent `calleeRefusal`, donc un seul `isMember` — mais
 * c'est une propriété du code d'aujourd'hui, pas du contrat, et c'est
 * exactement ce qu'un témoin doit figer. Le second verbe est le plus grave des
 * deux : c'est lui qui relaie le flux.
 */
describe('la clause réelle refuse les DEUX verbes de l\'aperçu (#20261)', () => {
  const CALL = '64b7f0c2a1b2c3d4e5f60718';
  const SDP = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n';

  const harnaisSurLignes = (lignes: readonly Ligne[], lecteur: string) => {
    const handlers = new Map<string, (raw: unknown, ack?: (r: CallControlAck) => void) => Promise<void>>();
    const emitted: unknown[] = [];
    const prisma = {
      participant: {
        count: async ({ where }: { where: Record<string, unknown> }) =>
          lignes.filter(l => matchesMongoWhere(l as never, where as never)).length,
      },
    };
    const deps = callPreviewDependencies({
      io: { to: () => ({ emit: (...a: unknown[]) => (emitted.push(a), true) }) } as never,
      prisma: prisma as never,
      callService: {
        getCallSession: async () => ({
          status: 'ringing',
          initiatorId: 'alice',
          conversationId: CONVERSATION,
          conversation: { type: 'direct' },
        }),
      } as never,
      rateLimiter: { checkLimit: async () => true },
    });
    registerCallPreviewEvents(
      deps,
      { id: 'sock-1', on: (e: string, h: never) => { handlers.set(e, h); } } as never,
      () => lecteur
    );
    return {
      emitted,
      envoyer: async (event: string, raw: unknown) => {
        const acks: CallControlAck[] = [];
        await handlers.get(event)?.(raw, (r) => acks.push(r));
        return acks[0];
      },
    };
  };

  it("REFUSE la demande d'aperçu à l'actif-et-banni, et n'émet RIEN", async () => {
    const h = harnaisSurLignes([ACTIF_ET_BANNI], 'mallory');
    expect(await h.envoyer(CLIENT_EVENTS.CALL_PREVIEW_REQUEST, { callId: CALL }))
      .toEqual({ success: false, code: 'NOT_A_PARTICIPANT' });
    expect(h.emitted).toEqual([]);
  });

  it("REFUSE le SIGNAL à l'actif-et-banni — c'est lui qui relaie la caméra et le micro", async () => {
    const h = harnaisSurLignes([ACTIF_ET_BANNI], 'mallory');
    const ack = await h.envoyer(CLIENT_EVENTS.CALL_PREVIEW_SIGNAL, {
      callId: CALL,
      signal: { type: 'offer', from: 'mallory', to: 'alice', sdp: SDP },
    });
    expect(ack).toEqual({ success: false, code: 'NOT_A_PARTICIPANT' });
    expect(h.emitted).toEqual([]);
  });

  it('et laisse passer le membre VIVANT sur les deux verbes', async () => {
    const demande = harnaisSurLignes([VIVANT], 'bob');
    expect(await demande.envoyer(CLIENT_EVENTS.CALL_PREVIEW_REQUEST, { callId: CALL })).toEqual({ success: true });
    expect(demande.emitted).toHaveLength(1);

    const signal = harnaisSurLignes([VIVANT], 'bob');
    expect(await signal.envoyer(CLIENT_EVENTS.CALL_PREVIEW_SIGNAL, {
      callId: CALL,
      signal: { type: 'offer', from: 'bob', to: 'alice', sdp: SDP },
    })).toEqual({ success: true });
    expect(signal.emitted).toHaveLength(1);
  });
});
