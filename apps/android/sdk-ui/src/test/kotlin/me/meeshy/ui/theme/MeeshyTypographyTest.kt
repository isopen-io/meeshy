package me.meeshy.ui.theme

import androidx.compose.ui.text.font.FontWeight
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
}
