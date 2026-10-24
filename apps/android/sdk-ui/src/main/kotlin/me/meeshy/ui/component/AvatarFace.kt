package me.meeshy.ui.component

import me.meeshy.sdk.util.resolveServedImageUrl

/**
 * L'état du chargement d'une photo d'avatar, tel que le moteur d'image le rapporte. Aucun état
 * « nouvelle tentative » : un avatar n'a ni spinner ni bouton (D2, miroir de `CachedAvatarImage`).
 */
public enum class AvatarPhotoState {
    Loading, Success, Error;

    /**
     * L'état après ce que le moteur rapporte. Une photo déjà montrée ne retombe pas en initiales parce
     * que le moteur annonce qu'il charge : Coil le dit toujours AVANT de lire sa mémoire, y compris
     * pour une photo que [firstFrame] a déjà montrée.
     */
    public fun then(reported: AvatarPhotoState): AvatarPhotoState =
        if (this == Success && reported == Loading) Success else reported

    public companion object {
        /**
         * L'état de la première image : une photo déjà en mémoire à la taille du cercle la tient d'emblée
         * (miroir de la sonde `WarmImageProbe` de `CachedAvatarImage`) ; sinon les initiales l'attendent.
         */
        public fun firstFrame(isResident: Boolean): AvatarPhotoState = if (isResident) Success else Loading
    }
}

/** Le calque qui se dessine dans le cercle : UN seul, jamais les deux. */
public sealed interface AvatarLayer {
    public data class Initials(val text: String) : AvatarLayer
    public data class Photo(val model: String) : AvatarLayer
}

/**
 * Le visage demandé d'un cercle d'avatar (#12569) : miroir de `MeeshyAvatar.avatarBody` et de la
 * cascade de `CachedAvatarImage` (iOS). Une photo quand une référence est servie, avec ses initiales
 * comme placeholder EXCLUSIF — montées À LA PLACE de la photo tant qu'elle ne s'est pas chargée ou si
 * elle échoue, jamais SOUS elle (une photo PNG transparente, un liseré anticrénelé ou un
 * `ContentScale.Fit` les laisseraient transparaître).
 *
 * La référence (`2026/09/<id>/photo.png`, `static:…`, URL héritée) se résout ICI, jamais chez
 * l'appelant : un appelant qui passerait sa clé brute à Coil n'afficherait jamais rien.
 */
public sealed interface AvatarFace {
    public val initials: String

    /** Aucune photo servie : les initiales seules, sur le dégradé d'accent. */
    public data class Initials(override val initials: String) : AvatarFace

    /** Une photo à charger à l'adresse [model], dont [initials] tient la place en attendant. */
    public data class Photo(val model: String, override val initials: String) : AvatarFace

    /** Le calque à dessiner pour l'état [state] : photo seulement une fois chargée, initiales sinon. */
    public fun layer(state: AvatarPhotoState): AvatarLayer = when (this) {
        is Initials -> AvatarLayer.Initials(initials)
        is Photo -> if (state == AvatarPhotoState.Success) AvatarLayer.Photo(model) else AvatarLayer.Initials(initials)
    }

    public companion object {
        /**
         * @param imageUrl ce que la base SERT : clé de stockage, `static:`, URL complète héritée. Jamais
         *   un URI local : `file:` / `content:` venus du serveur rendent les initiales.
         * @param localPhotoUri la photo que l'UTILISATEUR vient de choisir sur son appareil (`file:` / `content:`),
         *   seul chemin d'un URI local ; jamais alimenté par la charge serveur.
         * @param apiBaseUrl la base d'API configurée (cf. [LocalMediaBaseUrl]) ; `null` hors composition.
         */
        public fun resolve(
            name: String,
            imageUrl: String?,
            apiBaseUrl: String?,
            localPhotoUri: String? = null,
        ): AvatarFace {
            val initials = avatarInitials(name)
            val model = avatarLocalPhotoModel(localPhotoUri)
                ?: avatarPhotoModel(imageUrl, apiBaseUrl)
                ?: return Initials(initials)
            return Photo(model = model, initials = initials)
        }
    }
}

private val LOCAL_URI_SCHEMES = listOf("file:", "content:")

private fun String.isLocalUri(): Boolean = LOCAL_URI_SCHEMES.any { startsWith(it, ignoreCase = true) }

/**
 * L'adresse chargeable d'une référence SERVIE, ou `null` (⇒ initiales) quand rien n'est servi, quand
 * c'est un URI local, ou quand la politique d'URL média (https, pas d'adresse privée) la refuse. Pur.
 */
internal fun avatarPhotoModel(imageUrl: String?, apiBaseUrl: String?): String? =
    resolveServedImageUrl(imageUrl, apiBaseUrl)

/** Une photo choisie localement : `file:` / `content:` seulement. */
internal fun avatarLocalPhotoModel(localPhotoUri: String?): String? =
    localPhotoUri?.trim()?.takeIf { it.isLocalUri() }
