package me.meeshy.sdk.model.playback

import me.meeshy.sdk.model.AudioPlayerChrome
import me.meeshy.sdk.model.AudioPlayerChromePlan
import me.meeshy.sdk.model.media.MediaPlayerContext

/**
 * **Le bandeau de langues sous un lecteur vocal** (iOS `AudioLanguageStrip`) : la pastille « Original » puis une pastille
 * par piste traduite. Il se montre dans les postures carte et focalisée, jamais dans un contexte compact (la bulle, dont le
 * pied porte déjà les drapeaux) et seulement quand une piste traduite existe.
 */
public object AudioLanguageStripLaw {

    /** La sentinelle de la pastille « Original » (iOS : le code `"orig"`). */
    public const val ORIGINAL: String = "orig"

    public data class Pill(val code: String, val isSelected: Boolean) {
        public val isOriginal: Boolean get() = code == ORIGINAL
    }

    public fun isShown(chrome: AudioPlayerChrome, context: MediaPlayerContext, translatedCount: Int): Boolean =
        AudioPlayerChromePlan.plan(chrome).showsLanguageStrip && !context.isCompact && translatedCount > 0

    /**
     * Les pastilles, dans l'ordre des pistes servies, dédoublonnées et en minuscules. [selected] est la langue jouée :
     * `null` ou [ORIGINAL] sélectionne l'original.
     */
    public fun pills(translated: List<String>, selected: String?): List<Pill> {
        val current = selected?.trim()?.lowercase()?.takeIf { it.isNotEmpty() && it != ORIGINAL }
        val codes = translated.map { it.trim().lowercase() }.filter { it.isNotEmpty() && it != ORIGINAL }.distinct()
        return listOf(Pill(ORIGINAL, isSelected = current == null)) + codes.map { Pill(it, isSelected = it == current) }
    }

    /** La bascule qu'un toucher pose : la sentinelle la lève (`null`), une langue la nomme en minuscules. */
    public fun overrideFor(code: String): String? =
        code.trim().lowercase().takeIf { it.isNotEmpty() && it != ORIGINAL }
}
