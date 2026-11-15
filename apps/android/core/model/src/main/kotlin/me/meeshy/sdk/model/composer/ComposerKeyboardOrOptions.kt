package me.meeshy.sdk.model.composer

import kotlin.math.max
import kotlin.math.min

/**
 * L'état de frappe du compositeur (#13835, maquette du 2026-10-30, état 2) : une barre de style fine, collée au clavier,
 * et sous elle le clavier OU les choix d'une de ses icônes, jamais les deux (iOS #6156). Les choix prennent la hauteur du
 * dernier clavier mesuré : la barre ne bouge pas quand l'un remplace l'autre, et la scène non plus. La scène est le plus
 * grand 9:16 ENTIER au-dessus de la barre — réduite, jamais couverte.
 *
 * Toutes les longueurs sont dans la même unité (le dp, à l'écran) ; aucune dépendance Android.
 */
object ComposerKeyboardOrOptions {

    /** Les quatre icônes de la barre, dans l'ordre de la maquette : Aa, ●, ≡, ▣ (OK n'ouvre rien, il termine). */
    enum class Options { FONT, COLOR, ALIGN, BACKING }

    sealed interface Surface {
        data object Keyboard : Surface
        data class Showing(val options: Options) : Surface
    }

    const val BAR_HEIGHT: Float = 48f
    const val SCENE_MARGIN: Float = 14f
    const val DEFAULT_OPTIONS_HEIGHT: Float = 280f
    const val MAX_OPTIONS_FRACTION: Float = 0.45f

    val initial: Surface = Surface.Keyboard

    /**
     * Ce que montre chaque icône : Aa la police, puis la taille et l'effet, puis la langue du texte ; ● la couleur puis le
     * contour ; ≡ l'alignement ; ▣ le fond du texte puis son cadre. Ensemble, elles servent CHAQUE réglage d'un texte.
     */
    fun tools(options: Options): List<TextEditTool> = when (options) {
        Options.FONT -> listOf(TextEditTool.STYLE, TextEditTool.EFFECT, TextEditTool.LANGUAGE)
        Options.COLOR -> listOf(TextEditTool.COLOR, TextEditTool.BORDER)
        Options.ALIGN -> listOf(TextEditTool.ALIGN)
        Options.BACKING -> listOf(TextEditTool.BACKGROUND, TextEditTool.FRAME)
    }

    /** Toucher une icône montre ses choix à la place du clavier ; toucher celle qui est ouverte rend le clavier. */
    fun iconTapped(surface: Surface, options: Options): Surface =
        if (surface == Surface.Showing(options)) Surface.Keyboard else Surface.Showing(options)

    /** Le clavier qui remonte — l'auteur a touché son texte — ferme les choix. */
    @Suppress("UNUSED_PARAMETER")
    fun keyboardRaised(surface: Surface): Surface = Surface.Keyboard

    /** La hauteur du dernier clavier, retenue une fois posé (fin d'animation) : c'est celle que prendront les choix. */
    fun rememberedKeyboard(previous: Float, ime: Float, imeTarget: Float): Float =
        if (ime > 0f && ime == imeTarget) ime else previous

    /**
     * La place réservée sous la barre. Les choix : la hauteur du dernier clavier (ou une hauteur bornée s'il n'y en a jamais
     * eu). Le clavier : ce qu'il occupe, mais pas moins que le dernier clavier tant qu'il remonte — revenir des choix au
     * clavier ne fait pas sauter la barre. Un clavier rangé par le système libère sa place.
     */
    fun reserve(surface: Surface, ime: Float, imeTarget: Float, lastKeyboard: Float, windowHeight: Float): Float = when (surface) {
        is Surface.Showing -> optionsHeight(lastKeyboard, windowHeight)
        Surface.Keyboard -> if (imeTarget > 0f) max(ime, lastKeyboard) else ime
    }

    fun optionsHeight(lastKeyboard: Float, windowHeight: Float): Float =
        if (lastKeyboard > 0f) lastKeyboard else min(DEFAULT_OPTIONS_HEIGHT, windowHeight * MAX_OPTIONS_FRACTION)

    /** La scène peinte, en coordonnées de la fenêtre, et le cadrage qui la pose depuis son cadre au repos (en haut, centré). */
    data class SceneBox(val left: Float, val top: Float, val width: Float, val height: Float, val framing: StoryCanvasFraming.Result) {
        val bottom: Float get() = top + height
    }

    /**
     * Le plus grand 9:16 entier entre le haut de la fenêtre et le haut de la barre, centré : le cadre au repos
     * ([frameWidth] × [frameHeight], posé en haut de la fenêtre) n'est que réduit, jamais agrandi. La marge haute vient
     * avec la réduction, pour qu'aucun saut ne marque le moment où le clavier touche la scène.
     */
    fun scene(frameWidth: Float, frameHeight: Float, windowHeight: Float, reserve: Float, barHeight: Float = BAR_HEIGHT): SceneBox {
        val regionBottom = windowHeight - reserve - barHeight - SCENE_MARGIN
        val overlap = (frameHeight - regionBottom).coerceIn(0f, SCENE_MARGIN)
        val framing = StoryCanvasFraming.resolve(
            StoryCanvasFraming.Input(
                viewportWidth = frameWidth,
                viewportHeight = frameHeight,
                headerInset = overlap,
                bottomInset = max(0f, frameHeight - regionBottom),
                presentation = StoryCanvasFraming.Presentation.CARDED,
                cardedCornerRadius = 0f,
                verticalAlignment = StoryCanvasFraming.VerticalAlignment.TOP,
            ),
        )
        val width = frameWidth * framing.scale
        val height = frameHeight * framing.scale
        val top = frameHeight / 2f + framing.offsetY - height / 2f
        return SceneBox(left = (frameWidth - width) / 2f, top = top, width = width, height = height, framing = framing)
    }
}
