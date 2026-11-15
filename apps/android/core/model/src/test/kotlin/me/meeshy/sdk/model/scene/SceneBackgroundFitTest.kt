package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SceneBackgroundFitTest {
    private val portrait = 9.0 / 16.0
    private val landscape = 16.0 / 9.0

    @Test
    fun `le mode libre remplit comme sur iOS, portrait ou paysage`() {
        assertThat(SceneBackgroundFitLaw.resolve(null, landscape)).isEqualTo(SceneBackgroundFit.FILL)
        assertThat(SceneBackgroundFitLaw.resolve(null, portrait)).isEqualTo(SceneBackgroundFit.FILL)
    }

    @Test
    fun `l auto par orientation remplit en portrait et ajuste en paysage`() {
        assertThat(SceneBackgroundFitLaw.resolve(null, portrait, autoByOrientation = true)).isEqualTo(SceneBackgroundFit.FILL)
        assertThat(SceneBackgroundFitLaw.resolve(null, landscape, autoByOrientation = true)).isEqualTo(SceneBackgroundFit.FIT)
        assertThat(SceneBackgroundFitLaw.resolve(null, null, autoByOrientation = true)).isEqualTo(SceneBackgroundFit.FILL)
    }

    @Test
    fun `fit et fill forces priment sur l orientation`() {
        assertThat(SceneBackgroundFitLaw.resolve("fit", portrait, autoByOrientation = true)).isEqualTo(SceneBackgroundFit.FIT)
        assertThat(SceneBackgroundFitLaw.resolve("fill", landscape, autoByOrientation = true)).isEqualTo(SceneBackgroundFit.FILL)
    }

    @Test
    fun `une valeur inconnue vaut le mode libre`() {
        assertThat(SceneBackgroundFitLaw.resolve("zoom", landscape)).isEqualTo(SceneBackgroundFit.FILL)
    }
}
