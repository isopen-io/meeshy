package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertWithMessage
import org.junit.Test

/**
 * #16223 : le bandeau « Validez votre compte » ne se pose pas au-dessus d'un écran plein écran de création. iOS n'y montre
 * aucun bandeau : le compositeur (story, post, réel) et ses éditeurs prennent tout l'écran ; le bandeau revient à leur fermeture.
 */
class ActivationInviteBandRoutesTest {

    @Test
    fun `the band steps aside while a composer is in front`() {
        listOf(Routes.STORY_COMPOSER_ROUTE, Routes.COMPOSER).forEach { route ->
            assertWithMessage(route).that(ActivationInviteBandRoutes.showsOver(route)).isFalse()
        }
    }

    @Test
    fun `the band comes back on every other screen once the composer is closed`() {
        listOf(Routes.CONVERSATIONS, Routes.FEED, Routes.CHAT, Routes.SETTINGS, null).forEach { route ->
            assertWithMessage("$route").that(ActivationInviteBandRoutes.showsOver(route)).isTrue()
        }
    }
}
