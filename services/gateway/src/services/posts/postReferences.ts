/**
 * La forme sous laquelle une référence quitte le serveur.
 *
 * Elle porte le PROFIL, pas seulement un pseudo : la rangée « Avec … » a besoin
 * du nom d'affichage et de l'avatar, et un champ plat de usernames obligerait à
 * les résoudre une seconde fois. Résolu au CHARGEMENT, donc toujours à jour —
 * une personne qui change de nom apparaît sous son nom actuel.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

import type { PostMentionDisplayValue } from './postMentions';
import { readDisplay } from './postMentions';
import { postMentionInclude } from './postIncludes';
import { convertStoryEffectsForWire } from './storyEffectsV3';

/**
 * La conversion v1→v3 à la lecture, DERRIÈRE `CANVAS_V3_READ` (défaut OFF).
 *
 * Entre le déploiement du lot A et celui du lot F, le web ne lit que les
 * familles legacy : servir v3 pendant cette fenêtre viderait les stories web.
 * Le drapeau rend le lockstep VRAI — le merge de A est inerte en lecture,
 * l'armement est un acte de déploiement.
 */
function withWireStoryEffects<T>(post: T): T {
  if (process.env.CANVAS_V3_READ !== '1') return post;
  const effects = (post as { storyEffects?: unknown }).storyEffects;
  if (effects == null) return post;
  return { ...post, storyEffects: convertStoryEffectsForWire(effects) };
}

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

/** La seule surface Prisma que la relecture touche. */
export type PostReferenceReaderPrisma = Pick<PrismaClient, 'postMention'>;

/**
 * Le jeu de références d'un post, RELU en base.
 *
 * Il n'y a pas d'autre façon d'en connaître l'état après une écriture : le
 * document que rend `createPost` a chargé sa relation AVANT que la résolution
 * n'écrive la moindre ligne, et celui que rend `updatePost` sort de sa propre
 * transaction, donc d'avant la réconciliation. Servir ces relations-là donnait
 * `mentions: []` à la création — par construction — et le jeu PRÉ-édition à
 * l'édition.
 *
 * Lit TOUT, silencieuses comprises : les deux consommateurs ne veulent pas la
 * même chose (la réponse va à l'auteur, qui voit ses silencieuses ; le
 * broadcast va à une audience, qui ne doit rien en savoir), et c'est
 * `projectReferencesForViewer` qui tranche, jamais la requête.
 *
 * `undefined` en échec, jamais `[]` : rien n'a pu être établi, et l'appelant
 * doit alors garder ce que la relation portait — un `[]` inventé serait lu
 * comme un verdict par les deux clients.
 */
export async function readPostReferences(params: {
  prisma: PostReferenceReaderPrisma;
  postId: string;
  onError?: (error: unknown) => void;
}): Promise<PostReference[] | undefined> {
  try {
    const rows = await params.prisma.postMention.findMany({
      where: { postId: params.postId },
      select: postMentionInclude.select,
    });
    return toPostReferences(rows);
  } catch (error) {
    params.onError?.(error);
    return undefined;
  }
}

/**
 * Pose le jeu RELU sur une charge utile, à la place de la relation qu'elle
 * porte. `undefined` = rien de relu : la charge garde sa relation, que
 * `withMentions` aplatira comme avant.
 */
export function graftReferences(
  post: Record<string, unknown>,
  references: readonly PostReference[] | undefined
): Record<string, unknown> {
  if (references === undefined) return post;
  const { postMentions, ...rest } = post;
  return { ...rest, mentions: [...references] };
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
  const flat = postMentions === undefined && Array.isArray(mentions)
    ? { ...rest, mentions: mentions as PostReference[] }
    : { ...rest, mentions: toPostReferences(postMentions as never) };
  return withNestedRepostMentions(withWireStoryEffects(flat));
}

/**
 * Le post ORIGINAL d'une republication porte ses propres références, et la
 * même conversion leur est due.
 *
 * Un repost CITE le texte de l'original : sans jeu validé en face, le client
 * retombe sur sa regex locale et linkifie n'importe quel `@handle` du texte
 * cité vers un profil inexistant — exactement le lien mort que la validation
 * serveur existe pour supprimer.
 *
 * Deux abstentions délibérées. Une relation ABSENTE (`trayStorySelect` ne
 * charge pas les références de l'original) reste absente : fabriquer
 * `mentions: []` y prononcerait un verdict que le serveur n'a jamais rendu, et
 * `[]` se lit comme un verdict chez les deux clients. Et la récursion s'arrête
 * au premier niveau, parce que `repostOfInclude` ne charge pas son propre
 * `repostOf` — il n'y a jamais de troisième étage.
 */
function withNestedRepostMentions<T>(post: T): T {
  const repostOf = (post as { repostOf?: unknown }).repostOf;
  if (!repostOf || typeof repostOf !== 'object') return post;

  // La conversion du blob précède le tri des mentions : le chemin « pas de
  // références chargées » sort TÔT et laisserait sinon un
  // `repostOf.storyEffects` v1 sur le fil.
  const nested = withWireStoryEffects(repostOf as { postMentions?: unknown; mentions?: unknown });
  if (nested.postMentions === undefined && nested.mentions === undefined) {
    return nested === repostOf ? post : { ...post, repostOf: nested };
  }

  return { ...post, repostOf: withMentions(nested) };
}
