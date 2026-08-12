package me.meeshy.app.navigation

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Le bouton gauche flottant doit basculer entre Flux et Conversations (parite
 * iOS `showFeed.toggle()`), pas naviguer a sens unique. Bug vecu : un tap
 * depuis le Flux ne ramenait jamais aux Conversations.
 */
class LeftButtonTapTargetTest {

    @Test
    fun `from Conversations, a tap targets Feed`() {
        assertEquals(Routes.FEED, leftButtonTapTarget(Routes.CONVERSATIONS))
    }

    @Test
    fun `from Feed, a tap targets Conversations`() {
        assertEquals(Routes.CONVERSATIONS, leftButtonTapTarget(Routes.FEED))
    }

    @Test
    fun `from any other tab, a tap targets Feed`() {
        assertEquals(Routes.FEED, leftButtonTapTarget(Routes.CALLS))
        assertEquals(Routes.FEED, leftButtonTapTarget(Routes.NOTIFICATIONS))
        assertEquals(Routes.FEED, leftButtonTapTarget(Routes.SETTINGS))
    }

    @Test
    fun `a null current route (cold start, nothing composed yet) targets Feed`() {
        assertEquals(Routes.FEED, leftButtonTapTarget(null))
    }
}
