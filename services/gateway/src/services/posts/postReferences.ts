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
 * Ce qu'un lecteur donné a le droit de savoir des références d'un post.
 *
 * Trois réponses, et la distinction n'est pas cosmétique : l'AUTEUR doit voir
 * ses silencieuses pour pouvoir en retirer une, la personne CONCERNÉE doit voir
 * la sienne — sans quoi la notification qu'elle vient de recevoir n'a aucune
 * réponse dans le contenu — et un tiers ne doit rien en savoir, sinon le mode
 * silencieux ne veut plus rien dire.
 *
 * Réservé aux lectures UNITAIRES. Un feed sert la même charge utile à tout le
 * monde et filtre au niveau du `select` (`postMentionInclude`) : y projeter
 * ferait dépendre d'un lecteur une réponse mise en cache sous une clé partagée.
 */
export function projectReferencesForViewer(params: {
  references: readonly PostReference[];
  authorId: string;
  viewerId: string | undefined;
}): PostReference[] {
  const { references, authorId, viewerId } = params;
  if (viewerId && viewerId === authorId) return [...references];

  return references.filter(
    (reference) => reference.display !== 'SILENT' || reference.userId === viewerId
  );
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
 *
 * IDEMPOTENTE. `POST /posts` sert le même remappage sur deux formes : le post
 * fraîchement créé, qui porte encore la relation, et — au rejeu d'idempotence —
 * celui que `getPostById` a déjà aplati ET PROJETÉ pour son lecteur. Repasser
 * la conversion sur une relation absente rendrait une liste vide, effaçant des
 * références que l'auteur a le droit de voir.
 */
export function withMentions<T extends { postMentions?: unknown; mentions?: unknown }>(
  post: T
): Omit<T, 'postMentions' | 'mentions'> & { mentions: PostReference[] } {
  const { postMentions, mentions, ...rest } = post;
  if (postMentions === undefined && Array.isArray(mentions)) {
    return { ...rest, mentions: mentions as PostReference[] };
  }
  return { ...rest, mentions: toPostReferences(postMentions as never) };
}
