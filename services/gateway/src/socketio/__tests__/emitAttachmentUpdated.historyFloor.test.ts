/**
 * `message:attachment-updated` ne part qu'à ceux qui ont le droit de LIRE le
 * message porteur.
 *
 * Constat du cycle 165, et la loi qu'il réclame existait déjà — appliquée à
 * QUATRE autres sorties, jamais à celle-ci :
 *
 * | famille | site qui applique `translationReaders` |
 * |---|---|
 * | `message:translation` | `deliverTextTranslation.ts` |
 * | `message:edited` | `editedAudience.ts` (`messageReadership`) |
 * | mention | `services/messaging/messageMentions.ts` |
 * | aperçu de ligne de liste | `emitConversationPreviewUpdate` (`latestBelowFloor`) |
 * | **`message:attachment-updated`** | **aucun, avant ce lot** |
 *
 * Et le dépôt DÉCLARE cet événement porteur de texte, deux fois dans le même
 * fichier : `TEXT_BEARING_TABLE` et la table en prose de
 * `queuedEventContract.ts`, rangé avec `new`, `edited`, `translation` et
 * `link-message`. Il était le seul des cinq à ne jamais interroger la loi.
 *
 * ─── Le défaut, sans aucune course à gagner ──────────────────────────────────
 *
 * Le balayage des médias en attente n'a **aucune borne temporelle basse**
 * (`gateway-sweep-runner.ts` : `where: { processingState: 'pending', createdAt:
 * { lt: createdBefore } }`). Une pièce bloquée par une panne de worker est donc
 * reprise des jours plus tard, et l'enrichissement tire sur un message d'âge
 * arbitraire. L'invité entré entre-temps par un lien qui REFUSE l'historique
 * recevait la transcription Whisper entière, ses traductions NLLB, les URL des
 * pistes TTS et l'adresse du fichier — en direct sur ses DEUX rooms, plus une
 * entrée Redis de 48 h sous sa clé que le drain rejoue à sa reconnexion —
 * pendant que `GET …/messages`, `/sync`, `conversation:updated` et
 * `GET /attachments/:id` refusent tous ce message au même lecteur.
 *
 * ─── Les témoins ne peuvent pas se poser au cas nominal ─────────────────────
 *
 * Quand personne n'est arrivé après le message, la loi rend `{kind:'room'}`
 * sans rien restreindre : la forme juste et le défaut rendent le MÊME verdict.
 * Les témoins portent donc un invité arrivé APRÈS, et le cas nominal est gardé
 * à part comme non-régression.
 *
 * Le double Prisma ÉVALUE le `where` (`matchesMongoWhere`) : la sélection des
 * lecteurs tardifs se juge sur ce qu'elle rend, jamais sur une copie de la
 * clause — sans quoi le témoin atteste la clause qu'il a recopiée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

import { emitAttachmentUpdated } from '../emitAttachmentUpdated';
import { matchesMongoWhere, type MongoDocument } from '../../__tests__/helpers/mongo-where';

/**
 * **Sans clé de signature, la branche du PLAN N'EXISTE PAS**, et c'est l'audit
 * adversarial du lot qui l'a mesuré : `readerSignedPlanForMessageId` sort sur
 * `if (!signer || …) return null` AVANT même de regarder la protection du
 * message, si bien que `vueUnique: true` était un paramètre MORT et que les
 * deux témoins du plan passaient par la diffusion chaînée comme les autres.
 *
 * Mesure : la garde `if (blocked.has(target.key)) continue;` retirée de la
 * production laissait **29/30 témoins VERTS**. Un témoin qui ne peut pas
 * tomber n'est pas un témoin — et celui-là gardait la branche la plus
 * sensible, celle des pièces à vue unique et des flammes.
 *
 * Sa sœur `emitAttachmentUpdated.readerSigned.test.ts` posait déjà cette clé ;
 * c'est le seul écart qui séparait un témoin porteur d'un témoin décoratif.
 */
beforeEach(() => {
  process.env.ATTACHMENT_URL_SIGNING_KEY = Buffer.alloc(32, 1).toString('base64');
});
afterEach(() => {
  delete process.env.ATTACHMENT_URL_SIGNING_KEY;
});

const CONV = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const MSG = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const ECRIT = new Date('2026-10-08T10:00:00Z');
const apres = (minutes: number) => new Date(ECRIT.getTime() + minutes * 60_000);

const hote: MongoDocument = {
  id: 'p-hote', userId: 'u-hote', isActive: true, conversationId: CONV, role: 'creator',
  joinedAt: new Date('2026-10-01T00:00:00Z'), shareLinkId: null, historyVisibleFrom: null,
  permissions: null, anonymousSession: null, user: { role: 'USER' },
};

/** Entré APRÈS le vocal, par un lien qui REFUSE l'historique. */
const invite = (overrides: MongoDocument = {}): MongoDocument => ({
  id: 'p-invite', userId: null, isActive: true, conversationId: CONV, role: 'member',
  joinedAt: apres(30), shareLinkId: 'lnk-ferme', historyVisibleFrom: null,
  permissions: null, anonymousSession: { rights: null }, user: null, ...overrides,
});

const ROOM_INVITE = ROOMS.user('p-invite');
const ROOM_HOTE = ROOMS.user('u-hote');

/** La pièce enrichie : transcription, traductions, adresse du fichier. */
const PIECE = {
  id: 'aaaaaaaaaaaaaaaaaaaaaaa1',
  messageId: MSG,
  fileUrl: '2026/10/68f2a81417a557e8ce4ddfc1/voice_8b1f0c1e.m4a',
  mimeType: 'audio/m4a',
  fileSize: 100,
  createdAt: ECRIT,
  transcription: { text: 'le code du coffre est 4417' },
  translations: { en: { text: 'the safe code is 4417', url: 'https://cdn/en.mp3' } },
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
} as Record<string, unknown>;

type Emission = { rooms: string[]; excepts: string[]; event: string; payload: any };

function monde(options: {
  participants: MongoDocument[];
  /** `null` ⇒ la ligne du message ne porte pas de `createdAt` (lecture sans date). */
  messageCreatedAt?: Date | null;
  /** Rend la pièce LIÉE AU LECTEUR, donc fait exister un plan signé par lecteur. */
  vueUnique?: boolean;
  /** Fait LEVER les lectures de participants : la loi ne peut rien conclure. */
  loiTombe?: boolean;
}) {
  const emissions: Emission[] = [];
  const chain = (rooms: string[], excepts: string[]): any => ({
    to: (room: string) => chain([...rooms, room], excepts),
    except: (room: string | string[]) =>
      chain(rooms, [...excepts, ...(Array.isArray(room) ? room : [room])]),
    emit: (event: string, payload: unknown) => { emissions.push({ rooms, excepts, event, payload }); },
  });
  const io = { to: (room: string) => chain([room], []) };

  const enfile: Array<{ userId: string; entry: any }> = [];
  let audienceReads = 0;

  const prisma = {
    message: {
      // Le double ignore le `select`, donc il rend le SUPERSET : le régime de
      // chiffrement qu'interroge `attachmentEventSealsAtRest`, les colonnes de
      // protection du plan signé, ET le `createdAt` que la loi du plancher
      // demande. Les trois lectures portent sur la MÊME ligne.
      findUnique: jest.fn(async () => ({
        conversationId: CONV,
        senderId: 'p-hote',
        encryptionMode: null,
        conversation: { encryptionMode: null },
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
      findMany: jest.fn(async (args: any) => {
        if (options.loiTombe) throw new Error('mongo down');
        // L'audience chaînée est la seule requête SANS clause de retard ni
        // projection de plancher : la compter permet de garder la propriété
        // « on ne requête pas deux fois pour la file ».
        if (!JSON.stringify(args.where ?? {}).includes('joinedAt') && !args.select?.joinedAt) audienceReads += 1;
        return options.participants.filter((row) => matchesMongoWhere(row, args.where));
      }),
    },
    conversationShareLink: {
      findMany: jest.fn(async () => [
        // `expiresAt` pour `withoutExpiredShareLinks`, `allowViewHistory` pour
        // le plancher : deux lectures de la même table, deux `select`.
        { id: 'lnk-ferme', allowViewHistory: false, expiresAt: null },
        { id: 'lnk-ouvert', allowViewHistory: true, expiresAt: null },
      ]),
    },
    conversation: { findUnique: jest.fn(async () => null) },
  };

  const enrichir = () =>
    emitAttachmentUpdated({
      io: io as never,
      prisma: prisma as never,
      deliveryQueue: { enqueue: jest.fn(async (userId: string, entry: any) => { enfile.push({ userId, entry }); }) } as never,
      connectedUsers: new Map() as never,
      conversationId: CONV,
      messageId: MSG,
      attachment: PIECE as never,
    });

  const majs = () => emissions.filter((e) => e.event === SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED);
  return { emissions, enfile, enrichir, majs, audienceReads: () => audienceReads };
}

/**
 * Toute émission qui ATTEINT une room — par adressage direct, ou par une
 * diffusion de room qui ne l'exclut pas.
 *
 * Écrit émission par émission : aplatir `rooms` et `excepts` sur TOUTES les
 * émissions laisserait une diffusion qui exclut l'invité masquer une émission
 * DIRECTE vers sa room personnelle.
 */
const atteint = (emissions: Emission[], room: string) =>
  emissions.filter(
    (e) => (e.rooms.includes(room) || e.rooms.includes(ROOMS.conversation(CONV))) && !e.excepts.includes(room),
  );

describe("emitAttachmentUpdated — le plancher d'historique de la diffusion chaînée", () => {
  it("ne sert PAS l'enrichissement à un invité entré après le message", async () => {
    const monde_ = monde({ participants: [hote, invite()] });

    await monde_.enrichir();

    // La transcription, ses traductions et l'adresse du fichier ne doivent
    // atteindre l'invité NI par sa room personnelle, NI par la room de
    // conversation — où sa socket est mise dès le handshake
    // (`join-user-conversations.ts`, `PARTICIPATION_VIVANTE` seul).
    expect(atteint(monde_.majs(), ROOM_INVITE)).toEqual([]);
  });

  it("sert toujours l'enrichissement à l'hôte, qui a écrit le message", async () => {
    const monde_ = monde({ participants: [hote, invite()] });

    await monde_.enrichir();

    // Une garde de confidentialité qui vide l'audience entière ne garde rien :
    // elle casse la feature. Le lecteur autorisé reçoit sa pièce enrichie.
    expect(atteint(monde_.majs(), ROOM_HOTE).length).toBeGreaterThan(0);
    const payload = atteint(monde_.majs(), ROOM_HOTE)[0].payload;
    expect(payload.attachment.transcription).toEqual({ text: 'le code du coffre est 4417' });
  });

  it("n'exclut personne quand tout le monde était là avant le message", async () => {
    const monde_ = monde({ participants: [hote, invite({ joinedAt: new Date('2026-10-02T00:00:00Z') })] });

    await monde_.enrichir();

    // Non-régression : la loi rend `{kind:'room'}` et la diffusion reste celle
    // d'avant le lot — room de conversation PLUS chaque room personnelle.
    expect(monde_.majs()).toHaveLength(1);
    expect(monde_.majs()[0].rooms).toEqual([ROOMS.conversation(CONV), ROOM_HOTE, ROOM_INVITE]);
    expect(monde_.majs()[0].excepts).toEqual([]);
  });

  it("ne requête pas l'audience deux fois pour alimenter la file", async () => {
    const monde_ = monde({ participants: [hote, invite({ joinedAt: new Date('2026-10-02T00:00:00Z') })] });

    await monde_.enrichir();

    expect(monde_.audienceReads()).toBe(1);
  });
});

describe('emitAttachmentUpdated — le plancher de la file hors ligne', () => {
  it("n'enfile RIEN sous la clé d'un invité entré après le message", async () => {
    const monde_ = monde({ participants: [hote, invite()] });

    await monde_.enrichir();

    // Sans cette garde l'entrée vivait 48 h dans Redis sous la clé de
    // l'invité, et le drain la rejouait à sa reconnexion : la fuite survivait
    // à la déconnexion qui l'avait empêchée en direct.
    expect(monde_.enfile.map((e) => e.userId)).not.toContain('p-invite');
  });

  it("enfile toujours pour l'hôte hors ligne", async () => {
    const monde_ = monde({ participants: [hote, invite()] });

    await monde_.enrichir();

    expect(monde_.enfile.map((e) => e.userId)).toContain('u-hote');
  });
});

describe('emitAttachmentUpdated — le plancher du plan signé par lecteur', () => {
  it("ne sert PAS la pièce signée à un invité entré après le message", async () => {
    const monde_ = monde({ participants: [hote, invite()], vueUnique: true });

    await monde_.enrichir();

    // Le plan s'autorise sur `ADMITTED_FILE_READER_WHERE`, dont
    // `editedAudience.ts` écrit qu'elle « ne regarde NI `joinedAt` NI
    // `historyVisibleFrom` : elle ne dispense pas du plancher ».
    expect(atteint(monde_.majs(), ROOM_INVITE)).toEqual([]);
  });

  it("sert la pièce signée à l'hôte", async () => {
    const monde_ = monde({ participants: [hote, invite()], vueUnique: true });

    await monde_.enrichir();

    expect(atteint(monde_.majs(), ROOM_HOTE).length).toBeGreaterThan(0);
  });
});

describe('emitAttachmentUpdated — le verdict que la loi ne peut pas rendre', () => {
  it('se tait sur les DEUX canaux quand la loi est illisible', async () => {
    const monde_ = monde({ participants: [hote, invite()], loiTombe: true });

    await expect(monde_.enrichir()).resolves.toBeUndefined();

    // Fail-CLOSED, le même arbitrage que le chemin d'édition : on ne sait NI
    // qui est bloqué, NI qui est autorisé. Diffuser à la room servirait le
    // texte à un lecteur peut-être sans droit ; la base garde la vérité, et la
    // relecture du fil sert la pièce enrichie.
    expect(monde_.majs()).toEqual([]);
    expect(monde_.enfile).toEqual([]);
  });

  it("exclut tout lecteur à plancher quand la DATE du message est illisible", async () => {
    const monde_ = monde({ participants: [hote, invite()], messageCreatedAt: null });

    await monde_.enrichir();

    // « Une date de message inconnue fait lire le plancher de tous, et exclut
    // quiconque en a un » — l'audience reste juste, seulement plus étroite.
    expect(atteint(monde_.majs(), ROOM_INVITE)).toEqual([]);
    expect(monde_.enfile.map((e) => e.userId)).not.toContain('p-invite');
  });
});
