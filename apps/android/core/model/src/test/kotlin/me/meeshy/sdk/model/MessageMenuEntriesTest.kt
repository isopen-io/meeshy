package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageMenuEntries.Entry
import me.meeshy.sdk.model.MessageMenuEntries.Facts
import me.meeshy.sdk.model.MessageMenuEntries.Piece
import me.meeshy.sdk.model.MessageMenuEntries.ShareTarget
import org.junit.Test

/** Les entrées iOS du menu d'un message (#13778, #13779) : conditions d'apparition, comme `MessageActionResolver`. */
class MessageMenuEntriesTest {

    private val now = 1_792_494_000_000L
    private val linkText = "Regarde https://meeshy.me/a?b=1 vite"

    private fun linkFacts(exits: MessageExitOffer = MessageExitOffer.Unrestricted) = Facts(
        hasText = true,
        link = MessageMenuEntries.firstLink(linkText),
        kindActions = MessageActionPolicy.kindActionsOf(MessageContentKind.Subject(id = "m1", content = linkText), now),
        exits = exits,
    )

    private val blurredExit = MessageExitOffer(ContentExitLaw.Ordinary, holdsBlur = true, isEncrypted = false)

    @Test
    fun `a link message offers to open and copy its first link, read on the shared law`() {
        assertThat(MessageMenuEntries.firstLink(linkText)).isEqualTo("https://meeshy.me/a?b=1")
        assertThat(MessageMenuEntries.offers(linkFacts())).containsAtLeast(Entry.OPEN_LINK, Entry.COPY_LINK)
    }

    @Test
    fun `a plain text has no link entry, and a link entry needs a link to act on`() {
        val text = Facts(hasText = true, kindActions = MessageActionPolicy.kindActionsOf(MessageContentKind.Subject(id = "m1", content = "Salut"), now))
        assertThat(MessageMenuEntries.offers(text)).containsNoneOf(Entry.OPEN_LINK, Entry.COPY_LINK)
        assertThat(MessageMenuEntries.offers(linkFacts().copy(link = null))).containsNoneOf(Entry.OPEN_LINK, Entry.COPY_LINK)
    }

    @Test
    fun `the shared law withholds the copy of a link that may not leave, and keeps opening it`() {
        val kinds = MessageActionPolicy.kindActionsOf(
            MessageContentKind.Subject(id = "m1", content = linkText, ephemeralDuration = 30.0),
            now,
        )
        assertThat(kinds).containsExactly(MessageActionPolicy.Action.OPEN_LINK)
    }

    @Test
    fun `a blurred, view-once, sealed or gone message offers no content entry`() {
        listOf(
            linkFacts().copy(isBlurred = true, exits = blurredExit),
            linkFacts().copy(isViewOnce = true),
            linkFacts().copy(isSealed = true),
            linkFacts().copy(isGone = true),
        ).forEach { facts ->
            assertThat(MessageMenuEntries.offers(facts))
                .containsNoneOf(Entry.OPEN_LINK, Entry.COPY_LINK, Entry.TRANSLATE, Entry.SHARE, Entry.SAVE_MEDIA, Entry.TRANSCRIPTION)
        }
    }

    @Test
    fun `reactions are offered on any live message, never on a gone or view-once one`() {
        assertThat(MessageMenuEntries.offers(Facts())).contains(Entry.REACTIONS)
        assertThat(MessageMenuEntries.offers(Facts(isBlurred = true))).contains(Entry.REACTIONS)
        assertThat(MessageMenuEntries.offers(Facts(isGone = true))).doesNotContain(Entry.REACTIONS)
        assertThat(MessageMenuEntries.offers(Facts(isViewOnce = true))).doesNotContain(Entry.REACTIONS)
        assertThat(MessageMenuEntries.offers(Facts(isLive = false))).doesNotContain(Entry.REACTIONS)
    }

    @Test
    fun `the thread opens only on a live thread`() {
        assertThat(MessageMenuEntries.offers(Facts(hasThread = true))).contains(Entry.THREAD)
        assertThat(MessageMenuEntries.offers(Facts(hasThread = false))).doesNotContain(Entry.THREAD)
        assertThat(MessageMenuEntries.offers(Facts(hasThread = true, isViewOnce = true))).doesNotContain(Entry.THREAD)
    }

    @Test
    fun `translate is offered on an untranslated live text, never twice beside explore languages`() {
        assertThat(MessageMenuEntries.offers(Facts(hasText = true))).contains(Entry.TRANSLATE)
        assertThat(MessageMenuEntries.offers(Facts(hasText = true, isTranslated = true))).doesNotContain(Entry.TRANSLATE)
        assertThat(MessageMenuEntries.offers(Facts(hasText = false))).doesNotContain(Entry.TRANSLATE)
        assertThat(MessageMenuEntries.offers(Facts(hasText = true, isNotice = true))).doesNotContain(Entry.TRANSLATE)
        assertThat(MessageMenuEntries.offers(Facts(hasText = true, isLive = false))).doesNotContain(Entry.TRANSLATE)
    }

    @Test
    fun `an end-to-end conversation offers neither server translation nor transcription, and says so`() {
        val facts = Facts(hasText = true, pieces = listOf(Piece.AUDIO), conversationIsEndToEnd = true)
        assertThat(MessageMenuEntries.offers(facts)).containsNoneOf(Entry.TRANSLATE, Entry.TRANSCRIPTION)
        assertThat(MessageMenuEntries.saysServerFeaturesAbsent(facts)).isTrue()
        assertThat(MessageMenuEntries.saysServerFeaturesAbsent(Facts(hasText = true))).isFalse()
    }

    @Test
    fun `transcription is offered on an audio or a video, never on a photo`() {
        assertThat(MessageMenuEntries.offers(Facts(pieces = listOf(Piece.AUDIO)))).contains(Entry.TRANSCRIPTION)
        assertThat(MessageMenuEntries.offers(Facts(pieces = listOf(Piece.VIDEO)))).contains(Entry.TRANSCRIPTION)
        assertThat(MessageMenuEntries.offers(Facts(pieces = listOf(Piece.IMAGE)))).doesNotContain(Entry.TRANSCRIPTION)
    }

    @Test
    fun `save is offered on exactly one photo or video that may leave`() {
        assertThat(MessageMenuEntries.offers(Facts(pieces = listOf(Piece.IMAGE)))).contains(Entry.SAVE_MEDIA)
        assertThat(MessageMenuEntries.offers(Facts(pieces = listOf(Piece.VIDEO)))).contains(Entry.SAVE_MEDIA)
        assertThat(MessageMenuEntries.offers(Facts(pieces = listOf(Piece.IMAGE, Piece.IMAGE)))).doesNotContain(Entry.SAVE_MEDIA)
        assertThat(MessageMenuEntries.offers(Facts(pieces = listOf(Piece.AUDIO)))).doesNotContain(Entry.SAVE_MEDIA)
        assertThat(MessageMenuEntries.offers(Facts(pieces = listOf(Piece.FILE)))).doesNotContain(Entry.SAVE_MEDIA)
        val held = MessageExitOffer(ContentExitLaw.of(ContentExitLaw.Subject(ephemeralDuration = 10.0)), holdsBlur = false, isEncrypted = false)
        assertThat(MessageMenuEntries.offers(Facts(pieces = listOf(Piece.IMAGE), exits = held))).doesNotContain(Entry.SAVE_MEDIA)
    }

    @Test
    fun `share carries the text of a text message, or the only photo or sound`() {
        assertThat(MessageMenuEntries.shareTarget(Facts(hasText = true))).isEqualTo(ShareTarget.TEXT)
        assertThat(MessageMenuEntries.shareTarget(Facts(hasText = true, pieces = listOf(Piece.IMAGE)))).isEqualTo(ShareTarget.PIECE)
        assertThat(MessageMenuEntries.shareTarget(Facts(pieces = listOf(Piece.AUDIO)))).isEqualTo(ShareTarget.PIECE)
    }

    @Test
    fun `share is absent where a file share already exists, on several pieces, or when the exit refuses it`() {
        assertThat(MessageMenuEntries.shareTarget(Facts(pieces = listOf(Piece.FILE)))).isNull()
        assertThat(MessageMenuEntries.shareTarget(Facts(pieces = listOf(Piece.VIDEO)))).isNull()
        assertThat(MessageMenuEntries.shareTarget(Facts(pieces = listOf(Piece.IMAGE, Piece.IMAGE)))).isNull()
        assertThat(MessageMenuEntries.shareTarget(Facts(hasText = true, isBlurred = true, exits = blurredExit))).isNull()
        assertThat(MessageMenuEntries.shareTarget(Facts(pieces = listOf(Piece.IMAGE), isLive = false))).isNull()
    }
}
