package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

/** Les trois densités : le glyphe seul devant un aperçu, la ligne sous un texte, la légende de verre sur un média (K51). */
public enum class MeeshyTranslationMarkDensity { Icon, Line, Legend }

/** Les trois modes : la traduction est servie, l'original est servi, ou l'annonce d'avant l'envoi. */
public enum class MeeshyTranslationMarkMode { Translated, Original, Announce }

@Immutable
public data class MeeshyTranslationMarkValues(
    val glyphSizeDp: Float,
    val textSizeSp: Float,
    val mentionWeight: Int,
    val toggleWeight: Int,
    val separatorSpacingDp: Float,
    val tapTargetDp: Float,
    val showsMention: Boolean,
    val showsToggle: Boolean,
    val showsSeparator: Boolean,
    val wrapsToggle: Boolean,
    val glyphIsMuted: Boolean,
    val toggleScale: Float,
    val toggleInkOpacity: Float,
    val toggleOpacity: Float,
    val acceptsToggle: Boolean,
    val crossfadeMillis: Int,
)

/**
 * **La recette de K51 en VALEURS** : mesures, graisses, bascule, fondu. Aucune couleur, aucun état : l'hôte remet
 * `isShowingOriginal`, la marque annonce ce que l'hôte rend et ne résout rien. Miroir de `MeeshyTranslationMarkRecipe` (iOS).
 */
public object MeeshyTranslationMarkRecipe {
    /** En deçà de cette largeur, le point s'en va et la bascule passe sous la mention. */
    public const val NARROW_WIDTH_DP: Float = 320f
    public const val PRESSED_SCALE: Float = 0.94f
    public const val PRESSED_INK_OPACITY: Float = 0.62f
    private const val PENDING_OPACITY: Float = 0.5f
    private const val CROSSFADE_MILLIS: Int = 200

    @Suppress("LongParameterList")
    public fun resolve(
        density: MeeshyTranslationMarkDensity,
        mode: MeeshyTranslationMarkMode,
        hasToggle: Boolean,
        isPressed: Boolean,
        isPending: Boolean,
        widthDp: Float,
        reduceMotion: Boolean,
    ): MeeshyTranslationMarkValues {
        val showsToggle = hasToggle && mode != MeeshyTranslationMarkMode.Announce && density != MeeshyTranslationMarkDensity.Icon
        val wraps = showsToggle && widthDp < NARROW_WIDTH_DP
        return MeeshyTranslationMarkValues(
            glyphSizeDp = 16f,
            textSizeSp = if (mode == MeeshyTranslationMarkMode.Announce) 13f else 12.5f,
            mentionWeight = 400,
            toggleWeight = 700,
            separatorSpacingDp = 7f,
            tapTargetDp = 44f,
            showsMention = density != MeeshyTranslationMarkDensity.Icon,
            showsToggle = showsToggle,
            showsSeparator = showsToggle && !wraps,
            wrapsToggle = wraps,
            glyphIsMuted = mode == MeeshyTranslationMarkMode.Original,
            toggleScale = if (showsToggle && isPressed) PRESSED_SCALE else 1f,
            toggleInkOpacity = if (showsToggle && isPressed) PRESSED_INK_OPACITY else 1f,
            toggleOpacity = if (isPending) PENDING_OPACITY else 1f,
            acceptsToggle = showsToggle && !isPending,
            crossfadeMillis = if (reduceMotion) 0 else CROSSFADE_MILLIS,
        )
    }

    /** Le mode se déduit du booléen de l'hôte ; `Announce` se passe explicitement. */
    public fun resolveMode(explicit: MeeshyTranslationMarkMode?, isShowingOriginal: Boolean): MeeshyTranslationMarkMode =
        explicit ?: if (isShowingOriginal) MeeshyTranslationMarkMode.Original else MeeshyTranslationMarkMode.Translated
}

/**
 * Les mots dits : le nom de langue est donné, déjà accordé, par l'hôte ; la marque ne le recompose jamais. Les gabarits
 * (« Traduit de %s ») viennent des ressources, passés par le composable.
 */
public class MeeshyTranslationMarkWords(
    private val translated: String,
    private val translatedFrom: (String) -> String,
    private val original: String,
    private val originalFrom: (String) -> String,
    private val showTranslation: String,
    private val showOriginal: String,
    private val valueOriginal: String,
    private val valueTranslated: String,
) {
    /** « Traduit de l'italien » / « Original en italien » ; sans langue : « Traduit » / « Original ». */
    public fun mention(mode: MeeshyTranslationMarkMode, languageName: String?): String {
        val name = languageName.orEmpty()
        return when {
            mode == MeeshyTranslationMarkMode.Original -> if (name.isEmpty()) original else originalFrom(name)
            name.isEmpty() -> translated
            else -> translatedFrom(name)
        }
    }

    /** Le verbe de la bascule : l'original quand la traduction est servie, et inversement. */
    public fun toggle(mode: MeeshyTranslationMarkMode): String =
        if (mode == MeeshyTranslationMarkMode.Original) showTranslation else showOriginal

    /** La valeur du bouton : ce qui est affiché en ce moment. */
    public fun toggleValue(mode: MeeshyTranslationMarkMode): String =
        if (mode == MeeshyTranslationMarkMode.Original) valueOriginal else valueTranslated
}
