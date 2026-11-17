package me.meeshy.ui.component.kit

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K31 — la carte de code : trois côtés, l'inclinaison bornée, la teinte servie à 4,5:1 et UN générateur de QR. */
class MeeshyCodeCardTest {

    private fun resolve(
        style: MeeshyCodeCardStyle = MeeshyCodeCardStyle.Glass,
        size: MeeshyCodeCardSize = MeeshyCodeCardSize.Compact,
        tilt: MeeshyCodeCardTilt = MeeshyCodeCardTilt.Device,
        isReady: Boolean = true,
        reduceMotion: Boolean = false,
    ) = MeeshyCodeCardRecipe.resolve(style, size, tilt, isReady, reduceMotion)

    @Test
    fun `les trois cotes sont 72 160 et 220`() {
        assertThat(MeeshyCodeCardSize.entries.map { it.side }).containsExactly(72.0, 160.0, 220.0).inOrder()
    }

    @Test
    fun `la carte fait le cote plus 98 sauf le mini qui n a que sa plaque`() {
        assertThat(resolve(size = MeeshyCodeCardSize.Compact).cardWidth).isEqualTo(258.0)
        assertThat(resolve(size = MeeshyCodeCardSize.Large).cardWidth).isEqualTo(318.0)
        assertThat(resolve(size = MeeshyCodeCardSize.Mini).cardWidth).isEqualTo(84.0)
    }

    @Test
    fun `marges et rayons de plaque suivent la taille`() {
        assertThat(MeeshyCodeCardSize.entries.map { MeeshyCodeCardRecipe.plateMargin(it) }).containsExactly(6.0, 12.0, 16.0).inOrder()
        assertThat(MeeshyCodeCardSize.entries.map { MeeshyCodeCardRecipe.plateRadius(it) }).containsExactly(14.0, 22.0, 28.0).inOrder()
    }

    @Test
    fun `seul le verre non mini s incline et se reflete et le mouvement reduit le redresse`() {
        assertThat(resolve().tilt).isEqualTo(MeeshyCodeCardTilt.Device)
        assertThat(resolve().hasReflection).isTrue()
        assertThat(resolve(style = MeeshyCodeCardStyle.Plain).tilt).isEqualTo(MeeshyCodeCardTilt.None)
        assertThat(resolve(size = MeeshyCodeCardSize.Mini).isGlass).isFalse()
        assertThat(resolve(reduceMotion = true).tilt).isEqualTo(MeeshyCodeCardTilt.None)
        assertThat(resolve(reduceMotion = true).hasReflection).isFalse()
        assertThat(resolve(tilt = MeeshyCodeCardTilt.Pointer).tilt).isEqualTo(MeeshyCodeCardTilt.Pointer)
    }

    @Test
    fun `la pastille centrale et la legende manquent au mini et la pastille sous 120`() {
        assertThat(resolve(size = MeeshyCodeCardSize.Mini).hasCenter).isFalse()
        assertThat(resolve(size = MeeshyCodeCardSize.Mini).hasCaption).isFalse()
        assertThat(resolve(size = MeeshyCodeCardSize.Compact).hasCenter).isTrue()
        assertThat(MeeshyCodeCardRecipe.centerSide(160.0)).isEqualTo(40.0)
        assertThat(MeeshyCodeCardRecipe.centerSide(119.0)).isEqualTo(0.0)
    }

    @Test
    fun `l inclinaison est bornee a 16 degres en lacet et 6 en tangage et le reflet balaie`() {
        val full = MeeshyCodeCardRecipe.motion(yaw = 50.0, pitch = -20.0)
        assertThat(full.yaw).isEqualTo(16.0)
        assertThat(full.pitch).isEqualTo(-6.0)
        assertThat(full.reflectionPosition).isWithin(1e-9).of(40.0 - 72.0)
        assertThat(full.plateShift).isWithin(1e-9).of(-7.0)
        assertThat(full.centerShift).isWithin(1e-9).of(-13.0)
        assertThat(MeeshyCodeCardRecipe.motion(Double.NaN, Double.NaN)).isEqualTo(MeeshyCodeCardMotion.Flat)
    }

    @Test
    fun `la plaque verre est claire et l encre sombre quel que soit le theme et la plaque claire est blanche`() {
        assertThat(MeeshyCodeCardRecipe.plateColor(MeeshyCodeCardStyle.Plain)).isEqualTo(Color.White)
        assertThat(MeeshyCodeCardRecipe.inkColor(MeeshyCodeCardStyle.Plain)).isEqualTo(Color.Black)
        assertThat(MeeshyCodeCardRecipe.plateColor(MeeshyCodeCardStyle.Glass)).isEqualTo(Color(0xFFF5F3FF))
        assertThat(MeeshyCodeCardRecipe.inkColor(MeeshyCodeCardStyle.Glass)).isEqualTo(Color(0xFF1B1140))
    }

    @Test
    fun `la teinte servie tient 4,5 sur la plaque`() {
        val plate = MeeshyCodeCardRecipe.plateColor(MeeshyCodeCardStyle.Glass)
        listOf(0xFFFDE68A, 0xFF6366F1, 0xFF34D399).forEach { argb ->
            val served = MeeshyCodeCardRecipe.servedTint(Color(argb), MeeshyCodeCardStyle.Glass)
            assertThat(MeeshyKitColor.contrast(served, plate)).isAtLeast(4.5)
        }
    }

    @Test
    fun `sans code pret le squelette tient la place`() {
        assertThat(resolve(isReady = false).showsSkeleton).isTrue()
        assertThat(resolve().showsSkeleton).isFalse()
    }

    @Test
    fun `le generateur unique rend une matrice carree stable avec les yeux aux trois coins`() {
        val first = MeeshyQrModules.encode("https://meeshy.me/u/alice")
        val again = MeeshyQrModules.encode("https://meeshy.me/u/alice")
        assertThat(first).isNotNull()
        assertThat(first!!.size).isEqualTo(again!!.size)
        assertThat(first.rows.map { it.toList() }).isEqualTo(again.rows.map { it.toList() })
        assertThat(first.size).isAtLeast(21)
        listOf(0 to 0, first.size - 7 to 0, 0 to first.size - 7).forEach { (x, y) ->
            assertThat(first[x, y]).isTrue()
            assertThat(first[x + 6, y + 6]).isTrue()
            assertThat(first[x + 1, y + 1]).isFalse()
            assertThat(first[x + 3, y + 3]).isTrue()
        }
        assertThat(MeeshyQrModules.isEye(2, 2, first.size)).isTrue()
        assertThat(MeeshyQrModules.isEye(10, 10, first.size)).isFalse()
    }

    @Test
    fun `un contenu vide ne rend pas de code`() {
        assertThat(MeeshyQrModules.encode("")).isNull()
    }
}
