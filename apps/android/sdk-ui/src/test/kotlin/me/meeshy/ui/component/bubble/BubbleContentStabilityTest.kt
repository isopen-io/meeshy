package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * La liste saute une bulle dont le contenu est ÉGAL (Compose compare les `@Immutable data class`) :
 * l'égalité doit donc bouger dès qu'un champ mutable d'une pièce bouge, et seulement alors.
 */
class BubbleContentStabilityTest {

    private fun bubble(
        images: List<BubbleImage> = emptyList(),
        videos: List<BubbleVideo> = emptyList(),
        audios: List<BubbleAudio> = emptyList(),
        files: List<BubbleFile> = emptyList(),
    ) = BubbleContent(
        messageId = "m1",
        text = "t",
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = null,
        showSenderName = false,
        isEdited = false,
        isDeleted = false,
        createdAtIso = "2026-06-11T08:00:00Z",
        images = images,
        videos = videos,
        audios = audios,
        files = files,
    )

    private val image = BubbleImage(attachmentId = "i1", url = "https://cdn/i1.jpg", thumbnailUrl = "https://cdn/i1-t.jpg", width = 800, height = 600)
    private val video = BubbleVideo(attachmentId = "v1", url = "https://cdn/v1.mp4", thumbnailUrl = "https://cdn/v1.jpg", width = 1080, height = 1920, durationSeconds = 12)
    private val audio = BubbleAudio(attachmentId = "a1", url = "https://cdn/a1.m4a", durationSeconds = 12)
    private val file = BubbleFile(attachmentId = "f1", name = "doc.pdf", url = "https://cdn/f1.pdf", sizeBytes = 10)

    @Test
    fun `deux contenus identiques sont egaux et de meme hash`() {
        val a = bubble(listOf(image), listOf(video), listOf(audio), listOf(file))
        val b = bubble(listOf(image.copy()), listOf(video.copy()), listOf(audio.copy()), listOf(file.copy()))

        assertThat(a).isEqualTo(b)
        assertThat(a.hashCode()).isEqualTo(b.hashCode())
    }

    @Test
    fun `une image dont la miniature, les dimensions, la reaction ou la protection change n'est plus egale`() {
        val base = bubble(listOf(image))
        assertThat(bubble(listOf(image.copy(thumbnailUrl = "https://cdn/other.jpg")))).isNotEqualTo(base)
        assertThat(bubble(listOf(image.copy(width = 801)))).isNotEqualTo(base)
        assertThat(bubble(listOf(image.copy(height = 599)))).isNotEqualTo(base)
        assertThat(bubble(listOf(image.copy(reactionLabel = "❤️ 2")))).isNotEqualTo(base)
        assertThat(bubble(listOf(image.copy(isProtected = true)))).isNotEqualTo(base)
        assertThat(bubble(listOf(image.copy(sizeBytes = 99L)))).isNotEqualTo(base)
    }

    @Test
    fun `une video dont la miniature, la duree, les dimensions ou la protection change n'est plus egale`() {
        val base = bubble(videos = listOf(video))
        assertThat(bubble(videos = listOf(video.copy(thumbnailUrl = "https://cdn/x.jpg")))).isNotEqualTo(base)
        assertThat(bubble(videos = listOf(video.copy(durationSeconds = 13)))).isNotEqualTo(base)
        assertThat(bubble(videos = listOf(video.copy(width = 720)))).isNotEqualTo(base)
        assertThat(bubble(videos = listOf(video.copy(height = 1280)))).isNotEqualTo(base)
        assertThat(bubble(videos = listOf(video.copy(isProtected = true)))).isNotEqualTo(base)
        assertThat(bubble(videos = listOf(video.copy(isOnDevice = true)))).isNotEqualTo(base)
    }

    @Test
    fun `un audio dont la duree ou la transcription change n'est plus egal`() {
        val base = bubble(audios = listOf(audio))
        assertThat(bubble(audios = listOf(audio.copy(durationSeconds = 13)))).isNotEqualTo(base)
        assertThat(bubble(audios = listOf(audio.copy(transcriptionText = "bonjour")))).isNotEqualTo(base)
        assertThat(bubble(audios = listOf(audio.copy(isAudioTranslated = true)))).isNotEqualTo(base)
    }

    @Test
    fun `un fichier dont la miniature, les dimensions ou l'etat local change n'est plus egal`() {
        val base = bubble(files = listOf(file))
        assertThat(bubble(files = listOf(file.copy(thumbnailUrl = "https://cdn/t.jpg")))).isNotEqualTo(base)
        assertThat(bubble(files = listOf(file.copy(width = 10)))).isNotEqualTo(base)
        assertThat(bubble(files = listOf(file.copy(isOnDevice = true)))).isNotEqualTo(base)
        assertThat(bubble(files = listOf(file.copy(isProtected = true)))).isNotEqualTo(base)
    }

    @Test
    fun `le flou d'un message et ses reactions deplacent aussi l'egalite`() {
        val base = bubble()
        assertThat(base.copy(blurReveal = BubbleBlurRevealSpec(isViewOnce = true))).isNotEqualTo(base)
        assertThat(base.copy(reactions = listOf(ReactionEntry("👍", 1)))).isNotEqualTo(base)
        assertThat(base.copy(reactions = listOf(ReactionEntry("👍", 2)))).isNotEqualTo(base.copy(reactions = listOf(ReactionEntry("👍", 1))))
    }
}
