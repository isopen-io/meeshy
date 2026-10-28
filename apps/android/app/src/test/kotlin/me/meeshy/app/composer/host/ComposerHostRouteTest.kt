package me.meeshy.app.composer.host

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerOrigin
import org.junit.Test

class ComposerHostRouteTest {
    @Test
    fun `the three doors the host carries round-trip through their route`() {
        listOf(ComposerOrigin.StoryTray, ComposerOrigin.FeedComposer, ComposerOrigin.MoodChip).forEach { origin ->
            val route = ComposerHostRoute.route(origin)!!
            val wire = route.substringAfter("${ComposerHostRoute.ORIGIN_ARG}=")
            assertThat(ComposerHostRoute.origin(wire)).isEqualTo(origin)
        }
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
}
