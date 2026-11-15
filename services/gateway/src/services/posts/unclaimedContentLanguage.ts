import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { measureContentLanguage } from '../../utils/content-language';
import { RECIPIENT_LANG_SELECT, recipientLanguages } from '../../utils/recipient-language';

/**
 * La langue d'origine d'un contenu dont l'auteur n'a rien revendiqué (#9861).
 *
 * Dans l'ordre de ce qui est le plus sûr : la mesure faite par le client sur
 * le texte tapé, puis ce que le texte PROUVE (écriture ou mots connus), puis
 * la langue déclarée de l'auteur (rang 1 de son prisme). Jamais un « en »
 * inventé sur un texte court sans un mot connu : « Story recette B 9743 r2 »
 * devenait de l'anglais, et le français, sa propre cible de traduction.
 */
export async function unclaimedContentLanguage(
  prisma: PrismaClient,
  params: { readonly content: string; readonly detectedLanguage?: string | undefined; readonly authorId: string },
): Promise<string> {
  const proven = params.detectedLanguage ?? measureContentLanguage(params.content);
  if (proven) return proven;
  const author = await prisma.user.findUnique({
    where: { id: params.authorId },
    select: RECIPIENT_LANG_SELECT,
  });
  return recipientLanguages(author)[0] ?? 'en';
}
