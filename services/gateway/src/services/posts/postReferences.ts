/**
 * La forme sous laquelle une référence quitte le serveur.
 *
 * Elle porte le PROFIL, pas seulement un pseudo : la rangée « Avec … » a besoin
 * du nom d'affichage et de l'avatar, et un champ plat de usernames obligerait à
 * les résoudre une seconde fois. Résolu au CHARGEMENT, donc toujours à jour —
 * une personne qui change de nom apparaît sous son nom actuel.
 */

import type { PostMentionDisplayValue } from './postMentions';
import { readDisplay } from './postMentions';

export interface PostReference {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
  readonly display: PostMentionDisplayValue;
}

type PostMentionRow = {
  readonly display?: PostMentionDisplayValue | null;
  readonly mentionedUser?: {
    readonly id: string;
    readonly username: string;
    readonly displayName: string | null;
    readonly avatar: string | null;
  } | null;
};

export function toPostReferences(rows: readonly PostMentionRow[] | undefined): PostReference[] {
  if (!rows) return [];

  return rows.flatMap((row) => {
    const user = row.mentionedUser;
    if (!user) return [];
    return [{
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      display: readDisplay(row.display),
    }];
  });
}

/**
 * Le post tel qu'il quitte le serveur : `postMentions` (nom de la RELATION,
 * imposé par le schéma) devient `mentions` (nom EXPOSÉ, aligné sur ce que les
 * commentaires et les messages portent déjà), et les lignes brutes deviennent
 * des `PostReference` aplaties.
 *
 * Une seule fonction pour tous les chemins de liste : le feed, les stories, les
 * réels, les statuts et les posts d'un profil rendent tous des items bruts, et
 * cinq remappages copiés divergeraient au premier champ ajouté.
 */
export function withMentions<T extends { postMentions?: unknown }>(
  post: T
): Omit<T, 'postMentions'> & { mentions: PostReference[] } {
  const { postMentions, ...rest } = post;
  return { ...rest, mentions: toPostReferences(postMentions as never) };
}
