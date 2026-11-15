/**
 * Le DÉTAIL d'un contenu de message que sa bannière annonce (#8856, #8857).
 *
 * Une notification de message disait l'auteur et, au mieux, un libellé de
 * pièce jointe : une position partait avec un corps VIDE, une invitation ou un
 * lien en URL brute. Ce type porte ce qui rend chaque contenu compréhensible et
 * actionnable depuis l'écran verrouillé, et voyage dans `NotificationContext`
 * (bannière in-app) puis, APLATI, dans `data` du push (NSE iOS, FCM, web).
 *
 * Il n'existe QUE pour un message dont le média a le droit de voyager
 * (`mediaMayTravel`) : un message protégé — vue unique, éphémère, flouté,
 * chiffré — n'en a jamais, et `showPreview: false` le retient du fil push.
 *
 * Aucun champ n'est obtenu par une requête sortante : tout est déjà en base
 * (`metadata.location`, nom d'origine de la vCard, lien de partage, vignette).
 */
export type NotificationContentDetail = {
  readonly location?: {
    readonly latitude: number;
    readonly longitude: number;
    readonly name: string | null;
    readonly address: string | null;
  };
  readonly contact?: { readonly name: string | null };
  readonly invite?: {
    readonly url: string;
    readonly conversationTitle: string | null;
    readonly memberCount: number | null;
  };
  readonly link?: { readonly url: string; readonly domain: string };
  readonly sticker?: { readonly emoji: string | null };
  /** Référence de la vignette d'une VIDÉO, telle que la base la porte (clé de stockage ou URL). */
  readonly videoThumbnailUrl?: string;
  /** `authorId` de la story citée — dit au lecteur si c'est SA story. `null` sur instantané legacy. */
  readonly storyReply?: { readonly authorId: string | null };
};

/** Les catégories iOS qu'un détail peut élire à la place de celle du type. */
export type NotificationContentCategory = 'MEESHY_LOCATION' | 'MEESHY_CONTACT' | 'MEESHY_INVITE';
