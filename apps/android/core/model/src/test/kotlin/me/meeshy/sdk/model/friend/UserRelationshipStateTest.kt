package me.meeshy.sdk.model.friend

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * La relation affichee est UNE seule, sur Decouvrir, la liste de contacts, la fiche de
 * profil et les mentions : six etats, une table. Chaque ligne ci-dessous est un cas du
 * `UserRelationshipState` iOS, avec l'etat que la loi pure en tire et ce que chaque
 * surface en projette (le bouton de Decouvrir, la pastille « en attente »).
 *
 * Il n'y a qu'un seul type d'etat dans `:core:model` : un second, jumeau et jamais
 * branche, vivait dans le package parent. Une jumelle divergente est ce que cette
 * table existe pour rendre impossible.
 */
class UserRelationshipStateTest {

    private data class Case(
        val name: String,
        val state: UserRelationshipState,
        val isPending: Boolean,
        val connectAction: ConnectAction,
    )

    private val sixCases = listOf(
        Case("current", UserRelationshipState.Current, false, ConnectAction.Hidden),
        Case("blocked", UserRelationshipState.Blocked, false, ConnectAction.Blocked),
        Case("connected", UserRelationshipState.Connected, false, ConnectAction.Contact),
        Case("pendingSent", UserRelationshipState.PendingSent("req-1"), true, ConnectAction.Pending),
        Case("pendingReceived", UserRelationshipState.PendingReceived("req-2"), true, ConnectAction.Accept("req-2")),
        Case("none", UserRelationshipState.None, false, ConnectAction.Connect),
    )

    @Test
    fun `there are exactly six relationship states`() {
        assertThat(sixCases.map { it.state::class }.distinct()).hasSize(6)
    }

    @Test
    fun `only the two pending states are pending`() {
        sixCases.forEach { case ->
            assertThat(case.state.isPending).isEqualTo(case.isPending)
        }
    }

    @Test
    fun `every surface that renders a state projects the same control from it`() {
        sixCases.forEach { case ->
            assertThat(ConnectAction.from(case.state)).isEqualTo(case.connectAction)
        }
    }

    @Test
    fun `the pending states carry the request id the gesture will act on`() {
        assertThat((UserRelationshipState.PendingSent("req-1")).requestId).isEqualTo("req-1")
        assertThat((UserRelationshipState.PendingReceived("req-2")).requestId).isEqualTo("req-2")
    }

    @Test
    fun `two pending states of different requests are different states`() {
        assertThat(UserRelationshipState.PendingReceived("req-1"))
            .isNotEqualTo(UserRelationshipState.PendingReceived("req-2"))
        assertThat(UserRelationshipState.PendingSent("req-1"))
            .isNotEqualTo(UserRelationshipState.PendingReceived("req-1"))
    }

    @Test
    fun `the rules reach each of the six states from the inputs a surface reads`() {
        fun resolve(isBlocked: Boolean, friendship: FriendshipStatus, target: String = "other") =
            UserRelationshipRules.resolve(
                targetUserId = target,
                currentUserId = "me",
                isBlocked = isBlocked,
                friendship = friendship,
            )

        val reached = listOf(
            resolve(false, FriendshipStatus.None, target = "me"),
            resolve(true, FriendshipStatus.Friend),
            resolve(false, FriendshipStatus.Friend),
            resolve(false, FriendshipStatus.PendingSent("req-1")),
            resolve(false, FriendshipStatus.PendingReceived("req-2")),
            resolve(false, FriendshipStatus.None),
        )

        assertThat(reached).containsExactlyElementsIn(sixCases.map { it.state }).inOrder()
    }

    @Test
    fun `a block hides a pending request without forgetting it`() {
        val pending = FriendshipStatus.PendingReceived("req-2")

        val blocked = UserRelationshipRules.resolve("other", "me", isBlocked = true, friendship = pending)
        val unblocked = UserRelationshipRules.resolve("other", "me", isBlocked = false, friendship = pending)

        assertThat(blocked).isEqualTo(UserRelationshipState.Blocked)
        assertThat(unblocked).isEqualTo(UserRelationshipState.PendingReceived("req-2"))
    }
}
