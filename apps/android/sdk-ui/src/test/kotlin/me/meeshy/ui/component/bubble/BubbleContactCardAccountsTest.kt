package me.meeshy.ui.component.bubble

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import androidx.compose.runtime.CompositionLocalProvider
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.contacts.ContactCardResolutionScope
import me.meeshy.sdk.user.ContactCardMeeshyAccount
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #13495 : la rangée « Sur Meeshy » sous une carte de visite, sans requête hors d'une carte déjà reçue et en clair. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class BubbleContactCardAccountsTest {

    private object Prefs : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    @get:Rule
    val compose = createComposeRule()

    private val ada = ContactCardMeeshyAccount("u1", "Ada Lovelace", null)

    private class Spy(val answer: ContactCardMeeshyAccount?) : BubbleContactCardAccounts {
        var lookups = 0
        var cachedCalls = 0
        override fun cached(file: BubbleFile): ContactCardMeeshyAccount? { cachedCalls++; return null }
        override suspend fun lookup(file: BubbleFile): ContactCardMeeshyAccount? { lookups++; return answer }
    }

    private fun card(
        scope: ContactCardResolutionScope = ContactCardResolutionScope.Clear,
        localUri: String? = null,
        sealed: Boolean = false,
    ) = BubbleFile(
        attachmentId = "a1", name = "Bob.vcf", url = "https://x/a1", isContactCard = true,
        isSealed = sealed, localUri = localUri, contactScope = scope,
    )

    private fun show(file: BubbleFile, accounts: BubbleContactCardAccounts, transfers: BubbleFileTransfers = BubbleFileTransfers.None) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalBubbleContactCardAccounts provides accounts, LocalBubbleFileTransfers provides transfers) {
                    BubbleFileRow(file = file, onColor = Color.Black, onClick = {})
                }
            }
        }
    }

    @Test
    fun `une carte recue en clair montre le nom de l'inscrit sous la carte`() {
        val spy = Spy(ada)
        show(card(), spy, BubbleFileTransfers(readyAttachmentIds = setOf("a1")))
        compose.waitForIdle()

        compose.onNodeWithText("Ada Lovelace", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("On Meeshy", useUnmergedTree = true).assertIsDisplayed()
        assertThat(spy.lookups).isEqualTo(1)
    }

    @Test
    fun `un contact non inscrit ne montre aucune rangee`() {
        val spy = Spy(null)
        show(card(), spy, BubbleFileTransfers(readyAttachmentIds = setOf("a1")))
        compose.waitForIdle()

        compose.onNodeWithText("On Meeshy", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `une carte non telechargee ne declenche aucune demande`() {
        val spy = Spy(ada)
        show(card(), spy)
        compose.waitForIdle()

        assertThat(spy.lookups).isEqualTo(0)
        compose.onNodeWithText("Ada Lovelace", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `une carte envoyee depuis l'appareil se resout sans telechargement`() {
        val spy = Spy(ada)
        show(card(localUri = "content://x/1"), spy)
        compose.waitForIdle()

        compose.onNodeWithText("Ada Lovelace", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun `bout en bout ne demande jamais`() = neverAsks(ContactCardResolutionScope.EndToEnd)

    @Test
    fun `une portee inconnue ne demande jamais`() = neverAsks(ContactCardResolutionScope.Unknown)

    private fun neverAsks(scope: ContactCardResolutionScope) {
        val spy = Spy(ada)
        show(card(scope = scope, localUri = "content://x/1"), spy, BubbleFileTransfers(readyAttachmentIds = setOf("a1")))
        compose.waitForIdle()
        assertThat(spy.lookups).isEqualTo(0)
        compose.onNodeWithText("On Meeshy", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `une recomposition ne relance pas la demande`() {
        val spy = Spy(ada)
        val tick = mutableStateOf(0)
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(
                    LocalBubbleContactCardAccounts provides spy,
                    LocalBubbleFileTransfers provides BubbleFileTransfers(readyAttachmentIds = setOf("a1")),
                ) {
                    tick.value
                    BubbleFileRow(file = card(), onColor = Color.Black, onClick = {})
                }
            }
        }
        compose.waitForIdle()
        repeat(3) { tick.value++; compose.waitForIdle() }

        assertThat(spy.lookups).isEqualTo(1)
    }

    @Test
    fun `la loi de demande exige une carte lisible, prete ou locale, en clair, non scellee`() {
        assertThat(card().asksForMeeshyAccount(isDownloaded = true)).isTrue()
        assertThat(card().asksForMeeshyAccount(isDownloaded = false)).isFalse()
        assertThat(card(localUri = "file:///a").asksForMeeshyAccount(isDownloaded = false)).isTrue()
        assertThat(card(scope = ContactCardResolutionScope.EndToEnd).asksForMeeshyAccount(true)).isFalse()
        assertThat(card(scope = ContactCardResolutionScope.Unknown).asksForMeeshyAccount(true)).isFalse()
        assertThat(card(sealed = true).asksForMeeshyAccount(true)).isFalse()
        assertThat(card().copy(isContactCard = false).asksForMeeshyAccount(true)).isFalse()
    }

    @Test
    fun `le constructeur ferme la portee d'une carte d'un message chiffre ou scelle`() {
        fun scopeOf(message: ApiMessage, piece: ApiMessageAttachment) = BubbleContentBuilder.build(
            message = message.copy(attachments = listOf(piece)),
            currentUserId = "me",
            preferences = Prefs,
        ).files.single().contactScope

        val plain = ApiMessage(id = "m", conversationId = "c", senderId = "u", content = "")
        val vcf = ApiMessageAttachment(id = "a1", mimeType = "text/vcard", originalName = "Bob.vcf", fileUrl = "content://x/1")

        assertThat(scopeOf(plain, vcf)).isEqualTo(ContactCardResolutionScope.Clear)
        assertThat(scopeOf(plain.copy(encryptionMode = "e2ee"), vcf)).isEqualTo(ContactCardResolutionScope.EndToEnd)
        assertThat(scopeOf(plain, vcf.copy(isEncrypted = true))).isEqualTo(ContactCardResolutionScope.EndToEnd)
    }

    @Test
    fun `l'adresse locale d'un envoi depuis l'appareil est gardee brute pour la lecture`() {
        val content = BubbleContentBuilder.build(
            message = ApiMessage(
                id = "m", conversationId = "c", senderId = "me", content = "",
                attachments = listOf(ApiMessageAttachment(id = "a1", mimeType = "text/vcard", originalName = "B.vcf", fileUrl = "content://x/1")),
            ),
            currentUserId = "me",
            preferences = Prefs,
            mediaBaseUrl = "https://gate.meeshy.me/api/v1",
        )
        assertThat(content.files.single().localUri).isEqualTo("content://x/1")
    }

    @Test
    fun `une portee qui se ferme retire la rangee deja montree`() {
        val open = Spy(ada)
        val closed = Spy(null)
        val accounts = mutableStateOf<BubbleContactCardAccounts>(open)
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(
                    LocalBubbleContactCardAccounts provides accounts.value,
                    LocalBubbleFileTransfers provides BubbleFileTransfers(readyAttachmentIds = setOf("a1")),
                ) {
                    BubbleFileRow(file = card(), onColor = Color.Black, onClick = {})
                }
            }
        }
        compose.waitForIdle()
        compose.onNodeWithText("Ada Lovelace", useUnmergedTree = true).assertIsDisplayed()

        accounts.value = closed
        compose.waitForIdle()

        compose.onNodeWithText("On Meeshy", useUnmergedTree = true).assertDoesNotExist()
    }
}
