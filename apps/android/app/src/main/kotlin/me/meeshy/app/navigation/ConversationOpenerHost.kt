package me.meeshy.app.navigation

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import me.meeshy.app.R
import me.meeshy.sdk.conversation.ConversationOpenOutcome
import me.meeshy.sdk.conversation.ConversationOpener

/** What the single entry point asks the UI to do. */
sealed interface ConversationOpenEvent {
    data class Navigate(val route: String) : ConversationOpenEvent
    data class ShowError(val message: String) : ConversationOpenEvent
}

/** The error text shown by every entry point: title, then the underlying detail in parentheses. */
fun openConversationErrorMessage(title: String, detail: String?): String =
    if (detail.isNullOrBlank()) title else "$title ($detail)"

/**
 * Single site through which every by-id opening (notification, link, widget, shortcut) passes,
 * so the failure toast is identical whatever the entry. The UI collects [events].
 */
@Singleton
class ConversationOpenerHost internal constructor(
    private val opener: ConversationOpener,
    private val errorTitle: () -> String,
) {
    @Inject
    constructor(
        opener: ConversationOpener,
        @ApplicationContext context: Context,
    ) : this(opener, { context.getString(R.string.open_conversation_error) })

    private val mutableEvents = MutableSharedFlow<ConversationOpenEvent>(
        extraBufferCapacity = 8,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val events: SharedFlow<ConversationOpenEvent> = mutableEvents.asSharedFlow()

    /** Un echec hors de l'ouverture par id (ex. conversation directe impossible) : meme toast que partout. */
    fun reportOpenFailure(detail: String? = null) {
        mutableEvents.tryEmit(ConversationOpenEvent.ShowError(openConversationErrorMessage(errorTitle(), detail)))
    }

    suspend fun open(
        conversationId: String,
        highlightMessageId: String? = null,
        isKnown: Boolean = false,
    ) {
        val outcome = opener.open(conversationId, highlightMessageId, isKnown) { id, highlight ->
            mutableEvents.tryEmit(ConversationOpenEvent.Navigate(Routes.chat(id, highlight)))
        }
        if (outcome is ConversationOpenOutcome.Failed) {
            mutableEvents.tryEmit(
                ConversationOpenEvent.ShowError(openConversationErrorMessage(errorTitle(), outcome.detail)),
            )
        }
    }
}
