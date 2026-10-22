package me.meeshy.ui.theme

import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * P0-3 contract: the brand type scale maps 1:1 to the iOS `MeeshyFont` sizes
 * (parity plan §3.5) and every role carries the Nunito rounded family.
 */
class MeeshyTypographyTest {

    @Test
    fun `screen title and large title match iOS sizes`() {
        assertThat(MeeshyTypography.displayLarge.fontSize.value).isEqualTo(46f) // screen title
        assertThat(MeeshyTypography.displayMedium.fontSize.value).isEqualTo(34f) // largeTitle
    }

    @Test
    fun `iOS role sizes are mapped onto Material roles`() {
        assertThat(MeeshyTypography.headlineSmall.fontSize.value).isEqualTo(22f) // title
        assertThat(MeeshyTypography.titleLarge.fontSize.value).isEqualTo(22f) // title
        assertThat(MeeshyTypography.titleMedium.fontSize.value).isEqualTo(17f) // headline
        assertThat(MeeshyTypography.bodyMedium.fontSize.value).isEqualTo(15f) // body
        assertThat(MeeshyTypography.bodySmall.fontSize.value).isEqualTo(13f) // subhead
        assertThat(MeeshyTypography.labelSmall.fontSize.value).isEqualTo(11f) // footnote
    }

    @Test
    fun `every role uses the Nunito brand family`() {
        val roles = listOf(
            MeeshyTypography.displayLarge, MeeshyTypography.displayMedium,
            MeeshyTypography.headlineLarge, MeeshyTypography.headlineSmall,
            MeeshyTypography.titleLarge, MeeshyTypography.titleMedium,
            MeeshyTypography.bodyLarge, MeeshyTypography.bodyMedium, MeeshyTypography.bodySmall,
            MeeshyTypography.labelLarge, MeeshyTypography.labelMedium, MeeshyTypography.labelSmall,
        )
        roles.forEach { assertThat(it.fontFamily).isEqualTo(NunitoFontFamily) }
    }

    @Test
    fun `display titles are bold for the premium rounded look`() {
        assertThat(MeeshyTypography.displayLarge.fontWeight).isEqualTo(FontWeight.Bold)
        assertThat(MeeshyTypography.displayMedium.fontWeight).isEqualTo(FontWeight.Bold)
    }

    @Test
    fun `the font size scale runs from micro 9 to large title 34 like iOS MeeshyFont`() {
        assertThat(MeeshyFontSize.scale.map { it.value }).containsExactly(
            9f, 10f, 11f, 12f, 13f, 14f, 15f, 16f, 17f, 18f, 20f, 22f, 28f, 34f,
        ).inOrder()
        assertThat(MeeshyFontSize.micro).isEqualTo(9.sp)
        assertThat(MeeshyFontSize.largeTitle).isEqualTo(34.sp)
    }

    @Test
    fun `every font size is expressed in sp so it grows with the system font`() {
        MeeshyFontSize.scale.forEach { assertThat(it.isSp).isTrue() }
    }

    @Test
    fun `Material roles that mirror an iOS role take their size from the token`() {
        assertThat(MeeshyTypography.displayMedium.fontSize).isEqualTo(MeeshyFontSize.largeTitle)
        assertThat(MeeshyTypography.titleLarge.fontSize).isEqualTo(MeeshyFontSize.title)
        assertThat(MeeshyTypography.titleMedium.fontSize).isEqualTo(MeeshyFontSize.headline)
        assertThat(MeeshyTypography.bodyMedium.fontSize).isEqualTo(MeeshyFontSize.body)
        assertThat(MeeshyTypography.bodySmall.fontSize).isEqualTo(MeeshyFontSize.subhead)
        assertThat(MeeshyTypography.labelSmall.fontSize).isEqualTo(MeeshyFontSize.footnote)
    }
}
