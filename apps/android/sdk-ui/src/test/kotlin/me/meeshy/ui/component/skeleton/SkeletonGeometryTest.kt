package me.meeshy.ui.component.skeleton

import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SkeletonGeometryTest {
    @Test
    fun `la publication du fil a les dimensions d'iOS`() {
        val p = SkeletonGeometry.FeedPost
        assertThat(p.avatar).isEqualTo(40.dp)
        assertThat(p.bodyLineCount).isEqualTo(3)
        assertThat(p.lastLineMaxWidth).isEqualTo(220.dp)
        assertThat(p.mediaHeight).isEqualTo(200.dp)
        assertThat(p.actionCount).isEqualTo(4)
        assertThat(p.listCount).isEqualTo(3)
    }

    @Test
    fun `l'en-tete de profil a les dimensions d'iOS`() {
        val h = SkeletonGeometry.ProfileHeader
        assertThat(h.banner).isEqualTo(120.dp)
        assertThat(h.avatar).isEqualTo(90.dp)
        assertThat(h.statCount).isEqualTo(3)
        assertThat(h.bioLastLineMaxWidth).isEqualTo(200.dp)
    }

    @Test
    fun `la vignette de story a six anneaux de 96 pour 88`() {
        val s = SkeletonGeometry.StoryThumb
        assertThat(s.trayCount).isEqualTo(6)
        assertThat(s.ring).isEqualTo(96.dp)
        assertThat(s.avatar).isEqualTo(88.dp)
    }

    @Test
    fun `la rangee de lien alterne ses largeurs sur quatre valeurs`() {
        val l = SkeletonGeometry.LinkRow
        assertThat(l.listCount).isEqualTo(4)
        assertThat((0..3).map { l.titleWidth(it) }).containsExactly(140.dp, 110.dp, 168.dp, 96.dp).inOrder()
        assertThat(l.subtitleWidth(5)).isEqualTo(150.dp)
    }

    @Test
    fun `le reflet squelette fait 120 dp en 1,5 s et le voile 60 pourcent en 2 s`() {
        assertThat(LoadingSheenStyle.SKELETON_BAND_DP).isEqualTo(120)
        assertThat(LoadingSheenStyle.SKELETON_DURATION_MILLIS).isEqualTo(1_500)
        assertThat(LoadingSheenStyle.Veil.bandFraction).isEqualTo(0.6f)
        assertThat(LoadingSheenStyle.Veil.durationMillis).isEqualTo(2_000)
        assertThat(LoadingSheenStyle.Veil.tint.alpha).isWithin(0.001f).of(0.15f)
    }
}
