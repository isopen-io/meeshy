import type { StatusMoodPost } from '@/lib/api/stories';
import { participantAvatarOf } from '@/lib/view/conversation';
import type { StoryTrayGroup } from '@/lib/view/story-tray';

/**
 * **LA CELLULE « SOI » DU RAIL DES STORIES** (#6150) — sa loi, PURE, hors de
 * tout rendu. Miroir de `LentilleRailSelfEntry` et de
 * `LentilleRailPolicy.shouldRender(selfEntry:entries:)`
 * (`apps/ios/.../Lentille/Chrome/StoriesVivantsRail.swift`).
 *
 * **Elle est SÉPARÉE des groupes d'auteurs, et ce n'est pas une commodité.**
 * Un `StoryTrayGroup` naît d'au moins UNE story (`groupStoriesByAuthor` ne
 * pousse un groupe qu'à partir d'une ligne) : un lecteur qui n'a rien publié
 * n'en a donc aucun, et sans cette entrée distincte les deux portes de la
 * directive porteur — créer une story, poser une humeur — n'existeraient que
 * pour qui a DÉJÀ publié. iOS écrit exactement cette règle : « faire
 * disparaître le seul chemin vers "mes stories" et "mon statut" parce que
 * personne d'autre n'a publié serait une régression, pas une épure ».
 *
 * **Elle ferme aussi l'écart que `withMoods` nommait** — « un auteur qui n'a
 * QU'un statut, sans story, n'a pas encore de pastille dans ce rail ». Pour le
 * lecteur lui-même, il en a une, et c'est celle qui ouvre son composeur.
 */
export type StoryRailSelfEntry = {
  readonly viewerId: string;
  /** L'anneau accentué — au moins une de MES stories est active. */
  readonly hasActiveStory: boolean;
  /** L'adresse de ma story (`/story/$post`), `undefined` tant que je n'ai rien
   * publié : la cellule n'est alors pas un lien, seulement le support de ses
   * deux pastilles. */
  readonly entryStoryId: string | undefined;
  /** Mon humeur COURANTE — `undefined` ⇒ la pastille rend 💭. */
  readonly moodEmoji: string | undefined;
  /**
   * **MA PHOTO** (#6975) — `undefined` ⇒ la pastille rend mes initiales.
   *
   * Ce type la JETAIT : il n'en portait aucun champ, donc la tuile ne pouvait
   * rendre qu'un dégradé d'initiales — alors que `Viewer.avatar`
   * (`lib/api/viewer.ts`) avait été ajouté POUR elle, son doc-comment le dit
   * (« la pastille "moi" du rail de stories est la PREMIÈRE surface à en avoir
   * besoin »), et que personne ne le lisait. Une loi qui calcule une valeur
   * que personne ne lit, dans l'autre sens : une valeur servie qu'aucun type
   * ne laisse passer.
   */
  readonly avatar: string | undefined;
};

/**
 * MON humeur courante dans le corpus des statuts.
 *
 * Même règle que `withMoods` (`story-tray.ts`) et pour la même raison : le
 * corpus est déjà trié `createdAt desc` par `PostFeedService.getStatuses`,
 * donc la PREMIÈRE ligne d'un auteur est la plus récente. Une chaîne vide ou
 * nulle n'est pas une humeur — elle retombe sur 💭, jamais sur une pastille
 * blanche.
 */
function currentMoodOf(moods: readonly StatusMoodPost[], viewerId: string): string | undefined {
  for (const post of moods) {
    const authorId = post.author?.id ?? post.authorId;
    if (authorId !== viewerId) continue;
    const emoji = post.moodEmoji;
    if (emoji === null || emoji === undefined || emoji === '') continue;
    return emoji;
  }
  return undefined;
}

export function selfRailEntry(options: {
  readonly viewerId: string | undefined;
  /**
   * MA PHOTO, TELLE QUE LA SESSION LA SERT (`Viewer.avatar`, #6975) — passée
   * plutôt que devinée : cette loi est PURE, elle ne lit aucun magasin.
   * Facultative, et la descente retombe alors sur l'auteur de MES stories,
   * parce que la raison d'être de cette cellule est précisément d'exister
   * quand je n'ai RIEN publié — auquel cas il n'y a aucun groupe à interroger.
   */
  readonly avatar?: string | undefined;
  readonly groups: readonly StoryTrayGroup[];
  readonly moods: readonly StatusMoodPost[];
}): StoryRailSelfEntry | undefined {
  const { viewerId } = options;
  if (viewerId === undefined || viewerId === '') return undefined;

  const mien = options.groups.find((g) => g.isMine);
  return {
    viewerId,
    hasActiveStory: mien !== undefined,
    entryStoryId: mien?.entryStoryId,
    moodEmoji: currentMoodOf(options.moods, viewerId),
    /* LA MÊME loi partagée que partout ailleurs (`participantAvatarOf` →
       `resolveParticipantAvatar`) : les deux rangs sont donnés dans l'ordre,
       et une chaîne BLANCHE ne masque pas le rang suivant. */
    avatar: participantAvatarOf({ avatar: options.avatar }) ?? participantAvatarOf(mien?.author),
  };
}

/**
 * Les AUTRES, pour le rail — mon groupe en est retiré parce que ma pastille
 * est peinte à part, avec ses deux portes. Sans ce retrait, un lecteur ayant
 * publié verrait deux fois son visage : la cellule « soi » et sa jumelle sans
 * portes, à un rang de là.
 */
export function railGroupsWithoutSelf(groups: readonly StoryTrayGroup[]): readonly StoryTrayGroup[] {
  return groups.some((g) => g.isMine) ? groups.filter((g) => !g.isMine) : groups;
}
