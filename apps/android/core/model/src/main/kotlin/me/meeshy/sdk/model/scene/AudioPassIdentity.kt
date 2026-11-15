package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StorySlide

/**
 * Clé d'identité de la passe audio d'une slide — miroir de `currentSlideKey` +
 * `StorySlideStructureRules.fingerprint` (iOS). À clé égale le transport reprend sans
 * re-planifier (ni écho, ni retour à zéro) ; à clé neuve toute la passe est re-planifiée.
 *
 * Elle suit la COMPOSITION (id, rôle fond/premier plan des audios, identité des vidéos), jamais
 * une édition (déplacement, texte, volume) : la musique ne coupe pas pendant l'édition.
 */
object AudioPassIdentity {

    fun fingerprint(slide: StorySlide): String {
        val effects = slide.effects
        val parts = buildList {
            effects.mediaObjects.orEmpty().filter { it.mediaType == VIDEO }
                .forEach { add("v:${it.id}:${if (it.isBackground) 1 else 0}") }
            effects.audioPlayerObjects.orEmpty()
                .forEach { add("a:${it.id}:${if (it.isBackground == true) 1 else 0}") }
            add("bga:${effects.backgroundAudioId ?: "-"}")
        }
        return parts.sorted().joinToString("|")
    }

    fun key(slide: StorySlide, preferredLanguages: List<String>): String =
        "${slide.id}#${fingerprint(slide)}#${preferredLanguages.joinToString(",")}"

    private const val VIDEO = "video"
}
