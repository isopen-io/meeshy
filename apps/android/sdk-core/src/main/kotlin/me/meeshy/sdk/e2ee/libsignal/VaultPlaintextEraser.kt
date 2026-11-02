package me.meeshy.sdk.e2ee.libsignal

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.e2ee.EndToEndPlaintextEraser
import me.meeshy.sdk.session.SessionRepository

/** Le coffre libsignal de CET appareil, vidé pour le seul compte de la session (#13000, #14633). */
@Singleton
internal class VaultPlaintextEraser @Inject constructor(
    private val runtime: EndToEndMessagingRuntime,
    private val session: SessionRepository,
) : EndToEndPlaintextEraser {
    override suspend fun erase(messageIds: Collection<String>) {
        if (messageIds.isEmpty()) return
        val userId = session.currentUserId ?: return
        runtime.erase(userId, messageIds)
    }
}
