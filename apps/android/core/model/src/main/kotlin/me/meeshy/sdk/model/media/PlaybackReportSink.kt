package me.meeshy.sdk.model.media

/**
 * Sortie des rapports de consommation : les moteurs la **appellent**, le lot de rapports
 * l'implémentera. L'implémentation par défaut, [Inert], ne fait rien.
 */
public interface PlaybackReportSink {
    public fun report(attachmentId: String, body: AttachmentStatusBody)

    public data object Inert : PlaybackReportSink {
        override fun report(attachmentId: String, body: AttachmentStatusBody) = Unit
    }
}
