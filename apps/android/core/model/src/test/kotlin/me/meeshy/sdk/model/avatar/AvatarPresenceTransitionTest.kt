package me.meeshy.sdk.model.avatar

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import org.junit.Test

class AvatarPresenceTransitionTest {

    private val online = AvatarPresenceDot.Presence(PresenceState.ONLINE)
    private val away = AvatarPresenceDot.Presence(PresenceState.AWAY)

    private fun corner(
        context: AvatarContext = AvatarContext.PostAuthor,
        mood: String? = null,
        dot: AvatarPresenceDot? = null,
        here: ConversationHere = ConversationHere.ABSENT,
        enablePulse: Boolean = true,
        ring: Boolean = true,
        reduce: Boolean = false,
        isUser: Boolean = true,
    ) = AvatarCornerBadge.resolve(context, isUser, mood, dot, here, enablePulse, ring, reduce)

    @Test
    fun `hors ligne et presence absente ne rendent aucun point`() {
        assertThat(AvatarPresenceDot.resolve(PresenceState.OFFLINE, isHere = false)).isNull()
        assertThat(AvatarPresenceDot.resolve(null, isHere = false)).isNull()
    }

    @Test
    fun `vert orange gris selon l'etat`() {
        assertThat(online.tone).isEqualTo(AvatarDotTone.ONLINE)
        assertThat(away.tone).isEqualTo(AvatarDotTone.AWAY)
        assertThat(AvatarPresenceDot.Presence(PresenceState.IDLE).tone).isEqualTo(AvatarDotTone.IDLE)
    }

    @Test
    fun `ici prime sur la presence et se rend meme sans presence servie`() {
        assertThat(AvatarPresenceDot.resolve(null, isHere = true)).isEqualTo(AvatarPresenceDot.Here)
        assertThat(AvatarPresenceDot.resolve(PresenceState.OFFLINE, isHere = true)).isEqualTo(AvatarPresenceDot.Here)
        assertThat(AvatarPresenceDot.Here.tone).isEqualTo(AvatarDotTone.HERE)
    }

    @Test
    fun `seul online pulse et seul ici fait onde a l'arrivee`() {
        assertThat(online.pulses).isTrue()
        assertThat(away.pulses).isFalse()
        assertThat(AvatarPresenceDot.Here.pulses).isFalse()
        assertThat(AvatarPresenceDot.Here.arrivesWithRipple).isTrue()
        assertThat(online.arrivesWithRipple).isFalse()
    }

    @Test
    fun `le diametre suit 0,26 et 0,30 avec un plancher de 6`() {
        assertThat(online.diameter(100f)).isWithin(0.001f).of(26f)
        assertThat(AvatarPresenceDot.Here.diameter(100f)).isWithin(0.001f).of(30f)
        assertThat(online.diameter(20f)).isEqualTo(6f)
        assertThat(AvatarPresenceDot.Here.diameter(20f)).isEqualTo(6f)
    }

    @Test
    fun `la cle de transition distingue chaque point`() {
        assertThat(online.transitionKey).isEqualTo("presence.online")
        assertThat(AvatarPresenceDot.Here.transitionKey).isEqualTo("here")
        assertThat(setOf(online.transitionKey, away.transitionKey, "here")).hasSize(3)
    }

    @Test
    fun `le centre du point tombe sur le cercle de l'avatar`() {
        val offset = AvatarPresenceDot.centerOffset(avatarSize = 44f, frameSize = 44f, dotDiameter = 11.44f)
        assertThat(offset).isWithin(0.01f).of(22f + 22f * 0.70710678f - (44f - 5.72f))
    }

    @Test
    fun `aucun changement au premier rendu ni quand le point reste le meme`() {
        val state = AvatarPresenceTransition.initial(online)
        assertThat(state.changed).isFalse()
        assertThat(state.observe(online)).isEqualTo(state)
        assertThat(state.showsArrivalRipple(online, reduceMotion = false)).isFalse()
    }

    @Test
    fun `un vrai remplacement arme l'onde d'arrivee ici`() {
        val state = AvatarPresenceTransition.initial(online).observe(AvatarPresenceDot.Here)
        assertThat(state.changed).isTrue()
        assertThat(state.showsArrivalRipple(AvatarPresenceDot.Here, reduceMotion = false)).isTrue()
        assertThat(state.showsArrivalRipple(online, reduceMotion = false)).isFalse()
        assertThat(state.showsArrivalRipple(AvatarPresenceDot.Here, reduceMotion = true)).isFalse()
    }

    @Test
    fun `l'apparition ou la disparition d'un point compte comme changement`() {
        assertThat(AvatarPresenceTransition.initial(null).observe(online).changed).isTrue()
        assertThat(AvatarPresenceTransition.initial(online).observe(null).changed).isTrue()
    }

    @Test
    fun `sous reduction le remplacement se fait en fondu seul`() {
        assertThat(AvatarPresenceTransition.scalesOnReplace(reduceMotion = true)).isFalse()
        assertThat(AvatarPresenceTransition.scalesOnReplace(reduceMotion = false)).isTrue()
    }

    @Test
    fun `l'humeur masque le point de presence`() {
        val badge = corner(mood = "😀", dot = online)
        assertThat(badge).isInstanceOf(AvatarCornerBadge.Mood::class.java)
        assertThat((badge as AvatarCornerBadge.Mood).outline).isEqualTo(AvatarDotTone.ONLINE)
    }

    @Test
    fun `l'humeur est retiree dans un contexte qui l'interdit ou pour une entite`() {
        assertThat(corner(context = AvatarContext.PostComment, mood = "😀", dot = online, ring = false))
            .isEqualTo(AvatarCornerBadge.Dot(online, pulses = false))
        assertThat(corner(mood = "😀", dot = null, isUser = false)).isEqualTo(AvatarCornerBadge.None)
        assertThat(corner(mood = "", dot = null)).isEqualTo(AvatarCornerBadge.None)
    }

    @Test
    fun `l'humeur ne respire jamais en liste ni sous reduction`() {
        assertThat((corner(context = AvatarContext.ConversationList, mood = "😀") as AvatarCornerBadge.Mood).animates).isFalse()
        assertThat((corner(mood = "😀") as AvatarCornerBadge.Mood).animates).isTrue()
        assertThat((corner(mood = "😀", reduce = true) as AvatarCornerBadge.Mood).animates).isFalse()
        assertThat((corner(mood = "😀", enablePulse = false) as AvatarCornerBadge.Mood).animates).isFalse()
    }

    @Test
    fun `le pouls de l'humeur suit ce que fait le pair`() {
        assertThat(AvatarCornerBadge.moodPulseIntensity(ConversationHere.FOCUSED)).isWithin(0.0001f).of(0.05f)
        assertThat(AvatarCornerBadge.moodPulseIntensity(ConversationHere.ACTIVE)).isEqualTo(0.16f)
        assertThat(AvatarCornerBadge.moodPulseIntensity(ConversationHere.HERE)).isEqualTo(0.12f)
        assertThat((corner(mood = "😀", here = ConversationHere.FOCUSED) as AvatarCornerBadge.Mood).hushed).isTrue()
    }

    @Test
    fun `le point pulse seulement en ligne, avec anneau, autorise et sans reduction`() {
        assertThat(corner(dot = online)).isEqualTo(AvatarCornerBadge.Dot(online, pulses = true))
        assertThat(corner(dot = online, ring = false)).isEqualTo(AvatarCornerBadge.Dot(online, pulses = false))
        assertThat(corner(dot = online, reduce = true)).isEqualTo(AvatarCornerBadge.Dot(online, pulses = false))
        assertThat(corner(dot = away)).isEqualTo(AvatarCornerBadge.Dot(away, pulses = false))
        assertThat(corner()).isEqualTo(AvatarCornerBadge.None)
    }

    @Test
    fun `l'onde ici suit l'activite du pair`() {
        assertThat(PresenceHereWave.forHere(ConversationHere.ABSENT)).isNull()
        assertThat(PresenceHereWave.forHere(ConversationHere.HERE)).isEqualTo(PresenceHereWave.REST)
        assertThat(PresenceHereWave.forHere(ConversationHere.ACTIVE)).isEqualTo(PresenceHereWave.VIVID)
        assertThat(PresenceHereWave.forHere(ConversationHere.FOCUSED)).isEqualTo(PresenceHereWave.HUSH)
    }

    @Test
    fun `mouvement de la pastille d'humeur`() {
        assertThat(MoodBadgeMotion.motion(animates = true, reduceMotion = false, hushed = false)).isEqualTo(MoodMotion.BREATHE)
        assertThat(MoodBadgeMotion.motion(animates = true, reduceMotion = false, hushed = true)).isEqualTo(MoodMotion.HUSH)
        assertThat(MoodBadgeMotion.motion(animates = true, reduceMotion = true, hushed = true)).isEqualTo(MoodMotion.STILL)
        assertThat(MoodBadgeMotion.motion(animates = false, reduceMotion = false, hushed = false)).isEqualTo(MoodMotion.STILL)
        assertThat(MoodBadgeMotion.hitDiameter(9f)).isEqualTo(48f)
        assertThat(MoodBadgeMotion.hitDiameter(60f)).isEqualTo(60f)
        assertThat(MoodBadgeMotion.outlineWidth(22f)).isEqualTo(1.54f)
        assertThat(MoodBadgeMotion.outlineWidth(10f)).isEqualTo(1.5f)
    }
}
