package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * La regle unique « est-ce moi ? » de la navigation profil : ma page (`profile/me`)
 * pour la session, par id ou par pseudo ; la page d'un tiers inchangee sinon.
 */
class ProfileRoutesTest {

    @Test
    fun `my own id leads to my page`() {
        assertThat(ProfileRoutes.profileFor("me1", selfId = "me1")).isEqualTo("profile/me")
        assertThat(ProfileRoutes.OWN).isEqualTo("profile/me")
    }

    @Test
    fun `my own username leads to my page`() {
        assertThat(ProfileRoutes.profileFor("atabeth", selfId = "me1", selfUsername = "atabeth"))
            .isEqualTo(ProfileRoutes.OWN)
    }

    @Test
    fun `someone else keeps the third party route`() {
        assertThat(ProfileRoutes.profileFor("u2", selfId = "me1", selfUsername = "atabeth"))
            .isEqualTo(Routes.profile("u2"))
        assertThat(ProfileRoutes.profileFor("bob", selfId = "me1", selfUsername = "atabeth"))
            .isEqualTo("profile/bob")
    }

    @Test
    fun `an empty id opens nothing`() {
        assertThat(ProfileRoutes.profileFor("", selfId = "me1")).isNull()
        assertThat(ProfileRoutes.profileFor("   ", selfId = "me1")).isNull()
    }

    @Test
    fun `without a session nobody is me`() {
        assertThat(ProfileRoutes.profileFor("me1", selfId = null)).isEqualTo("profile/me1")
        assertThat(ProfileRoutes.profileFor("atabeth", selfId = "", selfUsername = "atabeth"))
            .isEqualTo("profile/atabeth")
    }

    @Test
    fun `the floating avatar leads to my editable page`() {
        assertThat(ProfileRoutes.own("me1")).isEqualTo(ProfileRoutes.OWN)
        assertThat(ProfileRoutes.own(null)).isNull()
        assertThat(ProfileRoutes.own(" ")).isNull()
    }

    @Test
    fun `self entry points no longer build the third party route`() {
        val navigation = File("src/main/kotlin/me/meeshy/app/navigation")
        val chrome = File(navigation, "FloatingChrome.kt").readText()
        val settings = File(navigation, "graph/SettingsNavGraph.kt").readText()
        assertThat(chrome).contains("ProfileRoutes.own(")
        assertThat(chrome).doesNotContain("Routes.profile(")
        assertThat(settings).contains("ProfileRoutes.own(")
        assertThat(settings).doesNotContain("Routes.profile(")
    }

    @Test
    fun `my page is registered and the third party destination resolves self`() {
        val social = File("src/main/kotlin/me/meeshy/app/navigation/graph/SocialNavGraph.kt").readText()
        assertThat(social).contains("composable(ProfileRoutes.OWN)")
        assertThat(social).contains("OwnProfileScreen(")
        assertThat(social).contains("PublicProfileScreen(")
        assertThat(social).contains("resolvesToSelf(")
    }
}
