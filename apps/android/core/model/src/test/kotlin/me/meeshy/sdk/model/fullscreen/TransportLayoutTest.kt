package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.fullscreen.TransportPlacement.CENTER
import me.meeshy.sdk.model.fullscreen.TransportPlacement.CORRIDOR
import me.meeshy.sdk.model.fullscreen.TransportPlacement.RAIL
import me.meeshy.sdk.model.fullscreen.TransportPlacement.STACKED
import me.meeshy.sdk.model.fullscreen.VideoControl.*
import org.junit.Test

class TransportLayoutTest {

    private val all = VideoControl.entries.toSet()

    @Test
    fun `le son et la sortie audio vont a la barre, vitesse boucle et PiP au menu`() {
        assertThat(TransportLayout.barItems(all)).containsExactly(TransportBarItem.MUTE, TransportBarItem.AUDIO_OUTPUT).inOrder()
        assertThat(TransportLayout.menuItems(all))
            .containsExactly(TransportMenuItem.SPEED, TransportMenuItem.LOOP, TransportMenuItem.PIP).inOrder()
    }

    @Test
    fun `le PiP est masque et non grise hors support`() {
        assertThat(TransportLayout.menuItems(all, pipSupported = false))
            .containsExactly(TransportMenuItem.SPEED, TransportMenuItem.LOOP).inOrder()
        assertThat(TransportLayout.showsMenuButton(setOf(PIP), pipSupported = false)).isFalse()
    }

    @Test
    fun `le menu propose cinq vitesses de 1,0 a 2,0`() {
        assertThat(TransportLayout.menuSpeeds.map { it.rate }).containsExactly(1.0f, 1.25f, 1.5f, 1.75f, 2.0f).inOrder()
    }

    @Test
    fun `empile montre centre barre items temps et verre`() {
        assertThat(TransportLayout.showsCenter(STACKED)).isTrue()
        assertThat(TransportLayout.showsBar(STACKED, setOf(MUTE))).isTrue()
        assertThat(TransportLayout.showsBarItems(STACKED)).isTrue()
        assertThat(TransportLayout.showsElapsedTime(STACKED, setOf(DURATION))).isTrue()
        assertThat(TransportLayout.showsTotalDuration(STACKED, setOf(DURATION))).isTrue()
        assertThat(TransportLayout.wrapsBarInGlass(STACKED)).isTrue()
    }

    @Test
    fun `centre seul ne montre que le play pause`() {
        assertThat(TransportLayout.showsCenter(CENTER)).isTrue()
        assertThat(TransportLayout.showsBar(CENTER, all)).isFalse()
        assertThat(TransportLayout.showsRail(CENTER, all)).isFalse()
        assertThat(TransportLayout.showsTotalDuration(CENTER, all)).isFalse()
    }

    @Test
    fun `le couloir porte la progression seule sans verre ni temps ecoule`() {
        assertThat(TransportLayout.showsBar(CORRIDOR, setOf(SCRUBBER))).isTrue()
        assertThat(TransportLayout.showsBar(CORRIDOR, setOf(MUTE, PIP))).isFalse()
        assertThat(TransportLayout.showsBarItems(CORRIDOR)).isFalse()
        assertThat(TransportLayout.showsElapsedTime(CORRIDOR, all)).isFalse()
        assertThat(TransportLayout.wrapsBarInGlass(CORRIDOR)).isFalse()
        assertThat(TransportLayout.showsCenter(CORRIDOR)).isFalse()
    }

    @Test
    fun `le rail n'existe que s'il a quelque chose a porter`() {
        assertThat(TransportLayout.showsRail(RAIL, setOf(MUTE))).isTrue()
        assertThat(TransportLayout.showsRail(RAIL, setOf(SPEED))).isTrue()
        assertThat(TransportLayout.showsRail(RAIL, setOf(PIP), pipSupported = false)).isFalse()
        assertThat(TransportLayout.showsRail(RAIL, setOf(SCRUBBER))).isFalse()
        assertThat(TransportLayout.showsRail(STACKED, all)).isFalse()
    }

    @Test
    fun `les sauts de dix secondes suivent le placement`() {
        assertThat(TransportLayout.showsSkip(STACKED, setOf(SCRUBBER))).isTrue()
        assertThat(TransportLayout.showsSkip(STACKED, setOf(SKIP))).isFalse()
        assertThat(TransportLayout.showsSkip(CENTER, setOf(SKIP))).isTrue()
        assertThat(TransportLayout.showsSkip(CENTER, setOf(SCRUBBER))).isFalse()
        assertThat(TransportLayout.showsSkip(CORRIDOR, all)).isFalse()
        assertThat(TransportLayout.showsSkip(RAIL, all)).isFalse()
    }

    @Test
    fun `efface a l'oeil le play pause reste accessible`() {
        assertThat(TransportLayout.keepsAccessiblePlayPause(false, setOf(PLAY_PAUSE))).isTrue()
        assertThat(TransportLayout.keepsAccessiblePlayPause(true, setOf(PLAY_PAUSE))).isFalse()
        assertThat(TransportLayout.keepsAccessiblePlayPause(false, setOf(MUTE))).isFalse()
    }
}
