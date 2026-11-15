package me.meeshy.sdk.model.composer.look

import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.scene.StoryTextBackground

/** Une passe de cuisson : la vitre d'un texte de verre (`null` en tête), puis l'encre qui se pose dessus. */
public data class ComposerRetouchBakeRun(val glass: StoryTextObject?, val ink: List<StoryTextObject>)

/**
 * **L'ORDRE DE CUISSON DES TEXTES** (iOS `ComposerRetouchTextRule.bakeRuns`, #12753) : les textes dans l'ordre du
 * rendu (z croissant, ordre de pose à z égal), coupés à chaque texte de verre — une vitre floute TOUT ce qui est
 * peint avant elle, prise et textes inférieurs, puis l'encre du verre et de ceux qui le suivent s'y pose.
 */
public object ComposerRetouchBake {
    public fun runs(texts: List<StoryTextObject>): List<ComposerRetouchBakeRun> {
        val ordered = texts.withIndex().sortedWith(compareBy({ it.value.zIndex }, { it.index })).map { it.value }
        val runs = ordered.fold(listOf(ComposerRetouchBakeRun(null, emptyList()))) { passes, text ->
            if (isGlass(text)) passes + ComposerRetouchBakeRun(text, listOf(text))
            else passes.dropLast(1) + passes.last().let { it.copy(ink = it.ink + text) }
        }
        return runs.filter { it.glass != null || it.ink.isNotEmpty() }
    }

    public fun isGlass(text: StoryTextObject): Boolean =
        StoryTextBackground.resolve(text.backgroundStyle, text.textBg) is StoryTextBackground.Glass
}
