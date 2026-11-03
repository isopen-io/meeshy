package me.meeshy.sdk.model.scene

/**
 * La couche que reçoivent les gestes (déplacer, pincer, tourner) — miroir de `CanvasManipulationLayer`.
 * [CANVAS] : slide vierge, aucune manipulation. [BACKGROUND] : un fond seul, il est manipulable.
 * [FOREGROUND] : au moins un objet de premier plan ; seul le premier plan se manipule, le fond est gelé.
 */
public enum class SceneManipulationLayer { CANVAS, BACKGROUND, FOREGROUND }

/**
 * La cascade de la couche manipulable, résolue en UN site (miroir de
 * `StoryCanvasUIView.resolveManipulationLayer`) : premier plan (média hors fond, texte, sticker, lieu)
 * > fond > vierge. Les deux jetons « Arrière-plan » / « Premier plan » forcent la couche, mais
 * seulement tant qu'elle correspond à du contenu réel — un jeton qui pointe une couche vide ne doit
 * jamais geler l'édition.
 */
public object SceneManipulationLayerRule {

    public fun resolve(hasForeground: Boolean, hasBackground: Boolean): SceneManipulationLayer = when {
        hasForeground -> SceneManipulationLayer.FOREGROUND
        hasBackground -> SceneManipulationLayer.BACKGROUND
        else -> SceneManipulationLayer.CANVAS
    }

    public fun resolve(lists: SceneLists, override: SceneManipulationLayer? = null): SceneManipulationLayer =
        resolve(hasForeground(lists), hasBackground(lists), override)

    public fun resolve(
        hasForeground: Boolean,
        hasBackground: Boolean,
        override: SceneManipulationLayer?,
    ): SceneManipulationLayer {
        val auto = resolve(hasForeground, hasBackground)
        return when (override) {
            SceneManipulationLayer.BACKGROUND -> if (hasBackground) SceneManipulationLayer.BACKGROUND else auto
            SceneManipulationLayer.FOREGROUND -> if (hasForeground) SceneManipulationLayer.FOREGROUND else auto
            SceneManipulationLayer.CANVAS, null -> auto
        }
    }

    /** Les sons ne comptent pas : leur puce ne bloque pas le cadrage du fond (comme sur iOS). */
    public fun hasForeground(lists: SceneLists): Boolean =
        lists.medias.any { !it.isBackground } ||
            lists.texts.isNotEmpty() ||
            lists.stickers.isNotEmpty() ||
            lists.places.isNotEmpty()

    public fun hasBackground(lists: SceneLists): Boolean = lists.medias.any { it.isBackground }
}
