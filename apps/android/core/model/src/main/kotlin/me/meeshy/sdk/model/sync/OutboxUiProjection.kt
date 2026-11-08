package me.meeshy.sdk.model.sync

/** Les règles pures qui bornent ce que la file montre à la pastille (miroir d'iOS `OutboxUIItem` / `OutboxPendingIndicator`). */
object OutboxUiProjection {
    /** La file ne remonte que sa tête : un arriéré énorme ne coûte ni mémoire ni décodage pour des lignes invisibles. */
    const val LIMIT: Int = 50

    /** Le plafond de caractères d'un aperçu avant l'ellipse. */
    const val PREVIEW_MAX_CHARACTERS: Int = 60

    /** Combien de temps une entrée TERMINALE reste un état de synchronisation (iOS #4660) : passé là, c'est un journal. */
    const val TERMINAL_DISPLAY_WINDOW_MS: Long = 60_000L

    /** [text] tel quel jusqu'à [PREVIEW_MAX_CHARACTERS] caractères, sinon coupé et suivi de « … ». */
    fun truncatePreview(text: String): String {
        if (text.codePointCount(0, text.length) <= PREVIEW_MAX_CHARACTERS) return text
        val end = text.offsetByCodePoints(0, PREVIEW_MAX_CHARACTERS)
        return text.substring(0, end) + "…"
    }

    /** Une entrée terminale n'est montrée que dans sa fenêtre, mesurée sur `updatedAt` (la même règle par ENTRÉE). */
    fun isDisplayable(item: OutboxUiItem, now: Long): Boolean =
        !item.status.isTerminal || now - item.updatedAt <= TERMINAL_DISPLAY_WINDOW_MS

    /** La tête de file, plus ancienne d'abord, bornée à [limit], sans les terminales périmées. */
    fun head(items: List<OutboxUiItem>, now: Long, limit: Int = LIMIT): List<OutboxUiItem> =
        items.sortedBy { it.createdAt }.filter { isDisplayable(it, now) }.take(limit)
}
