/**
 * **UN MESSAGE `server`/`hybrid` SE MODIFIE, ET SE RESCELLE** (décision porteur
 * du 2026-11-01, `packages/shared/decisions/2026-11-01-le-mode-de-chiffrement-se-choisit-a-la-creation.md`,
 * directive #9224 : « sans E2EE, toutes les features serveur »).
 *
 * L'unique énoncé de l'écriture d'une édition au repos, pour les QUATRE
 * transports d'édition (socket `message:edit`, `PUT /conversations/:id/messages/:messageId`,
 * `PUT /messages/:messageId`, `PATCH /messages/:messageId`). Le texte modifié
 * se range exactement comme un message neuf (`MessageProcessor.getEncryptionContext`,
 * via `sealTextAtRest`) : `content: ''`, le chiffré AES-256-GCM et ses
 * métadonnées à côté, lié à sa conversation. Le clair modifié n'entre JAMAIS
 * dans `content`.
 *
 * Modèle de menace couvert : une copie de la base (sauvegarde fuitée, Mongo
 * exposé, disque volé) sans l'environnement de la passerelle ne livre ni le
 * texte d'origine ni le texte modifié. Non couvert, comme pour tout le mode
 * `server` : un serveur compromis, qui détient la clé maîtresse. Ce N'EST PAS
 * du bout en bout — l'édition `e2ee` reste refusée par `admitMessageEdit`.
 *
 * Fail-closed : sans clé maîtresse, `sealAtRest` lève
 * `ServerAtRestUnavailableError` AVANT toute écriture, et le transport refuse
 * l'édition avec son code stable — jamais de repli en clair.
 *
 * Le régime se lit sur la conversation OU sur la ligne : une ligne d'avant
 * l'activation, dans une conversation désormais au repos, voit son texte
 * modifié scellé ; une ligne scellée l'est encore si la projection de sa
 * conversation manque. Les deux sens ferment.
 */
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { getEncryptionService, type EncryptionService } from '../EncryptionService';
import { sealTextAtRest, type AtRestMode } from './atRestWrite';
import { reconcileEditedLinks, type EditedLinkParams, type ReconciledLinks } from './messageLinks';
import {
  isSealedAtRest,
  isServerAtRestMode,
  revealAtRest,
  revealAtRestRowsForWire,
  servedClearAtRest,
  type AtRestKeyring,
  type AtRestReadableRow,
} from './serverAtRest';

/** Ce que l'édition demande au coffre : sceller le texte neuf, ouvrir celui d'avant. */
export type AtRestEditCrypto = Pick<EncryptionService, 'sealAtRest'> & AtRestKeyring;

/** Le coffre de la passerelle, construit au premier besoin : une édition hors repos n'y touche jamais. */
export function gatewayEditCrypto(prisma: PrismaClient): AtRestEditCrypto {
  const service = () => getEncryptionService(prisma);
  return {
    sealAtRest: async (params) => (await service()).sealAtRest(params),
    openAtRest: async (envelope, conversationId) => (await service()).openAtRest(envelope, conversationId),
  };
}

/** Le régime que l'édition lit : celui de la ligne, et celui de sa conversation. */
export type EditedRowRegime = {
  readonly encryptionMode?: string | null;
  readonly conversation?: {
    readonly encryptionMode?: string | null;
    readonly serverEncryptionKeyId?: string | null;
  } | null;
};

export const editSealsAtRest = (row: EditedRowRegime): boolean =>
  isServerAtRestMode(row.conversation?.encryptionMode) || isServerAtRestMode(row.encryptionMode);

const atRestModeOfRow = (row: EditedRowRegime): string =>
  (isServerAtRestMode(row.conversation?.encryptionMode) ? row.conversation?.encryptionMode : row.encryptionMode) ?? 'server';

/** Les colonnes de TEXTE qu'une édition écrit, étalées dans la donnée de l'`update`. */
export type EditedTextColumns =
  | { readonly content: string }
  | {
      readonly content: '';
      readonly isEncrypted: boolean;
      readonly encryptionMode: AtRestMode;
      readonly encryptedContent: string | null;
      readonly encryptionMetadata: Prisma.InputJsonValue | null;
    };

export type PreparedEditedText = {
  readonly sealed: boolean;
  readonly columns: EditedTextColumns;
  /** Le texte d'AVANT, en clair et en mémoire seulement : les compteurs comptent un écart de mots, pas une chaîne vide. */
  readonly previousContent: string | null;
};

async function previousTextOf(row: AtRestReadableRow, keyring: AtRestKeyring): Promise<string | null> {
  if (!isSealedAtRest(row)) return row.content ?? null;
  const opened = await revealAtRest(row, keyring);
  return opened.isEncrypted === true ? '' : opened.content ?? '';
}

async function sealedColumns(params: {
  readonly crypto: AtRestEditCrypto;
  readonly row: EditedRowRegime & AtRestReadableRow & { readonly conversationId?: string | null };
  readonly conversationId: string;
  readonly text: string;
}): Promise<EditedTextColumns> {
  const sealed = await sealTextAtRest({
    sealer: params.crypto,
    mode: atRestModeOfRow(params.row),
    conversationId: params.conversationId,
    plaintext: params.text,
    preferredKeyId: params.row.conversation?.serverEncryptionKeyId ?? null,
  });
  if (!sealed) {
    const mode = atRestModeOfRow(params.row).toLowerCase() === 'hybrid' ? 'hybrid' : 'server';
    return { content: '', isEncrypted: false, encryptionMode: mode, encryptedContent: null, encryptionMetadata: null };
  }
  return {
    content: '',
    isEncrypted: true,
    encryptionMode: sealed.mode,
    encryptedContent: sealed.encryptedContent,
    encryptionMetadata: sealed.encryptionMetadata,
  };
}

/**
 * Ce que l'écriture de l'édition range, calculé AVANT elle : une clé absente
 * fait échouer ici, sans qu'aucune colonne n'ait été touchée.
 */
export async function prepareEditedText(params: {
  readonly crypto: AtRestEditCrypto;
  readonly row: EditedRowRegime & AtRestReadableRow & { readonly conversationId: string };
  readonly text: string;
}): Promise<PreparedEditedText> {
  const { crypto, row, text } = params;
  if (!editSealsAtRest(row)) return { sealed: false, columns: { content: text }, previousContent: row.content ?? null };
  const columns = await sealedColumns({ crypto, row, conversationId: row.conversationId, text });
  return { sealed: true, columns, previousContent: await previousTextOf(row, crypto) };
}

/**
 * Au repos, aucune adresse ne se range en clair à côté du chiffré — comme à la
 * création (`MessageProcessor.saveMessage`, #11381) : ni réécriture
 * `m+<token>`, ni carte `metadata.trackingLinks`. Le mapping est ÉTABLI vide,
 * ce qui retire celui qu'une ligne d'avant l'activation portait encore.
 */
export function editedLinksFor(sealsAtRest: boolean, params: EditedLinkParams): Promise<ReconciledLinks> {
  if (!sealsAtRest) return reconcileEditedLinks(params);
  return Promise.resolve({ processedContent: params.content, trackingLinks: [], reconciled: true });
}

type WithQuote = AtRestReadableRow & { readonly replyTo?: AtRestReadableRow | null };

/**
 * La ligne relue après l'écriture, telle qu'elle part (réponse HTTP et
 * `message:edited`) : le texte modifié en clair à la place du chiffré, la
 * citation ouverte, et ni chiffré ni métadonnées sur le fil — comme la lecture
 * sert un message neuf.
 */
export async function servedEditedRow<T extends WithQuote>(
  row: T,
  written: { readonly prepared: PreparedEditedText; readonly text: string },
  keyring: AtRestKeyring
) {
  const columns = written.prepared.columns;
  const opened = 'isEncrypted' in columns && columns.isEncrypted ? servedClearAtRest(row, written.text) : row;
  const [served] = await revealAtRestRowsForWire([opened], keyring);
  return served;
}
