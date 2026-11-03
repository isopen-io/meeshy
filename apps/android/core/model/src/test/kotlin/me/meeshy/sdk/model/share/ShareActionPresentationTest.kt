package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PublicationTarget
import org.junit.Test

class ShareActionPresentationTest {
    private fun plan(actions: List<ShareAction>, withheld: List<ShareWithheld> = emptyList()) = SharePlan(
        title = ShareTitle.SEND, kept = emptyList(), withdrawn = emptyList(), blocked = null, actions = actions,
        withheld = withheld, grouping = null, caption = null, flameMaxDurationSeconds = null, blurInherited = false,
        encryption = null, limits = ShareLimitsReport(0, 0L, 0, 0, 0), canSend = false,
    )

    private val everything = ShareHostCapabilities(canSave = true, canImager = true, hasUrl = true, hasText = true)
    private val allTargets = PublicationTarget.entries

    @Test
    fun `publication chips follow story then feed then reel and only what the plan offers`() {
        val plan = plan(listOf(ShareAction.PUBLISH_POST, ShareAction.PUBLISH_STORY))
        val presentation = ShareActionPresentation.of(plan, allTargets, studioAvailable = false, host = everything)
        assertThat(presentation.publications).containsExactly(PublicationTarget.STORY, PublicationTarget.POST).inOrder()
    }

    @Test
    fun `a target the content does not serve is not rendered even when the plan offers it`() {
        val plan = plan(listOf(ShareAction.PUBLISH_POST, ShareAction.PUBLISH_REEL))
        val presentation = ShareActionPresentation.of(plan, listOf(PublicationTarget.POST), false, everything)
        assertThat(presentation.publications).containsExactly(PublicationTarget.POST)
    }

    @Test
    fun `the studio needs both the plan offer and matter with a host`() {
        val plan = plan(listOf(ShareAction.STUDIO))
        assertThat(ShareActionPresentation.of(plan, allTargets, true, everything).studio).isTrue()
        assertThat(ShareActionPresentation.of(plan, allTargets, false, everything).studio).isFalse()
        assertThat(ShareActionPresentation.of(plan(emptyList()), allTargets, true, everything).studio).isFalse()
    }

    @Test
    fun `tools keep the iOS order and drop what the host cannot run`() {
        val plan = plan(ShareAction.entries)
        val full = ShareActionPresentation.of(plan, allTargets, false, everything)
        assertThat(full.tools).containsExactly(
            ShareTool.SAVE, ShareTool.COPY_LINK, ShareTool.COPY_TEXT, ShareTool.IMAGER, ShareTool.SHARE_OUT,
        ).inOrder()
        val textOnly = ShareActionPresentation.of(plan, allTargets, false, ShareHostCapabilities(hasText = true))
        assertThat(textOnly.tools).containsExactly(ShareTool.COPY_LINK, ShareTool.COPY_TEXT, ShareTool.SHARE_OUT).inOrder()
        val nothing = ShareActionPresentation.of(plan, allTargets, false, ShareHostCapabilities())
        assertThat(nothing.tools).isEmpty()
    }

    @Test
    fun `a forbidden tool is not rendered`() {
        val plan = plan(listOf(ShareAction.COPY_TEXT))
        val presentation = ShareActionPresentation.of(plan, allTargets, false, everything)
        assertThat(presentation.tools).containsExactly(ShareTool.COPY_TEXT)
    }

    @Test
    fun `a single grey line follows the plan priority`() {
        val plan = plan(
            emptyList(),
            listOf(
                ShareWithheld(ShareAction.PUBLISH_REEL, ShareWithheldReason.SINGLE_PHOTO_NOT_A_REEL),
                ShareWithheld(ShareAction.IMAGER, ShareWithheldReason.CITES_PROTECTED),
                ShareWithheld(ShareAction.SAVE, ShareWithheldReason.FLAME),
            ),
        )
        assertThat(ShareActionPresentation.withheldReason(plan)).isEqualTo(ShareWithheldReason.FLAME)
        val noFlame = plan.copy(withheld = plan.withheld.filterNot { it.reason == ShareWithheldReason.FLAME })
        assertThat(ShareActionPresentation.withheldReason(noFlame)).isEqualTo(ShareWithheldReason.CITES_PROTECTED)
    }

    @Test
    fun `not-a-reel has no grey line, as on iOS`() {
        val plan = plan(emptyList(), listOf(ShareWithheld(ShareAction.PUBLISH_REEL, ShareWithheldReason.NOT_A_REEL)))
        assertThat(ShareActionPresentation.withheldReason(plan)).isNull()
    }

    @Test
    fun `an empty presentation renders nothing`() {
        val presentation = ShareActionPresentation.of(plan(emptyList()), allTargets, true, everything)
        assertThat(presentation.isEmpty).isTrue()
    }

    @Test
    fun `toggling ticks, unticks, and ignores a target that is not offered`() {
        val presentation = ShareActionPresentation(listOf(PublicationTarget.STORY), false, emptyList(), null)
        val ticked = presentation.toggled(emptyList(), PublicationTarget.STORY)
        assertThat(ticked).containsExactly(PublicationTarget.STORY)
        assertThat(presentation.toggled(ticked, PublicationTarget.STORY)).isEmpty()
        assertThat(presentation.toggled(emptyList(), PublicationTarget.REEL)).isEmpty()
    }
}
