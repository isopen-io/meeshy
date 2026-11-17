/**
 * La charge ENFILÉE d'un message dont une pièce se lit PAR LECTEUR (#18619).
 *
 * Le direct signe par destinataire depuis #9646 : `fileUrl` / `thumbnailUrl`
 * portent une adresse valable pour SA ligne `Participant`. L'enfilement, lui,
 * déposait la charge GÉNÉRIQUE — l'adresse NUE — dans Redis pour 48 h
 * (`DELIVERY_QUEUE_TTL_SECONDS`), et le drain la rejouait telle quelle.
 *
 * La file est le canal le plus EXPOSÉ des deux : son entrée survit à la fenêtre
 * pendant laquelle la protection d'une pièce peut changer. Avec
 * `ATTACHMENT_URL_SIGNATURE_ENFORCE` à `false` — le défaut des deux
 * environnements — l'adresse nue est SERVIE à qui la détient, et un
 * destinataire qui a déjà consommé une pièce à vue unique en relit les octets.
 *
 * ─── Les DEUX producteurs, et pourquoi pas un seul témoin ───────────────────
 *
 * Le défaut était sur les deux. Un témoin unique laisserait l'autre transport
 * diverger en silence — c'est la raison d'être de `message-new-producer-parity`,
 * dont ce fichier est l'extension : ce dernier est à son plafond de lignes
 * (1 000), et le dépôt interdit d'ajouter à un fichier hors budget. « On extrait
 * d'abord, on ajoute ensuite. »
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { getIoState } from './helpers/message-new-parity-mocks';
import { MeeshySocketIOManager } from '../MeeshySocketIOManager';
import {
  makePrisma,
  makeTranslationService,
  makeContractMessage,
  makeAttachmentRow,
  CONVERSATION_ID,
} from './helpers/message-new-parity-fixtures';

const SIGNED_KEY = Buffer.alloc(32, 7).toString('base64');

describe('message:new — la charge ENFILÉE est signée pour son destinataire (#18619)', () => {
  let manager: any;
  let messageHandler: any;
  let prisma: ReturnType<typeof makePrisma>;
  let ioState: ReturnType<typeof getIoState>;
  let queue: { enqueue: jest.Mock };

  /**
   * Un message dont la PIÈCE porte sa propre protection, en plus de celle du
   * message : la loi de sortie lit les deux, et un message `isViewOnce` dont la
   * pièce ne déclare rien se range « ordinaire » — la signature serait alors un
   * no-op silencieux, et le témoin vert pour rien.
   *
   * `fileUrl` est une CLÉ DE STOCKAGE, pas une adresse absolue : le signeur ne
   * réécrit que ce qu'il sait adresser (`STORAGE_KEY_SHAPE`), et une URL de CDN
   * traverse intacte. Les deux pièges ont été trouvés en mutant la garde, pas
   * en la relisant.
   */
  const protectedPiece = () => makeContractMessage({
    isViewOnce: true,
    attachments: [makeAttachmentRow({ isViewOnce: true, fileUrl: '2026/11/aaaaaaaaaaaaaaaaaaaaaaaa/photo.jpg' })],
  });

  /** L'entrée réellement déposée pour ce destinataire, si elle existe. */
  const queuedFor = (queueKey: string): Record<string, unknown> | undefined =>
    ((queue.enqueue.mock.calls as any[]).find((c) => c[0] === queueKey)?.[1]) as Record<string, unknown> | undefined;

  const queuedUrlOf = (queueKey: string): unknown =>
    ((queuedFor(queueKey)?.payload as any)?.attachments?.[0] ?? {}).fileUrl;

  /**
   * L'adresse SIGNÉE se reconnaît à sa PORTE : `/attachments/signed/…`, dont le
   * jeton nomme la ligne `Participant` pour laquelle il vaut. L'assertion porte
   * sur la porte, jamais sur la forme interne du jeton — celle-ci est l'affaire
   * de `readerFileSignature`, et la recopier ici en ferait une jumelle.
   */
  const estSignee = (url: unknown): boolean =>
    typeof url === 'string' && url.startsWith('/api/v1/attachments/signed/');

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.ATTACHMENT_URL_SIGNING_KEY = SIGNED_KEY;
    ioState = getIoState();
    ioState.to.mockClear();
    ioState.toEmit.mockClear();
    ioState.toEmit.mockImplementation(() => undefined);
    ioState.sockets.sockets.clear();
    ioState.sockets.adapter.rooms.clear();

    prisma = makePrisma();
    // Le plan ABOUTIT : la requête d'admission répond, et les deux lignes
    // portent `shareLinkId` — la projection que ce prédicat demande.
    (prisma.participant.findMany as any).mockImplementation(async () => [
      { id: 'sender-participantId', userId: 'sender-userId', shareLinkId: null },
      { id: 'peer-participantId', userId: 'peer-userId', shareLinkId: null },
    ]);
    manager = new MeeshySocketIOManager({} as any, prisma as any, makeTranslationService() as any);
    await manager.initialize();
    messageHandler = manager.messageHandler;

    queue = { enqueue: jest.fn().mockResolvedValue(undefined) as jest.Mock };
    manager.setDeliveryQueue(queue as any);
  });

  afterEach(() => {
    delete process.env.ATTACHMENT_URL_SIGNING_KEY;
  });

  it('le producteur REST/ZMQ enfile la pièce SIGNÉE, pas l’adresse nue', async () => {
    await manager.broadcastMessage(protectedPiece() as any, CONVERSATION_ID);

    expect(estSignee(queuedUrlOf('peer-userId'))).toBe(true);
  });

  it('le producteur WS enfile la pièce SIGNÉE, pas l’adresse nue', async () => {
    await messageHandler.broadcastNewMessage(protectedPiece() as any, CONVERSATION_ID);

    expect(estSignee(queuedUrlOf('peer-userId'))).toBe(true);
  });

  /**
   * L'autre moitié, sans laquelle le lot serait un correctif trop large : un
   * message ORDINAIRE n'a aucune pièce liée au lecteur, son adresse n'a rien à
   * signer, et la réécrire coûterait une signature à tout le produit.
   */
  it('laisse INTACTE l’adresse d’une pièce ordinaire', async () => {
    // « Ordinaire » se DÉCLARE, il ne s'omet pas : une colonne de protection
    // non chargée reste `undefined`, et la loi de sortie la lit comme une
    // preuve manquante — donc ferme et signe. C'est le bon défaut, et c'est
    // pourquoi ce témoin doit poser les cinq colonnes plutôt que les taire.
    const ORDINAIRE = { isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null };
    const ordinaire = makeContractMessage({
      ...ORDINAIRE,
      attachments: [makeAttachmentRow({ ...ORDINAIRE, fileUrl: '2026/11/aaaaaaaaaaaaaaaaaaaaaaaa/photo.jpg' })],
    });

    await manager.broadcastMessage(ordinaire as any, CONVERSATION_ID);

    expect(queuedUrlOf('peer-userId')).toBe('2026/11/aaaaaaaaaaaaaaaaaaaaaaaa/photo.jpg');
  });
});
