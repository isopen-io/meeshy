package me.meeshy.app.chat.fileviewer

import android.net.Uri
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import java.io.File
import me.meeshy.sdk.model.contacts.ContactAccountActions
import me.meeshy.sdk.model.contacts.ContactRelation
import me.meeshy.sdk.net.api.PublicContactAccount
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #13495 : la fiche d'une carte dit si le contact est sur Meeshy et propose les gestes de sa relation. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ContactCardAccountsUiTest {

    @get:Rule val compose = createComposeRule()
    @get:Rule val folder = TemporaryFolder()

    private val card = "BEGIN:VCARD\nVERSION:3.0\nFN:Zoé Dupont\nTEL:+33612345678\nEND:VCARD"

    private fun row(relation: ContactRelation, blocked: Boolean = false, busy: Boolean = false) = ContactCardAccountRow(
        account = PublicContactAccount(userId = "u1", displayName = "Zoé D.", username = "zoe", bio = "Bonjour", relation = relation.wire),
        relation = relation,
        actions = ContactAccountActions.resolve(relation),
        isBusy = busy,
        isBlocked = blocked,
        showsFace = false,
    )

    private fun request(): FileViewerRequest {
        val file = File(folder.root, "Zoé.vcf").apply { writeText(card) }
        return FileViewerRequest("Zoé.vcf", "text/vcard", Uri.fromFile(file).toString())
    }

    private fun show(row: ContactCardAccountRow?, onConnect: () -> Unit = {}, onWrite: () -> Unit = {}, bound: MutableList<String> = mutableListOf()) {
        val ui = ContactCardAccountsUi(
            rows = listOfNotNull(row),
            bind = { bound += it.displayName },
            onConnect = { onConnect() },
            onWrite = { onWrite() },
        )
        compose.setContent { MeeshyTheme { ContactCardSheet(request(), Color.Blue, onDismiss = {}, accounts = ui) } }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Add to Contacts")).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun `un contact inscrit montre sa section et se connecte ou ecrit`() {
        var connected = 0
        var written = 0
        val bound = mutableListOf<String>()
        show(row(ContactRelation.None), { connected++ }, { written++ }, bound)

        compose.onNodeWithText("On Meeshy", ignoreCase = true).assertIsDisplayed()
        compose.onNodeWithText("@zoe").assertIsDisplayed()
        compose.onNodeWithText("Connect").performClick()
        compose.onNodeWithText("Message").performClick()
        compose.runOnIdle {
            assert(connected == 1) { "connected=$connected" }
            assert(written == 1) { "written=$written" }
            assert(bound == listOf("Zoé Dupont")) { "bound=$bound" }
        }
    }

    @Test
    fun `une demande envoyee est un etat et non un bouton`() {
        show(row(ContactRelation.RequestSent))
        compose.onNodeWithText("Request sent").assertExists()
        compose.onAllNodes(hasText("Connect")).fetchSemanticsNodes().let { assert(it.isEmpty()) }
        compose.onNodeWithText("Message").assertExists()
    }

    @Test
    fun `un bloque ne peut pas recevoir d ecrire`() {
        show(row(ContactRelation.Friend, blocked = true))
        compose.onAllNodes(hasText("Message")).fetchSemanticsNodes().let { assert(it.isEmpty()) }
    }

    @Test
    fun `soi n a aucune action`() {
        show(row(ContactRelation.Self))
        compose.onAllNodes(hasText("Message")).fetchSemanticsNodes().let { assert(it.isEmpty()) }
        compose.onAllNodes(hasText("Connect")).fetchSemanticsNodes().let { assert(it.isEmpty()) }
    }

    @Test
    fun `sans compte reconnu la fiche reste celle d avant`() {
        show(null)
        compose.onAllNodes(hasText("On Meeshy", ignoreCase = true)).fetchSemanticsNodes().let { assert(it.isEmpty()) }
    }
}
