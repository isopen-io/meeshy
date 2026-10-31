package me.meeshy.sdk.model.scene.export

import com.google.common.truth.Truth.assertThat
import kotlin.math.hypot
import me.meeshy.sdk.model.PresenceState
import org.junit.Test

/** #13997 : où l'intro pose le point de présence et le logo de cercle — mesuré sur la géométrie, pas sur des pixels. */
class StoryExportIdentityLayoutTest {

    private fun identity(presence: PresenceState? = null, badge: String? = null, mood: String? = null, username: String = "aicha") =
        StoryExportIdentity("Aïcha", username, null, null, "6366F1", mood, null, presence, badge)

    private fun layout(identity: StoryExportIdentity) = StoryExportIdentityLayout.of(identity, 1080f, 1920f)

    @Test
    fun `no presence in the projection paints no dot`() {
        assertThat(layout(identity(presence = null)).presenceDot).isNull()
    }

    @Test
    fun `the dot is 22 percent of the avatar and sits on its bottom right edge`() {
        val laid = layout(identity(presence = PresenceState.AWAY))
        val dot = laid.presenceDot!!
        assertThat(dot.state).isEqualTo(PresenceState.AWAY)
        assertThat(dot.diameter).isWithin(1e-3f).of(laid.avatarSide * 0.22f)
        val centreX = laid.avatarLeft + laid.avatarSide / 2f
        val centreY = laid.avatarTop + laid.avatarSide / 2f
        assertThat(hypot(dot.centerX - centreX, dot.centerY - centreY)).isWithin(1e-2f).of(laid.avatarSide / 2f)
        assertThat(dot.centerX).isGreaterThan(centreX)
        assertThat(dot.centerY).isGreaterThan(centreY)
        assertThat(dot.ringWidth).isGreaterThan(0f)
    }

    @Test
    fun `the circle logo rides the name line at the right of the name, in the same run`() {
        assertThat(layout(identity(badge = "🔥")).nameLine).isEqualTo("Aïcha 🔥")
        assertThat(layout(identity(badge = "🩸")).nameLine).isEqualTo("Aïcha 🩸")
        assertThat(layout(identity(badge = null)).nameLine).isEqualTo("Aïcha")
    }

    @Test
    fun `the painted suffix after the name is the circle logo alone, nothing below Close`() {
        assertThat(layout(identity(badge = "🔥")).nameSuffix).isEqualTo(" 🔥")
        assertThat(layout(identity(badge = null)).nameSuffix).isEmpty()
    }

    @Test
    fun `the avatar is centred and the mood row only exists with an emoji`() {
        val laid = layout(identity())
        assertThat(laid.avatarLeft + laid.avatarSide / 2f).isWithin(1e-3f).of(540f)
        assertThat(laid.moodCenterY).isNull()
        assertThat(layout(identity(mood = "😴")).moodCenterY).isGreaterThan(laid.handleTop)
    }

    @Test
    fun `a handle identical to the name is not repeated`() {
        assertThat(layout(identity(username = "aicha")).handleText).isEqualTo("@aicha")
        assertThat(layout(identity(username = "Aïcha")).handleText).isNull()
        assertThat(layout(identity(username = "")).handleText).isNull()
    }
}
