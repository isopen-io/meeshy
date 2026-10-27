package me.meeshy.ui.component.bubble

import androidx.compose.runtime.compositionLocalOf

/**
 * `audio.autoTranscribeIncoming` (iOS `UserPreferencesManager.shared.audio`), lu une fois à la racine
 * et fourni à tout l'arbre : le SDK ne connaît pas le magasin de préférences, il reçoit une valeur
 * opaque (SDK Purity). Actif par défaut — aperçus et tests voient la transcription.
 */
public val LocalAutoRevealTranscription = compositionLocalOf { true }
