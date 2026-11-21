package me.meeshy.ui.component.focal

import androidx.compose.runtime.compositionLocalOf

/**
 * #19790 — l'identifiant de l'appel que le serveur dit VIVANT dans la conversation ouverte (son appel actif), ou `null`.
 * Fourni une fois par la liste du chat, lu par la seule carte d'appel : une carte `call-live` ne propose « Rejoindre »
 * que si son appel est celui-ci ([me.meeshy.sdk.model.reading.focal.FocalCallNoticePresenter]). Seules les cartes
 * d'appel le lisent, donc seules elles se recomposent quand il change.
 */
public val LocalFocalLiveCallId = compositionLocalOf<String?> { null }
