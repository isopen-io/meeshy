/**
 * Les deux portes de fichier qu'ouvre l'adresse signée par lecteur (#9600).
 *
 * 1. {@link resolveSignedFileAccess} — l'adresse SIGNÉE : la signature, puis la
 *    vie globale du fichier (`resolveFileRouteVerdict`), puis celle de CE
 *    lecteur (`resolveSignedReaderVerdict`, la loi des routes par identifiant,
 *    #9589). Tout refus est le même : la route rend la réponse d'un fichier
 *    absent, sans dire laquelle des trois a fermé.
 *
 * 2. {@link admitUnsignedFile} — l'adresse NUE d'un fichier dont tous les
 *    porteurs vivants disparaissent (`readerBound`). Pendant la transition elle
 *    répond encore — les charges déjà livrées (messages en cache, temps réel
 *    pas encore signé) la portent — et chaque usage laisse UNE ligne de
 *    journal, {@link UNSIGNED_READER_BOUND_FILE_EVENT}, sans identité : la
 *    route montée, une plateforme et une version normalisées comme celles du
 *    compteur d'accès (#4275). Jamais la clé de stockage (elle porte le
 *    `User.id` de l'auteur), jamais l'adresse, jamais l'IP. Quand ce journal
 *    tombe à zéro, `ATTACHMENT_URL_SIGNATURE_ENFORCE=true` la fait refuser.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { enhancedLogger } from '../../utils/logger-enhanced';
import { normaliserPlateforme, normaliserVersion } from '../route-usage.service';
import { resolveSignedReaderVerdict } from './attachmentReadVerdict';
import { resolveFileRouteVerdict, type FileRouteVerdict } from './fileRouteVerdict';
import { checkReaderFileToken, type SigningKeys } from './readerFileSignature';
import { isSignableStorageKey } from './signedAttachmentUrls';

const log = enhancedLogger.child({ module: 'AttachmentReaderFileGate' });

/** Le nom STABLE de la ligne de journal que la transition compte. */
export const UNSIGNED_READER_BOUND_FILE_EVENT = 'attachment-file:unsigned-reader-bound';

export type SignedFilePrisma = Pick<PrismaClient, 'message' | 'participant' | 'messageStatusEntry' | 'messageAttachment'>;

export type SignedFileAccess =
  | { readonly kind: 'serve'; readonly cacheControl: string }
  | { readonly kind: 'refuse'; readonly reason: string };

export async function resolveSignedFileAccess(
  prisma: SignedFilePrisma,
  input: { readonly token: string; readonly storageKey: string; readonly keys: SigningKeys; readonly now: Date }
): Promise<SignedFileAccess> {
  const check = checkReaderFileToken(input);
  if (check.kind === 'invalid') return { kind: 'refuse', reason: `signature:${check.reason}` };

  const verdict = await resolveFileRouteVerdict(input.storageKey, prisma, input.now);
  if (verdict.kind !== 'serve') return { kind: 'refuse', reason: `file:${verdict.kind}` };

  const reader = await resolveSignedReaderVerdict(prisma, {
    attachmentId: check.attachmentId,
    readerParticipantId: check.readerParticipantId,
    now: input.now,
  });
  return reader === 'allow' ? { kind: 'serve', cacheControl: verdict.cacheControl } : { kind: 'refuse', reason: `reader:${reader}` };
}

export type UnsignedRequestFacts = {
  readonly route: string | undefined;
  readonly platformHeader: string | undefined;
  readonly versionHeader: string | undefined;
  readonly userAgent: string | undefined;
};

/**
 * `legacy` : une clé que `signedAttachmentUrls` ne signe jamais (hors de
 * l'arborescence datée `STORAGE_KEY_SHAPE` et des pistes `translated/`). Son
 * lecteur n'a aucune adresse signée vers laquelle migrer : la mesure la compte
 * à part (audit #9600, L1-C), sans quoi elle ne pourrait jamais tomber à zéro.
 */
export function signableStorageKeyShape(storageKey: string): 'signable' | 'legacy' {
  return isSignableStorageKey(storageKey) ? 'signable' : 'legacy';
}

export function admitUnsignedFile(input: {
  readonly verdict: FileRouteVerdict;
  readonly request: UnsignedRequestFacts;
  readonly enforced: boolean;
  readonly storageKey: string;
}): 'serve' | 'refuse' {
  if (input.verdict.kind !== 'serve' || !input.verdict.readerBound) return 'serve';
  log.info(UNSIGNED_READER_BOUND_FILE_EVENT, {
    route: input.request.route ?? 'unknown',
    keyShape: signableStorageKeyShape(input.storageKey),
    platform: normaliserPlateforme(input.request.platformHeader, input.request.userAgent),
    version: normaliserVersion(input.request.versionHeader),
    enforced: input.enforced,
  });
  return input.enforced ? 'refuse' : 'serve';
}
