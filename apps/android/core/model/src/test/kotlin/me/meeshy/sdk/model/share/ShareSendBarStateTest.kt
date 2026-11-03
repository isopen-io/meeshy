package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareSendBarStateTest {
    private fun media(n: Int, bytes: Long = 1L) = (1..n).map { ShareMedia(id = "m$it", mimeType = "application/pdf", bytes = bytes) }
    private fun conv(n: Int, title: String = "Conv $n") = ShareRecipient.conversation(
        conversationId = "$n", title = title, detail = ShareRecipient.Detail.Direct, avatarUrl = null, accentHex = null, peerUserId = null,
    )

    private fun plan(
        entry: ShareEntry = ShareEntry.Media(media(2)),
        destinations: List<ShareDestination> = listOf(ShareDestination("conv:1")),
    ) = SharePlanner.plan(entry, destinations)

    private fun bar(
        plan: SharePlan = plan(),
        selection: List<ShareRecipient> = listOf(conv(1)),
        hasSent: Boolean = false,
        online: Boolean = true,
    ) = ShareSendBarState.of(plan, selection, hasSent, online)

    @Test
    fun `the button counts the recipients and says send for a new share`() {
        val button = bar().button!!
        assertThat(button.label).isEqualTo(ShareSendBarState.ButtonLabel.Send(1))
        assertThat(button.enabled).isTrue()
    }

    @Test
    fun `a forwarded message reads forward`() {
        val forwarded = plan(entry = ShareEntry.Messages(listOf(ShareMessage(id = "m1", text = "hi"))))
        assertThat(bar(plan = forwarded).button!!.label).isEqualTo(ShareSendBarState.ButtonLabel.Forward(1))
    }

    @Test
    fun `no destination disables the button`() {
        val none = plan(destinations = emptyList())
        assertThat(bar(plan = none, selection = emptyList()).button!!.enabled).isFalse()
    }

    @Test
    fun `too heavy replaces the label by the number of files to remove and disables sending`() {
        val heavy = plan(entry = ShareEntry.Media(media(ShareLimits.MAX_FILES + 3)))
        val state = bar(plan = heavy)
        assertThat(state.button!!.label).isEqualTo(ShareSendBarState.ButtonLabel.TrimLast(3))
        assertThat(state.button!!.enabled).isFalse()
        assertThat(state.banners).contains(ShareSendBarState.Banner.TooHeavy(files = ShareLimits.MAX_FILES + 3, bytes = ShareLimits.MAX_FILES + 3L))
    }

    @Test
    fun `more than ten recipients warns and disables`() {
        val many = plan(destinations = (1..11).map { ShareDestination("conv:$it") })
        val state = bar(plan = many, selection = (1..11).map { conv(it) })
        assertThat(state.banners).contains(ShareSendBarState.Banner.TooManyRecipients)
        assertThat(state.button!!.enabled).isFalse()
    }

    @Test
    fun `offline shows the discreet banner and keeps the button usable`() {
        val state = bar(online = false)
        assertThat(state.banners).containsExactly(ShareSendBarState.Banner.Offline)
        assertThat(state.button!!.enabled).isTrue()
    }

    @Test
    fun `leaving the encryption names the unencrypted destinations of the selection`() {
        val sealed = plan(
            entry = ShareEntry.Messages(listOf(ShareMessage(id = "m1", text = "hi", encrypted = true))),
            destinations = listOf(ShareDestination("conv:1"), ShareDestination("conv:2")),
        )
        val encryption = sealed.encryption
        assertThat(encryption).isNotNull()
        val state = bar(plan = sealed, selection = listOf(conv(1, "Léa"), conv(2, "Zoé")))
        val warning = state.banners.filterIsInstance<ShareSendBarState.Banner.EncryptionExit>().single()
        assertThat(warning.names).containsExactlyElementsIn(
            listOf(conv(1, "Léa"), conv(2, "Zoé")).filter { it.id in encryption!!.warnDestinationIds }.map { it.title },
        )
    }

    @Test
    fun `banners keep the iOS order offline then encryption then heavy then recipients`() {
        val kinds = bar(plan = plan(entry = ShareEntry.Media(media(ShareLimits.MAX_FILES + 1)), destinations = (1..11).map { ShareDestination("conv:$it") }), online = false)
            .banners.map { it::class }
        assertThat(kinds).containsExactly(
            ShareSendBarState.Banner.Offline::class,
            ShareSendBarState.Banner.TooHeavy::class,
            ShareSendBarState.Banner.TooManyRecipients::class,
        ).inOrder()
    }

    @Test
    fun `caption and grouping follow the plan and disappear once something was sent`() {
        val state = bar()
        assertThat(state.showsCaption).isTrue()
        assertThat(state.showsGrouping).isTrue()
        val sent = bar(hasSent = true)
        assertThat(sent.showsCaption).isFalse()
        assertThat(sent.showsGrouping).isFalse()
        assertThat(sent.button).isNull()
        assertThat(sent.banners).isEmpty()
    }

    @Test
    fun `a single piece offers no grouping`() {
        assertThat(bar(plan = plan(entry = ShareEntry.Media(media(1)))).showsGrouping).isFalse()
    }

    @Test
    fun `the test id is share dot sheet dot send`() {
        assertThat(ShareSendBarState.SEND_TEST_ID).isEqualTo("share.sheet.send")
    }
}
