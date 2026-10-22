package me.meeshy.app.chat

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * The window a built-in controller gets onto the screen's [ChatUiState]: a snapshot
 * ([value]), an observable ([flow]) and an atomic read-modify-write ([update]).
 *
 * It exists so a controller never holds the ViewModel — it receives this handle and its
 * own repositories, and is exercised in a plain coroutines-test with
 * `ChatStateAccess(MutableStateFlow(ChatUiState()))`, no Hilt, no ViewModel.
 */
internal class ChatStateAccess(private val source: MutableStateFlow<ChatUiState>) {

    val flow: StateFlow<ChatUiState> = source.asStateFlow()

    val value: ChatUiState get() = source.value

    fun update(transform: (ChatUiState) -> ChatUiState) {
        source.update(transform)
    }
}
