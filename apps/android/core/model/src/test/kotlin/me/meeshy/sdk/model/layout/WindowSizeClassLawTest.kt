package me.meeshy.sdk.model.layout

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Classes de taille de la FENETRE de l'activite (jamais l'ecran) — seuils Material :
 * largeur 600 / 840 dp, hauteur 480 / 900 dp. Miroir de la `UserInterfaceSizeClass` iOS
 * (`.regular` = Medium ou Expanded).
 */
class WindowSizeClassLawTest {

    @Test
    fun `a phone in portrait is compact in width`() {
        assertThat(WindowSizeClassLaw.widthClass(411f)).isEqualTo(WindowWidthClass.COMPACT)
    }

    @Test
    fun `the width just under six hundred stays compact`() {
        assertThat(WindowSizeClassLaw.widthClass(599.9f)).isEqualTo(WindowWidthClass.COMPACT)
    }

    @Test
    fun `six hundred dp opens the medium width class`() {
        assertThat(WindowSizeClassLaw.widthClass(600f)).isEqualTo(WindowWidthClass.MEDIUM)
    }

    @Test
    fun `the width just under eight hundred forty stays medium`() {
        assertThat(WindowSizeClassLaw.widthClass(839.9f)).isEqualTo(WindowWidthClass.MEDIUM)
    }

    @Test
    fun `eight hundred forty dp opens the expanded width class`() {
        assertThat(WindowSizeClassLaw.widthClass(840f)).isEqualTo(WindowWidthClass.EXPANDED)
    }

    @Test
    fun `half of a tablet in split screen is compact again`() {
        // Une tablette de 1280 dp coupee en deux : la fenetre fait ~640 dp, pas 1280.
        assertThat(WindowSizeClassLaw.widthClass(1280f / 2f - 4f)).isEqualTo(WindowWidthClass.MEDIUM)
        assertThat(WindowSizeClassLaw.widthClass(1280f / 3f)).isEqualTo(WindowWidthClass.COMPACT)
    }

    @Test
    fun `a negative or unknown width falls back to compact`() {
        assertThat(WindowSizeClassLaw.widthClass(-1f)).isEqualTo(WindowWidthClass.COMPACT)
        assertThat(WindowSizeClassLaw.widthClass(Float.NaN)).isEqualTo(WindowWidthClass.COMPACT)
    }

    @Test
    fun `height thresholds are four hundred eighty and nine hundred dp`() {
        assertThat(WindowSizeClassLaw.heightClass(479.9f)).isEqualTo(WindowHeightClass.COMPACT)
        assertThat(WindowSizeClassLaw.heightClass(480f)).isEqualTo(WindowHeightClass.MEDIUM)
        assertThat(WindowSizeClassLaw.heightClass(899.9f)).isEqualTo(WindowHeightClass.MEDIUM)
        assertThat(WindowSizeClassLaw.heightClass(900f)).isEqualTo(WindowHeightClass.EXPANDED)
    }

    @Test
    fun `classify combines both axes`() {
        assertThat(WindowSizeClassLaw.classify(widthDp = 891f, heightDp = 411f))
            .isEqualTo(WindowSizeClass(WindowWidthClass.EXPANDED, WindowHeightClass.COMPACT))
    }

    @Test
    fun `only the compact width is narrow`() {
        assertThat(WindowWidthClass.COMPACT.isWide).isFalse()
        assertThat(WindowWidthClass.MEDIUM.isWide).isTrue()
        assertThat(WindowWidthClass.EXPANDED.isWide).isTrue()
    }

    @Test
    fun `a flat or absent fold is the normal posture`() {
        assertThat(WindowPostureLaw.resolve(isHalfOpened = false, isHingeHorizontal = true))
            .isEqualTo(WindowPosture.NORMAL)
        assertThat(WindowPostureLaw.resolve(isHalfOpened = null, isHingeHorizontal = null))
            .isEqualTo(WindowPosture.NORMAL)
    }

    @Test
    fun `a half opened horizontal hinge is the tabletop posture`() {
        assertThat(WindowPostureLaw.resolve(isHalfOpened = true, isHingeHorizontal = true))
            .isEqualTo(WindowPosture.TABLETOP)
    }

    @Test
    fun `a half opened vertical hinge is the book posture`() {
        assertThat(WindowPostureLaw.resolve(isHalfOpened = true, isHingeHorizontal = false))
            .isEqualTo(WindowPosture.BOOK)
    }
}
