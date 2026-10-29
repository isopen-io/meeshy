package me.meeshy.app.widget

import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.socket.PresenceStore

/**
 * Every `GlanceAppWidget` in `apps/android` is a `Hilt`-unsupported entry point
 * (unlike Activities/Fragments/Services/BroadcastReceivers) — it cannot use
 * field/constructor injection. [dagger.hilt.android.EntryPointAccessors] against
 * this shared interface is the documented Hilt pattern for reaching `@Singleton`
 * bindings from exactly this kind of caller (same shape as a `WorkManager`
 * `Worker` that isn't `@HiltWorker`).
 */
@EntryPoint
@InstallIn(SingletonComponent::class)
internal interface WidgetEntryPoint {
    fun conversationRepository(): ConversationRepository

    /**
     * Persisted current-user id — see [TokenStore.userId]'s doc for why a widget
     * reads this instead of `SessionRepository.currentUserId` (in-memory only,
     * unpopulated in a cold widget-update process).
     */
    fun tokenStore(): TokenStore

    /** La carte de présence vivante : l'état SERVI des pairs affichés, rien d'autre (#13747). */
    fun presenceStore(): PresenceStore
}
