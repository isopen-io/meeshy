/**
 * La remise PAR DESTINATAIRE d'une charge temps réel qui porte une pièce
 * protégée (#9646, suite de #9600).
 *
 * Une diffusion à la room de conversation porte UNE charge pour tous : elle ne
 * peut pas porter l'adresse signée de chaque lecteur. Quand une pièce du
 * message se lit par lecteur (vue unique, flamme — la nature de la loi de
 * sortie, `attachmentIsReaderBound`), la charge part donc sur la room
 * PERSONNELLE de chaque participant actif (`participantUserRoomTargets`, le
 * mécanisme de l'avis de capture, `captureNoticeDelivery.ts`), chacune avec
 * ses adresses signées pour SA ligne `Participant`.
 *
 * Tout le reste — message ordinaire, flou seul, aucune clé de signature —
 * garde sa diffusion de room, inchangée : {@link readerSignedTargets} rend
 * `null` sans aucune requête.
 *
 * Ce que ça coûte, mesuré (`readerSignedDelivery.test.ts`, § coût) : une
 * émission et une sérialisation par participant actif au lieu d'une par
 * room, pour les seuls messages protégés. La charge est construite UNE fois ;
 * seul le tableau `attachments` est recopié par lecteur.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import {
  attachmentIsReaderBound,
  signReaderAttachmentUrls,
  type ReaderBoundMessage,
  type SignableAttachment,
} from '../services/attachments/signedAttachmentUrls';
import { readerFileUrlSignerFromEnv, type ReaderFileUrlSigner } from '../services/attachments/readerFileSignature';
import { ADMITTED_FILE_READER_WHERE, withoutExpiredShareLinks } from '../services/attachments/fileReaderAdmission';
import { participantUserRoomTargets } from './emitToConversationParticipants';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'ReaderSignedDelivery' });

export type ReaderSignedTarget = {
  /** La room personnelle — `ROOMS.user(userId ?? id)`. */
  readonly room: string;
  /** La clé de cette room (`userId ?? id`), celle des variantes par lecteur existantes. */
  readonly key: string;
  readonly participantId: string;
};

/**
 * Les colonnes de protection d'une ligne `Message` que la passerelle vient
 * d'écrire ou de relire SANS `select` (tous les scalaires) : une colonne
 * absente y vaut `null` en base, et se lit ainsi. Ne jamais l'appliquer à une
 * projection partielle — `contentExitLawOfSource` y fermerait à raison.
 */
export function protectionOfFullMessageRow(message: object): ReaderBoundMessage {
  // `Message` (types partagés) ne déclare ni `effectFlags` ni toujours
  // `ephemeralDuration` : la ligne se lit par ses clés, sans présumer leur type.
  const row = message as Readonly<Record<string, unknown>>;
  const expiresAt = row['expiresAt'];
  return {
    isViewOnce: row['isViewOnce'] === true,
    isBlurred: row['isBlurred'] === true,
    effectFlags: typeof row['effectFlags'] === 'number' ? row['effectFlags'] : 0,
    ephemeralDuration: typeof row['ephemeralDuration'] === 'number' ? row['ephemeralDuration'] : null,
    expiresAt: expiresAt instanceof Date || typeof expiresAt === 'string' ? expiresAt : null,
  };
}

const asAttachments = (value: unknown): readonly SignableAttachment[] =>
  Array.isArray(value) ? value.filter((entry): entry is SignableAttachment => typeof entry === 'object' && entry !== null) : [];

/** Une pièce du message se lit-elle par lecteur ? Sans clé, la question ne se pose pas. */
export function carriesReaderBoundAttachment(input: {
  readonly message: ReaderBoundMessage;
  readonly attachments: unknown;
  readonly signer: ReaderFileUrlSigner | null;
}): boolean {
  return input.signer !== null && asAttachments(input.attachments).some((piece) => attachmentIsReaderBound(input.message, piece));
}

/**
 * Les destinataires d'une remise par lecteur, ou `null` quand la diffusion de
 * room suffit (sans aucune requête). Les destinataires sont TOUJOURS relus ici,
 * sous le prédicat d'admission que la route signée applique au même lecteur
 * (`fileReaderAdmission.ts` : actif, jamais banni, lien d'entrée non échu) —
 * jamais pris d'une liste de l'appelant, chargée pour une autre question : une
 * adresse signée ne part qu'à qui la route servirait.
 */
export async function readerSignedTargets(
  prisma: Pick<PrismaClient, 'participant' | 'conversationShareLink'>,
  input: {
    readonly conversationId: string;
    readonly message: ReaderBoundMessage;
    readonly attachments: unknown;
    readonly signer: ReaderFileUrlSigner | null;
    readonly now: Date;
  }
): Promise<ReadonlyArray<ReaderSignedTarget> | null> {
  if (!carriesReaderBoundAttachment(input)) return null;
  const rows = await prisma.participant.findMany({
    where: { conversationId: input.conversationId, ...ADMITTED_FILE_READER_WHERE },
    select: { id: true, userId: true, shareLinkId: true },
  });
  const admitted = await withoutExpiredShareLinks(prisma, rows, input.now);
  return participantUserRoomTargets(admitted).map(({ room, participant }) => ({
    room,
    key: participant.userId ?? participant.id,
    participantId: participant.id,
  }));
}

/** La charge d'UN lecteur : la même, ses adresses de pièces signées pour lui. */
export function signedForReader<P extends object>(
  payload: P,
  input: { readonly message: ReaderBoundMessage; readonly participantId: string; readonly signer: ReaderFileUrlSigner | null }
): P {
  const attachments = (payload as { readonly attachments?: unknown }).attachments;
  if (!Array.isArray(attachments)) return payload;
  const context = { message: input.message, readerParticipantId: input.participantId, signer: input.signer };
  return {
    ...payload,
    attachments: attachments.map((entry: unknown) =>
      typeof entry === 'object' && entry !== null ? signReaderAttachmentUrls(entry as SignableAttachment, context) : entry
    ),
  };
}

export type ReaderSignedPlan = {
  readonly targets: ReadonlyArray<ReaderSignedTarget>;
  /** La charge d'un lecteur : son tableau `attachments` signé pour lui. */
  readonly signFor: <P extends object>(payload: P, participantId: string) => P;
  /** Une pièce seule (`message:attachment-updated`), signée pour un lecteur. */
  readonly signAttachment: <A extends SignableAttachment>(attachment: A, participantId: string) => A;
};

async function planFor(
  prisma: Pick<PrismaClient, 'participant' | 'conversationShareLink'>,
  input: {
    readonly conversationId: string;
    readonly protection: ReaderBoundMessage;
    readonly attachments: unknown;
    readonly signer: ReaderFileUrlSigner | null;
    readonly now: Date;
  }
): Promise<ReaderSignedPlan | null> {
  const { protection, signer } = input;
  const targets = await readerSignedTargets(prisma, { ...input, message: protection });
  if (!targets) return null;
  return {
    targets,
    signFor: (payload, participantId) => signedForReader(payload, { message: protection, participantId, signer }),
    signAttachment: (attachment, participantId) =>
      signReaderAttachmentUrls(attachment, { message: protection, readerParticipantId: participantId, signer }),
  };
}

/**
 * Le plan de remise par lecteur d'une charge `message:new` — la ligne `Message`
 * que l'émetteur vient d'écrire ou de relire ENTIÈRE (`protectionOfFullMessageRow`).
 * `null` quand la diffusion de room suffit. La clé est lue à l'instant de
 * l'émission (`readerFileUrlSignerFromEnv`).
 */
export async function readerSignedPlan(
  prisma: Pick<PrismaClient, 'participant' | 'conversationShareLink'>,
  input: { readonly conversationId: string; readonly message: object; readonly attachments: unknown }
): Promise<ReaderSignedPlan | null> {
  const now = new Date();
  return planFor(prisma, {
    conversationId: input.conversationId,
    protection: protectionOfFullMessageRow(input.message),
    attachments: input.attachments,
    signer: readerFileUrlSignerFromEnv(now),
    now,
  });
}

const MESSAGE_PROTECTION_COLUMNS = {
  isViewOnce: true,
  isBlurred: true,
  effectFlags: true,
  ephemeralDuration: true,
  expiresAt: true,
} as const;

/**
 * La protection RELUE, fail-closed sur les DEUX façons de ne rien savoir.
 *
 * `null` (ligne introuvable) et un `throw` (lecture tombée) disent la même
 * chose à cette loi — « je n'ai aucune preuve » — et un `throw` en dit même
 * MOINS. Les deux rendent donc `{}`, dont les cinq colonnes sont `undefined` :
 * `contentExitLawOfSource` les lit comme une preuve manquante et ferme, la
 * pièce est signée. Rendre l'erreur à l'appelant lui ferait perdre le plan
 * ENTIER — et avec lui la seule remise que ses pairs EN LIGNE recevront jamais
 * (#16965).
 */
async function protectionRowFailClosed(
  prisma: Pick<PrismaClient, 'message'>,
  messageId: string,
): Promise<object> {
  try {
    return (await prisma.message.findUnique({ where: { id: messageId }, select: MESSAGE_PROTECTION_COLUMNS })) ?? {};
  } catch (error) {
    logger.warn('reader-signed plan: protection read failed — fail-closed, piece signed', { messageId, error });
    return {};
  }
}

/**
 * Le même plan quand l'émetteur ne tient pas la ligne entière (`message:edited`,
 * `message:attachment-updated`) : la protection est RELUE, cinq colonnes, et
 * seulement s'il y a une clé et une pièce à signer. Une ligne introuvable ne
 * prouve pas l'ordinaire — la loi ferme, la pièce est signée.
 *
 * ─── Les deux lectures ne s'arbitrent pas ensemble (#16965) ──────────────────
 *
 * Cette unité en fait DEUX, et une seule a une valeur de repli. Les enfermer
 * dans un seul `try` chez l'appelant — ce que faisait `broadcastMessageMutation`
 * — faisait disparaître `message:edited` pour tous les pairs EN LIGNE dès que
 * l'une ou l'autre tombait, les HORS LIGNE étant seuls servis par la file.
 *
 * - **La PROTECTION** (`message.findUnique`) est récupérable : son absence a
 *   déjà une valeur fail-closed déclarée (`{}`), et une lecture tombée y a
 *   droit au même titre qu'une ligne absente. Voir
 *   {@link protectionRowFailClosed} — la remise par lecteur a lieu, signée,
 *   sans qu'aucune audience ne s'élargisse.
 * - **Les DESTINATAIRES** (`participant.findMany` sous le prédicat
 *   d'admission, dans `readerSignedTargets`) n'en ont AUCUNE : sans eux on ne
 *   sait adresser personne, et `carriesReaderBoundAttachment` a déjà répondu
 *   que la pièce est liée au lecteur. Retomber sur la room servirait l'adresse
 *   nue d'une pièce établie comme protégée. L'erreur remonte donc, et
 *   l'appelant se tait en direct — la décision écrite de la jumelle
 *   `emitAttachmentUpdated`, et ici sa raison tient.
 */
export async function readerSignedPlanForMessageId(
  prisma: Pick<PrismaClient, 'participant' | 'conversationShareLink' | 'message'>,
  input: { readonly conversationId: string; readonly messageId: string; readonly attachments: unknown }
): Promise<ReaderSignedPlan | null> {
  const now = new Date();
  const signer = readerFileUrlSignerFromEnv(now);
  if (!signer || asAttachments(input.attachments).length === 0) return null;
  return planFor(prisma, {
    conversationId: input.conversationId,
    protection: await protectionRowFailClosed(prisma, input.messageId),
    attachments: input.attachments,
    signer,
    now,
  });
}

/**
 * Le verdict d'un plan dont la LECTURE peut tomber (#17026).
 *
 * Les deux unités ci-dessus laissent remonter l'échec de la lecture des
 * DESTINATAIRES, et c'est voulu : retomber sur la room servirait l'adresse nue
 * d'une pièce qu'on vient d'établir comme liée au lecteur (voir le doc-comment
 * de {@link readerSignedPlanForMessageId}). Mais « ne rien émettre en direct »
 * et « ne rien faire du tout » sont deux phrases différentes, et l'exception
 * les confondait chez tout appelant dont l'émission vivante précède, dans le
 * même `try`, un enfilage DURABLE.
 *
 * Trois valeurs, donc, parce qu'il y a trois choses à dire :
 *
 * | valeur | la phrase | l'appelant |
 * |---|---|---|
 * | un plan | « voici les destinataires » | remise par lecteur, signée |
 * | `null` | « la question ne se pose pas » | diffusion de room ordinaire |
 * | `'unavailable'` | « je ne sais pas adresser » | RIEN en direct — et la suite a lieu |
 *
 * `'unavailable'` n'est PAS `null` : collapser les deux rendrait la diffusion de
 * room sur une pièce protégée, c'est-à-dire exactement la fuite que le silence
 * évite. C'est la leçon `[]`-vs-`undefined` du cycle 116 portée au plan signé —
 * une ignorance qui ne peut pas se dire devient une affirmation.
 */
export type ReaderSignedPlanOutcome = ReaderSignedPlan | null | 'unavailable';

/**
 * {@link readerSignedPlan} dont l'échec ne peut pas emporter ce qui SUIT
 * l'émission vivante chez l'appelant (#17026).
 *
 * Les deux producteurs de `message:new` appelaient la version nue au milieu de
 * leurs arguments d'émission, dans le `try` dont le `catch` est en fin de
 * méthode : une lecture tombée y annulait l'enfilage hors ligne du message,
 * c'est-à-dire la SEULE voie par laquelle un destinataire absent l'apprend
 * jamais. Rien ne rejoue, et aucun client ne refetch spontanément.
 *
 * `onError` est REQUIS, et il l'était d'abord optionnel — ce qui est la forme
 * exacte du défaut que `editedAudience.ts` décrit pour son propre `onError` :
 * « l'appelant NOMME la panne chez lui ; sans cela, une remise définitivement
 * perdue ne laissait qu'un `warn` d'un module que la route ne regarde pas ».
 * Les deux appelants qui ne le passaient pas étaient ceux où la perte coûte le
 * plus cher. Un paramètre dont l'absence dégrade une garde ne doit pas être
 * optionnel (audit adversarial de #17026).
 */
export async function readerSignedPlanBestEffort(
  prisma: Pick<PrismaClient, 'participant' | 'conversationShareLink'>,
  input: { readonly conversationId: string; readonly message: object; readonly attachments: unknown },
  onError: (error: unknown) => void,
): Promise<ReaderSignedPlanOutcome> {
  try {
    return await readerSignedPlan(prisma, input);
  } catch (error) {
    logger.warn('reader-signed plan failed — no live per-reader delivery, durable paths unaffected', {
      conversationId: input.conversationId,
      error,
    });
    onError(error);
    return 'unavailable';
  }
}

/**
 * {@link readerSignedPlanForMessageId}, même arbitrage — la variante des
 * émetteurs qui ne tiennent pas la ligne entière (`message:attachment-updated`).
 * Elle vivait en copie privée dans `emitAttachmentUpdated`, seule à porter la
 * décision ; elle vit ici une fois, avec sa jumelle.
 */
export async function readerSignedPlanForMessageIdBestEffort(
  prisma: Pick<PrismaClient, 'participant' | 'conversationShareLink' | 'message'>,
  input: { readonly conversationId: string; readonly messageId: string; readonly attachments: unknown },
  onError: (error: unknown) => void,
): Promise<ReaderSignedPlanOutcome> {
  try {
    return await readerSignedPlanForMessageId(prisma, input);
  } catch (error) {
    logger.warn('reader-signed plan (by messageId) failed — no live per-reader delivery', {
      conversationId: input.conversationId,
      messageId: input.messageId,
      error,
    });
    onError(error);
    return 'unavailable';
  }
}
