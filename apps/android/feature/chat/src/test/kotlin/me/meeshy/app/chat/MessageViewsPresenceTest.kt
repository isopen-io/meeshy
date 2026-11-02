package me.meeshy.app.chat

import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageViewsFilter
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.ReadByUser
import me.meeshy.sdk.model.ReadStatusData
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.format.rememberRelativeTimeStrings
import androidx.compose.ui.graphics.Color
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La fiche « Vu par » porte le point de présence vivant comme iOS (#13745) : l'auteur de l'onglet Envoyé
 * le tient de la carte vivante (jamais pour soi), chaque ligne d'une liste le tient du roster en cache
 * (`MessageViewsMemberPresence`). Rien servi, aucun point.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MessageViewsPresenceTest {

    @get:Rule
    val compose = createComposeRule()

    private fun bubble(isOutgoing: Boolean, authorId: String) = BubbleContent(
        messageId = "m1",
        text = "Salut",
        isOutgoing = isOutgoing,
        isTranslated = false,
        originalText = null,
        senderName = "Ana",
        showSenderName = false,
        senderProfile = ProfileSheetUser(userId = authorId, participantId = "p-$authorId", username = "ana"),
        isEdited = false,
        isDeleted = false,
        createdAtIso = null,
    )

    private fun reader(participantId: String) = ReadByUser(participantId = participantId, displayName = "Ana", readAt = null)

    private fun showRow(members: Map<String, PaginatedParticipant>) {
        val row = viewerRows(MessageViewsFilter.Read, ReadStatusData(readBy = listOf(reader("p1"))), members).single()
        compose.showWithPresence(presenceStore()) {
            ViewerRowItem(row = row, accentColor = Color.Blue, now = PRESENCE_NOW, strings = rememberRelativeTimeStrings())
        }
    }

    @Test
    fun `l'auteur de l'onglet Envoye a le point que la carte vivante sert`() {
        compose.showWithPresence(presenceStore(live = mapOf("u1" to PresenceState.AWAY))) {
            SentTab(bubble(isOutgoing = false, authorId = "u1"), Color.Blue)
        }

        compose.assertDot(PresenceState.AWAY)
    }

    @Test
    fun `un auteur dont rien n'est servi n'a aucun point`() {
        compose.showWithPresence(presenceStore()) {
            SentTab(bubble(isOutgoing = false, authorId = "u1"), Color.Blue)
        }

        compose.assertNoDot()
    }

    @Test
    fun `mon propre message n'a jamais de point`() {
        compose.showWithPresence(presenceStore(live = mapOf("me" to PresenceState.ONLINE))) {
            SentTab(bubble(isOutgoing = true, authorId = "me"), Color.Blue)
        }

        compose.assertNoDot()
    }

    @Test
    fun `une ligne de liste a le point que le roster en cache sert pour son membre`() {
        showRow(
            mapOf(
                "p1" to PaginatedParticipant(id = "p1", userId = "u1", isOnline = true, lastActiveAt = presenceIso(PRESENCE_NOW - 10_000)),
            ),
        )

        compose.assertDot(PresenceState.ONLINE)
    }

    @Test
    fun `une ligne dont le membre est inconnu du roster n'a aucun point`() {
        showRow(emptyMap())

        compose.assertNoDot()
    }

    @Test
    fun `un membre que le roster sert sans presence n'a aucun point`() {
        showRow(mapOf("p1" to PaginatedParticipant(id = "p1", userId = "u1")))

        compose.assertNoDot()
    }

    @Test
    fun `les lignes gardent le compte de chaque membre`() {
        val rows = viewerRows(
            MessageViewsFilter.Read,
            ReadStatusData(readBy = listOf(reader("p1"), reader("p2"))),
            mapOf("p2" to PaginatedParticipant(id = "p2", userId = "u2")),
        )

        assertThat(rows.map { it.userId }).containsExactly(null, "u2").inOrder()
    }
}
