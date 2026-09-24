import { recordShareAction } from '@/lib/api/query';
import { publicationShareUrl, RETOUR_PARTAGE_PUBLICATION } from '@/lib/feed/share-url';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { partagerLien, portailDuNavigateur, type PortailPartage } from '@/lib/view/invitation';

/**
 * **PARTAGER UNE STORY DEPUIS SON LECTEUR** (#7116, D-48) — même adresse
 * canonique et même geste que `usePostGesture().onShare` (`use-post-gesture.ts`),
 * REDONNÉ en fonction PURE paramétrée par `announce` : le lecteur de stories
 * porte déjà SA propre région vivante (`useLiveAnnouncer`, `routes/story.tsx`,
 * D-11) — monter un second `usePostGesture()` y ouvrirait une SECONDE région
 * `role="status"` pour le même événement, ce que D-11 interdit.
 *
 * **iOS bake un MP4 et présente un sélecteur de langue à graver**
 * (`StoryExportShareViewModel.swift`) — le web ne peut pas baker dans le
 * geste (`navigator.share` n'ouvre que pendant l'activation, D-48) : il
 * partage donc le LIEN canonique de la publication, la forme qu'iOS
 * revendique déjà en lien universel. Écart assumé (`decisions.md`, D-88
 * addendum).
 */
export function shareStory(params: {
  readonly storyId: string;
  readonly language: InterfaceLanguage;
  readonly announce: (message: string) => void;
  readonly portail?: PortailPartage;
}): void {
  const { storyId, language, announce } = params;
  void partagerLien(
    { title: 'Meeshy', text: translate(language, 'feed.share.text'), url: publicationShareUrl(storyId) },
    params.portail ?? portailDuNavigateur(),
  ).then((result) => {
    if (result === 'partage' || result === 'copie') void recordShareAction(storyId);
    const key = RETOUR_PARTAGE_PUBLICATION[result];
    if (key !== null) announce(translate(language, key));
  });
}
