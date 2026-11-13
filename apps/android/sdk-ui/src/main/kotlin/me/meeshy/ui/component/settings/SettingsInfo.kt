package me.meeshy.ui.component.settings

import androidx.compose.runtime.Immutable

/**
 * Contenu d'une fiche « (i) ». [id] est la clé de la LIGNE, pas son titre. [question] est le nom accessible
 * du bouton (i) quand l'écran suit l'épure (#17584) : la QUESTION à laquelle la note répond, jamais
 * « Plus d'infos » ; absente, le nom reste « En savoir plus sur [title] ».
 */
@Immutable
public data class SettingsInfo(val id: String, val title: String, val message: String, val question: String? = null)
