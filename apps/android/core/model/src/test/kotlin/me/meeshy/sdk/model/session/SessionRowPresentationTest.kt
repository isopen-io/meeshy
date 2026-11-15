package me.meeshy.sdk.model.session

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.session.SessionRowPresentation.Activity
import me.meeshy.sdk.model.session.SessionRowPresentation.Icon
import me.meeshy.sdk.model.session.SessionRowPresentation.LoginMethod
import me.meeshy.sdk.model.session.SessionRowPresentation.Platform
import me.meeshy.sdk.model.session.SessionRowPresentation.Title
import org.junit.Test

class SessionRowPresentationTest {

    private val now = 1_790_848_800_000L

    private fun session(
        deviceName: String? = null, deviceModel: String? = null, deviceVendor: String? = null,
        browserName: String? = null, osName: String? = null, deviceType: String? = null,
        platform: String? = null, isMobile: Boolean? = null,
    ) = UserSession(
        id = "s", deviceName = deviceName, deviceModel = deviceModel, deviceVendor = deviceVendor,
        browserName = browserName, osName = osName, deviceType = deviceType, platform = platform, isMobile = isMobile,
    )

    private fun title(s: UserSession) = SessionRowPresentation.of(s, now).title

    @Test
    fun `le nom servi l emporte`() {
        assertThat(title(session(deviceName = " Pixel de Sam ", deviceModel = "iPhone15,2"))).isEqualTo(Title.Named("Pixel de Sam"))
    }

    @Test
    fun `un modele lisible vient ensuite`() {
        assertThat(title(session(deviceModel = "iPhone15,2", deviceVendor = "Apple"))).isEqualTo(Title.Model("iPhone 14 Pro"))
    }

    @Test
    fun `fabricant et modele sans doublon de prefixe`() {
        assertThat(title(session(deviceVendor = "Google", deviceModel = "Pixel 8"))).isEqualTo(Title.VendorModel("Google", "Pixel 8"))
        assertThat(title(session(deviceVendor = "Xiaomi", deviceModel = "Xiaomi 13"))).isEqualTo(Title.Model("Xiaomi 13"))
    }

    @Test
    fun `navigateur sur systeme puis navigateur seul puis inconnu`() {
        assertThat(title(session(browserName = "Chrome", osName = "macOS"))).isEqualTo(Title.BrowserOnOs("Chrome", "macOS"))
        assertThat(title(session(browserName = "Chrome"))).isEqualTo(Title.Browser("Chrome"))
        assertThat(title(session(osName = "macOS"))).isEqualTo(Title.Unknown)
        assertThat(title(session(deviceName = "  "))).isEqualTo(Title.Unknown)
    }

    @Test
    fun `l icone vient du type puis de la plateforme puis de isMobile`() {
        fun icon(s: UserSession) = SessionRowPresentation.of(s, now).icon
        assertThat(icon(session(deviceType = "Tablet", platform = "web"))).isEqualTo(Icon.TABLET)
        assertThat(icon(session(deviceType = "mobile"))).isEqualTo(Icon.PHONE)
        assertThat(icon(session(deviceType = "desktop", platform = "ios"))).isEqualTo(Icon.DESKTOP)
        assertThat(icon(session(platform = "ios", deviceModel = "iPad14,1"))).isEqualTo(Icon.TABLET)
        assertThat(icon(session(platform = "ios", deviceModel = "iPhone15,2"))).isEqualTo(Icon.PHONE)
        assertThat(icon(session(platform = "android-shell"))).isEqualTo(Icon.ANDROID_APP)
        assertThat(icon(session(platform = "pwa"))).isEqualTo(Icon.WEB)
        assertThat(icon(session(isMobile = true))).isEqualTo(Icon.PHONE)
        assertThat(icon(session())).isEqualTo(Icon.DESKTOP)
    }

    @Test
    fun `le logiciel porte version build navigateur majeur systeme et plateforme`() {
        val s = UserSession(
            id = "s", appVersion = "1.2.0", appBuild = "1874", browserName = "Chrome", browserVersion = "129.0.6668",
            osName = "Android", osVersion = "15", platform = "android-shell",
        )
        assertThat(SessionRowPresentation.of(s, now).software).isEqualTo(
            SessionRowPresentation.Software("1.2.0", "1874", "Chrome", "129", "Android", "15", Platform.ANDROID_APP),
        )
    }

    @Test
    fun `ios sans nom de systeme se dit iOS et rien ne se dit sans donnee`() {
        assertThat(SessionRowPresentation.of(UserSession(id = "s", platform = "ios", osVersion = "18.2"), now).software?.osName).isEqualTo("iOS")
        assertThat(SessionRowPresentation.of(UserSession(id = "s"), now).software).isNull()
    }

    @Test
    fun `le lieu garde ville pays code localisation et adresse`() {
        val s = UserSession(id = "s", city = "Lyon", country = "FR", ipAddress = "203.0.113.4", location = " ")
        assertThat(SessionRowPresentation.of(s, now).place).isEqualTo(SessionRowPresentation.Place("Lyon", "FR", null, "203.0.113.4"))
        assertThat(SessionRowPresentation.of(UserSession(id = "s", country = ""), now).place).isNull()
    }

    @Test
    fun `fuseau et mode de connexion`() {
        val s = UserSession(id = "s", timezone = "Europe/Paris", loginMethod = "two_factor", createdAt = "2026-10-01T00:00:00Z")
        val p = SessionRowPresentation.of(s, now)
        assertThat(p.timezone).isEqualTo("Europe/Paris")
        assertThat(p.loginMethod).isEqualTo(LoginMethod.TWO_FACTOR)
        assertThat(p.openedAtMillis).isEqualTo(1_790_812_800_000L)
        listOf("password", "magic_link", "registration", "email_verification", "oauth", "anonymous").forEach {
            assertThat(LoginMethod.from(it)).isNotNull()
        }
        assertThat(LoginMethod.from("nouveau")).isNull()
    }

    @Test
    fun `activite ActiveNow sous le seuil, Since au dela, jamais dans le futur`() {
        fun activity(last: Long?, current: Boolean = false) = SessionRowPresentation.of(
            UserSession(id = "s", lastActivityAt = last?.let { me.meeshy.sdk.model.WireDate.string(it) }, isCurrentSession = current), now,
        ).activity
        assertThat(activity(now - 30_000)).isEqualTo(Activity.ActiveNow)
        assertThat(activity(now - 3_600_000)).isEqualTo(Activity.Since(now - 3_600_000))
        assertThat(activity(now + 5_000_000)).isEqualTo(Activity.ActiveNow)
        assertThat(activity(null)).isNull()
        assertThat(activity(null, current = true)).isEqualTo(Activity.ActiveNow)
    }

    @Test
    fun `la presentation ne contient aucune chaine localisee`() {
        val p = SessionRowPresentation.of(UserSession(id = "s", city = "Lyon", country = "FR", loginMethod = "password"), now)
        assertThat(p.toString()).doesNotContain("approximatif")
        assertThat(p.toString()).doesNotContain("Connexion")
    }
}
