/**
 * L'extrait d'un POST servi à un destinataire NOMMÉ — le site UNIQUE des six
 * bâtisseurs d'engagement social (#8731).
 *
 * Réaction, commentaire, partage, réponse, like et réaction de commentaire
 * posaient tous les 80 premiers caractères de `post.content` : la langue de l'AUTEUR, pour un
 * lecteur dont le Prisme est ailleurs. Un extrait est un CONTENU, pas un
 * cadrage : il se résout dans la liste ORDONNÉE du lecteur
 * (`resolveRecipientPrism().ordered`), par la descente partagée
 * `resolvePrismTranslation`, jamais par la langue de cadrage.
 *
 * Le bâtisseur RELIT le post plutôt que de recevoir un extrait de ses
 * appelants : sept appelants recopiaient chacun un `select` et un `slice`, et
 * une projection trop étroite rend la descente impossible en aval sans
 * qu'aucun témoin ne rougisse. Relire ici tient ENSEMBLE ce qu'il faut lire et
 * ce qu'on en fait — y compris la VIE du post, que l'extrait d'un appelant ne
 * disait pas.
 *
 * Fail-CLOSED, comme `canNotifyAboutPost` : un post supprimé, expiré,
 * introuvable ou illisible ne pousse AUCUN texte. La notification part quand
 * même (elle nomme le contenu par son type ou son média) ; un extrait poussé,
 * lui, ne se rappelle pas.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  buildPostTranslationRecord,
  resolvePrismTranslation,
} from '@meeshy/shared/utils/conversation-helpers';
import { sliceCodePoints } from '@meeshy/shared/utils/text-truncate';

/** La borne historique des appelants — un extrait IDENTIFIE, il ne raconte pas. */
export const POST_EXCERPT_MAX_CODE_POINTS = 80;

const POST_EXCERPT_SELECT = {
  content: true,
  originalLanguage: true,
  translations: true,
  deletedAt: true,
  expiresAt: true,
} as const;

export type PostExcerptSource = {
  readonly content: string | null;
  readonly originalLanguage: string | null;
  readonly translations: unknown;
  readonly deletedAt: Date | null;
  readonly expiresAt: Date | null;
};

function isWithheld(source: PostExcerptSource, now: Date): boolean {
  if (source.deletedAt) return true;
  return source.expiresAt !== null && source.expiresAt.getTime() <= now.getTime();
}

/**
 * La descente PURE : le texte que le lecteur doit voir, ou `undefined` quand
 * rien ne doit partir. Traduction du premier rang servi, sinon l'original.
 */
export function servePostExcerpt(params: {
  readonly source: PostExcerptSource | null;
  readonly preferredLanguages: readonly string[];
  readonly now: Date;
}): string | undefined {
  const { source } = params;
  if (!source || isWithheld(source, params.now)) return undefined;

  const original = source.content?.trim() ?? '';
  if (original === '') return undefined;

  const translation = resolvePrismTranslation({
    translations: buildPostTranslationRecord(source.translations),
    originalLanguage: source.originalLanguage,
    preferredLanguages: params.preferredLanguages,
  });
  const served = (translation?.text ?? original).trim();
  return served === '' ? undefined : sliceCodePoints(served, POST_EXCERPT_MAX_CODE_POINTS);
}

/** Relit le post puis descend le Prisme du lecteur — fail-closed sur la panne. */
export async function loadServedPostExcerpt(
  prisma: PrismaClient,
  params: { readonly postId: string; readonly preferredLanguages: readonly string[]; readonly now?: Date }
): Promise<string | undefined> {
  try {
    const source = await prisma.post.findUnique({
      where: { id: params.postId },
      select: POST_EXCERPT_SELECT,
    });
    return servePostExcerpt({
      source,
      preferredLanguages: params.preferredLanguages,
      now: params.now ?? new Date(),
    });
  } catch {
    return undefined;
  }
}
