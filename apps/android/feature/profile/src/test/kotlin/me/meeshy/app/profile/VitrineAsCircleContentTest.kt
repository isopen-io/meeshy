package me.meeshy.app.profile

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import me.meeshy.ui.R as UiR

/**
 * Le contenu de « Voir comme » (#18887) se lit au lecteur d'écran : une rangée verrouillée est UN arrêt qui dit la capacité,
 * « verrouillé » et le cercle qui l'ouvre — jamais deux annonces pour une même rangée — et choisir un cercle déplace ce qu'il
 * ouvre de « Masqué » vers « Visible ».
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class VitrineAsCircleContentTest {

    @get:Rule
    val compose = createComposeRule()

    private val context = RuntimeEnvironment.getApplication()
    private val temporaryLocation = context.getString(R.string.vitrine_cap_location_temporary)
    private val friend = context.getString(UiR.string.circles_level_friend)

    private fun content(initial: RelationLevel = RelationLevel.PUBLIC) = compose.setContent {
        MeeshyTheme(darkTheme = false) {
            var level by remember { mutableStateOf(initial) }
            VitrineAsCircleContent(level = level, onSelect = { level = it })
        }
    }

    @Test
    fun `une rangée verrouillée est un seul arrêt du lecteur d'écran`() {
        content()

        VitrineAsCircle.view(RelationLevel.PUBLIC).locked
            .forEach { lock ->
                val title = context.getString(lock.capability.title)
                val stops = compose.onAllNodes(hasContentDescription("$title, ", substring = true)).fetchSemanticsNodes()
                assertWithMessage("« $title » : arrêts du lecteur d'écran").that(stops).hasSize(1)
            }
    }

    @Test
    fun `choisir Ami ouvre la position temporaire, qui quitte les rangées verrouillées`() {
        content()
        compose.onNode(hasContentDescription("$temporaryLocation, ", substring = true)).assertExists()

        compose.onNodeWithText(friend).performClick()

        compose.onNodeWithText(friend).assertIsSelected()
        compose.onNode(hasText(temporaryLocation)).assertExists()
        compose.onNode(hasContentDescription("$temporaryLocation, ", substring = true)).assertDoesNotExist()
    }
}
