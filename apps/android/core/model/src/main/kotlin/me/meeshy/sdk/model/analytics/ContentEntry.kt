package me.meeshy.sdk.model.analytics

/**
 * L'ENTRÉE d'un écran détail : sa provenance et, pour un listing seulement, l'origine du
 * tap. L'invariant « une origine n'accompagne qu'un listing » tient par construction.
 */
@ConsistentCopyVisibility
data class ContentEntry private constructor(
    val provenance: ViewProvenance,
    val origin: OpenOrigin?,
) {
    /** La source de l'impression d'ouverture d'un détail ; un lien de suivi garde `shared_link`. */
    val detailImpressionSource: String
        get() = SocialEventsDispatch.detailImpressionSource(provenance)

    companion object {
        /** Relecture d'une file : l'origine d'une provenance autre que listing est écartée. */
        fun of(provenance: ViewProvenance, origin: OpenOrigin?): ContentEntry =
            ContentEntry(provenance, if (provenance == ViewProvenance.LISTING) origin else null)

        fun listing(origin: OpenOrigin): ContentEntry = ContentEntry(ViewProvenance.LISTING, origin)

        val notification: ContentEntry = ContentEntry(ViewProvenance.NOTIFICATION, null)
        val sharedLink: ContentEntry = ContentEntry(ViewProvenance.SHARED_LINK, null)
        val trackingLink: ContentEntry = ContentEntry(ViewProvenance.TRACKING_LINK, null)
        val external: ContentEntry = ContentEntry(ViewProvenance.EXTERNAL, null)
        val direct: ContentEntry = ContentEntry(ViewProvenance.DIRECT, null)
    }
}
