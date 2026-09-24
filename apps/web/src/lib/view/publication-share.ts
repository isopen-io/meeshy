import { recordShareAction } from '@/lib/api/query';
import { publicationShareUrl, RETOUR_PARTAGE_PUBLICATION } from '@/lib/feed/share-url';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { partagerLien, portailDuNavigateur, type PortailPartage } from './invitation';

/**
 * **PARTAGER UNE PUBLICATION** (#6278, D-48 ; site UNIQUE depuis la revue de
 * #7116) — la carte du fil, le détail d'une publication, le rail des Réels
 * (`usePostGesture().onShare`) et le rail AUTEUR du lecteur de stories
 * (`useStoryOwnerRail`) partagent CE geste, jamais une copie.
 *
 * `partagerLien` part DANS le gestionnaire, sans `await` préalable : la
 * feuille du système n'ouvre que pendant l'activation du geste (D-48). Le
 * partage n'est COMPTÉ (`POST /posts/:id/share`, `routes/posts/share.ts:64`)
 * qu'une fois le lien réellement parti — partagé ou copié.
 *
 * La promesse rendue se résout quand la feuille du système s'est refermée —
 * le lecteur de stories y attache sa REPRISE (iOS met la story en pause sous
 * sa feuille de partage). Elle ne rejette jamais : `partagerLien` rend ses
 * quatre issues en valeurs.
 *
 * `announce` est un PARAMÈTRE, jamais une région montée ici : chaque hôte
 * tient déjà SA région `role="status"` (`useLiveAnnouncer`), et en ouvrir une
 * seconde pour le même événement est ce que D-11 interdit.
 *
 * **iOS partage un MP4 baké avec un sélecteur de langue à graver**
 * (`StoryExportShareViewModel.swift`) ; le web ne peut pas baker dans le
 * geste, et partage le LIEN canonique — la forme qu'iOS revendique déjà en
 * lien universel. Écart assumé, écrit dans `decisions.md` (D-88, addendum
 * #7116).
 */
export function sharePublicationLink(params: {
  readonly postId: string;
  readonly language: InterfaceLanguage;
  readonly announce: (message: string) => void;
  readonly record?: (postId: string) => unknown;
  readonly portal?: PortailPartage;
}): Promise<void> {
  const { postId, language, announce } = params;
  const record = params.record ?? recordShareAction;
  return partagerLien(
    { title: 'Meeshy', text: translate(language, 'feed.share.text'), url: publicationShareUrl(postId) },
    params.portal ?? portailDuNavigateur(),
  ).then((result) => {
    if (result === 'partage' || result === 'copie') void record(postId);
    const key = RETOUR_PARTAGE_PUBLICATION[result];
    if (key !== null) announce(translate(language, key));
  });
}
