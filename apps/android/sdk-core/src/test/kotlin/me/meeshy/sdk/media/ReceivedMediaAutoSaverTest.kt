package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.MediaSaveOutcome
import me.meeshy.sdk.model.WireDate
import org.junit.Test

/** #14642 — l'enregistrement automatique des médias reçus, piloté par `privacy.saveMediaToGallery`. */
class ReceivedMediaAutoSaverTest {

    private class Harness(
        var enabled: Boolean = true,
        var userId: String? = "me",
        var allowed: (MediaKind, Long?) -> Boolean = { _, _ -> true },
        var outcome: MediaSaveOutcome = MediaSaveOutcome.SAVED,
    ) {
        val written = mutableListOf<String>()
        val claims = InMemoryAutoSavedAttachmentClaims()
        val saver = ReceivedMediaAutoSaver(
            isEnabled = { enabled },
            currentUserId = { userId },
            installedAtMillis = { WireDate.epochMillis("2026-11-01T00:00:00.000Z")!! },
            downloadAllowed = { kind, size -> allowed(kind, size) },
            claims = claims,
            writer = { attachment -> written += attachment.id; outcome },
        )
    }

    private fun photo(id: String, size: Int? = 500_000, mime: String = "image/jpeg") = ApiMessageAttachment(
        id = id, mimeType = mime, fileUrl = "https://x/$id", fileSize = size,
        isViewOnce = false, isBlurred = false, effectFlags = 0L,
    )

    private fun received(vararg attachments: ApiMessageAttachment) = ApiMessage(
        id = "m", conversationId = "c", senderId = "friend",
        createdAt = "2026-11-02T10:00:00.000Z", attachments = attachments.toList(),
    )

    @Test
    fun disabledByTheUser_nothingReachesTheGallery() = runTest {
        val h = Harness(enabled = false)
        h.saver.consider(received(photo("a")))
        assertThat(h.written).isEmpty()
    }

    @Test
    fun enabled_aReceivedPhotoAndVideo_areSaved_onceEach_evenWhenSeenTwice() = runTest {
        val h = Harness()
        val message = received(photo("a"), photo("v", mime = "video/mp4"))
        h.saver.consider(message)
        h.saver.consider(message)
        assertThat(h.written).containsExactly("a", "v").inOrder()
    }

    @Test
    fun alreadyPresentInTheGallery_isASuccess_soItIsNotRetried() = runTest {
        val h = Harness(outcome = MediaSaveOutcome.ALREADY_PRESENT)
        h.saver.consider(received(photo("a")))
        h.saver.consider(received(photo("a")))
        assertThat(h.written).containsExactly("a")
    }

    @Test
    fun aFailedWrite_releasesThePiece_soTheNextReceptionRetries() = runTest {
        val h = Harness(outcome = MediaSaveOutcome.FAILED)
        h.saver.consider(received(photo("a")))
        h.outcome = MediaSaveOutcome.SAVED
        h.saver.consider(received(photo("a")))
        assertThat(h.written).containsExactly("a", "a")
    }

    @Test
    fun theNetworkPolicy_holdsBackALargeMedia_butNotOneUnder100Ko() = runTest {
        val h = Harness(allowed = { _, size -> size != null && size < 102_400 })
        h.saver.consider(received(photo("big", size = 2_000_000), photo("small", size = 99_999)))
        assertThat(h.written).containsExactly("small")
    }

    @Test
    fun withoutASession_orForMyOwnMessage_nothingIsSaved() = runTest {
        val h = Harness(userId = null)
        h.saver.consider(received(photo("a")))
        h.userId = "friend"
        h.saver.consider(received(photo("b")))
        assertThat(h.written).isEmpty()
    }

    @Test
    fun aProtectedMessage_isNeverSaved() = runTest {
        val h = Harness()
        h.saver.consider(received(photo("a")).copy(isViewOnce = true))
        h.saver.consider(received(photo("b")).copy(ephemeralDuration = 10))
        h.saver.consider(received(photo("c")).copy(isEncrypted = true))
        assertThat(h.written).isEmpty()
    }

    @Test
    fun listening_savesEachMessageArrivingOnTheSocket() = runTest {
        val h = Harness()
        val socket = MutableSharedFlow<ApiMessage>()
        val job = h.saver.listen(this, socket)
        advanceUntilIdle()
        socket.emit(received(photo("a")))
        socket.emit(received(photo("b")))
        advanceUntilIdle()
        job.cancel()
        assertThat(h.written).containsExactly("a", "b")
    }

    @Test
    fun theClaims_areBounded() {
        val claims = InMemoryAutoSavedAttachmentClaims(capacity = 2)
        assertThat(claims.claim("a")).isTrue()
        assertThat(claims.claim("a")).isFalse()
        claims.claim("b")
        claims.claim("c")
        assertThat(claims.claim("a")).isTrue()
    }
}
