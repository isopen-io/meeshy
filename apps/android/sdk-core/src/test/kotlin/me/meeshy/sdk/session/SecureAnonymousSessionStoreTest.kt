package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.AnonymousSessionContext
import me.meeshy.sdk.model.ParticipantPermissions
import me.meeshy.sdk.model.security.InMemorySecureStore
import me.meeshy.sdk.model.security.SecureStore
import org.junit.Test

class SecureAnonymousSessionStoreTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun context(token: String = "sess") = AnonymousSessionContext(
        sessionToken = token,
        participantId = "p",
        permissions = ParticipantPermissions.defaultAnonymous,
        linkId = "l",
        conversationId = "c",
    )

    @Test
    fun `la session du DataStore est migree une fois puis effacee de la source`() = runTest {
        val legacy = InMemoryAnonymousSessionStore(context("old"))
        val vault = InMemorySecureStore()
        val store = SecureAnonymousSessionStore(vault, legacy, json)
        assertThat(store.load()?.sessionToken).isEqualTo("old")
        assertThat(legacy.load()).isNull()
        assertThat(store.load()?.sessionToken).isEqualTo("old")
    }

    @Test
    fun `la source n'est pas effacee si l'ecriture dans le coffre echoue`() = runTest {
        val legacy = InMemoryAnonymousSessionStore(context("old"))
        val store = SecureAnonymousSessionStore(InMemorySecureStore(failWrites = true), legacy, json)
        assertThat(store.load()?.sessionToken).isEqualTo("old")
        assertThat(legacy.load()).isNotNull()
    }

    @Test
    fun `un blob illisible vaut aucune session invitee`() = runTest {
        val vault = InMemorySecureStore()
        vault.put("anonymous_session", "{not json")
        val store = SecureAnonymousSessionStore(vault, InMemoryAnonymousSessionStore(), json)
        assertThat(store.load()).isNull()
    }

    @Test
    fun `save puis load puis clear passent par le coffre seul`() = runTest {
        val legacy = InMemoryAnonymousSessionStore()
        val store = SecureAnonymousSessionStore(InMemorySecureStore(), legacy, json)
        store.save(context("new"))
        assertThat(store.load()?.sessionToken).isEqualTo("new")
        store.clear()
        assertThat(store.load()).isNull()
    }
}
