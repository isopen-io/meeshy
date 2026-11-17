/**
 * Le plancher d'historique des canaux FRÈRES de l'enrichissement (#18623).
 *
 * #17025 a fermé `message:attachment-updated`. Deux canaux partaient NUS à
 * toute la room, depuis la MÊME fonction et sept lignes plus haut :
 *
 * | site | ce qui partait |
 * |---|---|
 * | `transcription:ready` | `transcription.text`, `segments`, `speakerAnalysis` |
 * | `audio-translation:*` | le texte traduit, `segments`, ET l'URL de la piste TTS |
 *
 * L'invité entré par un lien qui refuse l'historique est dans
 * `conversation:<id>` dès le handshake : il recevait le texte intégral **une
 * milliseconde avant** la garde du site voisin.
 *
 * ─── Pourquoi un fichier à part, et pas le gros harnais ──────────────────────
 *
 * `MeeshySocketIOManager.test.ts` est hors budget (8 114 lignes), et le dépôt
 * interdit d'ajouter à un fichier hors budget — « on extrait d'abord, on ajoute
 * ensuite » (`gateway-test-file-size-budget`, règle 3, qui a rougi sur
 * `8158 → 8237`). Le patron suivi ici est celui de
 * `drain-message-liveness.test.ts` : un VRAI manager, construit depuis les
 * helpers PARTAGÉS, et zéro `jest.mock` local — un double partiel perdrait en
 * silence ce que le harnais partagé gagne.
 *
 * Les témoins portent un lecteur arrivé APRÈS le message : au cas nominal la
 * forme juste et le défaut rendent le même verdict (leçon 261).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { getIoState } from './helpers/message-new-parity-mocks';
import { MeeshySocketIOManager } from '../MeeshySocketIOManager';
import { makePrisma, makeTranslationService } from './helpers/message-new-parity-fixtures';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { matchesMongoWhere } from '../../__tests__/helpers/mongo-where';

const CONV = 'cccccccccccccccccccccccc';
const MSG = 'dddddddddddddddddddddddd';
const ECRIT = new Date('2026-10-08T10:00:00Z');
const ROOM_LATE = ROOMS.user('p-late');
const ROOM_HOST = ROOMS.user('u-host');

const host = {
  id: 'p-host', userId: 'u-host', isActive: true, conversationId: CONV, role: 'creator',
  joinedAt: new Date('2026-10-01T00:00:00Z'), shareLinkId: null, historyVisibleFrom: null,
  permissions: null, anonymousSession: null, user: { role: 'USER' },
};

/** Entré APRÈS le message, par un lien qui REFUSE l'historique. */
const late = {
  id: 'p-late', userId: null, isActive: true, conversationId: CONV, role: 'member',
  joinedAt: new Date(ECRIT.getTime() + 1_800_000), shareLinkId: 'lnk-shut', historyVisibleFrom: null,
  permissions: null, anonymousSession: { rights: null }, user: null,
};

const TRANSCRIPTION = {
  taskId: 't-1', messageId: MSG, attachmentId: 'att-f',
  transcription: { id: 'tr-1', text: 'le code du coffre est 4417', language: 'fr', segments: [] },
};
const AUDIO = {
  messageId: MSG, attachmentId: 'att-f', language: 'en',
  translatedAudio: { transcription: 'the safe code is 4417', url: 'https://cdn/en.mp3' },
};

describe('le plancher des canaux frères de l’enrichissement (#18623)', () => {
  let manager: MeeshySocketIOManager;
  let prisma: ReturnType<typeof makePrisma>;
  let ioState: ReturnType<typeof getIoState>;
  let sent: Array<{ rooms: string[]; excepts: string[]; event: string }>;

  /** Branche le monde sur un lecteur TARDIF ; `lawFails` fait tomber la loi. */
  function seedFloor(options: { lawFails?: boolean } = {}): void {
    // Le double rend le SUPERSET : `conversationId` pour le routage du
    // handler, `createdAt` pour la loi du plancher. Même ligne, deux lectures.
    prisma.message.findUnique = jest.fn(async () => ({ conversationId: CONV, createdAt: ECRIT })) as never;
    // La pièce est absente : `_broadcastAttachmentUpdated` sort tôt, et le
    // témoin ne mesure que les deux canaux frères.
    prisma.messageAttachment.findUnique = jest.fn(async () => null) as never;
    prisma.participant.findMany = jest.fn(async (args: any) => {
      if (options.lawFails) throw new Error('mongo down');
      return [host, late].filter((row) => matchesMongoWhere(row as never, args.where));
    }) as never;
    (prisma as any).conversationShareLink = {
      findMany: jest.fn(async () => [{ id: 'lnk-shut', allowViewHistory: false, expiresAt: null }]),
    };
  }

  /**
   * Toute émission qui ATTEINT une room — adressée, ou par une diffusion qui
   * ne l'exclut pas.
   *
   * **Le nom se lit sur la CONSTANTE, jamais sur un préfixe deviné.** La
   * première version de ce témoin filtrait `startsWith('audio-translation')`
   * quand l'événement s'appelle `audio:translation-ready` : le filtre ne
   * rendait rien, `toEqual([])` était trivialement vrai, et la mutation de la
   * garde laissait tout au VERT.
   */
  const reaches = (event: string, room: string) =>
    sent.filter((s) => s.event === event
      && (s.rooms.includes(room) || s.rooms.includes(ROOMS.conversation(CONV)))
      && !s.excepts.includes(room));

  beforeEach(async () => {
    jest.clearAllMocks();
    ioState = getIoState();
    ioState.to.mockClear();
    ioState.toEmit.mockClear();
    ioState.sockets.sockets.clear();
    ioState.sockets.adapter.rooms.clear();

    sent = [];
    const chain = (rooms: string[], excepts: string[]): any => ({
      to: (room: string) => chain([...rooms, room], excepts),
      except: (room: string) => chain(rooms, [...excepts, room]),
      emit: (event: string) => { sent.push({ rooms, excepts, event }); },
    });
    ioState.to.mockImplementation(((room: string) => chain([room], [])) as never);

    prisma = makePrisma();
    manager = new MeeshySocketIOManager({} as any, prisma as any, makeTranslationService() as any);
    await manager.initialize();
  });

  it("transcription:ready n'atteint PAS un lecteur entré après le message", async () => {
    seedFloor();

    await (manager as any)._handleTranscriptionReady(TRANSCRIPTION);

    expect(reaches(SERVER_EVENTS.TRANSCRIPTION_READY, ROOM_LATE)).toEqual([]);
  });

  it('transcription:ready atteint toujours le lecteur autorisé', async () => {
    seedFloor();

    await (manager as any)._handleTranscriptionReady(TRANSCRIPTION);

    // Une garde qui vide l'audience ne garde rien : elle casse la feature.
    expect(reaches(SERVER_EVENTS.TRANSCRIPTION_READY, ROOM_HOST).length).toBeGreaterThan(0);
  });

  it("audio-translation n'atteint PAS un lecteur entré après le message", async () => {
    seedFloor();

    await (manager as any)._handleAudioTranslationReady(AUDIO);

    // La charge porte le texte traduit ET l'URL de la piste TTS.
    expect(reaches(SERVER_EVENTS.AUDIO_TRANSLATION_READY, ROOM_LATE)).toEqual([]);
  });

  it('audio-translation atteint toujours le lecteur autorisé', async () => {
    seedFloor();

    await (manager as any)._handleAudioTranslationReady(AUDIO);

    expect(reaches(SERVER_EVENTS.AUDIO_TRANSLATION_READY, ROOM_HOST).length).toBeGreaterThan(0);
  });

  it('ne diffuse RIEN quand la loi du plancher est illisible', async () => {
    seedFloor({ lawFails: true });

    await (manager as any)._handleTranscriptionReady(TRANSCRIPTION);

    // Fail-CLOSED, le même arbitrage que l'édition et l'enrichissement.
    expect(sent.filter((s) => s.event === SERVER_EVENTS.TRANSCRIPTION_READY)).toEqual([]);
  });
});
