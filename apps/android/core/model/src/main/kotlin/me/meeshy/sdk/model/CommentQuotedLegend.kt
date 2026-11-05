package me.meeshy.sdk.model

/**
 * Ce que la citation DIT à côté de sa vignette (iOS `CommentQuotedMedia.legende`) : la légende du média d'abord — celle
 * que l'auteur du post a écrite, relue à chaque service —, sa NATURE ensuite. La nature est le seul mot qu'une citation
 * dont la cible a disparu a le droit de dire : un média disparu dégrade la citation, il ne l'efface jamais.
 */
public sealed interface CommentQuotedLegend {
    public data class Caption(val text: String) : CommentQuotedLegend
    public data class OfKind(val kind: CommentQuotedMedia.Kind) : CommentQuotedLegend
}

public val CommentQuotedMedia.legend: CommentQuotedLegend
    get() = media?.caption?.takeIf { it.isNotBlank() }?.let { CommentQuotedLegend.Caption(it) }
        ?: CommentQuotedLegend.OfKind(kind)
