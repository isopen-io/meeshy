package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerOrigin
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LaunchRouterComposerShortcutTest {

    @Test
    fun `le raccourci Publier un post ouvre la porte du composeur du fil`() {
        val route = LaunchRouter.route(LaunchExtras(shortcut = LaunchShortcut.COMPOSE_POST))

        assertThat(route).isEqualTo(Routes.composer(ComposerOrigin.FeedComposer))
        assertThat(route).isNotNull()
    }

    @Test
    fun `un raccourci inconnu n ouvre rien`() {
        assertThat(LaunchRouter.route(LaunchExtras(shortcut = "autre"))).isNull()
        assertThat(LaunchRouter.route(LaunchExtras())).isNull()
    }

    @Test
    fun `un appel entrant passe avant le raccourci`() {
        val route = LaunchRouter.route(LaunchExtras(callId = "c1", conversationId = "k", shortcut = LaunchShortcut.COMPOSE_POST))

        assertThat(CallRoute.isCallRoute(route)).isTrue()
    }

    @Test
    fun `une activite recreee ne rouvre pas le composeur du raccourci`() {
        val route = LaunchRouter.route(LaunchExtras(shortcut = LaunchShortcut.COMPOSE_POST))

        assertThat(LaunchRouter.onCreateRoute(route, restored = true)).isNull()
        assertThat(LaunchRouter.onCreateRoute(route, restored = false)).isEqualTo(route)
    }
}
