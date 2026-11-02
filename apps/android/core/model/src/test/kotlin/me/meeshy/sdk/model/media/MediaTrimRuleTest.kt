package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryMediaObject
import org.junit.Test

class MediaTrimRuleTest {

    private val whole = MediaTrimBounds(0.0, 10.0)

    @Test
    fun `la poignee de gauche s arrete a 0,4 s de la droite`() {
        val moved = MediaTrimRule.movingStart(MediaTrimBounds(2.0, 5.0), 99.0, 10.0)
        assertThat(moved.start).isWithin(1e-9).of(4.6)
        assertThat(moved.end).isEqualTo(5.0)
    }

    @Test
    fun `la poignee de droite s arrete a 0,4 s de la gauche sans pousser l autre`() {
        val moved = MediaTrimRule.movingEnd(MediaTrimBounds(2.0, 5.0), -99.0, 10.0)
        assertThat(moved.end).isWithin(1e-9).of(2.4)
        assertThat(moved.start).isEqualTo(2.0)
    }

    @Test
    fun `les poignees restent dans le fichier`() {
        assertThat(MediaTrimRule.movingStart(whole, -5.0, 10.0).start).isEqualTo(0.0)
        assertThat(MediaTrimRule.movingEnd(whole, 5.0, 10.0).end).isEqualTo(10.0)
    }

    @Test
    fun `un fichier plus court que le plancher ne produit pas de fenetre inversee`() {
        val moved = MediaTrimRule.movingEnd(MediaTrimBounds(0.0, 0.3), -1.0, 0.3)
        assertThat(moved.end).isAtLeast(moved.start)
    }

    @Test
    fun `les points se convertissent en secondes sur la source entiere`() {
        assertThat(MediaTrimRule.seconds(50f, 200f, 20.0)).isWithin(1e-9).of(5.0)
        assertThat(MediaTrimRule.seconds(-50f, 200f, 20.0)).isWithin(1e-9).of(-5.0)
        assertThat(MediaTrimRule.seconds(50f, 0f, 20.0)).isEqualTo(0.0)
    }

    @Test
    fun `des bornes egales a l integrale ne sont pas persistees, a epsilon pres`() {
        assertThat(whole.persisted(10.0)).isNull()
        assertThat(MediaTrimBounds(0.005, 9.995).persisted(10.0)).isNull()
        assertThat(MediaTrimBounds(0.02, 10.0).persisted(10.0)).isNotNull()
        assertThat(MediaTrimBounds(0.0, 9.98).persisted(10.0)).isNotNull()
    }

    @Test
    fun `rogner ecrit trois champs et rien n est ecrit sans rognage`() {
        assertThat(MediaTrimRule.fields(whole, 10.0)).isEqualTo(MediaTrimFields(null, null, 10.0))
        assertThat(MediaTrimRule.fields(MediaTrimBounds(2.0, 6.0), 10.0))
            .isEqualTo(MediaTrimFields(2.0, 6.0, 4.0))
    }

    @Test
    fun `des bornes absentes ou aberrantes valent la source entiere`() {
        assertThat(MediaTrimRule.resolved(null, null, 10.0)).isEqualTo(whole)
        assertThat(MediaTrimRule.resolved(9.9, 10.0, 10.0)).isEqualTo(whole)
        assertThat(MediaTrimRule.resolved(3.0, 1.0, 10.0)).isEqualTo(whole)
        assertThat(MediaTrimRule.resolved(2.0, 50.0, 10.0)).isEqualTo(MediaTrimBounds(2.0, 10.0))
        assertThat(MediaTrimRule.resolved(1.0, 2.0, 0.0)).isEqualTo(MediaTrimBounds(0.0, 0.0))
    }

    @Test
    fun `les objets media et son de story exposent la meme fenetre`() {
        val media = StoryMediaObject(id = "m", sourceStart = 1.0, sourceEnd = 4.0)
        val sound = StoryAudioPlayerObject(id = "a", sourceStart = 1f, sourceEnd = 4f)
        assertThat(media.trimBounds(10.0)).isEqualTo(MediaTrimBounds(1.0, 4.0))
        assertThat(sound.trimBounds(10.0)).isEqualTo(MediaTrimBounds(1.0, 4.0))
        assertThat(StoryMediaObject(id = "n").trimBounds(10.0)).isEqualTo(whole)
    }
}
