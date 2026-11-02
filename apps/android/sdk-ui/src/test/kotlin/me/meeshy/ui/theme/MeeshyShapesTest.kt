package me.meeshy.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Les champs de saisie Material d'Android sont ARRONDIS (#13988) : sans `shapes`, Material 3 posait
 * ses 4 dp par défaut sur chaque `OutlinedTextField` de l'application.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyShapesTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `an outlined text field takes the rounded Meeshy field shape`() {
        var fieldShape: Shape? = null
        var extraSmall: Shape? = null
        compose.setContent {
            MeeshyTheme {
                fieldShape = OutlinedTextFieldDefaults.shape
                extraSmall = MaterialTheme.shapes.extraSmall
            }
        }
        compose.waitForIdle()
        assertThat(extraSmall).isEqualTo(RoundedCornerShape(MeeshyRadius.md))
        assertThat(fieldShape).isEqualTo(RoundedCornerShape(MeeshyRadius.md))
    }
}
