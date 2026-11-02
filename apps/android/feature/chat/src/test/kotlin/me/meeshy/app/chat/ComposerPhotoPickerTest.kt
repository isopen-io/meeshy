package me.meeshy.app.chat

import android.content.Intent
import androidx.activity.ComponentActivity
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.composer.ComposerConfiguration
import me.meeshy.ui.component.composer.UniversalComposerSpec
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/** #14286 — la porte Photos ouvre le sélecteur de photos du système, jamais le sélecteur de fichiers (documentsui). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerPhotoPickerTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `la porte Photos ne lance pas le sélecteur de fichiers`() {
        val spec = UniversalComposerSpec(
            configuration = ComposerConfiguration.COMMENT,
            draft = "",
            placeholder = "Commenter...",
            canSend = false,
            onDraftChange = {},
            onSend = {},
            onAttachUris = { _ -> },
            onAttachFile = { _, _, _ -> },
        )
        compose.setContent { MeeshyTheme(darkTheme = false) { UniversalComposerHost(spec, Modifier) } }

        compose.onNodeWithContentDescription(compose.activity.getString(R.string.composer_attach_photo)).performClick()

        val launched = shadowOf(compose.activity).nextStartedActivityForResult?.intent
        assertThat(launched).isNotNull()
        assertThat(launched!!.action).isNotEqualTo(Intent.ACTION_GET_CONTENT)
    }
}
