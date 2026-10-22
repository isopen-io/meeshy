package me.meeshy.ui.component.settings

import androidx.compose.runtime.Immutable

/** Contenu d'une fiche « (i) ». [id] est la clé de la LIGNE, pas son titre. */
@Immutable
public data class SettingsInfo(val id: String, val title: String, val message: String)
