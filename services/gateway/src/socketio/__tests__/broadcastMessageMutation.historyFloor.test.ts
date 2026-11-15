/**
 * `message:edited` ne part qu'à ceux qui ont le droit de LIRE le message.
 *
 * Constat d'audit adversarial du cycle 147, et la loi qu'il réclame existait
 * déjà — appliquée à TROIS autres événements, jamais à celui-ci.
 *
 * Le défaut : une conversation a un lien de partage créé avec
 * `allowViewHistory: false` (ou un membre à qui un admin a accordé
 * `historyVisibleFrom`). L'invité entre aujourd'hui, son plancher vaut son
 * `joinedAt`. L'hôte édite demain un message écrit la semaine dernière. La
 * socket de l'invité recevait `message:edited` avec **le texte intégral après
 * édition** — `buildMessageEditedCore` porte « le texte APRÈS édition » — pour
 * un message que `GET …/messages`, `…/pinned-messages`, `…/reactions`, `/sync`
 * et `conversation:updated` lui refusent tous. Aucune fenêtre de temps : le
 * défaut était PERMANENT.
 *
 * PANNE MESURÉE : le web enregistre l'écouteur (`socket.on(MESSAGE_EDITED, …)`),
 * la socket de l'invité est bien dans `ROOMS.conversation(...)`
 * (`AuthHandler._joinConversationRoomsWithRetry` sur sa porte), et la file hors
 * ligne PERSISTAIT la même charge 48 h dans Redis sous sa clé.
 *
 * ─── Ce qui rend le constat net ──────────────────────────────────────────────
 *
 * La loi est `translationReaders` (#9709), écrite pour `message:translation` :
 * « Un invité entré par un lien sans historique recevait donc le TEXTE traduit
 * des messages écrits avant lui ». `emitConversationPreviewUpdate` retient
 * l'aperçu (`latestBelowFloor`), `emitConversationActivityUpdate` retient
 * l'extrait de réaction. **Et `broadcastMessageMutation` appelle
 * `emitConversationPreviewUpdate` quinze lignes après avoir servi le texte
 * entier à la room** : elle retenait l'APERÇU du message pour ce lecteur juste
 * après lui avoir donné le message. C'est la leçon 275 inversée — la garde
 * était sur l'aperçu, et la fuite sur l'événement principal.
 *
 * ─── Les témoins ne peuvent pas se poser au cas nominal ──────────────────────
 *
 * Quand personne n'est arrivé après le message, `translationReaders` rend
 * `{kind:'room'}` sans rien restreindre : la forme juste et le défaut rendent
 * le même verdict. Les témoins portent donc un invité arrivé APRÈS, et le cas
 * nominal est gardé à part comme non-régression.
 *
 * Le double Prisma ÉVALUE le `where` (`matchesMongoWhere`) : la sélection des
 * lecteurs tardifs se juge sur ce qu'elle rend, jamais sur une copie de la
 * clause.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

import { broadcastMessageMutation } from '../broadcastMessageMutation';
import { matchesMongoWhere, type MongoDocument } from '../../__tests__/helpers/mongo-where';

const CONV = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const MSG = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const ECRIT = new Date('2026-10-08T10:00:00Z');
const apres = (minutes: number) => new Date(ECRIT.getTime() + minutes * 60_000);

const hote: MongoDocument = {
  id: 'p-hote', userId: 'u-hote', isActive: true, conversationId: CONV, role: 'creator',
  joinedAt: new Date('2026-10-01T00:00:00Z'), shareLinkId: null, historyVisibleFrom: null,
  permissions: null, anonymousSession: null, user: { role: 'USER' },
};

/** Entré APRÈS le message, par un lien qui REFUSE l'historique. */
const invite = (overrides: MongoDocument = {}): MongoDocument => ({
  id: 'p-invite', userId: null, isActive: true, conversationId: CONV, role: 'member',
  joinedAt: apres(30), shareLinkId: 'lnk-ferme', historyVisibleFrom: null,
  permissions: null, anonymousSession: { rights: null }, user: null, ...overrides,
});

type Emission = { rooms: string[]; excepts: string[]; event: string; payload: any };

function monde(options: {
  participants: MongoDocument[];
  messageCreatedAt?: Date | null;
  /** Rend la pièce LIÉE AU LECTEUR, donc fait exister un plan signé. */
  vueUnique?: boolean;
  /** Le harnais n'expose PAS `except` : simule une cible qui ne sait pas exclure. */
  sansExcept?: boolean;
}) {
  const emissions: Emission[] = [];
  const chain = (rooms: string[], excepts: string[]): any => ({
    to: (room: string) => chain([...rooms, room], excepts),
    ...(options.sansExcept
      ? {}
      : {
          except: (room: string | string[]) =>
            chain(rooms, [...excepts, ...(Array.isArray(room) ? room : [room])]),
        }),
    emit: (event: string, payload: unknown) => { emissions.push({ rooms, excepts, event, payload }); },
  });
  const io = { to: (room: string) => chain([room], []) };

  const enfile: any[] = [];
  const prisma = {
    message: {
      // Le double ignore le `select`, donc il rend le SUPERSET : les cinq
      // colonnes de protection que `readerSignedPlanForMessageId` demande ET
      // le `createdAt` que la loi du plancher demande. Les deux lectures
      // portent sur la MÊME ligne.
      findUnique: jest.fn(async () => ({
        conversationId: CONV,
        senderId: 'p-hote',
        isViewOnce: options.vueUnique === true,
        isBlurred: false,
        effectFlags: 0,
        ephemeralDuration: null,
        expiresAt: null,
        ...(options.messageCreatedAt === null ? {} : { createdAt: options.messageCreatedAt ?? ECRIT }),
      })),
      findFirst: jest.fn(async () => null),
    },
    participant: {
      findMany: jest.fn(async (args: any) =>
        options.participants.filter((row) => matchesMongoWhere(row, args.where)),
      ),
    },
    conversationShareLink: {
      findMany: jest.fn(async () => [
        { id: 'lnk-ferme', allowViewHistory: false },
        { id: 'lnk-ouvert', allowViewHistory: true },
      ]),
    },
    conversation: { findUnique: jest.fn(async () => null) },
  };
  const manager = {
    getIO: () => io,
    enqueueOfflineMessageMutation: jest.fn(async (p: any) => { enfile.push(p); }),
    emitUnreadCountsToRecipients: jest.fn(async () => undefined),
  };

  const editer = (extra: Record<string, unknown> = {}) =>
    broadcastMessageMutation({
      prisma: prisma as never,
      manager: manager as never,
      conversationId: CONV,
      actorUserId: 'u-hote',
      messageId: MSG,
      eventType: 'edited',
      atRest: false,
      payload: {
        id: MSG,
        conversationId: CONV,
        content: 'SECRET APRÈS ÉDITION',
        ...(options.vueUnique ? { attachments: [PIECE] } : {}),
      } as never,
      ...extra,
    } as never);

  const editions = () => emissions.filter((e) => e.event === SERVER_EVENTS.MESSAGE_EDITED);
  return { emissions, enfile, editer, editions };
}

const ROOM_INVITE = ROOMS.user('p-invite');

/** Une pièce dont la protection du message fait une pièce LIÉE AU LECTEUR. */
const PIECE = {
  id: 'aaaaaaaaaaaaaaaaaaaaaaa1',
  fileUrl: '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e.jpg',
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
};

/**
 * Toute émission qui ATTEINT une room donnée — par adressage direct, ou par une
 * diffusion de room qui ne l'exclut pas.
 *
 * Écrit émission par émission, et c'est le correctif d'un témoin FAIBLE : aplatir
 * `rooms` et `excepts` sur TOUTES les émissions laissait une diffusion de room
 * qui exclut l'invité masquer une émission DIRECTE vers sa room personnelle.
 */
const atteint = (emissions: Emission[], room: string) =>
  emissions.filter(
    (e) =>
      (e.rooms.includes(room) || e.rooms.includes(ROOMS.conversation(CONV))) && !e.excepts.includes(room),
  );

// La clé de signature est POSÉE ici, jamais héritée de l'environnement : sans
// elle `readerSignedPlanForMessageId` rend `null` sans aucune requête, et le
// témoin du chemin du PLAN SIGNÉ passerait par la diffusion de room en croyant
// tenir la boucle par lecteur. Même discipline que
// `broadcastMessageMutation.readerSigned.test.ts`.
beforeEach(() => {
  process.env.ATTACHMENT_URL_SIGNING_KEY = Buffer.alloc(32, 9).toString('base64');
});
afterEach(() => {
  delete process.env.ATTACHMENT_URL_SIGNING_KEY;
});

describe('le texte d’une édition ne part qu’à ceux qui peuvent lire le message', () => {
  it('un invité SANS historique, entré après le message, ne reçoit pas le texte édité', async () => {
    const m = monde({ participants: [hote, invite()] });

    await m.editer();

    const vers = m.editions().flatMap((e) => e.rooms);
    const exclus = m.editions().flatMap((e) => e.excepts);
    // Soit sa room personnelle est explicitement exclue de la diffusion, soit
    // la diffusion ne la nomme pas : ce qui compte est qu'aucune émission ne
    // l'atteigne.
    const atteint = vers.includes(ROOMS.conversation(CONV)) ? !exclus.includes(ROOM_INVITE) : vers.includes(ROOM_INVITE);
    expect({ atteint }).toEqual({ atteint: false });
  });

  it('le texte édité n’apparaît dans AUCUNE charge qui parte vers lui', async () => {
    const m = monde({ participants: [hote, invite()] });

    await m.editer();

    const pourLInvite = m.editions().filter(
      (e) => (e.rooms.includes(ROOM_INVITE) || e.rooms.includes(ROOMS.conversation(CONV))) && !e.excepts.includes(ROOM_INVITE),
    );
    expect(JSON.stringify(pourLInvite)).not.toContain('SECRET APRÈS ÉDITION');
  });

  it('l’hôte, lui, reçoit bien son édition — la porte échoue en montrant moins, pas rien', async () => {
    const m = monde({ participants: [hote, invite()] });

    await m.editer();

    const pourLHote = m.editions().filter(
      (e) => (e.rooms.includes(ROOMS.user('u-hote')) || e.rooms.includes(ROOMS.conversation(CONV)))
        && !e.excepts.includes(ROOMS.user('u-hote')),
    );
    expect(pourLHote.length).toBeGreaterThan(0);
    expect(JSON.stringify(pourLHote)).toContain('SECRET APRÈS ÉDITION');
  });

  it('la FILE hors ligne ne garde rien sous la clé de l’invité', async () => {
    const m = monde({ participants: [hote, invite()] });

    await m.editer();

    expect(m.enfile).toHaveLength(1);
    const exclues: ReadonlySet<string> | undefined = m.enfile[0]?.excludedQueueKeys;
    expect(exclues && [...exclues]).toContain('p-invite');
  });

  /**
   * ─── Les TROIS chemins par lecteur ───────────────────────────────────────
   *
   * Un audit adversarial a mesuré que les trois gardes par lecteur ne pouvaient
   * pas tomber : neutralisées en `if (false && …)`, 139 suites et 2 392 témoins
   * restaient VERTS. Les témoins ci-dessus n'atteignaient que la diffusion de
   * room — la charge ne portait pas d'`attachments` (donc aucun plan signé),
   * le harnais exposait toujours `except`, et aucun cas ne posait
   * `sealedQuoteAudience`.
   *
   * Les trois qui suivent prennent chacun un de ces chemins, et le chemin du
   * plan signé est celui que la production désigne elle-même comme le plus
   * dangereux : il s'autorise sur l'admission de lecture de FICHIER, qui ne
   * regarde NI `joinedAt` NI `historyVisibleFrom`.
   */
  it('chemin du PLAN SIGNÉ — la remise par lecteur saute l’invité sous plancher', async () => {
    const m = monde({ participants: [hote, invite()], vueUnique: true });

    await m.editer();

    // Le plan existe bien : la remise est par lecteur, pas en room.
    expect(m.editions().flatMap((e) => e.rooms)).not.toContain(ROOMS.conversation(CONV));
    expect(atteint(m.emissions.filter((e) => e.event === SERVER_EVENTS.MESSAGE_EDITED), ROOM_INVITE)).toEqual([]);
    // Et l'hôte, lui, est servi — la garde retire un lecteur, pas le canal.
    expect(atteint(m.editions(), ROOMS.user('u-hote')).length).toBeGreaterThan(0);
  });

  it('chemin de la CITATION SCELLÉE — l’invité sous plancher ne reçoit aucune variante', async () => {
    const m = monde({ participants: [hote, invite()] });

    // L'invité est DANS l'audience scellée : sceller une citation ne l'autorise
    // pas à lire le message porteur.
    await m.editer({ sealedQuoteAudience: new Map([['p-invite', new Date()]]) });

    expect(atteint(m.editions(), ROOM_INVITE)).toEqual([]);
    expect(atteint(m.editions(), ROOMS.user('u-hote')).length).toBeGreaterThan(0);
  });

  it('cible qui ne sait pas EXCLURE — rien ne part plutôt que de servir qui n’y a pas droit', async () => {
    const m = monde({ participants: [hote, invite()], sansExcept: true });

    await m.editer();

    // La porte échoue en montrant MOINS : aucune édition en direct. La file
    // hors ligne sert les absents, la relecture de la page les présents.
    expect(m.editions()).toEqual([]);
  });

  it('cible sans EXCLUSION mais sans lecteur bloqué — la diffusion de room est intacte', async () => {
    const m = monde({
      participants: [hote, invite({ joinedAt: new Date('2026-10-02T00:00:00Z') })],
      sansExcept: true,
    });

    await m.editer();

    // Le repli « rien ne part » ne vaut QUE s'il y a quelqu'un à retenir.
    expect(m.editions().flatMap((e) => e.rooms)).toContain(ROOMS.conversation(CONV));
  });

  /**
   * NON-RÉGRESSION, et elle n'est pas décorative : sans elle, les témoins
   * ci-dessus ne distinguent pas « restreint juste » de « restreint toujours ».
   */
  it('cas nominal — personne n’est arrivé après le message : la room entière', async () => {
    const m = monde({ participants: [hote, invite({ joinedAt: new Date('2026-10-02T00:00:00Z') })] });

    await m.editer();

    const vers = m.editions().flatMap((e) => e.rooms);
    expect(vers).toContain(ROOMS.conversation(CONV));
    expect(m.editions().flatMap((e) => e.excepts)).toEqual([]);
  });

  it('un invité entré après le message mais par un lien OUVERT reçoit son édition', async () => {
    const m = monde({ participants: [hote, invite({ shareLinkId: 'lnk-ouvert' })] });

    await m.editer();

    const vers = m.editions().flatMap((e) => e.rooms);
    expect(vers).toContain(ROOMS.conversation(CONV));
    expect(m.editions().flatMap((e) => e.excepts)).not.toContain(ROOM_INVITE);
  });
});
