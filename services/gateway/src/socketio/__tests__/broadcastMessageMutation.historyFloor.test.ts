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

import { describe, it, expect, jest } from '@jest/globals';
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

function monde(options: { participants: MongoDocument[]; messageCreatedAt?: Date | null }) {
  const emissions: Emission[] = [];
  const chain = (rooms: string[], excepts: string[]): any => ({
    to: (room: string) => chain([...rooms, room], excepts),
    except: (room: string | string[]) =>
      chain(rooms, [...excepts, ...(Array.isArray(room) ? room : [room])]),
    emit: (event: string, payload: unknown) => { emissions.push({ rooms, excepts, event, payload }); },
  });
  const io = { to: (room: string) => chain([room], []) };

  const enfile: any[] = [];
  const prisma = {
    message: {
      findUnique: jest.fn(async () => ({
        conversationId: CONV,
        senderId: 'p-hote',
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

  const editer = () =>
    broadcastMessageMutation({
      prisma: prisma as never,
      manager: manager as never,
      conversationId: CONV,
      actorUserId: 'u-hote',
      messageId: MSG,
      eventType: 'edited',
      atRest: false,
      payload: { id: MSG, conversationId: CONV, content: 'SECRET APRÈS ÉDITION' } as never,
    });

  const editions = () => emissions.filter((e) => e.event === SERVER_EVENTS.MESSAGE_EDITED);
  return { emissions, enfile, editer, editions };
}

const ROOM_INVITE = ROOMS.user('p-invite');

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
