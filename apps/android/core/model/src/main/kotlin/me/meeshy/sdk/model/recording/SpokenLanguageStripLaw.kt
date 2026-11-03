package me.meeshy.sdk.model.recording

import me.meeshy.sdk.model.LanguageData

public data class SpokenLanguageChip(val code: String, val flag: String, val nativeName: String)

/**
 * La bande de langue parlée de l'enregistreur (iOS `LanguageData.allLanguagesCommonFirst`) : langues courantes
 * d'abord, puis le reste. La langue choisie étiquette la prise pour la transcription et le Prisme.
 */
public object SpokenLanguageStripLaw {
    public const val FALLBACK_CODE: String = "fr"

    public val chips: List<SpokenLanguageChip> by lazy {
        LanguageData.allLanguagesCommonFirst.map { SpokenLanguageChip(it.code, it.flag, it.nativeName) }
    }

    /** La langue de départ : celle de l'appelant, nettoyée ; le français à défaut. */
    public fun initialSelection(preferred: String?): String =
        preferred?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: FALLBACK_CODE

    public fun isActive(chip: SpokenLanguageChip, selected: String): Boolean = chip.code == selected
}
