package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.avatar.AvatarDotTone
import me.meeshy.sdk.model.avatar.AvatarPresenceDot
import me.meeshy.sdk.model.avatar.ConversationHere
import me.meeshy.sdk.model.avatar.PresenceArrival
import me.meeshy.sdk.model.avatar.PresenceHereWave
import kotlin.math.hypot
import org.junit.Test

class PresenceStyleTest {

    private val online = AvatarPresenceDot.Presence(PresenceState.ONLINE)

    @Test
    fun `le diametre suit 26 pour cent de l'avatar et 30 pour cent pour ici`() {
        assertThat(PresenceStyle.dotDiameter(online, 100f)).isWithin(0.001f).of(26f)
        assertThat(PresenceStyle.dotDiameter(AvatarPresenceDot.Here, 100f)).isWithin(0.001f).of(30f)
    }

    @Test
    fun `le diametre ne descend jamais sous 6 dp`() {
        assertThat(PresenceStyle.dotDiameter(online, 20f)).isEqualTo(6f)
        assertThat(PresenceStyle.dotDiameter(AvatarPresenceDot.Here, 16f)).isEqualTo(6f)
    }

    @Test
    fun `le centre du point tombe sur le cercle de l'avatar a 45 degres`() {
        val avatar = 48f
        val diameter = PresenceStyle.dotDiameter(online, avatar)
        val shift = AvatarPresenceDot.centerOffset(avatar, avatar, diameter)
        val centerX = avatar - diameter / 2f + shift
        val centerY = avatar - diameter / 2f + shift
        val distance = hypot(centerX - avatar / 2f, centerY - avatar / 2f)
        assertThat(distance).isWithin(0.01f).of(avatar / 2f)
        assertThat(centerX).isEqualTo(centerY)
    }

    @Test
    fun `avec un anneau de story le point reste sur le cercle de l'avatar`() {
        val avatar = 48f
        val frame = 54f
        val diameter = PresenceStyle.dotDiameter(online, avatar)
        val shift = AvatarPresenceDot.centerOffset(avatar, frame, diameter)
        val center = frame - diameter / 2f + shift
        assertThat(hypot(center - frame / 2f, center - frame / 2f)).isWithin(0.01f).of(avatar / 2f)
    }

    @Test
    fun `les ondes de ici suivent concentre repos et actif`() {
        assertThat(PresenceHereWave.forHere(ConversationHere.FOCUSED)).isEqualTo(PresenceHereWave(1.25f, 0.2f, 2800))
        assertThat(PresenceHereWave.forHere(ConversationHere.HERE)).isEqualTo(PresenceHereWave(1.6f, 0.3f, 2400))
        assertThat(PresenceHereWave.forHere(ConversationHere.ACTIVE)).isEqualTo(PresenceHereWave(1.9f, 0.4f, 1800))
        assertThat(PresenceHereWave.forHere(ConversationHere.ABSENT)).isNull()
    }

    @Test
    fun `l'anneau d'arrivee trace 3 s'etend x3 et s'eteint en 0,9 s`() {
        assertThat(PresenceArrival.LINE_WIDTH).isEqualTo(3f)
        assertThat(PresenceArrival.PEAK_SCALE).isEqualTo(3f)
        assertThat(PresenceArrival.START_OPACITY).isEqualTo(0.9f)
        assertThat(PresenceArrival.DURATION_MILLIS).isEqualTo(900)
    }

    @Test
    fun `seul en ligne pulse et hors ligne ne rend rien`() {
        assertThat(PresenceStyle.pulses(PresenceState.ONLINE)).isTrue()
        assertThat(PresenceStyle.pulses(PresenceState.AWAY)).isFalse()
        assertThat(PresenceStyle.showsIndicator(PresenceState.OFFLINE)).isFalse()
        assertThat(PresenceStyle.showsIndicator(null)).isFalse()
    }
}

class PresenceStateColorTest {
    @Test
    fun `une seule table donne la teinte des quatre etats`() {
        assertThat(PresenceStyle.dotTone(PresenceState.ONLINE)).isEqualTo(AvatarDotTone.ONLINE)
        assertThat(PresenceStyle.dotTone(PresenceState.AWAY)).isEqualTo(AvatarDotTone.AWAY)
        assertThat(PresenceStyle.dotTone(PresenceState.IDLE)).isEqualTo(AvatarDotTone.IDLE)
        assertThat(PresenceStyle.dotTone(PresenceState.OFFLINE)).isNull()
        assertThat(PresenceStyle.dotTone(null)).isNull()
    }

    @Test
    fun `la teinte de la table s'accorde avec celle du point resolu`() {
        PresenceState.entries.forEach { state ->
            assertThat(AvatarPresenceDot.resolve(state, isHere = false)?.tone).isEqualTo(PresenceStyle.dotTone(state))
        }
    }

    @Test
    fun `ici l'emporte sur toute presence`() {
        PresenceState.entries.forEach { state ->
            assertThat(AvatarPresenceDot.resolve(state, isHere = true)).isEqualTo(AvatarPresenceDot.Here)
        }
        assertThat(AvatarPresenceDot.resolve(null, isHere = true)).isEqualTo(AvatarPresenceDot.Here)
    }
}
