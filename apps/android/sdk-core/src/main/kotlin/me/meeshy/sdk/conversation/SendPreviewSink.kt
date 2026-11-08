package me.meeshy.sdk.conversation

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import me.meeshy.sdk.model.ApiMessage

/**
 * Où l'aperçu de la liste de conversations apprend MON envoi : la bulle optimiste qui vient de naître, ou qui
 * vient d'être retirée. Une couture : le coordinateur d'envoi ne connaît pas la liste.
 */
interface SendPreviewSink {
    suspend fun staged(message: ApiMessage)

    suspend fun rolledBack(conversationId: String, sentId: String)
}

internal class LiveSendPreviewSink @Inject constructor(
    private val patcher: ConversationLivePatcher,
) : SendPreviewSink {
    override suspend fun staged(message: ApiMessage) {
        patcher.applyStaged(message)
    }

    override suspend fun rolledBack(conversationId: String, sentId: String) = patcher.applyRolledBack(conversationId, sentId)
}

@Module
@InstallIn(SingletonComponent::class)
internal interface SendPreviewModule {
    @Binds
    fun sendPreviewSink(impl: LiveSendPreviewSink): SendPreviewSink
}
