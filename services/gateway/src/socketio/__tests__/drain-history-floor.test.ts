/**
 * Le rejeu hors ligne relit le PLANCHER D'HISTOIRE du lecteur (#18615).
 *
 * #18613 a posé le plancher là où il manquait — `message:attachment-updated`,
 * le cinquième porteur de texte. Celle-ci porte sur le MOMENT où tous les
 * producteurs le posent : **à l'ENFILEMENT**, sur une copie prise à cet
 * instant-là.
 *
 * Les quatre producteurs porteurs de texte calculent le plancher et excluent
 * les lecteurs sous plancher de la file, avec leur raison écrite
 * (`broadcastMessageMutation.ts`, `deliverTextTranslation.ts`,
 * `emitAttachmentUpdated.ts`). **Le drain, lui, ne relisait que `isActive` et
 * `bannedAt`** — jamais `historyVisibleFrom` — et son propre doc-comment
 * énonçait la règle qu'il n'appliquait pas :
 *
 * > « Une autorisation se lit donc contre l'autorité au dernier instant
 * > possible, jamais contre une copie prise à l'enfilement. »
 *
 * Or le plancher est MUTABLE vers le haut : `PATCH …/participants/:id/rights`
 * accepte `historyVisibleFrom: null`, et `null` **RÉVOQUE** l'octroi. Entre
 * l'enfilement légitime d'une entrée et son rejeu il y a donc, en plus de
 * l'absence, une révocation possible — et rien ne fermait ce canal : à la
 * différence d'un retrait d'appartenance, une révocation de plancher
 * n'expulse aucune socket et ne touche pas la file.
 *
 * ## Le discriminant, et il est déjà nommé par le dépôt
 *
 * § « Une règle appliquée à l'ÉCRITURE n'est pas appliquée » : **quand ce que
 * la règle décide change plus souvent que le moment où elle s'exécute, la
 * décision persistée est un état FAUX jusqu'à la prochaine écriture.** Une
 * entrée vit 48 h (`DELIVERY_QUEUE_TTL_SECONDS`) ; un octroi se révoque en une
 * requête.
 *
 * ## Pourquoi le cas NOMINAL ne peut pas distinguer la forme juste du défaut
 *
 * Un lecteur sans plancher, ou un plancher inchangé depuis l'enfilement,
 * rendent le même verdict sous la forme juste et sous le défaut — leçon 261.
 * Les témoins de GARDE de ce fichier portent donc tous sur un plancher qui a
 * BOUGÉ entre les deux instants, et les témoins de NON-RÉGRESSION sur ce que
 * la garde ne doit pas retirer.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Les doubles `jest.mock` doivent être enregistrés AVANT l'import du manager.
import { getIoState } from './helpers/message-new-parity-mocks';

import { MeeshySocketIOManager } from '../MeeshySocketIOManager';
import { makePrisma, makeTranslationService } from './helpers/message-new-parity-fixtures';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

/** Un ObjectId de fixture — la forme que les colonnes portent RÉELLEMENT. */
function oid(seed: string): string {
  const hex = Buffer.from(seed).toString('hex');
  return (hex + '0'.repeat(24)).slice(0, 24);
}

const CONV = oid('conv-floor');
const OTHER = oid('conv-other');
const LINK = oid('link-no-hist');

/** Écrit AVANT l'arrivée du lecteur, APRÈS la date d'octroi : lisible tant que l'octroi tient. */
const GRANTED = oid('m-granted');
/** Écrit APRÈS l'arrivée du lecteur : lisible quoi qu'il arrive à l'octroi. */
const AFTER_JOIN = oid('m-after-join');

const JOINED_AT = new Date('2026-06-01T00:00:00Z');
const GRANT_FROM = new Date('2026-01-01T00:00:00Z');
const GRANTED_AT = new Date('2026-03-01T00:00:00Z');
const AFTER_JOIN_AT = new Date('2026-07-01T00:00:00Z');

type FloorRow = {
  conversationId?: string;
  role?: string | null;
  joinedAt?: Date;
  shareLinkId?: string | null;
  historyVisibleFrom?: Date | null;
  permissions?: unknown;
  anonymousSession?: unknown;
  user?: { role?: string | null } | null;
};

describe('drain hors ligne — le plancher d’historique est relu au dernier instant', () => {
  let manager: any;
  let prisma: any;
  let ioState: ReturnType<typeof getIoState>;
  /** Combien de fois la ligne `Message` a été lue — pour la garde de lecture PARTAGÉE. */
  let messageReads: number;
  /** Combien de fois la ligne du lecteur a été lue — pour la garde de lecture PARTAGÉE. */
  let participantReads: number;

  /**
   * Le double REFUSE ce que le vrai client refuse : `Message.id` et
   * `Participant.conversationId` sont des colonnes ObjectId, et une chaîne qui
   * n'en est pas un atteint le moteur et lève `Malformed ObjectID`. Un double
   * permissif répondrait poliment à une question que la production ne peut pas
   * poser — « un double de test ment aussi par ce qu'il ACCEPTE ».
   */
  function assertObjectIds(ids: unknown[]): void {
    for (const id of ids) {
      if (typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) {
        throw new Error(`Malformed ObjectID: ${String(id)}`);
      }
    }
  }

  /**
   * Le lecteur, tel que la base le rend MAINTENANT — c'est-à-dire APRÈS la
   * révocation, l'octroi, ou le retrait que le témoin met en scène. C'est tout
   * le sujet : la file porte l'état d'AVANT.
   */
  function seedReader(rows: FloorRow[]): void {
    prisma.participant.findMany = jest.fn(async (args: any) => {
      assertObjectIds(args?.where?.conversationId?.in ?? []);
      // Le gate d'appartenance et celui du plancher partagent UNE lecture : le
      // `select` porte donc `bannedAt` ET les colonnes qui décident du
      // plancher. Un double qui servirait deux formes selon le `select`
      // masquerait précisément la régression « la lecture a été dédoublée ».
      if (args?.select?.bannedAt === undefined) return [{ id: oid('p-reader'), userId: 'reader' }];
      participantReads += 1;
      return rows.map((row) => ({
        conversationId: row.conversationId ?? CONV,
        bannedAt: null,
        role: row.role ?? 'member',
        joinedAt: row.joinedAt ?? JOINED_AT,
        shareLinkId: row.shareLinkId ?? null,
        historyVisibleFrom: row.historyVisibleFrom ?? null,
        permissions: row.permissions ?? null,
        anonymousSession: row.anonymousSession ?? null,
        user: row.user ?? null,
      }));
    }) as any;
  }

  function seedMessageDates(rows: Array<{ id: string; createdAt: Date }>): void {
    prisma.message.findMany = jest.fn(async (args: any) => {
      const ids: unknown[] = args?.where?.id?.in ?? [];
      assertObjectIds(ids);
      messageReads += 1;
      return rows
        .filter((row) => ids.includes(row.id))
        .map((row) => ({ id: row.id, createdAt: row.createdAt, deletedAt: null, expiresAt: null }));
    }) as any;
  }

  function seedLinks(rows: Array<{ id: string; allowViewHistory: boolean }>): void {
    prisma.conversationShareLink = {
      findMany: jest.fn(async (args: any) => {
        const ids: unknown[] = args?.where?.id?.in ?? [];
        return rows.filter((row) => ids.includes(row.id));
      }),
      findUnique: jest.fn(async (args: any) => rows.find((row) => row.id === args?.where?.id) ?? null),
    } as any;
  }

  function queueOf(entries: unknown[]): any {
    return { drain: jest.fn<any>().mockResolvedValue(entries) };
  }

  function emittedWith(event: string): unknown[] {
    return (ioState.toEmit.mock.calls as any[]).filter((c) => c[0] === event).map((c) => c[1]);
  }

  /** Une entrée `message:new` légitimement enfilée pour ce lecteur. */
  const entry = (messageId: string, conversationId = CONV, eventType?: string) => ({
    payload: { id: messageId, content: `texte de ${messageId}`, conversationId },
    conversationId,
    messageId,
    ...(eventType ? { eventType } : {}),
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    ioState = getIoState();
    ioState.to.mockClear();
    ioState.toEmit.mockClear();
    ioState.sockets.sockets.clear();
    ioState.sockets.adapter.rooms.clear();

    messageReads = 0;
    participantReads = 0;
    prisma = makePrisma();
    // Le lecteur de ce fichier est un INVITÉ DE LIEN dont le lien ferme
    // l'historique, et à qui un administrateur a accordé la vue depuis une
    // date. C'est la seule forme qui porte la question : un membre ordinaire
    // entré sans lien n'a AUCUN plancher (rang iv de `historyFloorFor`,
    // « rien ne borne qui n'est entré par aucun lien »), donc révoquer son
    // octroi ne lui retire rien. Le premier jet de ce fichier mettait en scène
    // un membre nu — la garde ne pouvait pas tomber.
    seedReader([{ shareLinkId: LINK, historyVisibleFrom: GRANT_FROM }]);
    seedMessageDates([
      { id: GRANTED, createdAt: GRANTED_AT },
      { id: AFTER_JOIN, createdAt: AFTER_JOIN_AT },
    ]);
    seedLinks([{ id: LINK, allowViewHistory: false }]);
    manager = new MeeshySocketIOManager({} as any, prisma as any, makeTranslationService() as any);
    await manager.initialize();
  });

  // ─── Les GARDES : le plancher a bougé entre l'enfilement et le drain ───────

  /**
   * LE témoin du lot. L'octroi `historyVisibleFrom = 2026-01-01` rendait
   * l'entrée légitime à l'enfilement ; l'admin l'a RÉVOQUÉ (`null`) pendant
   * l'absence du lecteur, donc le plancher est redescendu sur son `joinedAt`.
   * Le texte d'un message que `GET …/messages`, `/sync` et
   * `conversation:updated` lui refusent tous repartait pourtant sur le fil.
   */
  it('ne rejoue PAS le texte d’un message passé sous plancher par une révocation d’octroi', async () => {
    seedReader([{ shareLinkId: LINK, historyVisibleFrom: null }]);
    manager.setDeliveryQueue(queueOf([entry(GRANTED)]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toEqual([]);
  });

  /**
   * La même révocation, sur les trois autres familles porteuses de texte : le
   * cadrage de la garde est `TextBearingQueuedEvent` (#12822), pas `'new'`
   * seul. Une édition et une traduction portent « le texte APRÈS édition » et
   * le texte TRADUIT du même message sous plancher.
   */
  it.each([
    ['edited', SERVER_EVENTS.MESSAGE_EDITED],
    ['translation', SERVER_EVENTS.MESSAGE_TRANSLATION],
    ['attachment-updated', SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED],
  ])('ne rejoue PAS une entrée %s dont le message est sous plancher', async (eventType, event) => {
    seedReader([{ shareLinkId: LINK, historyVisibleFrom: null }]);
    manager.setDeliveryQueue(queueOf([entry(GRANTED, CONV, eventType as string)]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(event)).toEqual([]);
  });

  /**
   * Le plancher peut aussi MONTER sans révocation : un octroi déplacé vers une
   * date plus récente. Même mécanique, autre écriture — et c'est ce qui
   * interdit d'écrire la garde comme « l'octroi existe-t-il ? ».
   */
  it('ne rejoue PAS le texte d’un message passé sous un octroi DÉPLACÉ vers une date plus récente', async () => {
    seedReader([{ shareLinkId: LINK, historyVisibleFrom: new Date('2026-05-01T00:00:00Z') }]);
    manager.setDeliveryQueue(queueOf([entry(GRANTED)]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toEqual([]);
  });

  /**
   * FAIL-CLOSED sur une lecture que la garde POSSÈDE. La date du message est
   * illisible alors qu'un plancher EXISTE : on ne sait pas de quel côté du
   * plancher l'entrée tombe, et c'est exactement la posture des producteurs
   * (`messageReadership` → `'unknown'` n'émet rien et n'enfile rien). La base
   * garde la vérité — une relecture du fil sert ce que le rejeu a refusé.
   */
  it('ne rejoue PAS une entrée dont la date de message est illisible, quand un plancher existe', async () => {
    prisma.message.findMany = jest.fn(async () => {
      throw new Error('replica lagging');
    }) as any;
    manager.setDeliveryQueue(queueOf([entry(GRANTED)]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toEqual([]);
  });

  /**
   * FAIL-CLOSED sur une LIGNE ABSENTE, qui est un échec DISTINCT de la lecture
   * tombée juste au-dessus : la requête a abouti et n'a rien rendu pour ce
   * message. Un plancher existe, et on ne sait pas de quel côté l'entrée
   * tombe.
   *
   * C'est l'arbitrage OPPOSÉ à celui de la garde de VIVACITÉ sur la même
   * absence — là il manque la preuve d'une MORT, donc on livre ; ici la preuve
   * d'un DROIT, donc on se taît. Deux gardes, une seule lecture, deux
   * postures.
   */
  it('ne rejoue PAS une entrée dont le message n’a aucune ligne, quand un plancher existe', async () => {
    seedMessageDates([]);
    manager.setDeliveryQueue(queueOf([entry(GRANTED)]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toEqual([]);
  });

  /**
   * FAIL-CLOSED, seconde lecture possédée par la garde : le LIEN décide du
   * plancher et sa ligne est illisible. `loadHistoryFloorsForOrFail` déclare
   * déjà cette posture pour exactement cette lecture (« la seule dégradation
   * sûre est de ne rien servir »), et elle ne retire QUE les participations
   * dont le lien décidait.
   */
  it('ne rejoue PAS quand le LIEN décide du plancher et que sa ligne est illisible', async () => {
    seedReader([{ shareLinkId: LINK }]);
    prisma.conversationShareLink = {
      findMany: jest.fn(async () => {
        throw new Error('link read failed');
      }),
    } as any;
    manager.setDeliveryQueue(queueOf([entry(GRANTED)]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toEqual([]);
  });

  /**
   * Un lien qui ferme l'historique borne à l'arrivée : le message antérieur au
   * `joinedAt` est refusé, sans qu'aucun octroi n'ait jamais existé. C'est le
   * chemin le plus courant d'un invité de lien.
   */
  it('ne rejoue PAS un message antérieur à l’arrivée d’un invité dont le lien ferme l’historique', async () => {
    seedReader([{ shareLinkId: LINK, conversationId: CONV }]);
    manager.setDeliveryQueue(queueOf([entry(GRANTED)]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toEqual([]);
  });

  /**
   * Un refus de plancher ne fait avancer AUCUN des trois signaux de livraison :
   * ni l'émission, ni `pending-messages:delivered`, ni l'accusé de réception
   * qui fait passer la coche de l'expéditeur de « envoyé » à « remis ».
   *
   * « Un accusé affirme *ce message est arrivé chez son destinataire* —
   * l'affirmer d'un message qu'on vient de refuser de livrer mentirait à son
   * auteur. » C'est la règle que le gate d'appartenance énonce, et la coche est
   * MONOTONE (`_advanceCursor` ne recule jamais) : un accusé émis à tort ne se
   * retire pas.
   *
   * Et le silence sur `pending-messages:delivered` est le comportement JUSTE,
   * pas une omission : ce signal envoie le client RELIRE les conversations
   * qu'il nomme, et aucune porte REST ne servira ce message à ce lecteur. Un
   * signal de récupération qui ne désigne rien vaut moins que le silence.
   */
  it('ne fait avancer aucun signal de livraison pour une entrée refusée par le plancher', async () => {
    seedReader([{ shareLinkId: LINK, historyVisibleFrom: null }]);
    manager.setDeliveryQueue(queueOf([entry(GRANTED)]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toEqual([]);
    expect(emittedWith(SERVER_EVENTS.READ_STATUS_UPDATED)).toEqual([]);
    const announced = emittedWith(SERVER_EVENTS.PENDING_MESSAGES_DELIVERED) as Array<{ count: number }>;
    expect(announced.filter((a) => a.count > 0)).toEqual([]);
  });

  // ─── Les NON-RÉGRESSIONS : ce que la garde ne doit pas retirer ────────────

  /**
   * Le message écrit APRÈS l'arrivée du lecteur passe, révocation ou pas :
   * aucun plancher ne peut le borner. C'est le cas nominal, et il est ici pour
   * prouver que la garde n'a pas fermé la porte en bloc.
   */
  it('rejoue le texte d’un message postérieur à l’arrivée du lecteur, même après révocation', async () => {
    seedReader([{ shareLinkId: LINK, historyVisibleFrom: null }]);
    manager.setDeliveryQueue(queueOf([entry(AFTER_JOIN)]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toHaveLength(1);
  });

  /** L'octroi TIENT toujours : l'entrée antérieure à l'arrivée reste lisible. */
  it('rejoue un message antérieur à l’arrivée quand l’octroi couvre toujours sa date', async () => {
    manager.setDeliveryQueue(queueOf([entry(GRANTED)]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toHaveLength(1);
  });

  /**
   * La borne est INCLUSIVE, et ce n'est pas un détail de goût : la porte REST
   * qu'on double sert `createdAt: { gte: floor }` (`historyFloorClause`). Une
   * garde plus stricte d'une milliseconde refuserait en temps réel le message
   * exact que `GET …/messages` sert — un écart qu'aucun client ne peut
   * rattraper, et que personne ne remarquerait.
   */
  it('rejoue le message écrit EXACTEMENT à l’instant du plancher', async () => {
    const onFloor = oid('m-on-floor');
    seedReader([{ shareLinkId: LINK, historyVisibleFrom: GRANT_FROM }]);
    seedMessageDates([{ id: onFloor, createdAt: GRANT_FROM }]);
    manager.setDeliveryQueue(queueOf([entry(onFloor)]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toHaveLength(1);
  });

  /**
   * L'ANNONCE DE LA MORT d'un message doit passer, même sous plancher — même
   * arbitrage que la garde de vivacité (#16685), et pour la même raison : la
   * refuser laisserait le client afficher indéfiniment un message détruit.
   * Elle ne porte aucun texte.
   */
  it.each([
    ['deleted', SERVER_EVENTS.MESSAGE_DELETED],
    ['expired', SERVER_EVENTS.MESSAGE_EXPIRED],
  ])('rejoue l’annonce %s d’un message sous plancher', async (eventType, event) => {
    seedReader([{ shareLinkId: LINK, historyVisibleFrom: null }]);
    manager.setDeliveryQueue(queueOf([
      {
        payload: { messageId: GRANTED, conversationId: CONV },
        conversationId: CONV,
        messageId: GRANTED,
        eventType,
      },
    ]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(event)).toHaveLength(1);
  });

  /**
   * Le lot MIXTE — et c'est le cas NORMAL : un message édité puis supprimé
   * pendant l'absence du lecteur enfile les deux. L'entrée porteuse de texte
   * est refusée, l'annonce de la mort du MÊME message passe.
   *
   * Ce témoin est né d'une mutation : retirer le cadrage `carriesMessageText`
   * de l'arbitrage PAR ENTRÉE ne faisait tomber aucun témoin, parce qu'un lot
   * fait UNIQUEMENT d'annonces de mort sort au court-circuit du dessus et
   * n'atteint jamais cet arbitrage. Les deux cadrages ont l'air de se doubler ;
   * ils gardent deux choses — le court-circuit garde le COÛT (pas une requête
   * de lien pour un lot sans texte), celui-ci garde le VERDICT. Sans ce témoin,
   * un lot mixte aurait fait disparaître la suppression d'un message sous
   * plancher, pour toujours.
   */
  it('refuse le texte et laisse passer la mort du MÊME message dans un lot mixte', async () => {
    seedReader([{ shareLinkId: LINK, historyVisibleFrom: null }]);
    manager.setDeliveryQueue(queueOf([
      entry(GRANTED, CONV, 'edited'),
      {
        payload: { messageId: GRANTED, conversationId: CONV },
        conversationId: CONV,
        messageId: GRANTED,
        eventType: 'deleted',
      },
    ]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_EDITED)).toEqual([]);
    expect(emittedWith(SERVER_EVENTS.MESSAGE_DELETED)).toHaveLength(1);
  });

  /**
   * Un ADMIN de la conversation n'a aucun plancher (rang i de
   * `historyFloorFor`) : son arriéré repart entier. La garde s'adosse à la loi
   * partagée plutôt que de comparer `joinedAt` elle-même — sans quoi elle
   * fermerait l'historique aux administrateurs et aux rôles de plateforme
   * privilégiés.
   */
  it('rejoue tout l’arriéré d’un administrateur de la conversation', async () => {
    seedReader([{ shareLinkId: LINK, role: 'admin', historyVisibleFrom: null }]);
    manager.setDeliveryQueue(queueOf([entry(GRANTED)]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toHaveLength(1);
  });

  /**
   * La garde ne coûte AUCUNE lecture de plus : la ligne `Message` est lue UNE
   * fois pour les deux gardes qui l'interrogent — le plancher et la vivacité
   * (`queuedMessageFacts`). « Avant de conclure qu'une garde coûterait une
   * requête, regarder ce que le site lit déjà » — ici elle ne coûte qu'une
   * colonne de plus (`createdAt`) sur une requête qui existait.
   *
   * Le premier jet de ce témoin assertait `askedMessageIds === []` pour un
   * lecteur sans plancher. Il ne pouvait pas tomber de la bonne façon : la
   * lecture est partagée, donc elle a lieu pour la vivacité quoi qu'il arrive,
   * et le témoin aurait mesuré l'absence d'une requête que la garde ne fait
   * pas — pas l'absence d'une requête en TROP.
   */
  it('ne lit la ligne `Message` qu’UNE fois pour le plancher ET la vivacité', async () => {
    manager.setDeliveryQueue(queueOf([entry(GRANTED), entry(AFTER_JOIN)]));

    await manager._drainPendingMessages('reader', false);

    expect(messageReads).toBe(1);
  });

  /**
   * Le plancher d'une conversation ne borne pas l'autre. Le plancher est par
   * PARTICIPATION, et le drain mélange les conversations d'un même lecteur.
   */
  it('ne retire que les entrées de la conversation BORNÉE', async () => {
    seedReader([
      { conversationId: CONV, shareLinkId: LINK, historyVisibleFrom: null },
      { conversationId: OTHER, role: 'admin' },
    ]);
    manager.setDeliveryQueue(queueOf([entry(GRANTED, CONV), entry(GRANTED, OTHER)]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toHaveLength(1);
  });

  /**
   * La garde PARTAGE la lecture du gate d'appartenance : UNE seule lecture de
   * la ligne du lecteur pour les deux questions. « Avant de conclure qu'une
   * garde coûterait une requête, regarder ce que le site lit déjà » — et le
   * drain est le chemin de la tempête de reconnexions.
   */
  it('ne lit la ligne du lecteur qu’UNE fois pour les deux gates d’autorisation', async () => {
    manager.setDeliveryQueue(queueOf([entry(GRANTED), entry(AFTER_JOIN)]));

    await manager._drainPendingMessages('reader', false);

    expect(participantReads).toBe(1);
  });

  /**
   * Clé de file = `Participant.id` pour un invité de lien, `userId` pour un
   * inscrit. La garde hérite la convention du gate d'appartenance au lieu de
   * la redécouvrir — brancher sur la mauvaise colonne rendrait une liste VIDE,
   * donc « aucun plancher », donc un fail-OPEN muet pour la population
   * DOMINANTE d'une conversation ouverte par lien.
   */
  it('retrouve la ligne d’un invité de lien sous la colonne `id`, pas `userId`', async () => {
    const guest = oid('p-guest');
    let whereSeen: any = null;
    prisma.participant.findMany = jest.fn(async (args: any) => {
      if (args?.select?.bannedAt === undefined) return [{ id: guest, userId: null }];
      whereSeen = args.where;
      return [{
        conversationId: CONV,
        bannedAt: null,
        role: 'member',
        joinedAt: JOINED_AT,
        shareLinkId: LINK,
        historyVisibleFrom: null,
        permissions: null,
        anonymousSession: null,
        user: null,
      }];
    }) as any;
    manager.setDeliveryQueue(queueOf([entry(GRANTED)]));

    await manager._drainPendingMessages(guest, true);

    expect(whereSeen).toMatchObject({ id: guest });
    expect(whereSeen.userId).toBeUndefined();
    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toEqual([]);
  });
});
