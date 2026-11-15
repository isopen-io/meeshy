package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.game.GameActsRing
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Test

class ChromeAvatarButtonTest {

    @Test
    fun `the ring is indigo600 to indigo300 when the ladder is closed`() {
        assertThat(chromeAvatarRingColors(menuExpanded = false))
            .containsExactly(MeeshyPalette.Indigo600, MeeshyPalette.Indigo300)
            .inOrder()
    }

    @Test
    fun `the ring turns error to indigo300 when the ladder is expanded`() {
        assertThat(chromeAvatarRingColors(menuExpanded = true))
            .containsExactly(MeeshyPalette.Error, MeeshyPalette.Indigo300)
            .inOrder()
    }

    @Test
    fun `a stored avatar key resolves against the API base so the chrome shows the photo`() {
        assertThat(chromeAvatarModel("avatars/user/u1.jpg", "https://gate.staging.meeshy.me/api/v1/"))
            .isEqualTo("https://gate.staging.meeshy.me/api/v1/attachments/file/avatars/user/u1.jpg")
    }

    @Test
    fun `no photo yields no model, so the initials show`() {
        assertThat(chromeAvatarModel(null, "https://gate.meeshy.me/api/v1/")).isNull()
        assertThat(chromeAvatarModel("", "https://gate.meeshy.me/api/v1/")).isNull()
        assertThat(chromeAvatarModel("  ", "https://gate.meeshy.me/api/v1/")).isNull()
    }

    @Test
    fun `a full photo URL is kept as served`() {
        assertThat(chromeAvatarModel("https://gate.meeshy.me/u/avatar.png", "https://gate.meeshy.me/api/v1/"))
            .isEqualTo("https://gate.meeshy.me/u/avatar.png")
    }

    @Test
    fun `the unread badge shows only while the ladder is closed and something is unread`() {
        assertThat(chromeBadgeVisible(menuExpanded = false, unreadCount = 3)).isTrue()
        assertThat(chromeBadgeVisible(menuExpanded = true, unreadCount = 3)).isFalse()
        assertThat(chromeBadgeVisible(menuExpanded = false, unreadCount = 0)).isFalse()
    }

    @Test
    fun `the avatar sits inside the gradient disc with a visible ring`() {
        assertThat(CHROME_AVATAR_SIZE_DP).isAtLeast(38f)
        assertThat(CHROME_AVATAR_SIZE_DP).isAtMost(44f)
        assertThat(CHROME_AVATAR_SIZE_DP).isLessThan(me.meeshy.ui.component.chrome.FloatingButtonSize.value)
    }

    @Test
    fun `the badge sits on the top trailing shoulder of the disc`() {
        assertThat(CHROME_BADGE_OFFSET_DP).isEqualTo(16f)
    }

    @Test
    fun `the feed disc is filled error to indigo300`() {
        assertThat(feedButtonGradientColors())
            .containsExactly(MeeshyPalette.Error, MeeshyPalette.Indigo300)
            .inOrder()
    }

    @Test
    fun `the chrome avatar wears the contour the user equipped, inside the gradient disc like iOS`() {
        val ring = ServedProfileDecorItem(pack = "contours-essentiels", item = "filet")
        val user = MeeshyUser(id = "u1", username = "mira", profileDecor = ServedProfileDecor(avatarRing = ring))

        assertThat(chromeAvatarDecorRing(user)).isEqualTo(ring)
        assertThat(chromeAvatarDecorRing(user.copy(profileDecor = null))).isNull()
        assertThat(chromeAvatarDecorRing(null)).isNull()
    }

    @Test
    fun `TalkBack lit les notifications puis les actes du jour, menu ferme`() {
        assertThat(chromeMenuA11yValue(notifications = "3 notifications en attente", acts = "Actes du jour : 2 sur 3", menuExpanded = false))
            .isEqualTo("3 notifications en attente, Actes du jour : 2 sur 3")
        assertThat(chromeMenuA11yValue(notifications = null, acts = "Actes du jour : 2 sur 3", menuExpanded = false))
            .isEqualTo("Actes du jour : 2 sur 3")
    }

    @Test
    fun `menu ouvert, les actes se taisent et les notifications restent`() {
        assertThat(chromeMenuA11yValue(notifications = "3 notifications en attente", acts = "Actes du jour : 2 sur 3", menuExpanded = true))
            .isEqualTo("3 notifications en attente")
        assertThat(chromeMenuA11yValue(notifications = null, acts = "Actes du jour : 2 sur 3", menuExpanded = true)).isNull()
        assertThat(chromeMenuA11yValue(notifications = null, acts = null, menuExpanded = false)).isNull()
    }

    @Test
    fun `chaque acte se dessine en arc depuis le haut, dans le sens des aiguilles`() {
        val arcs = chromeActsRingArcs(GameActsRing(done = 1, total = 3))
        assertThat(arcs).hasSize(3)
        assertThat(arcs.map { it.isDone }).containsExactly(true, false, false).inOrder()
        assertThat(arcs[0].startAngle).isWithin(1e-3f).of(-90f + 360f * 7f / 300f)
        assertThat(arcs[0].sweepAngle).isWithin(1e-3f).of(120f - 360f * 14f / 300f)
        assertThat(arcs[1].startAngle).isWithin(1e-3f).of(30f + 360f * 7f / 300f)
    }
}
