package me.meeshy.sdk.model.speech

import me.meeshy.sdk.model.LanguageData
import java.util.Locale

public data class RecognitionLanguageOption(val code: String, val name: String)

/**
 * La liste du sélecteur de langue de reconnaissance (iOS `AudioLanguagePickerView.listedLocales`) : par défaut seules les
 * langues dont le modèle est installé sur l'appareil, « Afficher toutes les langues » les liste toutes ; la recherche
 * porte sur le nom et sur le code ; tri par nom.
 */
public object RecognitionLanguageList {
    public fun options(installedTags: Set<String>, showAll: Boolean, query: String): List<RecognitionLanguageOption> {
        val installedCodes = installedTags.map(::primaryCode).toSet()
        val needle = query.trim().lowercase()
        return LanguageData.allLanguages
            .asSequence()
            .filter { showAll || it.code.lowercase() in installedCodes }
            .map { RecognitionLanguageOption(it.code, it.nativeName.replaceFirstChar { c -> c.titlecase(Locale.ROOT) }) }
            .filter { needle.isEmpty() || it.name.lowercase().contains(needle) || it.code.lowercase().contains(needle) }
            .sortedBy { it.name.lowercase() }
            .toList()
    }

    public fun isSelected(option: RecognitionLanguageOption, selected: String): Boolean =
        primaryCode(option.code) == primaryCode(selected)

    private fun primaryCode(tag: String): String = tag.substringBefore('-').substringBefore('_').lowercase()
}
