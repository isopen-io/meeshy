import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { NOT_DELETED } from './postIncludes';

/**
 * Compteurs affichés sous une ligne du sélecteur de sons.
 *
 * `Sound.usageCount` compte des PISTES : une story qui pose le même son sur
 * trois diapositives écrit trois lignes `SoundUsage` (`@@unique([postId,
 * trackId])`). Ce compteur reste le critère de classement « Tendances », mais
 * il ne peut pas être affiché tel quel — annoncer « 3 utilisations » pour une
 * seule publication est faux, et le poser à côté d'un nombre de lectures
 * calculé sur cette unique publication rend la ligne incohérente avec
 * elle-même.
 *
 * Les deux compteurs rendus ici sortent donc du MÊME ensemble : les
 * publications qu'un lecteur peut réellement ouvrir depuis la page du son
 * (`GET /sounds/:id/posts`). Même prédicat, mêmes chiffres — l'utilisateur qui
 * doute peut ouvrir la page et recompter.
 *
 * Conséquence assumée : un son capturé uniquement depuis des publications
 * COMMUNITY affiche 0/0. C'est voulu. Compter ces vues publierait l'activité
 * d'une communauté auprès de qui n'en fait pas partie, et ferait promettre
 * « 12 lectures » à une page du son vide.
 */
export interface SoundStats {
  /** Publications DISTINCTES et visibles qui utilisent ce son. */
  postCount: number;
  /** Somme des `viewCount` de ces mêmes publications. */
  playCount: number;
}

export const EMPTY_SOUND_STATS: SoundStats = { postCount: 0, playCount: 0 };

/**
 * Seuil d'alerte, pas de plafond : rien n'est tronqué ici. Le balayage des
 * usages d'une page de sons n'est pas borné, et il ne le sera pas tant qu'on
 * n'aura pas vu le volume réel — un plafond poserait des compteurs arbitraires
 * sans que personne le sache. Ce log est là pour qu'on l'apprenne AVANT que ça
 * coûte, pas après.
 */
export const USAGE_SCAN_WARN_THRESHOLD = 5000;

/**
 * Repli pur : (lignes d'usage, vues des publications visibles) → compteurs.
 *
 * Séparé de l'IO pour que le dédoublonnage — le seul endroit où ce calcul peut
 * mentir — soit prouvable sans simuler Prisma.
 *
 * Un son sans aucune ligne d'usage est ABSENT de la Map retournée ; l'appelant
 * dégrade sur `EMPTY_SOUND_STATS`.
 */
export function foldSoundStats(
  usages: ReadonlyArray<{ soundId: string; postId: string }>,
  visiblePostViews: ReadonlyMap<string, number>,
): Map<string, SoundStats> {
  const postIdsBySound = new Map<string, Set<string>>();
  for (const usage of usages) {
    // Dédoublonnage OBLIGATOIRE. Sommer les lignes compterait une publication
    // — et la totalité de ses vues — autant de fois qu'elle porte de pistes sur
    // ce son.
    let set = postIdsBySound.get(usage.soundId);
    if (!set) {
      set = new Set<string>();
      postIdsBySound.set(usage.soundId, set);
    }
    set.add(usage.postId);
  }

  const stats = new Map<string, SoundStats>();
  for (const [soundId, postIds] of postIdsBySound) {
    let postCount = 0;
    let playCount = 0;
    for (const postId of postIds) {
      const views = visiblePostViews.get(postId);
      // Absente de la Map = supprimée, expirée ou non publique. Elle ne compte
      // dans AUCUN des deux compteurs : les deux doivent décrire le même
      // ensemble que la page du son.
      if (views === undefined) continue;
      postCount += 1;
      playCount += views;
    }
    stats.set(soundId, { postCount, playCount });
  }
  return stats;
}

/**
 * Charge les compteurs d'une PAGE de sons en deux requêtes, quelle que soit la
 * taille de la page — `soundId` et `id` sont indexés. Le faire son par son
 * ferait un N+1 sur chaque défilement du sélecteur.
 *
 * Ne lève jamais. Ces compteurs décorent une liste dont la charge utile est
 * ailleurs : les perdre doit coûter deux nombres, pas la liste entière. Avaler
 * est légitime ICI et ne l'était pas dans le chemin de libération des usages —
 * là-bas l'échec laissait une dérive qu'un recomptage ultérieur confirmait,
 * alors qu'ici tout est recalculé à chaque lecture et se répare de lui-même au
 * prochain appel.
 */
export async function loadSoundStats(
  prisma: PrismaClient,
  soundIds: ReadonlyArray<string>,
): Promise<Map<string, SoundStats>> {
  const unique = [...new Set(soundIds)].filter((id) => !!id);
  if (unique.length === 0) return new Map();

  try {
    const usages = await prisma.soundUsage.findMany({
      where: { soundId: { in: unique } },
      select: { soundId: true, postId: true },
    });
    if (usages.length === 0) return new Map();
    if (usages.length >= USAGE_SCAN_WARN_THRESHOLD) {
      enhancedLogger.warn(
        `[soundStats] balayage de ${usages.length} usages pour ${unique.length} sons — au-delà de ce volume, passer les compteurs en dénormalisé`,
      );
    }

    const postIds = [...new Set(usages.map((u) => u.postId))];
    const now = new Date();
    const posts = await prisma.post.findMany({
      where: {
        id: { in: postIds },
        visibility: 'PUBLIC',
        deletedAt: NOT_DELETED,
        // Une story expirée n'est plus lisible : la compter ferait survivre ses
        // vues à son expiration par cette porte.
        OR: [{ expiresAt: { isSet: false } }, { expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true, viewCount: true },
    });

    return foldSoundStats(usages, new Map(posts.map((p) => [p.id, p.viewCount ?? 0])));
  } catch (error) {
    enhancedLogger.error(
      `[soundStats] compteurs indisponibles, la liste part sans eux: ${error instanceof Error ? error.message : String(error)}`,
    );
    return new Map();
  }
}
