package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.composer.ComposerFormat.POST
import me.meeshy.sdk.model.composer.ComposerFormat.REEL
import me.meeshy.sdk.model.composer.ComposerFormat.STATUS
import me.meeshy.sdk.model.composer.ComposerFormat.STORY
import me.meeshy.sdk.model.composer.ComposerPublishMenuRule.Dispatch
import me.meeshy.sdk.model.composer.ComposerPublishMenuRule.Route
import org.junit.Test

class ComposerPublishMenuRuleTest {
    private val candidates = listOf(STORY, POST, REEL)

    private fun entries(offered: List<ComposerFormat> = candidates, slides: Int = 2, travel: Boolean = true) =
        ComposerPublishMenuRule.entries(candidates, offered, carriesMoreThanText = true, slideCount = slides, layoutsTravel = travel)

    private fun choice(format: ComposerFormat, layout: MosaicLayoutMode? = null) = ComposerPublishChoice.of(format, layout)

    @Test
    fun `entries follow the door order and a refused format is greyed with its reason`() {
        val e = entries(offered = listOf(STORY, POST))
        assertThat(e.map { it.format }).containsExactly(STORY, POST, REEL).inOrder()
        val reel = e.first { it.format == REEL }
        assertThat(reel.isChoosable).isFalse()
        assertThat(reel.denial).isEqualTo(FormatDenial.REEL_NEEDS_MATERIAL)
    }

    @Test
    fun `post unfolds the five layouts from two scenes, and only post`() {
        assertThat(entries(slides = 1).first { it.format == POST }.layouts).isEmpty()
        val two = entries(slides = 2)
        assertThat(two.first { it.format == POST }.layouts).containsExactlyElementsIn(ComposerMosaicChoice.ordered).inOrder()
        assertThat(two.first { it.format == STORY }.layouts).isEmpty()
        assertThat(two.first { it.format == REEL }.layouts).isEmpty()
        assertThat(entries(slides = 3, travel = false).first { it.format == POST }.layouts).isEmpty()
    }

    @Test
    fun `the menu is absent when it would offer a single gesture`() {
        assertThat(ComposerPublishMenuRule.menu(listOf(POST), listOf(POST), true, 1, true)).isNull()
        assertThat(ComposerPublishMenuRule.menu(listOf(POST), listOf(POST), true, 2, true)).isNotNull()
        assertThat(ComposerPublishMenuRule.menu(candidates, listOf(STORY, POST), false, 1, true)).hasSize(3)
    }

    @Test
    fun `a choice the menu no longer offers falls back on the door format`() {
        val e = entries(offered = listOf(STORY, POST))
        assertThat(ComposerPublishMenuRule.armed(choice(REEL), STORY, e)).isEqualTo(choice(STORY))
        assertThat(ComposerPublishMenuRule.armed(null, POST, e)).isEqualTo(choice(POST))
        assertThat(ComposerPublishMenuRule.armed(choice(POST, MosaicLayoutMode.HERO), STORY, e)).isEqualTo(choice(POST, MosaicLayoutMode.HERO))
        assertThat(ComposerPublishMenuRule.armed(choice(POST, MosaicLayoutMode.HERO), STORY, entries(slides = 1))).isEqualTo(choice(STORY))
    }

    @Test
    fun `companion reel needs one scene, story and reel choosable, and no repost`() {
        assertThat(ComposerPublishMenuRule.companionReelOffered(entries(slides = 1), 1)).isTrue()
        assertThat(ComposerPublishMenuRule.companionReelOffered(entries(slides = 2), 2)).isFalse()
        assertThat(ComposerPublishMenuRule.companionReelOffered(entries(slides = 1), 1, isRepost = true)).isFalse()
        assertThat(ComposerPublishMenuRule.companionReelOffered(entries(offered = listOf(STORY), slides = 1), 1)).isFalse()
        assertThat(ComposerPublishMenuRule.companionReelOffered(null, 1)).isFalse()
    }

    @Test
    fun `without companion the reel drops from a story and reel choice`() {
        val e = entries(slides = 2)
        val both = ComposerPublishChoice.ofFormats(listOf(STORY, REEL), null)!!
        assertThat(ComposerPublishMenuRule.armed(both, POST, e, companionReelOffered = false).formats).containsExactly(STORY)
        assertThat(ComposerPublishMenuRule.armed(both, POST, entries(slides = 1), companionReelOffered = true).formats)
            .containsExactly(STORY, REEL).inOrder()
    }

    @Test
    fun `toggling checks and unchecks but never empties`() {
        val story = choice(STORY)
        assertThat(ComposerPublishMenuRule.toggled(STORY, story, false)).isEqualTo(story)
        assertThat(ComposerPublishMenuRule.toggled(POST, story, false).formats).containsExactly(POST, STORY).inOrder()
        assertThat(ComposerPublishMenuRule.toggled(REEL, story, false).formats).containsExactly(REEL)
        assertThat(ComposerPublishMenuRule.toggled(REEL, story, true).formats).containsExactly(STORY, REEL).inOrder()
        val storyPost = ComposerPublishChoice.ofFormats(listOf(STORY, POST), MosaicLayoutMode.WAVE)!!
        assertThat(ComposerPublishMenuRule.toggled(POST, storyPost, false)).isEqualTo(choice(STORY))
        assertThat(ComposerPublishMenuRule.toggled(STORY, storyPost, false)).isEqualTo(choice(POST, MosaicLayoutMode.WAVE))
    }

    @Test
    fun `choosing a layout checks the post and keeps the other formats`() {
        val r = ComposerPublishMenuRule.choosingLayout(MosaicLayoutMode.SINE, choice(STORY))
        assertThat(r.formats).containsExactly(POST, STORY).inOrder()
        assertThat(r.layout).isEqualTo(MosaicLayoutMode.SINE)
    }

    @Test
    fun `the menu ticks the armed format and the armed layout or the fallback`() {
        val post = entries().first { it.format == POST }
        assertThat(ComposerPublishMenuRule.isChecked(post, choice(POST))).isTrue()
        assertThat(ComposerPublishMenuRule.isChecked(post, choice(STORY))).isFalse()
        assertThat(ComposerPublishMenuRule.checkedLayout(post, choice(POST))).isEqualTo(MosaicLayoutMode.FALLBACK)
        assertThat(ComposerPublishMenuRule.checkedLayout(post, choice(POST, MosaicLayoutMode.HERO))).isEqualTo(MosaicLayoutMode.HERO)
        assertThat(ComposerPublishMenuRule.checkedLayout(post, choice(STORY))).isNull()
    }

    @Test
    fun `legs publish one request per format and the story carries its reel`() {
        val all = ComposerPublishChoice.ofFormats(listOf(STORY, POST, REEL), MosaicLayoutMode.HERO)!!
        assertThat(all.legs).containsExactly(
            choice(POST, MosaicLayoutMode.HERO),
            ComposerPublishChoice.of(STORY, null, alsoAsReel = true),
        ).inOrder()
        assertThat(all.alsoAsReel).isTrue()
    }

    @Test
    fun `routing follows the gesture on the scene and the format elsewhere`() {
        assertThat(ComposerPublishMenuRule.route(ComposerSurfaceKind.SCENE, choice(REEL))).isEqualTo(Route.ATELIER)
        assertThat(ComposerPublishMenuRule.route(ComposerSurfaceKind.SCENE, choice(POST, MosaicLayoutMode.WAVE))).isEqualTo(Route.DOCUMENT)
        assertThat(ComposerPublishMenuRule.route(ComposerSurfaceKind.DOCUMENT, choice(STORY))).isEqualTo(Route.STORY_SCENE)
        assertThat(ComposerPublishMenuRule.route(ComposerSurfaceKind.DOCUMENT, choice(REEL))).isEqualTo(Route.DOCUMENT)
        assertThat(ComposerPublishMenuRule.route(ComposerSurfaceKind.MOOD, choice(STATUS))).isEqualTo(Route.DOCUMENT)
        assertThat(ComposerPublishMenuRule.dispatch(ComposerSurfaceKind.SCENE, ComposerPublishChoice.of(STORY, null, true)))
            .isEqualTo(Dispatch.Atelier(STORY, alsoAsReel = true))
    }

    @Test
    fun `the atelier carries the post text only under post and when it says something`() {
        val post = choice(POST)
        assertThat(ComposerPublishMenuRule.atelierCarriedPostText(Route.ATELIER, post, "Salut")).isEqualTo("Salut")
        assertThat(ComposerPublishMenuRule.atelierCarriedPostText(Route.ATELIER, post, "  \n")).isNull()
        assertThat(ComposerPublishMenuRule.atelierCarriedPostText(Route.DOCUMENT, post, "Salut")).isNull()
        assertThat(ComposerPublishMenuRule.atelierCarriedPostText(Route.ATELIER, choice(STORY), "Salut")).isNull()
    }

    @Test
    fun `no format leaves unsupported`() {
        ComposerFormat.entries.forEach { assertThat(ComposerPublishChannel.of(it)).isNotEqualTo(ComposerPublishChannel.UNSUPPORTED) }
    }
}
