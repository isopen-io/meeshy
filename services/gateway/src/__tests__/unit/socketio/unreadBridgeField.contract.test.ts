/**
 * `conversation:unread-updated` — LE MÊME CONTRAT, TENU PAR SES QUATRE
 * ÉMETTEURS (cycle 63).
 *
 * Ce fichier existe parce que la classe de défaut du cycle 62 n'était pas dans
 * un émetteur : elle était dans l'ESPACE ENTRE LES ÉMETTEURS. Chacun avait ses
 * propres témoins, chacun était vert, et aucun ne connaissait la règle de
 * l'autre — si bien qu'un champ rendu autoritatif côté client a transformé
 * trois émetteurs en destructeurs sans qu'une seule ligne de leur code, ni un
 * seul de leurs témoins, ne bouge.
 *
 * Le garde ne peut donc pas vivre dans le fichier de test d'un émetteur. Il est
 * ici, il les convoque TOUS, et il énonce le vocabulaire une fois pour tous :
 *
 *   objet   → « voici le pont »            le client remplace
 *   `null`  → « j'ai calculé : aucun »     le client EFFACE
 *   absent  → « je n'ai pas calculé »      le client GARDE le sien
 *
 * La propriété transversale, celle qu'aucun témoin par émetteur ne peut voir :
 * **deux situations différentes ne doivent plus produire le MÊME fil.** Avant
 * ce lot, « la passe a tourné et n'annonce rien » et « je n'ai rien demandé à
 * la passe » sortaient tous deux en `{conversationId, unreadCount}`. C'est
 * cette confusion — pas un émetteur fautif — qui a coûté le pont de toutes les
 * lignes à chaque reconnexion.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { emitUnreadCountsToRecipients } from '../../../socketio/emitUnreadCountsToRecipients';
import { broadcastReadStatus } from '../../../socketio/broadcastReadStatus';

const CONV_ID = '507f1f77bcf86cd799439022';
const SENDER_PART_ID = '507f1f77bcf86cd799439031';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const PEER_PART_ID = '507f1f77bcf86cd799439032';
const PEER_USER_ID = '507f1f77bcf86cd799439042';

type Participant = { id: string; userId: string | null; joinedAt: Date | null };

const A_BRIDGE = {
  kind: 'fallback',
  unreadCount: 3,
  suggestedMode: 'focal',
  data: { authors: ['Alice'], extraAuthorCount: 0, messageCount: 3 },
} as const;

function makeIO() {
  const emit = jest.fn<any>();
  const to = jest.fn<any>(() => ({ emit }));
  return { io: { to }, to, emit };
}

function makePrisma(participants: Participant[]) {
  return { participant: { findMany: jest.fn<any>().mockResolvedValue(participants) } };
}

function makeReadStatusService(counts: Record<string, number>) {
  return {
    getUnreadCountsForParticipants: jest
      .fn<any>()
      .mockResolvedValue(new Map(Object.entries(counts))),
  };
}

const sender = (): Participant => ({ id: SENDER_PART_ID, userId: SENDER_USER_ID, joinedAt: null });
const peer = (): Participant => ({ id: PEER_PART_ID, userId: PEER_USER_ID, joinedAt: null });

/**
 * Le prédicat central du fichier. `toHaveBeenCalledWith` ne sait pas distinguer
 * « la clé vaut `undefined` » de « la clé n'est pas là » — or c'est EXACTEMENT
 * la distinction que ce contrat introduit. On lit donc la charge réellement
 * émise, et on interroge la présence de la clé.
 */
function payloadFor(emit: jest.Mock<any>, conversationId: string): Record<string, unknown> {
  const call = emit.mock.calls.find(
    ([, payload]: any) => (payload as { conversationId?: string })?.conversationId === conversationId
  );
  if (!call) throw new Error(`aucune émission pour ${conversationId}`);
  return call[1] as Record<string, unknown>;
}

describe('conversation:unread-updated — le troisième état du pont ✦', () => {
  // ---------------------------------------------------------------------------
  // 1. Le fan-out d'envoi
  // ---------------------------------------------------------------------------
  describe('emitUnreadCountsToRecipients — la passe a tourné, donc il SAIT', () => {
    it("dit `null` — pas le silence — quand la passe a tourné et n'annonce rien pour ce lecteur", async () => {
      const { io, emit } = makeIO();

      await emitUnreadCountsToRecipients({
        io,
        prisma: makePrisma([sender(), peer()]) as any,
        readStatusService: makeReadStatusService({ [PEER_PART_ID]: 4 }),
        conversationId: CONV_ID,
        senderId: SENDER_PART_ID,
        bridgeService: { buildBridgeDataForViewers: jest.fn<any>().mockResolvedValue(new Map()) },
      });

      const payload = payloadFor(emit, CONV_ID);
      expect(payload).toHaveProperty('bridge', null);
    });

    // Contrat gelé §3.2 — un compteur nul n'a pas de pont, et c'est un FAIT
    // connu, pas une abstention : le lecteur a tout lu, son pont doit tomber.
    it('dit `null` pour un destinataire dont le compteur est retombé à zéro', async () => {
      const { io, emit } = makeIO();

      await emitUnreadCountsToRecipients({
        io,
        prisma: makePrisma([sender(), peer()]) as any,
        readStatusService: makeReadStatusService({ [PEER_PART_ID]: 0 }),
        conversationId: CONV_ID,
        senderId: SENDER_PART_ID,
        bridgeService: { buildBridgeDataForViewers: jest.fn<any>().mockResolvedValue(new Map()) },
      });

      expect(payloadFor(emit, CONV_ID)).toHaveProperty('bridge', null);
    });

    // La posture best-effort, enfin tenue de bout en bout. Elle promettait « un
    // pont qui ne se calcule pas ne prive personne de sa pastille » — mais la
    // forme émise détruisait AUSSI le pont de tout le monde au passage.
    it("N'ÉMET PAS LA CLÉ quand la passe échoue — un incident ne détruit pas les ponts en cache", async () => {
      const { io, emit } = makeIO();

      await emitUnreadCountsToRecipients({
        io,
        prisma: makePrisma([sender(), peer()]) as any,
        readStatusService: makeReadStatusService({ [PEER_PART_ID]: 4 }),
        conversationId: CONV_ID,
        senderId: SENDER_PART_ID,
        bridgeService: {
          buildBridgeDataForViewers: jest.fn<any>().mockRejectedValue(new Error('bridge down')),
        },
        onError: jest.fn(),
      });

      const payload = payloadFor(emit, CONV_ID);
      expect(Object.keys(payload)).not.toContain('bridge');
      expect(payload).toEqual({ conversationId: CONV_ID, unreadCount: 4 });
    });

    // Un appelant qui n'a pas câblé le service ne sait RIEN du pont. Il ne peut
    // donc pas en ordonner l'effacement — c'est la garantie qui rend l'omission
    // sûre pour tout émetteur futur.
    it("N'ÉMET PAS LA CLÉ sans bridgeService — ignorer le pont n'est pas le nier", async () => {
      const { io, emit } = makeIO();

      await emitUnreadCountsToRecipients({
        io,
        prisma: makePrisma([sender(), peer()]) as any,
        readStatusService: makeReadStatusService({ [PEER_PART_ID]: 4 }),
        conversationId: CONV_ID,
        senderId: SENDER_PART_ID,
      });

      expect(Object.keys(payloadFor(emit, CONV_ID))).not.toContain('bridge');
    });

    it('porte le pont tel quel quand la passe en rend un', async () => {
      const { io, emit } = makeIO();

      await emitUnreadCountsToRecipients({
        io,
        prisma: makePrisma([sender(), peer()]) as any,
        readStatusService: makeReadStatusService({ [PEER_PART_ID]: 3 }),
        conversationId: CONV_ID,
        senderId: SENDER_PART_ID,
        bridgeService: {
          buildBridgeDataForViewers: jest
            .fn<any>()
            .mockResolvedValue(new Map([[PEER_USER_ID, { bridge: A_BRIDGE }]])),
        },
      });

      expect(payloadFor(emit, CONV_ID)).toEqual({
        conversationId: CONV_ID,
        unreadCount: 3,
        bridge: A_BRIDGE,
      });
    });

    /**
     * LE témoin transversal — celui qu'aucun fichier par émetteur ne pouvait
     * porter. Les deux situations coexistent dans UN SEUL appel, et le contrat
     * n'est tenu que si elles sortent DIFFÉREMMENT.
     */
    it('distingue, dans le même fan-out, « la passe ne dit rien » de « je ne calcule pas »', async () => {
      const { io, emit } = makeIO();
      const secondPeer: Participant = { id: 'part-3', userId: 'user-3', joinedAt: null };

      await emitUnreadCountsToRecipients({
        io,
        prisma: makePrisma([sender(), peer(), secondPeer]) as any,
        readStatusService: makeReadStatusService({ [PEER_PART_ID]: 4, 'part-3': 2 }),
        conversationId: CONV_ID,
        senderId: SENDER_PART_ID,
        bridgeService: {
          buildBridgeDataForViewers: jest
            .fn<any>()
            .mockResolvedValue(new Map([['user-3', { bridge: A_BRIDGE }]])),
        },
      });

      const withoutBridge = emit.mock.calls.find(([, p]: any) => p.unreadCount === 4)![1] as any;
      const withBridge = emit.mock.calls.find(([, p]: any) => p.unreadCount === 2)![1] as any;

      expect(withoutBridge.bridge).toBeNull();
      expect(withBridge.bridge).toEqual(A_BRIDGE);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. La resynchronisation du LECTEUR après un accusé de lecture
  // ---------------------------------------------------------------------------
  /**
   * Piste n°1 du cycle 62, tranchée ici — et pas dans le sens qu'elle
   * anticipait.
   *
   * Le cycle 62 la posait comme un arbitrage de PRIX : « le pont devrait être
   * recalculé sur le nouveau curseur, il est effacé à la place ; le corriger
   * coûterait les requêtes de la passe à chaque accusé de lecture ». Cette
   * formulation supposait que garder le pont valait mieux que l'effacer, et que
   * seul le coût s'y opposait.
   *
   * Le contrat gelé dit le contraire, et il le dit dans le type : le pont PORTE
   * son propre `unreadCount`, et le rang n'affiche plus aucun autre chiffre
   * (« le chiffre vit ICI, plus dans un badge » — L06 a supprimé le badge
   * chiffré). Une lecture partielle qui fait passer l'arriéré de 12 à 5
   * INVALIDE donc le pont qu'elle annonce : le garder ferait lire « Alice ·
   * 12 messages » à un lecteur qui n'en a plus que 5.
   *
   * Le serveur SAIT que l'ancien pont est void — c'est l'acte même qu'il
   * diffuse qui l'a rendu tel. `null` n'est donc pas ici un pis-aller de coût :
   * c'est la seule affirmation vraie. La piste n°1 se ferme sans payer une
   * seule requête, parce que la bonne question n'était pas « combien coûte le
   * recalcul » mais « que sait-on, au juste ».
   */
  describe('broadcastReadStatus — la lecture INVALIDE le pont qu’elle annonce', () => {
    function readStatusDeps(unreadCount: number) {
      const emit = jest.fn<any>();
      const to = jest.fn<any>(() => ({ emit }));
      return {
        emit,
        deps: {
          io: { to } as any,
          prisma: {
            conversationReadCursor: {
              findUnique: jest.fn<any>().mockResolvedValue({ lastReadAt: new Date() }),
            },
            participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
          } as any,
          readStatusService: {
            getLatestMessageSummary: jest.fn<any>().mockResolvedValue({}),
            getUnreadCount: jest.fn<any>().mockResolvedValue(unreadCount),
          },
          privacyPreferencesService: {
            shouldShowReadReceipts: jest.fn<any>().mockResolvedValue(false),
          },
        },
      };
    }

    it('efface EXPLICITEMENT le pont après une lecture partielle', async () => {
      const { emit, deps } = readStatusDeps(5);

      await broadcastReadStatus(deps, {
        conversationId: CONV_ID,
        participantId: PEER_PART_ID,
        userId: PEER_USER_ID,
        isAnonymous: false,
        type: 'read',
      });

      const payload = emit.mock.calls.find(
        ([event]: any) => event === 'conversation:unread-updated'
      )![1] as Record<string, unknown>;

      expect(payload).toHaveProperty('bridge', null);
      expect(payload).toMatchObject({ conversationId: CONV_ID, unreadCount: 5 });
    });
  });
});
