package me.meeshy.sdk.model

/**
 * **LE VOILE D'UN COMMENTAIRE** (iso iOS `CommentVeilRules`, #8582) : un commentaire flouté se lit en le touchant. Le voile
 * protège le CORPS seul (texte, citation, médias) : l'auteur, l'heure et les actions restent lisibles. Les effets
 * permanents (lueur, pulsation, arc-en-ciel, étincelles) habillent le corps sans jamais le masquer.
 */
public object CommentVeilRules {

    /** Les parties d'une ligne que le voile peut couvrir : le corps, rien d'autre. */
    public enum class Part { BODY }

    public fun isVeiled(effects: MessageEffects, isRevealed: Boolean): Boolean =
        effects.has(MessageEffectFlags.BLURRED) && !isRevealed

    public fun protectedParts(effects: MessageEffects, isRevealed: Boolean): Set<Part> =
        if (isVeiled(effects, isRevealed)) setOf(Part.BODY) else emptySet()

    /** Sous le voile, le corps ne reçoit ni toucher ni lecteur d'écran (iOS `allowsHitTesting` + `accessibilityHidden`). */
    public fun bodyIsInteractive(effects: MessageEffects, isRevealed: Boolean): Boolean = !isVeiled(effects, isRevealed)
}
