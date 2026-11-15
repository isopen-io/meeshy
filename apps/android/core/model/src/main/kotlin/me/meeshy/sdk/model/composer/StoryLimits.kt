package me.meeshy.sdk.model.composer

/**
 * Les plafonds LARGES d'une story / d'une scène (décision porteur 2026-10-28, #13590) : UNE source pour les
 * composeurs Android, miroir de `services/gateway/src/routes/posts/storyLimits.ts` (qui les fait respecter).
 *
 * Assez hauts pour ne gêner aucun usage réel, assez bas pour qu'une scène reste lisible. Le texte est borné à
 * la SAISIE ; la durée totale s'additionne sur toutes les slides ; les traductions écrites par le serveur ne
 * relèvent pas du plafond de texte.
 */
object StoryLimits {
    /** Stickers, images, textes, audios et vidéos posés sur UNE scène : cinquante de chaque famille. */
    const val OBJECTS_PER_FAMILY: Int = 50

    /** Caractères d'un texte posé sur la scène. */
    const val TEXT_LENGTH: Int = 1000

    /** Durée totale d'une story, toutes slides comprises : deux heures. */
    const val TOTAL_SECONDS: Double = 7200.0

    /** Le texte coupé à [TEXT_LENGTH] caractères (points de code : un emoji ne se coupe jamais en deux). */
    fun clampText(text: String): String {
        val points = text.codePointCount(0, text.length)
        return if (points <= TEXT_LENGTH) text else text.substring(0, text.offsetByCodePoints(0, TEXT_LENGTH))
    }

    /** Caractères restants avant le plafond de texte ; jamais négatif. */
    fun textCharactersRemaining(text: String): Int = (TEXT_LENGTH - text.codePointCount(0, text.length)).coerceAtLeast(0)

    /**
     * La durée [wanted] ramenée à ce que le budget de deux heures laisse à cette slide, sachant que les
     * autres en consomment déjà [usedByOthers] ; jamais sous [floor] (une slide garde sa durée minimale).
     */
    fun durationWithinBudget(wanted: Double, usedByOthers: Double, floor: Double): Double =
        wanted.coerceAtMost((TOTAL_SECONDS - usedByOthers).coerceAtLeast(floor)).coerceAtLeast(floor)
}
