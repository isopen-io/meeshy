package me.meeshy.sdk.model.game.photo

/** Ce que l'APERÇU de la carte montre à la place du carré QR. */
public sealed interface PhotoReferralBanner {
    /** Aucun jeton encore : un emplacement vide en pointillé, dans l'aperçu seulement. */
    public data object Placeholder : PhotoReferralBanner

    /** Le vrai lien, en carré QR. */
    public data class Ready(val link: String) : PhotoReferralBanner
}

/**
 * LE LIEN D'INVITATION DE LA CARTE DU MOMENT (iOS `GamePhotoSession`, #9554, #17392) — loi pure, sans réseau :
 *
 *  - le lien se montre et part en texte tant que l'utilisateur ne l'a pas retiré (conformité H-2) ;
 *  - sans jeton, l'aperçu montre son EMPLACEMENT, et seul le toucher de « Partager » crée le jeton ;
 *  - rien ne sort de l'app avec un emplacement, ni avec un lien retiré (H-8) : [outgoingLink] est le vrai lien ou rien ;
 *  - un refus de création retire le bandeau et ne se retente pas ; retirer le lien ne crée rien.
 */
public data class PhotoReferralChoice(
    val link: String? = null,
    val prepared: Boolean = false,
    val unavailable: Boolean = false,
    val linkOnCard: Boolean = true,
) {
    /** « Mon lien d'invitation sur la carte » ne se propose que s'il y a un lien, ou un jeton que Partager peut créer. */
    val offersLinkChoice: Boolean get() = link != null || (prepared && !unavailable)

    val preview: PhotoReferralBanner?
        get() = when {
            !linkOnCard -> null
            link != null -> PhotoReferralBanner.Ready(link)
            prepared && !unavailable -> PhotoReferralBanner.Placeholder
            else -> null
        }

    /** Le lien que porte ce qui SORT de l'app (partage, galerie, carnet) : jamais un emplacement. */
    val outgoingLink: String? get() = link?.takeIf { linkOnCard }

    /** Le toucher de « Partager » doit-il créer un jeton ? */
    val needsCreation: Boolean get() = linkOnCard && link == null && !unavailable

    /** La recette du carnet retient si le lien était sur la carte. */
    val showsLink: Boolean get() = outgoingLink != null

    /** La lecture d'un jeton EXISTANT (jamais une création) : un lien déjà obtenu n'est pas remplacé. */
    public fun read(existing: String?): PhotoReferralChoice = copy(prepared = true, link = link ?: existing)

    /** Le résultat de la création au toucher de « Partager » : `null` ⇒ la carte part sans bandeau. */
    public fun created(created: String?): PhotoReferralChoice =
        if (created == null) copy(prepared = true, unavailable = link == null) else copy(prepared = true, link = created)

    public fun withLinkOnCard(shown: Boolean): PhotoReferralChoice = copy(linkOnCard = shown)
}
