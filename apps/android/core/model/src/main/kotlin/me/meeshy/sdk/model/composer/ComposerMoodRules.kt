package me.meeshy.sdk.model.composer

/**
 * Les règles PURES du composeur d'humeur (iOS `ComposerMoodSurface` + `ComposerMoodBarePublish`, web `moodPublishStep`) :
 * le mot de 122 caractères et son compteur, la porte de Publier, la confirmation d'une humeur sans mot, la grille
 * d'emojis. L'écran n'est qu'une projection de ces décisions.
 */
object ComposerMoodRules {
    /** Plafond du mot : la passerelle refuserait au-delà, le champ tronque avant. */
    const val MAX_WORD_CHARS = 122

    /** Le compteur passe en alerte dès le 101e caractère (iOS `> 100`). */
    const val ALERT_FROM = 101

    /** Plafond de `moodEmoji` côté passerelle (`z.string().max(10)`), en unités UTF-16. */
    const val MAX_EMOJI_UNITS = 10

    /** Colonnes de la grille d'emojis. */
    const val GRID_COLUMNS = 5

    /** Le mot tel qu'il se garde : tronqué à [MAX_WORD_CHARS]. */
    fun clampWord(value: String): String = if (value.length <= MAX_WORD_CHARS) value else value.take(MAX_WORD_CHARS)

    /** Le compteur d'un mot : invisible tant que rien n'est tapé, en alerte à partir de [ALERT_FROM]. */
    data class Counter(val used: Int, val max: Int, val visible: Boolean, val alert: Boolean)

    fun counter(text: String): Counter =
        Counter(used = text.length, max = MAX_WORD_CHARS, visible = text.isNotEmpty(), alert = text.length >= ALERT_FROM)

    /** Ce que le geste Publier doit faire. */
    sealed interface PublishDecision {
        /** Aucun emoji : rien ne part, et le lecteur d'écran l'annonce ([announceKey]). */
        data object NeedsEmoji : PublishDecision

        /** Humeur sans mot : on demande « Publier ton humeur sans un petit mot ? ». */
        data object AskForWord : PublishDecision

        data object Publish : PublishDecision
    }

    /** La clé iOS du libellé annoncé quand Publier est pressé sans emoji. */
    const val ANNOUNCE_CHOOSE_EMOJI_KEY = "a11y.status.publish.disabled.hint"

    /** Une republication ne demande rien : elle porte déjà le mot de sa source. */
    fun decide(emoji: String?, text: String, isRepublication: Boolean): PublishDecision = when {
        emoji.isNullOrEmpty() -> PublishDecision.NeedsEmoji
        isRepublication || text.isNotBlank() -> PublishDecision.Publish
        else -> PublishDecision.AskForWord
    }

    fun acceptsPicked(emoji: String): Boolean = emoji.isNotEmpty() && emoji.length <= MAX_EMOJI_UNITS

    /** L'emoji choisi HORS de la grille ; null tant qu'il vient des emojis offerts. */
    fun customEmoji(emoji: String?, offered: List<String>): String? =
        emoji?.takeIf { it.isNotEmpty() && it !in offered }

    /** Une case de la grille. */
    sealed interface Cell {
        data class Emoji(val value: String, val selected: Boolean) : Cell

        /** La dernière case : ouvre tous les emojis. */
        data object More : Cell
    }

    /** Les cases : emojis offerts, l'emoji choisi hors grille réinjecté, puis la case « plus d'emojis ». */
    fun cells(offered: List<String>, selected: String?): List<Cell> =
        (offered + listOfNotNull(customEmoji(selected, offered))).map { Cell.Emoji(it, it == selected) } + Cell.More

    /** Retaper l'emoji choisi le désélectionne. */
    fun toggled(current: String?, tapped: String): String? = if (current == tapped) null else tapped
}
