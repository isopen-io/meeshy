package me.meeshy.sdk.model.composer

/** D'où vient une couleur de bordure : l'accent de la conversation ou l'indigo 600 de la marque. */
public enum class BorderColorSource { Accent, Indigo600 }

/**
 * La bordure de la capsule de saisie : invisible au repos, dégradé accent 55 % -> indigo 600 45 %
 * au focus (miroir d'iOS `textInputField`). Les couleurs restent à la charge de l'écran : l'accent
 * est un paramètre, jamais un littéral.
 */
public data class ComposerFocusBorder(
    val startSource: BorderColorSource,
    val startAlpha: Float,
    val endSource: BorderColorSource,
    val endAlpha: Float,
) {
    val isVisible: Boolean get() = startAlpha > 0f || endAlpha > 0f
}

public object ComposerFocusBorderPolicy {
    public fun resolve(focused: Boolean): ComposerFocusBorder =
        if (focused) {
            ComposerFocusBorder(BorderColorSource.Accent, 0.55f, BorderColorSource.Indigo600, 0.45f)
        } else {
            ComposerFocusBorder(BorderColorSource.Accent, 0f, BorderColorSource.Indigo600, 0f)
        }
}
