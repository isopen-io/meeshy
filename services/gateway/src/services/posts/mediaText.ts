import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { SecuritySanitizer } from '../../utils/sanitize.js';

/**
 * Le corps PARTAGÉ des deux appliqueurs de texte par média
 * (`PostService.applyMediaAlt` et `PostService.applyMediaCaption`).
 *
 * EXTRAIT plutôt que recopié : `alt` et `caption` portent exactement les mêmes
 * deux gardes, la même normalisation du vide et la même borne. Deux copies
 * auraient divergé au premier ajustement de l'une — et c'est le genre de
 * divergence qu'aucun témoin ne voit, puisque chaque copie reste cohérente
 * avec elle-même.
 *
 * La colonne est un paramètre LITTÉRAL, pas une chaîne : le compilateur refuse
 * tout nom qui n'est pas l'un des deux, si bien qu'aucun appelant ne peut
 * écrire dans une colonne voisine par faute de frappe.
 *
 * ## Pourquoi un MODULE et plus une méthode privée
 *
 * Elle n'a jamais touché `this` : son client Prisma est un paramètre (c'est ce
 * qui lui permet d'être appelée sous transaction), et son seul collaborateur
 * est le sanitiseur. Une fonction qui ne lit rien de son instance n'est pas une
 * méthode — c'est une fonction libre logée dans une classe, et elle pesait sur
 * un fichier hors budget (`gateway-file-size-budget`, règle 3) sans que sa
 * place là y soit pour rien.
 *
 * **L'ASSAINISSEMENT VIT ICI, et pas à la route comme `content`.**
 *
 * `content` est assaini dans `routes/posts/core.ts` (trois sites), à la
 * frontière de confiance. `alt` et `caption` ne l'étaient à AUCUN : le texte
 * partait brut de `parsed.data` jusqu'à `updateMany`. Une garde existait
 * pourtant — `sanitizeMediaCaptions`, dans ce même `core.ts`, doc-comment
 * citant #4055 — et aucune ligne du dépôt ne l'appelait.
 *
 * > Une garde écrite puis jamais câblée ne se signale nulle part. Elle
 * > compile, elle se relit bien, et elle donne à qui la croise l'impression
 * > que le champ est gardé.
 *
 * Elle est posée au point de passage OBLIGÉ avant la base plutôt qu'à la
 * route, pour une raison que le défaut vient d'illustrer : deux routes
 * écrivent ces colonnes (`createPost`, `updatePost`), et la troisième qu'on
 * ajoutera repartirait sans garde. Ici, il n'y a rien à oublier.
 */
export async function applyMediaText(
  column: 'alt' | 'caption',
  postId: string,
  requestedMediaIds: string[] | undefined,
  texts: Record<string, string> | undefined,
  client: Pick<PrismaClient, 'postMedia'>,
): Promise<void> {
  if (!texts || !requestedMediaIds?.length) return;
  const requested = new Set(requestedMediaIds);
  const entries = Object.entries(texts).filter(([id]) => requested.has(id));
  if (entries.length === 0) return;
  await Promise.all(entries.map(([id, text]) => {
    const propre = SecuritySanitizer.sanitizeText(text);
    return client.postMedia.updateMany({
      where: { id, postId },
      // Un texte qui n'est QUE du balisage devient vide, donc `null` — la
      // même phrase qu'une chaîne blanche : « il n'y a pas de légende ».
      // Écrire `''` la rendrait présente et vide.
      data: { [column]: propre.trim().length > 0 ? propre : null },
    });
  }));
}
