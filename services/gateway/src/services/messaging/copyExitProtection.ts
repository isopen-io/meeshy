import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import {
  contentExitLawOfSource,
  forwardedCopyProtection,
  type ContentExitProjection,
} from '@meeshy/shared/utils/content-exit-law';
import type { ForwardImposition } from './forwardAdmission';

/**
 * Ce qu'une COPIE porte de la protection de sa source (#9572) — critère de
 * fin : aucune requête ne produit une copie moins protégée que sa source.
 *
 * Deux gestes créent une ligne `Message` depuis une autre :
 *
 * - le TRANSFERT (`forwardedFromId`) — `admitMessageForward` a déjà lu la
 *   source et rend ce qu'elle impose ; la règle est `forwardedCopyProtection`
 *   (`@meeshy/shared`) : `min(durée demandée, durée source)`, durée ET après
 *   lecture, flou de la source ;
 * - la DIFFUSION (`copyAttachmentsFromMessageId`) — l'auteur renvoie SES
 *   pièces à d'autres destinataires. La copie hérite AU MOINS de la nature de
 *   sa source, sans gagner le bit après lecture : ce n'est pas un transfert,
 *   c'est le même envoi, ailleurs. Elle n'est pas refusée — iOS rejoue sur les
 *   cibles 2..N la protection armée à l'envoi (#8303), et refuser casserait la
 *   diffusion d'une vue unique ou d'une flamme par son propre auteur.
 *
 * Appliqué par `saveMessage` APRÈS la contagion des réponses
 * (`declaredReplyProtection`) : citer une flamme plus longue, ou une
 * flamme-œil sans durée, ne desserre pas ce que la source impose.
 *
 * Les deux gestes se COMPOSENT quand une requête porte les deux champs —
 * diffusion d'abord, imposition du transfert ensuite, toujours : ajouter
 * `copyAttachmentsFromMessageId` à un transfert n'en retire rien.
 *
 * La tolérance de la diffusion ne vaut que pour un message d'ORIGINE. Une
 * source elle-même issue d'un transfert (`forwardedFromId` non nul) et
 * protégée est REFUSÉE : son expéditeur est celui qui a transféré, et la
 * « diffuser » reviendrait à la retransférer, sans marque de provenance. Le
 * refus tombe dès le premier cran — la diffusion n'écrit aucune marque, donc
 * la provenance ne survivrait pas au suivant.
 *
 * FERMÉ : un `forwardedFromId` sans verdict d'admission (`forwardImposes`
 * absent) et une source de diffusion introuvable LÈVENT avant toute écriture.
 */

const { EPHEMERAL, BLURRED, VIEW_ONCE, EPHEMERAL_AFTER_READ } = MESSAGE_EFFECT_FLAGS;

export interface CopyDeclaredProtection {
  readonly effectFlags?: number;
  readonly isBlurred?: boolean;
  readonly isViewOnce?: boolean;
  readonly ephemeralDuration?: number;
  readonly expiresAt?: Date;
}

export interface ExitProtectedFields {
  /** La durée BORNE une copie qui porte aussi le bit après lecture — lu par `ephemeralSendFields`. */
  readonly durationBoundsAfterRead?: boolean;
}

export interface CopyRequest extends CopyDeclaredProtection {
  readonly forwardedFromId?: string;
  /**
   * Le verdict d'`admitMessageForward`, posé par `MessagingService.handleMessage`
   * et jamais par un client : `null` = source lue, rien d'imposé.
   */
  readonly forwardImposes?: ForwardImposition | null;
  readonly copyAttachmentsFromMessageId?: string;
}

export interface DiffusionSourceRow extends ContentExitProjection {
  /** Non nul ⇒ la source est elle-même une copie transférée. */
  readonly forwardedFromId: string | null;
}

export interface CopySourceReader {
  message: {
    findUnique(args: {
      where: { id: string };
      select: {
        isViewOnce: true;
        isBlurred: true;
        effectFlags: true;
        ephemeralDuration: true;
        expiresAt: true;
        forwardedFromId: true;
        attachments: { select: { isViewOnce: true; isBlurred: true; effectFlags: true } };
      };
    }): Promise<DiffusionSourceRow | null>;
  };
}

const validSeconds = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && Math.floor(value) > 0 ? Math.floor(value) : null;

export function forwardedCopyFields<T extends CopyDeclaredProtection>(
  declared: T,
  imposes: ForwardImposition | null,
): T & ExitProtectedFields {
  if (imposes === null) return declared;

  const copy = forwardedCopyProtection({ source: imposes, requested: declared });
  if (!copy) throw new Error('forward:source-not-forwardable');

  if (imposes.ephemeralDuration === null) {
    return { ...declared, effectFlags: copy.effectFlags, isBlurred: copy.isBlurred };
  }

  return {
    ...declared,
    effectFlags: copy.effectFlags,
    isBlurred: copy.isBlurred,
    ephemeralDuration: copy.ephemeralDuration ?? imposes.ephemeralDuration,
    expiresAt: undefined,
    durationBoundsAfterRead: true,
  };
}

export function diffusedCopyFields<T extends CopyDeclaredProtection>(
  declared: T,
  source: ContentExitProjection,
): T & ExitProtectedFields {
  const { nature, forward } = contentExitLawOfSource(source);
  const sourceBlurred = [source, ...(Array.isArray(source.attachments) ? source.attachments : [])].some(
    (carrier) => carrier?.isBlurred === true || ((carrier?.effectFlags ?? 0) & BLURRED) !== 0,
  );
  if (nature === 'ordinary' && !sourceBlurred) return declared;

  const isBlurred = declared.isBlurred === true || sourceBlurred;
  const blurred = { isBlurred, effectFlags: (declared.effectFlags ?? 0) | (isBlurred ? BLURRED : 0) };

  if (nature === 'view-once') {
    return { ...declared, ...blurred, isViewOnce: true, effectFlags: blurred.effectFlags | VIEW_ONCE };
  }
  if (forward.allowed === true && forward.maxDurationSeconds === null) return { ...declared, ...blurred };

  const afterRead = forward.allowed === false ? EPHEMERAL_AFTER_READ : 0;
  const bound = forward.allowed === true ? forward.maxDurationSeconds : validSeconds(source.ephemeralDuration);
  const flamed = { ...declared, ...blurred, effectFlags: blurred.effectFlags | EPHEMERAL | afterRead };
  if (bound === null) return flamed;

  return {
    ...flamed,
    ephemeralDuration: Math.min(validSeconds(declared.ephemeralDuration) ?? bound, bound),
    expiresAt: undefined,
    durationBoundsAfterRead: true,
  };
}

/**
 * Le point d'entrée de `saveMessage`. Un envoi ordinaire ne paie aucune
 * lecture. Une lecture de source de diffusion qui échoue REMONTE : rien n'est
 * encore écrit, et une copie dont on ignore la source ne naît pas en clair.
 */
export async function exitProtectedCopy<T extends CopyRequest>(
  prisma: CopySourceReader,
  declared: T,
): Promise<T & ExitProtectedFields> {
  const diffused = declared.copyAttachmentsFromMessageId
    ? diffusedCopyFields(declared, await diffusionSource(prisma, declared.copyAttachmentsFromMessageId))
    : declared;

  if (!declared.forwardedFromId) return diffused;
  if (declared.forwardImposes === undefined) throw new Error('forward:not-admitted');

  return forwardedCopyFields(diffused, declared.forwardImposes);
}

async function diffusionSource(prisma: CopySourceReader, id: string): Promise<DiffusionSourceRow> {
  const source = await prisma.message.findUnique({
    where: { id },
    select: {
      isViewOnce: true,
      isBlurred: true,
      effectFlags: true,
      ephemeralDuration: true,
      expiresAt: true,
      forwardedFromId: true,
      attachments: { select: { isViewOnce: true, isBlurred: true, effectFlags: true } },
    },
  });
  if (!source) throw new Error('copy-attachments:source-unavailable');
  if (source.forwardedFromId !== null && contentExitLawOfSource(source).nature !== 'ordinary') {
    throw new Error('copy-attachments:forwarded-protected-source');
  }
  return source;
}
