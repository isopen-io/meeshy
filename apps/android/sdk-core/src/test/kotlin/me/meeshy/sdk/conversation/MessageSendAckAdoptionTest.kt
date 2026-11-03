package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import me.meeshy.sdk.media.MediaAdoption
import me.meeshy.sdk.media.MediaCacheDirs
import me.meeshy.sdk.media.OwnedMediaRoots
import me.meeshy.sdk.media.TypedMediaCache
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** #14890 — l'accusé d'un envoi fait rejoindre le cache typé au fichier local de la pièce optimiste. */
@RunWith(RobolectricTestRunner::class)
class MessageSendAckAdoptionTest {
    @get:Rule val folder = TemporaryFolder()

    private val sender = MeeshyUser(id = "me", username = "atabeth", displayName = "Atabeth")
    private val remote = "https://gate.meeshy.me/api/v1/static/u/2026/photo.jpg"

    @Test
    fun `l'accuse adopte le fichier local sous l'adresse canonique`() = runHarnessTest { harness ->
        val cache = TypedMediaCache(MediaCacheDirs(folder.newFolder("cache"), folder.root))
        val owned = folder.newFolder("owned")
        val adoption = MediaAdoption(cache, { "https://gate.meeshy.me/api/v1/" }, OwnedMediaRoots(listOf(owned))::owns, Dispatchers.Unconfined)
        val coordinator = MessageSendCoordinator(harness.database, harness.database.messageDao(), harness.outbox, harness.clock, adoption = adoption)
        val file = java.io.File(owned, "photo.jpg").apply { writeBytes(ByteArray(20) { 1 }) }
        val local = ApiMessageAttachment(id = "att1", fileUrl = file.toURI().toString(), mimeType = "image/jpeg")
        val cid = coordinator.sendOptimistic("c1", "", "fr", sender, messageType = "image", attachments = listOf(local))

        coordinator.reconcileSent(
            cid,
            ApiMessage(
                id = "srv1",
                conversationId = "c1",
                createdAt = "2026-06-01T10:00:00Z",
                clientMessageId = cid,
                attachments = listOf(ApiMessageAttachment(id = "att1", fileUrl = remote, mimeType = "image/jpeg")),
            ),
        )

        assertThat(cache.contains(MediaCacheCategory.IMAGES, remote)).isTrue()
        assertThat(file.exists()).isFalse()
    }
}
