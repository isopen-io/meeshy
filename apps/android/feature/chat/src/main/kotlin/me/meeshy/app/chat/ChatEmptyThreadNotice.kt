package me.meeshy.app.chat

import androidx.annotation.StringRes
import me.meeshy.feature.chat.R

/**
 * Ce que dit un fil VIDE (#15105). Le cache peint toujours d'abord : ce texte ne paraît que lorsqu'il n'y a rien à
 * peindre. Il est traduit et dit la cause comprise par l'utilisateur — hors ligne, le fil attend le réseau ; en
 * ligne, il n'a pas pu se charger — jamais le texte de l'exception reçue (« Unable to resolve host … »), comme iOS,
 * qui tait l'échec réseau d'une ouverture.
 */
internal enum class ChatEmptyThreadNotice(@StringRes val text: Int, val offersRetry: Boolean) {
    NO_MESSAGES(R.string.chat_no_messages, offersRetry = false),
    OFFLINE(R.string.chat_history_offline, offersRetry = true),
    UNAVAILABLE(R.string.chat_history_unavailable, offersRetry = true),
}

internal fun ChatUiState.emptyThreadNotice(): ChatEmptyThreadNotice = when {
    isOffline -> ChatEmptyThreadNotice.OFFLINE
    errorMessage != null -> ChatEmptyThreadNotice.UNAVAILABLE
    else -> ChatEmptyThreadNotice.NO_MESSAGES
}
