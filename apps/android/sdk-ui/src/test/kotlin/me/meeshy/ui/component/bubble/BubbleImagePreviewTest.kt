package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MeeshyImageVariant
import me.meeshy.sdk.model.MessageEffectFlags
import org.junit.Test

/**
 * La vignette d'une image en bulle : la PLUS PETITE variante WebP qui couvre la case,
 * jamais l'original multi-Mo — et rien de plus pour un contenu protégé.
 */
class BubbleImagePreviewTest {

    private object French : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private val ladder = listOf(
        MeeshyImageVariant(width = 640, height = 480, url = "/v/640.webp", size = 42_000),
        MeeshyImageVariant(width = 1080, height = 810, url = "/v/1080.webp", size = 120_000),
        MeeshyImageVariant(width = 1920, height = 1440, url = "/v/1920.webp", size = 300_000),
    )

    /** Une pièce DÉCLARÉE ordinaire : le fil a prouvé qu'aucun canal ne masque. */
    private fun photo(
        id: String = "a1",
        variants: List<MeeshyImageVariant>? = ladder,
        thumbnailUrl: String? = "/thumbs/a1.jpg",
        isViewOnce: Boolean? = false,
        isBlurred: Boolean? = false,
        effectFlags: Long? = 0L,
        isEncrypted: Boolean? = null,
    ) = ApiMessageAttachment(
        id = id,
        mimeType = "image/jpeg",
        fileUrl = "/files/$id.jpg",
        thumbnailUrl = thumbnailUrl,
        width = 4000,
        height = 3000,
        imageVariants = variants,
        isViewOnce = isViewOnce,
        isBlurred = isBlurred,
        effectFlags = effectFlags,
        isEncrypted = isEncrypted,
    )

    private fun build(
        vararg attachments: ApiMessageAttachment,
        density: Float = BubbleContentBuilder.DEFAULT_DISPLAY_DENSITY,
        effectFlags: Int? = null,
    ): BubbleContent = BubbleContentBuilder.build(
        message = ApiMessage(
            id = "m1",
            conversationId = "c1",
            senderId = "other",
            attachments = attachments.toList(),
            effectFlags = effectFlags,
        ),
        currentUserId = "me",
        preferences = French,
        mediaBaseUrl = "https://cdn.meeshy.me",
        displayDensity = density,
    )

    @Test
    fun `an optimistic image still on the device paints its local file, never a gateway route built from it`() {
        val local = "file:///data/user/0/me.meeshy.app/cache/sticker-1.png"
        val image = BubbleContentBuilder.build(
            message = ApiMessage(
                id = "cid-1",
                conversationId = "c1",
                senderId = "me",
                attachments = listOf(ApiMessageAttachment(id = "cmid-1", mimeType = "image/png", fileUrl = local, width = 512, height = 512)),
            ),
            currentUserId = "me",
            preferences = French,
            mediaBaseUrl = "https://gate.staging.meeshy.me/api/v1",
            displayDensity = BubbleContentBuilder.DEFAULT_DISPLAY_DENSITY,
        ).images.single()

        assertThat(image.url).isEqualTo(local)
    }

    @Test
    fun `a pending image whose octets are sealed paints its local preview until the server answers`() {
        val preview = "file:///data/user/0/me.meeshy.app/cache/pending-previews/cmid-1.jpg"
        val image = BubbleContentBuilder.build(
            message = ApiMessage(
                id = "cid-1",
                conversationId = "c1",
                senderId = "me",
                attachments = listOf(ApiMessageAttachment(id = "cmid-1", mimeType = "image/jpeg", thumbnailUrl = preview, width = 4000, height = 3000)),
            ),
            currentUserId = "me",
            preferences = French,
            mediaBaseUrl = "https://gate.staging.meeshy.me/api/v1",
            displayDensity = BubbleContentBuilder.DEFAULT_DISPLAY_DENSITY,
        ).images.single()

        assertThat(image.url).isEqualTo(preview)
        assertThat(image.thumbnailUrl).isEqualTo(preview)
        assertThat(image.width).isEqualTo(4000)
    }

    @Test
    fun `a pending video shows its local first frame and its duration, ready to play rather than to download`() {
        val poster = "file:///data/user/0/me.meeshy.app/cache/pending-previews/cmid-2.preview.jpg"
        val video = BubbleContentBuilder.build(
            message = ApiMessage(
                id = "cid-2",
                conversationId = "c1",
                senderId = "me",
                attachments = listOf(ApiMessageAttachment(id = "cmid-2", mimeType = "video/mp4", thumbnailUrl = poster, duration = 12_000, width = 1920, height = 1080)),
            ),
            currentUserId = "me",
            preferences = French,
            mediaBaseUrl = "https://gate.staging.meeshy.me/api/v1",
            displayDensity = BubbleContentBuilder.DEFAULT_DISPLAY_DENSITY,
        ).videos.single()

        assertThat(video.thumbnailUrl).isEqualTo(poster)
        assertThat(video.durationSeconds).isEqualTo(12)
        assertThat(video.isOnDevice).isTrue()
    }

    @Test
    fun `an image with neither its file nor a local preview paints nothing`() {
        val images = build(ApiMessageAttachment(id = "a1", mimeType = "image/jpeg", thumbnailUrl = "/thumbs/a1.jpg")).images

        assertThat(images).isEmpty()
    }

    @Test
    fun `a single image previews the smallest variant that covers its 252 dp cell`() {
        val image = build(photo()).images.single()

        // 252 dp x 3 = 756 px -> the 1080 rung, not the 4000 px original.
        assertThat(image.thumbnailUrl).isEqualTo("https://cdn.meeshy.me/v/1080.webp")
    }

    @Test
    fun `the full url stays the original for the viewer`() {
        val image = build(photo()).images.single()

        assertThat(image.url).isEqualTo("https://cdn.meeshy.me/files/a1.jpg")
    }

    @Test
    fun `an image in a grid previews the variant covering its smaller 124 dp cell`() {
        val images = build(photo(id = "a1"), photo(id = "a2")).images

        // 124 dp x 3 = 372 px -> the 640 rung.
        assertThat(images.map { it.thumbnailUrl }).containsExactly(
            "https://cdn.meeshy.me/v/640.webp",
            "https://cdn.meeshy.me/v/640.webp",
        )
    }

    @Test
    fun `a denser screen asks for a bigger variant`() {
        val image = build(photo(), density = 4f).images.single()

        // 252 dp x 4 = 1008 px -> still the 1080 rung; 5x would need 1260 -> 1920.
        assertThat(image.thumbnailUrl).isEqualTo("https://cdn.meeshy.me/v/1080.webp")
        assertThat(build(photo(), density = 5f).images.single().thumbnailUrl)
            .isEqualTo("https://cdn.meeshy.me/v/1920.webp")
    }

    @Test
    fun `an image without variants keeps its server thumbnail`() {
        val image = build(photo(variants = null)).images.single()

        assertThat(image.thumbnailUrl).isEqualTo("https://cdn.meeshy.me/thumbs/a1.jpg")
    }

    @Test
    fun `an image without variants and without thumbnail has no preview`() {
        val image = build(photo(variants = null, thumbnailUrl = null)).images.single()

        assertThat(image.thumbnailUrl).isNull()
    }

    @Test
    fun `when the original is the best pick the server thumbnail stays`() {
        val image = build(photo(variants = ladder.take(1))).images.single()

        // 756 px is wider than the only 640 variant and the original is wider still.
        assertThat(image.thumbnailUrl).isEqualTo("https://cdn.meeshy.me/thumbs/a1.jpg")
    }

    @Test
    fun `a view once attachment keeps its previous urls - no variant url leaves for a secret`() {
        val image = build(photo(isViewOnce = true)).images.single()

        assertThat(image.thumbnailUrl).isEqualTo("https://cdn.meeshy.me/thumbs/a1.jpg")
    }

    @Test
    fun `a blurred attachment keeps its previous urls`() {
        assertThat(build(photo(isBlurred = true)).images.single().thumbnailUrl)
            .isEqualTo("https://cdn.meeshy.me/thumbs/a1.jpg")
    }

    @Test
    fun `an attachment masked by the bitfield alone keeps its previous urls`() {
        assertThat(build(photo(effectFlags = MessageEffectFlags.VIEW_ONCE)).images.single().thumbnailUrl)
            .isEqualTo("https://cdn.meeshy.me/thumbs/a1.jpg")
    }

    @Test
    fun `an attachment that declares nothing is treated as protected`() {
        val silent = photo(isViewOnce = null, isBlurred = null, effectFlags = null)

        assertThat(build(silent).images.single().thumbnailUrl).isEqualTo("https://cdn.meeshy.me/thumbs/a1.jpg")
    }

    @Test
    fun `an ordinary attachment of a view once message keeps its previous urls`() {
        val content = build(photo(), effectFlags = MessageEffectFlags.VIEW_ONCE.toInt())

        assertThat(content.images.single().thumbnailUrl).isEqualTo("https://cdn.meeshy.me/thumbs/a1.jpg")
    }

    @Test
    fun `an ordinary attachment of a blurred message keeps its previous urls`() {
        val content = build(photo(), effectFlags = MessageEffectFlags.BLURRED.toInt())

        assertThat(content.images.single().thumbnailUrl).isEqualTo("https://cdn.meeshy.me/thumbs/a1.jpg")
    }

    @Test
    fun `an encrypted image keeps its previous urls`() {
        val image = build(photo(isEncrypted = true)).images.single()

        assertThat(image.thumbnailUrl).isEqualTo("https://cdn.meeshy.me/thumbs/a1.jpg")
    }

    @Test
    fun `a decorative effect on the message does not stop the lighter preview`() {
        val content = build(photo(), effectFlags = MessageEffectFlags.CONFETTI.toInt())

        assertThat(content.images.single().thumbnailUrl).isEqualTo("https://cdn.meeshy.me/v/1080.webp")
    }

    @Test
    fun `a message without attachments is untouched`() {
        assertThat(build().images).isEmpty()
    }
    @Test
    fun `les reactions d'une piece se lisent sur sa tuile, les plus posees d'abord, avec le total`() {
        val image = build(photo().copy(reactionSummary = mapOf("😂" to 1, "👍" to 2, "❤️" to 1, "🔥" to 1))).images.single()

        // À égalité, l'ordre est celui des emojis : la bande ne saute pas d'un rendu à l'autre.
        assertThat(image.reactionLabel).isEqualTo("👍❤️🔥 5")
    }

    @Test
    fun `une seule reaction n'affiche que son emoji, aucune reaction aucune etiquette`() {
        assertThat(build(photo().copy(reactionSummary = mapOf("👍" to 1))).images.single().reactionLabel).isEqualTo("👍")
        assertThat(build(photo().copy(reactionSummary = mapOf("👍" to 0))).images.single().reactionLabel).isNull()
        assertThat(build(photo()).images.single().reactionLabel).isNull()
    }

    @Test
    fun `une piece protegee ou un message floute ne montre aucune reaction`() {
        val reactions = mapOf("👍" to 2)

        assertThat(build(photo().copy(reactionSummary = reactions, isBlurred = true)).images.single().reactionLabel).isNull()
        assertThat(build(photo().copy(reactionSummary = reactions, isViewOnce = true)).images.single().reactionLabel).isNull()
        assertThat(build(photo().copy(reactionSummary = reactions), effectFlags = MessageEffectFlags.BLURRED.toInt()).images.single().reactionLabel).isNull()
    }

    @Test
    fun `a pending voice note plays its local copy before the server answers`() {
        val audio = build(
            ApiMessageAttachment(
                id = "upload-0",
                mimeType = "audio/mp4",
                fileUrl = "file:///data/cache/pending-previews/upload-0.voice.m4a",
                duration = 4_000,
                effectFlags = 0L,
            ),
        ).audios.single()

        assertThat(audio.url).isEqualTo("file:///data/cache/pending-previews/upload-0.voice.m4a")
        assertThat(audio.isPlayable).isTrue()
        assertThat(audio.durationSeconds).isEqualTo(4)
    }
}
