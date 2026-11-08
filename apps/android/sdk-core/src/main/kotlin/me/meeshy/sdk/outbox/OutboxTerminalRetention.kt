package me.meeshy.sdk.outbox

/**
 * Combien de temps une ligne terminale (`EXHAUSTED`) reste en base avant d'être collectée (miroir d'iOS
 * `OfflineQueue+TerminalRetention`).
 *
 * Seules les lignes JETABLES du catalogue ([OutboxKindMeta.terminalDisposable] : aucun contenu écrit par l'utilisateur,
 * effet déjà défait localement) ont une fenêtre. Tout le reste — un message, un post, un commentaire — est GARDÉ : la bulle
 * en échec en dépend pour « Réessayer ». La fenêtre se mesure depuis `updatedAt`, l'instant du renoncement.
 */
public object OutboxTerminalRetention {

    /** Plus longue que l'affichage de la pastille d'échec : le doigt qui relance juste avant la sortie retrouve sa ligne. */
    public const val DISCARDABLE_WINDOW_MS: Long = 10 * 60 * 1000L

    /** La fenêtre de rétention de [kind], ou `null` quand ses lignes terminales sont gardées. */
    public fun windowFor(kind: OutboxKind): Long? =
        if (OutboxKindCatalog.metaFor(kind).terminalDisposable) DISCARDABLE_WINDOW_MS else null
}
