package me.meeshy.app.conversations

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.model.ShareLinkEditDraft
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Revue de l'épure (#17697, règle 7) : « Autoriser » et « Demander aux invités » ont remplacé
 * « Droits des invités sans compte » et « Conditions d'entrée ». Le titre court ne dit plus À QUI
 * s'appliquent les droits : la fiche du lien et son formulaire gardent, visible au repos, la phrase
 * qui le dit — la même que la création du lien.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ShareLinkGuestScopeTest {

    @get:Rule
    val compose = createComposeRule()

    private val link = MyShareLink(id = "link-1", name = "Invitation")

    @Test
    fun configurationCard_saysWhoTheRightsAreFor() {
        compose.setContent { MeeshyTheme { ShareLinkConfigurationCard(link = link, onEdit = {}) } }

        compose.onNodeWithText("What anonymous guests can do").assertIsDisplayed()
        compose.onNodeWithText("What visitors must provide in order to join").assertIsDisplayed()
    }

    @Test
    fun editForm_saysWhoTheRightsAreFor() {
        compose.setContent {
            MeeshyTheme {
                ShareLinkEditForm(
                    draft = ShareLinkEditDraft.from(link),
                    isActive = true,
                    canSave = false,
                    isSaving = false,
                    nowMillis = 0L,
                    onDraftChange = {},
                    onSave = {},
                    onToggleActive = {},
                    onDelete = {},
                )
            }
        }

        compose.onNodeWithText("What anonymous guests can do").assertExists()
        compose.onNodeWithText("What visitors must provide in order to join").assertExists()
    }
}
