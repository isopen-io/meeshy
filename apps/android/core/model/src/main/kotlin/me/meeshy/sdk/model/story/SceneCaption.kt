package me.meeshy.sdk.model.story

/**
 * La légende adossée à UNE scène — miroir de `SceneCaption` (iOS). La scène REGARDÉE décide, jamais la scène 0 par
 * défaut. Deux replis : le texte du porteur (gouverné par l'appelant) et, pour un document qui n'adresse AUCUN média,
 * le premier visuel du post (jugé par document, jamais scène par scène).
 */
object SceneCaption {
    enum class Origin { MediaCaption, CarrierText }

    data class Resolved(val text: String, val origin: Origin)

    /** Un média du post : son identité, s'il se voit, sa légende propre. */
    data class Media(val id: String, val isVisual: Boolean, val caption: String?)

    fun resolve(
        sceneIndex: Int,
        sceneCarriers: List<String?>,
        media: List<Media>,
        carrierText: String?,
        carrierFallback: Boolean,
    ): String? = resolveWithOrigin(sceneIndex, sceneCarriers, media, carrierText, carrierFallback)?.text

    fun resolveWithOrigin(
        sceneIndex: Int,
        sceneCarriers: List<String?>,
        media: List<Media>,
        carrierText: String?,
        carrierFallback: Boolean,
    ): Resolved? {
        if (sceneIndex !in sceneCarriers.indices) return null
        val own = mediaIdentity(sceneIndex, sceneCarriers, media)
            ?.let { id -> media.firstOrNull { it.id == id } }
            ?.caption?.trim()?.takeIf { it.isNotEmpty() }
        if (own != null) return Resolved(own, Origin.MediaCaption)
        val porteur = carrierText?.trim()?.takeIf { carrierFallback && it.isNotEmpty() } ?: return null
        return Resolved(porteur, Origin.CarrierText)
    }

    fun mediaIdentity(sceneIndex: Int, sceneCarriers: List<String?>, media: List<Media>): String? {
        sceneCarriers.getOrNull(sceneIndex)?.let { return it }
        if (addressesAnyMedia(sceneCarriers)) return null
        return media.firstOrNull { it.isVisual }?.id
    }

    fun addressesAnyMedia(sceneCarriers: List<String?>): Boolean = sceneCarriers.any { it != null }
}
