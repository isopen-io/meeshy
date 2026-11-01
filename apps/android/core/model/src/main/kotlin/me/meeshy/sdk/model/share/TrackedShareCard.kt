package me.meeshy.sdk.model.share

/**
 * **Le lien suivi d'un contenu partagé** (#14315) — miroir de `TrackedShareLink` (iOS). « Envoyer » (la feuille
 * Meeshy) et « Partager » (la feuille du système) frappent le MÊME lien : `POST /posts/{id}/share` avec
 * `generateLink` le crée s'il n'existe pas et le retrouve sinon, un par contenu et par partageur. Un post et un réel
 * en frappent toujours un (la passerelle vérifie l'audience AVANT la frappe) ; une story seulement PUBLIQUE, car
 * `meeshy.me/l/…` s'ouvre sans compte et élargirait l'audience d'une story d'amis ; un profil ou une invitation
 * gardent leur adresse.
 */
object TrackedShareCard {
    /** D'où part le lien — une étiquette de mesure, jamais une règle. */
    enum class Gesture(val platform: String) { SEND("meeshy"), SHARE_OUT("system") }

    fun mints(card: ShareCard): Boolean = card.contentId.isNotBlank() && when (card.kind) {
        ShareCardKind.POST, ShareCardKind.REEL -> true
        ShareCardKind.STORY -> card.isPublicStory
        ShareCardKind.PROFILE, ShareCardKind.INVITATION -> false
    }

    /** La carte qui porte [link] à la place de son adresse directe, dans son lien ET dans sa phrase. */
    fun withLink(card: ShareCard, link: String): ShareCard {
        val direct = card.url ?: return card
        if (direct == link) return card
        return card.copy(url = link, messageText = card.messageText?.replace(direct, link))
    }

    /** Ce que la feuille du système emporte : la phrase de la carte, sinon son lien, sinon son titre. */
    fun outgoingText(card: ShareCard): String =
        card.messageText?.takeIf { it.isNotBlank() } ?: card.url?.takeIf { it.isNotBlank() } ?: card.title
}
