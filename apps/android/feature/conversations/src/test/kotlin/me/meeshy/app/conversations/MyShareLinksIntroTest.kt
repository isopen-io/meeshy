package me.meeshy.app.conversations

import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Revue de l'épure (#17697, règle 7) : un lien de partage est une notion propre à Meeshy. Au repos, sous le
 * titre « Liens de partage », la liste redit à quoi il sert — la même phrase que le hub, comme le Suivi et les
 * Communautés — au lieu de ne montrer que des compteurs et des rangées.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MyShareLinksIntroTest {

    @get:Rule
    val compose = createComposeRule()

    private val link = MyShareLink(id = "link-1", name = "Invitation")

    @Test
    fun `a non empty list says at rest what a share link is for`() {
        compose.setContent {
            MeeshyTheme {
                LinksList(
                    listState = rememberLazyListState(),
                    links = listOf(link),
                    stats = null,
                    showFailureBanner = false,
                    onRetry = {},
                    joinUrlFor = { "https://meeshy.me/join/${it.id}" },
                    onOpen = {},
                    onCopy = {},
                    onShare = {},
                    onToggle = {},
                    onDelete = {},
                    onExtend = { _, _ -> },
                )
            }
        }

        compose.onNodeWithText("Invite contacts to join your conversations").assertIsDisplayed()
    }
}
