package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.StoryTransitionEffect
import me.meeshy.sdk.model.UserPresence
import org.junit.Test

class StoryGroupIntroPolicyTest {

    @Test
    fun `aucun interlude a la premiere ouverture`() {
        assertThat(StoryGroupIntroPolicy.shouldPresentOnSwitch(previousGroupIndex = null, newGroupIndex = 0, isPreview = false, hasEntryStory = true)).isFalse()
    }

    @Test
    fun `un interlude a chaque changement de groupe en avant comme en arriere`() {
        assertThat(StoryGroupIntroPolicy.shouldPresentOnSwitch(0, 1, isPreview = false, hasEntryStory = true)).isTrue()
        assertThat(StoryGroupIntroPolicy.shouldPresentOnSwitch(2, 1, isPreview = false, hasEntryStory = true)).isTrue()
    }

    @Test
    fun `pas d interlude sans changement de groupe`() {
        assertThat(StoryGroupIntroPolicy.shouldPresentOnSwitch(1, 1, isPreview = false, hasEntryStory = true)).isFalse()
    }

    @Test
    fun `pas d interlude en apercu du composeur ni pour un groupe sans story affichable`() {
        assertThat(StoryGroupIntroPolicy.shouldPresentOnSwitch(0, 1, isPreview = true, hasEntryStory = true)).isFalse()
        assertThat(StoryGroupIntroPolicy.shouldPresentOnSwitch(0, 1, isPreview = false, hasEntryStory = false)).isFalse()
    }

    @Test
    fun `la retenue se raccourcit du recouvrement et ne devient jamais negative`() {
        assertThat(StoryGroupIntroPolicy.holdMillis(total = 500)).isEqualTo(300)
        assertThat(StoryGroupIntroPolicy.holdMillis(total = 100)).isEqualTo(0)
    }

    @Test
    fun `la sortie suit l ouverture du slide revele`() {
        assertThat(StoryGroupIntroPolicy.dismissal(StoryTransitionEffect.ZOOM)).isEqualTo(StoryGroupIntroDismissal.Spring)
        assertThat(StoryGroupIntroPolicy.dismissal(StoryTransitionEffect.SLIDE)).isEqualTo(StoryGroupIntroDismissal.Spring)
        assertThat(StoryGroupIntroPolicy.dismissal(StoryTransitionEffect.REVEAL)).isEqualTo(StoryGroupIntroDismissal.Tween(400))
        assertThat(StoryGroupIntroPolicy.dismissal(StoryTransitionEffect.FADE)).isEqualTo(StoryGroupIntroDismissal.Tween(300))
        assertThat(StoryGroupIntroPolicy.dismissal(null)).isEqualTo(StoryGroupIntroDismissal.Tween(300))
    }

    @Test
    fun `un double toucher saute, la moitie gauche revient, la droite saute`() {
        assertThat(StoryGroupIntroGesture.onDoubleTap()).isEqualTo(StoryGroupIntroAction.Skip)
        assertThat(StoryGroupIntroGesture.onTap(x = 10f, width = 100f)).isEqualTo(StoryGroupIntroAction.Back)
        assertThat(StoryGroupIntroGesture.onTap(x = 50f, width = 100f)).isEqualTo(StoryGroupIntroAction.Skip)
        assertThat(StoryGroupIntroGesture.onTap(x = 90f, width = 100f)).isEqualTo(StoryGroupIntroAction.Skip)
    }

    @Test
    fun `le detail de presence est reserve aux amis`() {
        val online = UserPresence(isOnline = true)
        assertThat(StoryGroupIntroPolicy.presenceDetail(isFriend = true, presence = online, nowEpochMillis = 0L)).isEqualTo(PresenceState.ONLINE)
        assertThat(StoryGroupIntroPolicy.presenceDetail(isFriend = false, presence = online, nowEpochMillis = 0L)).isNull()
    }

    @Test
    fun `un ami hors ligne ou sans presence servie n affiche aucun badge`() {
        assertThat(StoryGroupIntroPolicy.presenceDetail(true, UserPresence(isOnline = false), 0L)).isNull()
        assertThat(StoryGroupIntroPolicy.presenceDetail(true, null, 0L)).isNull()
    }

    @Test
    fun `un ami absent ou inactif garde son etat`() {
        val now = 10_000_000L
        val away = UserPresence(isOnline = false, lastActiveAt = java.time.Instant.ofEpochMilli(now - 120_000).toString())
        val idle = UserPresence(isOnline = false, lastActiveAt = java.time.Instant.ofEpochMilli(now - 240_000).toString())
        assertThat(StoryGroupIntroPolicy.presenceDetail(true, away, now)).isEqualTo(PresenceState.AWAY)
        assertThat(StoryGroupIntroPolicy.presenceDetail(true, idle, now)).isEqualTo(PresenceState.IDLE)
    }
}
