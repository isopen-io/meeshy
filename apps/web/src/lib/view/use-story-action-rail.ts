import { useEffect, useMemo, useState } from 'react';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { storyReactionAction } from '@/lib/api/query';
import { storyReactionAnnouncement } from '@/lib/api/story-reactions';
import {
  freezeStoryActionRail,
  reconcileStoryActionRailComments,
  type FrozenStoryActionRail,
} from '@/lib/stories/action-rail';
import type { StoryPlaybackStory } from '@/lib/stories/playback';
import type { StoryActionRailHandlers } from '@/components/story-action-rail';

/**
 * **LE RAIL D'ACTIONS DU LECTEUR, CÔTÉ HÔTE** (§ 5.0 de la spécification
 * #7114) — EXTRAIT de `routes/story.tsx` : le GEL (`frozen` et ses DEUX
 * effets, `lib/stories/action-rail.ts`) et les GESTIONNAIRES (`handlers`,
 * `shown`). EXTRACTION PURE pour tout ce qui existait déjà ; l'entrée
 * `translations` est POSÉE ICI, jamais dans `routes/story.tsx` (§ 5.0.2).
 *
 * « Répondre » n'est PAS un gestionnaire du rail : c'est la capsule de la
 * barre basse (`StoryBottomBar.onReply`, #8879) — l'hôte lit `frozen.plan.showsReply`
 * pour la poser. « Envoyer » (`forwardHandlers`, #8884) et le plan AUTEUR
 * (`ownerHandlers`, #7116) viennent de leurs propres hôtes.
 */
export type StoryActionRailHost = {
  readonly frozen: FrozenStoryActionRail | null;
  readonly handlers: StoryActionRailHandlers;
  readonly shown: boolean;
};

export function useStoryActionRail(params: {
  readonly story: StoryPlaybackStory | undefined;
  readonly isOwnStory: boolean;
  /** Un visiteur sans compte (#9149) ne voit aucun rail : les gestes exigent une session. */
  readonly visitor: boolean;
  readonly showsSound: boolean;
  readonly toggleSound: () => void;
  readonly announce: (text: string) => void;
  readonly language: InterfaceLanguage;
  readonly openComments: () => void;
  readonly ownerHandlers: StoryActionRailHandlers;
  readonly forwardHandlers: Pick<StoryActionRailHandlers, 'forward'>;
  /** La disponibilité du Prisme (#7114) — `available` gouverne l'entrée dans
   * le GEL comme dans les GESTIONNAIRES (garde 1 = garde 2 en tranche 1, mais
   * la seconde reste structurelle pour la tranche 2 hors ligne, § 5.5.3). */
  readonly translations: { readonly available: boolean; readonly onOpen: () => void };
}): StoryActionRailHost {
  const { story, isOwnStory, visitor, showsSound, toggleSound, announce, language, openComments, ownerHandlers, forwardHandlers, translations } =
    params;

  /**
   * **LE PLAN DU RAIL, FIGÉ À L'ENTRÉE DE LA DIAPOSITIVE** (directive porteur
   * 2026-07-10, `StoryActionRailPlan`) — la loi vit dans
   * `lib/stories/action-rail.ts` ; ici on ne fait que l'appeler au bon
   * moment. Le gel porte l'identité de la story, comme `mediaDuration` et
   * `soundAvailability` : une remise à zéro « à chaque story » serait la
   * même course entre les effets du parent et ceux de l'enfant.
   */
  const [frozen, setFrozen] = useState<FrozenStoryActionRail | null>(null);

  /* LE GEL — re-résolu au CHANGEMENT de story, et la seule remontée que le
     lecteur apprend ensuite est le SON (le sondage de piste audio conclut
     souvent après l'entrée). Le compteur de commentaires, lui, est déjà dans
     le corpus : sa RÉCONCILIATION est un second chemin, appliqué ci-dessous
     quand le corpus se rafraîchit sous le lecteur. */
  useEffect(() => {
    if (story === undefined) return;
    setFrozen((current) =>
      freezeStoryActionRail(current, {
        storyId: story.id,
        isOwnStory,
        /* `canReply` — la capacité que l'hôte OFFRE, miroir de
           `onReplyToStory != nil` : le web répond par le fil de commentaires
           de la publication, donc il peut toujours. */
        canReply: true,
        hasAudibleSound: showsSound,
        commentCount: story.commentCount ?? 0,
        hasTranslatableContent: translations.available,
      }),
    );
  }, [story, isOwnStory, showsSound, translations.available]);

  useEffect(() => {
    if (story === undefined) return;
    const count = story.commentCount ?? 0;
    if (count <= 0) return;
    setFrozen((current) =>
      current === null ? current : reconcileStoryActionRailComments(current, { storyId: story.id, commentCount: count }),
    );
  }, [story]);

  const handlers = useMemo<StoryActionRailHandlers>(() => {
    if (story === undefined) return {};
    const storyId = story.id;
    return {
      ...(showsSound ? { sound: toggleSound } : {}),
      react: () => {
        void storyReactionAction(storyId).then((result) => {
          const key = storyReactionAnnouncement(result);
          if (key !== null) announce(translate(language, key));
        });
      },
      /* « Répondre » (la capsule de la barre basse) et « Commentaires »
         ouvrent la MÊME feuille : une seule zone de saisie, et la réponse
         n'est donc jamais un second composeur (spécification porteur
         2026-05-28). Le rail ne porte plus de bouton « Répondre » (#8879). */
      comments: openComments,
      /* Le plan AUTEUR (`showsViews`/`showsExport`) filtre déjà ces trois sur
         MA story SEULE — les remettre ici ne fait apparaître aucun bouton sur
         la story d'autrui ; `share`/`save` n'y sont que si la story porte un
         média exportable (`useStoryOwnerRail`, loi 4). */
      ...ownerHandlers,
      /* « Envoyer » (`showsForward`, toute story) : la loi le déclarait sans
         qu'aucun hôte ne remette de gestionnaire (#8884). */
      ...forwardHandlers,
      /* Garde 2 (§ loi 4) : un bouton n'existe que si la loi le dit ET
         qu'un gestionnaire l'atteint — ici structurellement la MÊME
         condition que le gel (`translations.available`), mais la tranche 2
         (hors ligne, `canRequestTranslation`) les dissociera. */
      ...(translations.available ? { translations: translations.onOpen } : {}),
    };
  }, [story, showsSound, toggleSound, announce, language, openComments, ownerHandlers, forwardHandlers, translations.available, translations.onOpen]);

  /* LE RAIL EST-IL PEINT ? Une seule réponse, lue par le rail ET par la
     légende qui doit lui laisser la place. */
  const shown = !visitor && story !== undefined && frozen !== null && frozen.storyId === story.id && Object.keys(handlers).length > 0;

  return { frozen, handlers, shown };
}
