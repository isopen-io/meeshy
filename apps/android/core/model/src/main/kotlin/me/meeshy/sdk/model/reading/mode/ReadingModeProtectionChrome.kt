package me.meeshy.sdk.model.reading.mode

/**
 * Où se monte le badge de protection et la combustion d'un éphémère, POUR CHAQUE mode de lecture —
 * miroir de `ReadingModeProtectionChrome` (iOS). Un `when` exhaustif, pas une liste : un sixième mode ne
 * compile pas tant qu'il n'a pas déclaré son hôte. Chemins relatifs à `apps/android/`.
 */
public object ReadingModeProtectionChrome {

    public fun rendererPath(mode: ConversationReadingMode): String = when (mode) {
        ConversationReadingMode.FOCAL, ConversationReadingMode.SCRIPT ->
            "sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/FocalFlatRow.kt"
        ConversationReadingMode.BUBBLES ->
            "sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt"
        ConversationReadingMode.RIVER ->
            "feature/chat/src/main/kotlin/me/meeshy/app/chat/river/RiverBubble.kt"
        // Le Résumé ne rend aucun texte protégé : il désigne les messages protégés dans sa section.
        ConversationReadingMode.SUMMARY ->
            "feature/chat/src/main/kotlin/me/meeshy/app/chat/LivingSummaryParts.kt"
    }

    /** Hôte de la combustion : le message ENTIER, donc pas toujours le fichier du badge. */
    public fun burnHostPath(mode: ConversationReadingMode): String = when (mode) {
        ConversationReadingMode.BUBBLES -> "sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt"
        else -> rendererPath(mode)
    }
}
