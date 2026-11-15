package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.session.SessionRowPresentation
import me.meeshy.sdk.model.session.SessionRowPresentation.Activity
import me.meeshy.sdk.model.session.SessionRowPresentation.LoginMethod
import me.meeshy.sdk.model.session.SessionRowPresentation.Platform
import me.meeshy.sdk.model.session.SessionRowPresentation.Title
import org.junit.Test

class ActiveSessionsUiMapperTest {

    private val names = mapOf(
        R.string.sessions_timezone to "Fuseau : %s",
        R.string.sessions_device_browser_on_system to "%s sur %s",
        R.string.sessions_unknown_device to "Appareil inconnu",
        R.string.sessions_opened to "Ouverte le %s",
        R.string.sessions_activity_now to "Active maintenant",
        R.string.sessions_activity_last to "Dernière activité %s",
        R.string.sessions_platform_web to "Web",
        R.string.sessions_platform_pwa to "Web (application installée)",
        R.string.sessions_platform_android to "Application Android",
        R.string.sessions_login_password to "par mot de passe",
        R.string.sessions_login_two_factor to "par mot de passe et code",
        R.string.sessions_login_magic_link to "par lien magique",
        R.string.sessions_login_registration to "à l'inscription",
        R.string.sessions_login_email_verification to "par vérification",
        R.string.sessions_login_oauth to "par un compte externe",
        R.string.sessions_login_anonymous to "invitée",
    )
    private val unmapped = mutableListOf<Int>()

    private fun mapper() = ActiveSessionsUiMapper(
        string = { res, args ->
            val template = names[res]
            if (template == null) unmapped += res
            String.format(template ?: "?", *args.toTypedArray())
        },
        countryName = { if (it == "FR") "France" else it },
        dateText = { "1 oct. 2026" },
        relativeText = { "il y a 5 min" },
    )

    private fun row(
        title: Title = Title.Named("iPhone de Marie"),
        software: SessionRowPresentation.Software? = null,
        place: SessionRowPresentation.Place? = null,
        timezone: String? = null,
        opened: Long? = null,
        method: LoginMethod? = null,
        activity: Activity? = null,
    ) = SessionRowPresentation(
        id = "s", title = title, icon = SessionRowPresentation.Icon.PHONE, isCurrent = false,
        software = software, place = place, timezone = timezone, openedAtMillis = opened,
        loginMethod = method, activity = activity,
    )

    @Test
    fun `every title variant has a text and the unknown one a string resource`() {
        val m = mapper()
        assertThat(m.title(Title.Named("Pixel"))).isEqualTo("Pixel")
        assertThat(m.title(Title.Model("iPhone 14 Pro"))).isEqualTo("iPhone 14 Pro")
        assertThat(m.title(Title.VendorModel("Google", "Pixel 8"))).isEqualTo("Google Pixel 8")
        assertThat(m.title(Title.BrowserOnOs("Chrome", "macOS"))).isEqualTo("Chrome sur macOS")
        assertThat(m.title(Title.Browser("Firefox"))).isEqualTo("Firefox")
        assertThat(m.title(Title.Unknown)).isEqualTo("Appareil inconnu")
        assertThat(unmapped).isEmpty()
    }

    @Test
    fun `every login method and every platform maps to a resource that exists`() {
        val m = mapper()
        LoginMethod.values().forEach { assertThat(names).containsKey(m.loginMethodRes(it)) }
        Platform.values().forEach { assertThat(names).containsKey(m.platformRes(it)) }
        assertThat(LoginMethod.values().map { m.loginMethodRes(it) }.toSet()).hasSize(LoginMethod.values().size)
    }

    @Test
    fun `the software line joins app, browser, system and platform`() {
        val software = SessionRowPresentation.Software("1.2.0", "1874", "Chrome", "129", "Android", "15", Platform.WEB)
        assertThat(mapper().texts(row(software = software)).software)
            .isEqualTo("Meeshy 1.2.0 (1874) · Chrome 129 · Android 15 · Web")
    }

    @Test
    fun `the place uses the country name and ends with the address`() {
        val place = SessionRowPresentation.Place("Lyon", "FR", null, "203.0.113.4")
        assertThat(mapper().texts(row(place = place)).place).isEqualTo("Lyon, France · 203.0.113.4")
        val located = SessionRowPresentation.Place(null, null, "Rhône", null)
        assertThat(mapper().texts(row(place = located)).place).isEqualTo("Rhône")
    }

    @Test
    fun `opened carries the login method and activity says now or since`() {
        val texts = mapper().texts(
            row(timezone = "Europe/Paris", opened = 1L, method = LoginMethod.MAGIC_LINK, activity = Activity.Since(2L)),
        )
        assertThat(texts.timezone).isEqualTo("Fuseau : Europe/Paris")
        assertThat(texts.opened).isEqualTo("Ouverte le 1 oct. 2026 · par lien magique")
        assertThat(texts.activity).isEqualTo("Dernière activité il y a 5 min")
        assertThat(mapper().texts(row(activity = Activity.ActiveNow)).activity).isEqualTo("Active maintenant")
        assertThat(texts.details).hasSize(3)
        assertThat(unmapped).isEmpty()
    }
}
