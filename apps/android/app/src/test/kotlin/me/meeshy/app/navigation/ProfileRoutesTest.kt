package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.app.navigation.graph.ProfileEntryAction
import me.meeshy.app.navigation.graph.ProfileRouteEntry
import me.meeshy.sdk.model.profile.ProfileSheetUser
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
        val profile = File("src/main/kotlin/me/meeshy/app/navigation/graph/ProfileNavGraph.kt").readText()
        assertThat(social).contains("composable(ProfileRoutes.OWN)")
        assertThat(social).contains("OwnProfileScreen(")
        assertThat(social).doesNotContain("Routes.PROFILE_USER")
        assertThat(profile).contains("resolvesToSelf(")
    }

    @Test
    fun `the third party route and its deep links open the sheet then leave the stack`() {
        val profile = File("src/main/kotlin/me/meeshy/app/navigation/graph/ProfileNavGraph.kt").readText()
        assertThat(profile).contains("route = Routes.PROFILE_USER")
        assertThat(profile).contains("uriPattern = Routes.PROFILE_DEEP_LINK")
        assertThat(profile).contains("uriPattern = Routes.PROFILE_SHARE_APP_DEEP_LINK")
        assertThat(profile).contains("uriPattern = Routes.PROFILE_SHARE_WEB_DEEP_LINK")
        assertThat(profile).contains("LocalProfileSheetOpener.current")
        assertThat(profile).contains("opener.open(")
        assertThat(profile).contains("popBackStack(destinationId, inclusive = true)")
        assertThat(profile).doesNotContain("PublicProfileScreen")
    }

    @Test
    fun `a third party id or pseudo resolves to the sheet opener`() {
        assertThat(ProfileRouteEntry.resolve("64b7f0a1c2d3e4f5a6b7c8d9", isSelf = false))
            .isEqualTo(ProfileEntryAction.Sheet(ProfileSheetUser(userId = "64b7f0a1c2d3e4f5a6b7c8d9", username = "64b7f0a1c2d3e4f5a6b7c8d9")))
        assertThat(ProfileRouteEntry.resolve(" bob ", isSelf = false))
            .isEqualTo(ProfileEntryAction.Sheet(ProfileSheetUser(username = "bob")))
    }

    @Test
    fun `a self target keeps my page and an empty target opens nothing`() {
        assertThat(ProfileRouteEntry.resolve("atabeth", isSelf = true)).isEqualTo(ProfileEntryAction.OwnPage)
        assertThat(ProfileRouteEntry.resolve("  ", isSelf = false)).isEqualTo(ProfileEntryAction.Ignore)
    }

    @Test
    fun `deep link targets build the route the sheet destination receives`() {
        val handle = Regex("""\{userId\}""")
        assertThat(Routes.PROFILE_DEEP_LINK.replace(handle, "u1")).isEqualTo("meeshy://profile/u1")
        assertThat(Routes.PROFILE_SHARE_APP_DEEP_LINK.replace(handle, "bob")).isEqualTo("meeshy://u/bob")
        assertThat(Routes.PROFILE_SHARE_WEB_DEEP_LINK.replace(handle, "bob")).isEqualTo("https://meeshy.me/u/bob")
        assertThat(ProfileRouteEntry.resolve("bob", isSelf = false)).isInstanceOf(ProfileEntryAction.Sheet::class.java)
    }
}
