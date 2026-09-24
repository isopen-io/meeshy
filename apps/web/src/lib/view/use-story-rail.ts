import { useMemo } from 'react';
import { useStore } from 'zustand/react';

import type { StoryRailProps } from '@/components/story-rail';
import { useStatusMoods, useStoryTray } from '@/lib/api/query';
import type { StatusMoodPost } from '@/lib/api/stories';
import { storyViewedStore } from '@/lib/api/story-viewed-store';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { selfRailEntry } from '@/lib/view/story-rail-self';
import { groupStoriesByAuthor, railTientLaPlace, withMoods } from '@/lib/view/story-tray';

const EMPTY_STATUS_MOODS: readonly StatusMoodPost[] = [];

/**
 * **LE CORPUS DU PLATEAU DES STORIES, CALCULÉ UNE FOIS PAR ÉCRAN** — extrait de
 * `routes/conversations.tsx` (#6080, #5652, #5817) pour servir aussi le Flux
 * (#6277). iOS monte le même `StoryTrayView(viewModel: storyViewModel)` sur les
 * deux écrans ; deux calculs recopiés auraient pu, un jour, ne pas regrouper
 * les mêmes auteurs.
 *
 * - **les groupes** : `groupStoriesByAuthor` sur le corpus des stories, avec
 *   l'AVANCE optimiste de « vu par moi » (`storyViewedStore` — la story que le
 *   lecteur vient d'ouvrir éteint son anneau sans attendre le réseau — « vu par
 *   moi » EST servi par la passerelle, `isViewedByMe` dans les deux
 *   projections de `PostFeedService.ts` ; un commentaire qui affirmait le
 *   contraire a été mesuré FAUX, #5817), puis
 *   `withMoods` fusionne le corpus DISTINCT des humeurs. Une requête d'humeurs
 *   qui échoue laisse les groupes sans humeur, jamais un état de chargement :
 *   le badge est un complément de la pastille, pas sa condition ;
 * - **la place** : `railTientLaPlace` borne la promesse du squelette à la
 *   PREMIÈRE tentative — un corpus lent garde sa place, un corpus qui répond
 *   NON la perd immédiatement.
 *
 * Une seule valeur, pour les DEUX géographies de l'écran (grand plateau et
 * bande épinglée) : c'est ce qui garantit que la tuile jumelle vers laquelle la
 * bande rend le focus existe (`RailTitleSlot`).
 */
export function useStoryRailProps(viewerId: string | undefined, viewerAvatar?: string): StoryRailProps {
  const tray = useStoryTray();
  const seenNow = useStore(storyViewedStore, (s) => s.ids);
  const moods = useStatusMoods();

  const groups = useMemo(
    () =>
      withMoods(
        groupStoriesByAuthor(tray.data ?? [], { viewerId, viewedIds: seenNow }),
        moods.data ?? EMPTY_STATUS_MOODS,
      ),
    [tray.data, viewerId, moods.data, seenNow],
  );

  const language = currentInterfaceLanguage();

  /**
   * **MOI, ET MES DEUX PORTES** (#6150) — calculée ICI, avec le reste des
   * props, pour la raison même qui a fait remonter `groups` : les deux
   * géographies du rail doivent voir la MÊME valeur, sinon la tuile jumelle
   * vers laquelle la bande rend le focus pourrait ne pas exister.
   *
   * Elle se calcule sur le corpus BRUT des humeurs, pas sur `groups` : un
   * lecteur qui n'a publié aucune story n'a AUCUN groupe, et c'est précisément
   * le cas où ses deux portes comptent le plus.
   */
  const self = useMemo(
    /* `avatar` (#6975) — `Viewer.avatar` avait été ajouté POUR cette pastille
       et n'atteignait AUCUN rendu : le paramètre le fait descendre jusqu'à la
       loi, qui décide (photo de session, puis auteur de mes stories). */
    () =>
      selfRailEntry({
        viewerId,
        ...(viewerAvatar === undefined ? {} : { avatar: viewerAvatar }),
        groups,
        moods: moods.data ?? EMPTY_STATUS_MOODS,
      }),
    [viewerId, viewerAvatar, groups, moods.data],
  );

  return useMemo(
    () => ({ groups, loading: railTientLaPlace(tray), language, ...(self === undefined ? {} : { self }) }),
    [groups, tray, language, self],
  );
}
