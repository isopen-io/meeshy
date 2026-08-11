package me.meeshy.app.widget

import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.conversation.ConversationRepository

/**
 * [UnreadCountWidget] is a `GlanceAppWidget`, not a Hilt-supported Android entry
 * point (unlike Activities/Fragments/Services/BroadcastReceivers) — it cannot use
 * field/constructor injection. [dagger.hilt.android.EntryPointAccessors] against
 * this interface is the documented Hilt pattern for reaching a `@Singleton`
 * binding from exactly this kind of caller (same shape as a `WorkManager`
 * `Worker` that isn't `@HiltWorker`).
 */
@EntryPoint
@InstallIn(SingletonComponent::class)
internal interface UnreadWidgetEntryPoint {
    fun conversationRepository(): ConversationRepository
}
