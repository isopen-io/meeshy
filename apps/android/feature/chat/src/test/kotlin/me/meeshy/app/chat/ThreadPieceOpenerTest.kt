package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.MessageExitOffer
import me.meeshy.ui.component.bubble.BubbleBlurRevealSpec
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleFile
import org.junit.Test

class ThreadPieceOpenerTest {
    private fun bubble(
        isViewOnce: Boolean = false,
        isViewOnceOpenedByMe: Boolean = false,
        isBlurred: Boolean = false,
        isDeleted: Boolean = false,
        exitOffer: MessageExitOffer = MessageExitOffer.Unrestricted,
    ) = BubbleContent(
        messageId = "m1",
        text = "",
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = null,
        senderAvatarUrl = null,
        showSenderName = false,
        isEdited = false,
        isDeleted = isDeleted,
        createdAtIso = null,
        isViewOnce = isViewOnce,
        isViewOnceOpenedByMe = isViewOnceOpenedByMe,
        isBlurred = isBlurred,
        exitOffer = exitOffer,
        blurReveal = if (isViewOnce || isBlurred) BubbleBlurRevealSpec(isViewOnce = isViewOnce) else null,
    )

    private fun video(isProtected: Boolean = false, isSealed: Boolean = false, url: String? = "https://gate.meeshy.me/v.mp4") =
        BubbleFile(attachmentId = "a1", name = "v.mp4", url = url, isVideo = true, isProtected = isProtected, isSealed = isSealed)

    private val document = BubbleFile(attachmentId = "a2", name = "cv.pdf", url = "https://gate.meeshy.me/cv.pdf")

    @Test
    fun `une video du fil s'ouvre dans le lecteur integre, en clair`() {
        assertThat(ThreadPieceOpener.of(bubble(), video()))
            .isEqualTo(ThreadPieceOpening.Video("https://gate.meeshy.me/v.mp4", secure = false))
    }

    @Test
    fun `un autre fichier garde l'ouverture externe`() {
        assertThat(ThreadPieceOpener.of(bubble(), document)).isEqualTo(ThreadPieceOpening.ExternalFile)
    }

    @Test
    fun `une video protegee s'ouvre dans la couche securisee`() {
        assertThat((ThreadPieceOpener.of(bubble(isViewOnce = true), video(isProtected = true)) as ThreadPieceOpening.Video).secure).isTrue()
        assertThat((ThreadPieceOpener.of(bubble(isBlurred = true), video(isProtected = true)) as ThreadPieceOpening.Video).secure).isTrue()
        assertThat((ThreadPieceOpener.of(bubble(), video(isProtected = true)) as ThreadPieceOpening.Video).secure).isTrue()
    }

    @Test
    fun `une video que la loi de capture retient s'ouvre dans la couche securisee`() {
        val flame = MessageExitOffer(ContentExitLaw.ViewOnce, holdsBlur = false, isEncrypted = false)
        assertThat((ThreadPieceOpener.of(bubble(exitOffer = flame), video()) as ThreadPieceOpening.Video).secure).isTrue()
    }

    @Test
    fun `une vue unique deja consumee par ce lecteur ne s'ouvre plus`() {
        assertThat(ThreadPieceOpener.of(bubble(isViewOnce = true, isViewOnceOpenedByMe = true), video(isProtected = true)))
            .isEqualTo(ThreadPieceOpening.Nothing)
    }

    @Test
    fun `une piece scellee, sans adresse, supprimee ou un fichier protege n'ouvrent rien`() {
        assertThat(ThreadPieceOpener.of(bubble(), video(isSealed = true))).isEqualTo(ThreadPieceOpening.Nothing)
        assertThat(ThreadPieceOpener.of(bubble(), video(url = null))).isEqualTo(ThreadPieceOpening.Nothing)
        assertThat(ThreadPieceOpener.of(bubble(isDeleted = true), video())).isEqualTo(ThreadPieceOpening.Nothing)
        assertThat(ThreadPieceOpener.of(bubble(), document.copy(isProtected = true))).isEqualTo(ThreadPieceOpening.Nothing)
    }
}
