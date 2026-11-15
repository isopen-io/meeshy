package me.meeshy.app.widget

/** Les quatre textes d'une réponse rapide (iOS : 👍 / OK / Thanks! / Call me). */
internal data class QuickReplyTexts(
    val thumbsUp: String,
    val ok: String,
    val thanks: String,
    val callMe: String,
)

/**
 * Une puce : [label] est du chrome (locale de l'appareil), [draft] est du contenu que l'utilisateur
 * va signer (langue du compte). Jamais d'envoi automatique : le brouillon est déposé dans le composeur.
 */
internal data class QuickReplyChip(val label: String, val draft: String)

internal object QuickReplyDrafts {

    /** Les langues dont le catalogue des widgets porte les quatre réponses. */
    private val WRITABLE = setOf("en", "fr", "es", "pt", "de", "it", "ar")

    /** Première langue du prisme du lecteur (rang 1 = compte) pour laquelle un brouillon existe. */
    fun draftLanguage(prism: List<String>): String? =
        prism.asSequence()
            .map { it.trim().lowercase().substringBefore('-').substringBefore('_') }
            .firstOrNull { it in WRITABLE }

    fun chips(labels: QuickReplyTexts, drafts: QuickReplyTexts?): List<QuickReplyChip> {
        val draftTexts = drafts ?: labels
        return listOf(
            QuickReplyChip(labels.thumbsUp, draftTexts.thumbsUp),
            QuickReplyChip(labels.ok, draftTexts.ok),
            QuickReplyChip(labels.thanks, draftTexts.thanks),
            QuickReplyChip(labels.callMe, draftTexts.callMe),
        )
    }
}
