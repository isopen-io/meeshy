package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PinAction
import me.meeshy.ui.component.bubble.BubbleAudio
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleFile
import me.meeshy.ui.component.bubble.BubbleImage
import org.junit.Test

/**
 * #13778, #13779 — the long-press menu offers iOS's entries (link, thread, translate, save, share, transcription,
 * reactions), read from a bubble through [actionContext], at iOS's place, and only where the host serves them.
 */
class MessageMenuIosEntriesTest {

    private val allHosted = MessageAction.entries.toSet()

    private fun bubble(
        text: String = "Bonjour",
        isTranslated: Boolean = false,
        images: List<BubbleImage> = emptyList(),
        files: List<BubbleFile> = emptyList(),
        audios: List<BubbleAudio> = emptyList(),
        isViewOnce: Boolean = false,
        isBlurred: Boolean = false,
        isDeleted: Boolean = false,
        isEndToEndSealed: Boolean = false,
    ) = BubbleContent(
        messageId = "665f1c2ab3e4d5f6a7b8c9d0",
        text = text,
        isOutgoing = false,
        isTranslated = isTranslated,
        originalText = null,
        senderName = null,
        showSenderName = false,
        isEdited = false,
        isDeleted = isDeleted,
        createdAtIso = null,
        images = images,
        files = files,
        audios = audios,
        isViewOnce = isViewOnce,
        isBlurred = isBlurred,
        isEndToEndSealed = isEndToEndSealed,
    )

    private fun menu(
        bubble: BubbleContent,
        hosted: Set<MessageAction> = allHosted,
        hasThread: Boolean = false,
        conversationIsEndToEnd: Boolean = false,
    ) = MessageActionMenu.actions(
        bubble.actionContext(
            canWrite = true,
            pinAction = PinAction.Pin,
            hostedEntries = hosted,
            hasThread = hasThread,
            conversationIsEndToEnd = conversationIsEndToEnd,
        ),
    )

    private val photo = BubbleImage(attachmentId = "a1", url = "https://gate.meeshy.me/f/a1.jpg")
    private val voice = BubbleAudio(attachmentId = "a2", url = "https://gate.meeshy.me/f/a2.m4a")
    private val video = BubbleFile(attachmentId = "a3", name = "clip.mp4", url = "https://gate.meeshy.me/f/a3.mp4", isVideo = true)

    @Test
    fun a_link_is_opened_and_copied_right_after_reply_as_on_ios() {
        val actions = menu(bubble(text = "Vois https://meeshy.me/x"))
        assertThat(actions.take(4))
            .containsExactly(MessageAction.Reply, MessageAction.OpenLink, MessageAction.CopyLink, MessageAction.Forward)
            .inOrder()
    }

    @Test
    fun a_text_offers_translate_share_and_reactions_where_ios_puts_them() {
        val actions = menu(bubble())
        assertThat(actions).containsAtLeast(
            MessageAction.Forward,
            MessageAction.Translate,
            MessageAction.Copy,
            MessageAction.Share,
            MessageAction.Reactions,
            MessageAction.Report,
        ).inOrder()
        assertThat(actions).containsNoneOf(MessageAction.OpenLink, MessageAction.SaveMedia, MessageAction.Transcription, MessageAction.Thread)
    }

    @Test
    fun a_translated_text_keeps_explore_languages_and_does_not_offer_translate_twice() {
        val actions = menu(bubble(isTranslated = true))
        assertThat(actions).contains(MessageAction.ExploreLanguages)
        assertThat(actions).doesNotContain(MessageAction.Translate)
    }

    @Test
    fun the_thread_follows_forward_when_replies_exist() {
        val actions = menu(bubble(), hasThread = true)
        val forward = actions.indexOf(MessageAction.Forward)
        assertThat(actions[forward + 1]).isEqualTo(MessageAction.Thread)
    }

    @Test
    fun a_single_photo_is_saved_and_shared() {
        val actions = menu(bubble(text = "", images = listOf(photo)))
        assertThat(actions).containsAtLeast(MessageAction.SaveMedia, MessageAction.Share).inOrder()
        assertThat(actions).doesNotContain(MessageAction.Transcription)
    }

    @Test
    fun a_voice_note_offers_transcription_before_reactions() {
        val actions = menu(bubble(text = "", audios = listOf(voice)))
        assertThat(actions).containsAtLeast(MessageAction.Transcription, MessageAction.Reactions).inOrder()
        assertThat(actions).doesNotContain(MessageAction.SaveMedia)
    }

    @Test
    fun a_video_is_saved_and_transcribed_and_shared_through_its_file_entry() {
        val actions = menu(bubble(text = "", files = listOf(video)))
        assertThat(actions).containsAtLeast(MessageAction.SaveMedia, MessageAction.ShareFile, MessageAction.Transcription)
        assertThat(actions).doesNotContain(MessageAction.Share)
    }

    @Test
    fun an_end_to_end_conversation_offers_neither_server_translation_nor_transcription() {
        val actions = menu(bubble(audios = listOf(voice)), conversationIsEndToEnd = true)
        assertThat(actions).containsNoneOf(MessageAction.Translate, MessageAction.Transcription)
        assertThat(actions).contains(MessageAction.Reactions)
    }

    @Test
    fun a_view_once_blurred_sealed_or_deleted_message_shows_none_of_its_content() {
        listOf(
            bubble(images = listOf(photo), isViewOnce = true),
            bubble(images = listOf(photo), isBlurred = true),
            bubble(images = listOf(photo), isEndToEndSealed = true),
            bubble(images = listOf(photo), isDeleted = true),
        ).forEach { candidate ->
            assertThat(menu(candidate)).containsNoneOf(
                MessageAction.Translate,
                MessageAction.SaveMedia,
                MessageAction.Share,
                MessageAction.OpenLink,
                MessageAction.Transcription,
            )
        }
        assertThat(menu(bubble(isViewOnce = true))).doesNotContain(MessageAction.Reactions)
    }

    @Test
    fun an_entry_the_host_does_not_serve_is_absent() {
        val actions = menu(bubble(text = "https://meeshy.me", audios = listOf(voice)), hosted = emptySet(), hasThread = true)
        assertThat(actions).containsNoneOf(
            MessageAction.OpenLink,
            MessageAction.CopyLink,
            MessageAction.Thread,
            MessageAction.Translate,
            MessageAction.Share,
            MessageAction.Transcription,
            MessageAction.Reactions,
        )
    }

    @Test
    fun the_chat_host_serves_every_ios_entry_and_saves_only_where_the_gallery_accepts_it() {
        val served = hostedDetailEntries(showReadReceipts = true, gallerySaveSupported = true)
        assertThat(served).containsAtLeast(
            MessageAction.OpenLink,
            MessageAction.CopyLink,
            MessageAction.Thread,
            MessageAction.Translate,
            MessageAction.SaveMedia,
            MessageAction.Share,
            MessageAction.Transcription,
            MessageAction.Reactions,
        )
        assertThat(hostedDetailEntries(showReadReceipts = true, gallerySaveSupported = false)).doesNotContain(MessageAction.SaveMedia)
    }

    @Test
    fun the_gallery_source_is_the_only_photo_or_video_with_its_type() {
        assertThat(bubble(images = listOf(photo)).onlyGallerySource).isEqualTo(GallerySource(photo.url, null))
        assertThat(bubble(files = listOf(video)).onlyGallerySource).isEqualTo(GallerySource(video.url!!, "video/mp4"))
        assertThat(bubble(images = listOf(photo, photo)).onlyGallerySource).isNull()
        assertThat(bubble(audios = listOf(voice)).onlyGallerySource).isNull()
        assertThat(bubble(images = listOf(photo), audios = listOf(voice)).onlyGallerySource).isNull()
    }
}
