package me.meeshy.app.feed

/**
 * Ce que le fil compte comme « vu » (iOS `countsListedImpression`) : UNE impression à CHAQUE apparition d'une
 * carte à l'écran — jamais dédupliquée par post, une carte qui sort puis revient compte deux fois — avec son genre
 * (`isVideo`, un réel) pour la mesure de visibilité. Le groupement et l'envoi restent à [record] / [flush]
 * (l'`ImpressionBatcher`) ; ici vit seulement la règle de comptage et le vidage à la sortie.
 */
internal class FeedImpressionTracker(
    private val record: (postId: String, isVideo: Boolean) -> Unit,
    private val flush: () -> Unit,
) {
    private var appearances = 0

    /** Nombre d'apparitions comptées depuis la création (témoin de la règle « à chaque apparition »). */
    val counted: Int get() = appearances

    /** [post] vient d'entrer à l'écran. Un identifiant vide n'est pas une carte. */
    fun appeared(post: FeedPostPresentation) {
        if (post.id.isEmpty()) return
        appearances += 1
        record(post.id, post.isReel)
    }

    /** Le fil sort de l'écran ou passe en arrière-plan : le lot en cours part aussitôt, il n'est pas jeté. */
    fun exited() {
        flush()
    }
}
