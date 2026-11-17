package me.meeshy.sdk.model.contentcard

import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.PostType

/** Ce que la lecture d'un post a rendu : le post servi au lecteur, ou le VERDICT qu'il ne lui est plus servi. */
sealed interface ContentCardResolution {
    data class Served(val post: ApiPost) : ContentCardResolution

    /** Supprimé, expiré, hors de l'audience du lecteur ou inconnu : indistinguables, et c'est voulu. */
    data object Unavailable : ContentCardResolution

    companion object {
        private val GONE_OR_NOT_FOR_YOU = setOf(403, 404, 410)

        /** Un refus qui dit « ce contenu n'est pas (ou plus) pour toi » est un verdict ; `null` : une panne, sans verdict. */
        fun ofRefusal(httpStatus: Int?): ContentCardResolution? = Unavailable.takeIf { httpStatus in GONE_OR_NOT_FOR_YOU }
    }
}

/**
 * L'état d'UNE carte de contenu (#19331, contrat § 3), réduction pure : la carte connue se montre à sa première image
 * ([remembered]), le squelette n'existe que sur mémoire vide, un refus devient la ligne « plus disponible », et une
 * panne ne retombe sur l'aperçu générique que tant que rien n'est montré ([failed]).
 */
sealed interface ContentLinkCardState {
    data object Loading : ContentLinkCardState
    data class Card(val card: ContentCard) : ContentLinkCardState

    /** Le contenu n'est plus servi au lecteur ; [type] : le genre que le lien annonçait, s'il le disait. */
    data class Unavailable(val type: PostType?) : ContentLinkCardState

    /** Une panne sur une carte encore vide : l'aperçu générique du lien prend la place. */
    data object Failed : ContentLinkCardState

    /** Le lien suivi mène ailleurs (une invitation, une fiche, un site) : ce n'est pas une carte de contenu. */
    data object NotContent : ContentLinkCardState

    /** La bulle rend son aperçu d'avant : jamais un trou, jamais une erreur bruyante. */
    val fallsBack: Boolean get() = this == Failed || this == NotContent

    /** Ce qu'une lecture rend. */
    fun resolved(resolution: ContentCardResolution, card: (ApiPost) -> ContentCard, type: PostType?): ContentLinkCardState =
        of(resolution, card, type)

    /** Une lecture a échoué sans verdict : ce qui est déjà montré reste. */
    fun failed(): ContentLinkCardState = if (this is Card || this is Unavailable) this else Failed

    companion object {
        /** Ce que la mémoire sert à la première image : une carte connue, même périmée, jamais un squelette. */
        fun remembered(lookup: ContentCardMemory.Lookup, card: (ApiPost) -> ContentCard, type: PostType?): ContentLinkCardState =
            when (lookup) {
                is ContentCardMemory.Lookup.Fresh -> of(lookup.resolution, card, type)
                is ContentCardMemory.Lookup.Stale -> of(lookup.resolution, card, type)
                ContentCardMemory.Lookup.Missing -> Loading
            }

        private fun of(resolution: ContentCardResolution, card: (ApiPost) -> ContentCard, type: PostType?): ContentLinkCardState =
            when (resolution) {
                is ContentCardResolution.Served -> Card(card(resolution.post))
                ContentCardResolution.Unavailable -> Unavailable(type)
            }
    }
}
