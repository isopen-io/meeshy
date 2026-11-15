package me.meeshy.app.composer.host

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerOrigin
import org.junit.Test

class ComposerHostRouteTest {
    private val token = "AbCdEfGhIjKlMnOpQrStUv"

    private fun arg(route: String, name: String): String? =
        route.substringAfter('?').split('&').map { it.split('=', limit = 2) }.firstOrNull { it[0] == name }?.getOrNull(1)

    private fun roundTrip(origin: ComposerOrigin, seed: String? = null): ComposerHostRoute.Door {
        val route = ComposerHostRoute.route(origin, seed)!!
        return ComposerHostRoute.door(
            wire = arg(route, ComposerHostRoute.ORIGIN_ARG),
            id = arg(route, ComposerHostRoute.ID_ARG),
            sub = arg(route, ComposerHostRoute.SUB_ARG),
            seed = arg(route, ComposerHostRoute.SEED_ARG),
        )
    }

    @Test
    fun `the three original doors round-trip through their route`() {
        listOf(ComposerOrigin.StoryTray, ComposerOrigin.FeedComposer, ComposerOrigin.MoodChip).forEach { origin ->
            assertThat(roundTrip(origin).origin).isEqualTo(origin)
        }
    }

    @Test
    fun `every other door the host carries round-trips with what it transports`() {
        assertThat(roundTrip(ComposerOrigin.Draft("d_1-x")).origin).isEqualTo(ComposerOrigin.Draft("d_1-x"))
        assertThat(roundTrip(ComposerOrigin.ConversationMedia("m1", "a1")).origin).isEqualTo(ComposerOrigin.ConversationMedia("m1", "a1"))
        assertThat(roundTrip(ComposerOrigin.ConversationMedia("m1")).origin).isEqualTo(ComposerOrigin.ConversationMedia("m1", null))
        assertThat(roundTrip(ComposerOrigin.SocialMedia("p1", "x9")).origin).isEqualTo(ComposerOrigin.SocialMedia("p1", "x9"))
        assertThat(roundTrip(ComposerOrigin.SocialMedia("p1")).origin).isEqualTo(ComposerOrigin.SocialMedia("p1", null))
        assertThat(roundTrip(ComposerOrigin.Share, token)).isEqualTo(ComposerHostRoute.Door(ComposerOrigin.Share, token))
    }

    @Test
    fun `a door still served by the legacy composer never enters the host`() {
        assertThat(ComposerHostRoute.route(ComposerOrigin.Repost("p1", ComposerFormat.POST))).isNull()
        assertThat(ComposerHostRoute.route(ComposerOrigin.Edit("p1", ComposerFormat.POST))).isNull()
    }

    @Test
    fun `an unknown or missing door opens the feed composer`() {
        assertThat(ComposerHostRoute.origin(null)).isEqualTo(ComposerOrigin.FeedComposer)
        assertThat(ComposerHostRoute.origin("zzz")).isEqualTo(ComposerOrigin.FeedComposer)
    }

    @Test
    fun `an identifier that is not an identifier produces no route and reads as the feed composer`() {
        listOf("", "../x", "a/b", "a b", "a%2Fb", "a?b=c", "x".repeat(65), "é").forEach { forged ->
            assertThat(ComposerHostRoute.route(ComposerOrigin.Draft(forged))).isNull()
            assertThat(ComposerHostRoute.route(ComposerOrigin.ConversationMedia(forged))).isNull()
            assertThat(ComposerHostRoute.route(ComposerOrigin.SocialMedia(forged))).isNull()
            assertThat(ComposerHostRoute.door("draft", id = forged).origin).isEqualTo(ComposerOrigin.FeedComposer)
            assertThat(ComposerHostRoute.door("conversation-media", id = forged).origin).isEqualTo(ComposerOrigin.FeedComposer)
            assertThat(ComposerHostRoute.door("social-media", id = forged).origin).isEqualTo(ComposerOrigin.FeedComposer)
        }
    }

    @Test
    fun `a forged sub identifier is dropped, not trusted, and the door still opens`() {
        assertThat(ComposerHostRoute.door("conversation-media", id = "m1", sub = "../etc").origin)
            .isEqualTo(ComposerOrigin.ConversationMedia("m1", null))
        assertThat(ComposerHostRoute.route(ComposerOrigin.SocialMedia("p1", "a/b"))).isEqualTo("composer?origin=social-media&id=p1")
    }

    @Test
    fun `the share door needs a seed in the shape the store makes, otherwise it has nothing to compose`() {
        assertThat(ComposerHostRoute.route(ComposerOrigin.Share)).isNull()
        assertThat(ComposerHostRoute.route(ComposerOrigin.Share, "short")).isNull()
        assertThat(ComposerHostRoute.route(ComposerOrigin.Share, "../../../../../../etc/passwd")).isNull()
        assertThat(ComposerHostRoute.door("share", seed = null)).isEqualTo(ComposerHostRoute.Door(ComposerOrigin.FeedComposer))
        assertThat(ComposerHostRoute.door("share", seed = "a/b/../c/dddddddddddddddd")).isEqualTo(ComposerHostRoute.Door(ComposerOrigin.FeedComposer))
    }

    @Test
    fun `a seed token is carried only by the share door`() {
        assertThat(ComposerHostRoute.door("story", seed = token)).isEqualTo(ComposerHostRoute.Door(ComposerOrigin.StoryTray))
        assertThat(ComposerHostRoute.route(ComposerOrigin.StoryTray, token)).isEqualTo("composer?origin=story")
    }
}
