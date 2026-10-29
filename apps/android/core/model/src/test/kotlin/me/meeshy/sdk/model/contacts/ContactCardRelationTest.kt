package me.meeshy.sdk.model.contacts

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.friend.FriendshipStatus
import org.junit.Test

class ContactCardRelationTest {

    @Test
    fun `soi reste soi quel que soit le cache`() {
        assertThat(ContactCardRelation.served(ContactRelation.Self, FriendshipStatus.Friend, cacheHydrated = true))
            .isEqualTo(ContactRelation.Self)
    }

    @Test
    fun `un statut vivant non vide l emporte sur la reponse du serveur`() {
        assertThat(ContactCardRelation.served(ContactRelation.None, FriendshipStatus.PendingSent("r"), false)).isEqualTo(ContactRelation.RequestSent)
        assertThat(ContactCardRelation.served(ContactRelation.None, FriendshipStatus.PendingReceived("r"), false)).isEqualTo(ContactRelation.RequestReceived)
        assertThat(ContactCardRelation.served(ContactRelation.None, FriendshipStatus.Friend, false)).isEqualTo(ContactRelation.Friend)
    }

    @Test
    fun `un cache hydrate sans relation retire une demande annulee ou une amitie rompue`() {
        assertThat(ContactCardRelation.served(ContactRelation.RequestSent, FriendshipStatus.None, cacheHydrated = true)).isEqualTo(ContactRelation.None)
        assertThat(ContactCardRelation.served(ContactRelation.Friend, FriendshipStatus.None, cacheHydrated = true)).isEqualTo(ContactRelation.None)
    }

    @Test
    fun `un cache pas encore hydrate ne contredit pas le serveur`() {
        assertThat(ContactCardRelation.served(ContactRelation.Friend, FriendshipStatus.None, cacheHydrated = false)).isEqualTo(ContactRelation.Friend)
    }
}
