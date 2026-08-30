package me.meeshy.sdk.socket

import me.meeshy.sdk.net.InMemoryTokenStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Ce que le handshake Socket.IO transmet, et sous quelle CLÉ (#4213).
 *
 * Deux défauts vivaient dans une seule ligne — `auth = mapOf("token" to token)`
 * où `token` valait `jwt ?: sessionToken` :
 *
 * 1. le jeton de SESSION d'un compte inscrit ne voyageait jamais, si bien que
 *    le serveur ne pouvait pas dire quel socket appartient à quelle session —
 *    et une révocation laissait l'appareil recevoir tout le temps réel
 *    indéfiniment, un socket n'étant authentifié qu'une fois, au connect ;
 * 2. un invité de lien s'annonçait sous la clé `token`, que la passerelle
 *    envoie dans la vérification JWT — laquelle refuse un jeton de session.
 */
class HandshakeAuthTest {

    private fun manager() = SocketManager(
        config = me.meeshy.sdk.net.MeeshyConfig(apiBaseUrl = "http://x", socketUrl = "http://x"),
        tokenStore = InMemoryTokenStore(),
    )

    @Test
    fun `un compte inscrit annonce son JWT ET sa session`() {
        val store = InMemoryTokenStore(jwt = "jwt-1", sessionToken = "sess-1")

        val auth = manager().handshakeAuth(store)

        assertEquals("jwt-1", auth?.get("token"))
        // Sans cette clé, aucune révocation ne peut viser CE socket.
        assertEquals("sess-1", auth?.get("sessionToken"))
    }

    @Test
    fun `un invite de lien annonce sa session, jamais sous la cle token`() {
        val store = InMemoryTokenStore(jwt = null, sessionToken = "anon-1")

        val auth = manager().handshakeAuth(store)

        assertEquals("anon-1", auth?.get("sessionToken"))
        // La passerelle branche sur les CLÉS : un jeton de session posé en
        // `token` part dans la vérification JWT, qui le refuse.
        assertNull(auth?.get("token"))
    }

    @Test
    fun `un compte sans session n'annonce que son JWT`() {
        val store = InMemoryTokenStore(jwt = "jwt-1", sessionToken = null)

        val auth = manager().handshakeAuth(store)

        assertEquals("jwt-1", auth?.get("token"))
        assertNull(auth?.get("sessionToken"))
    }

    @Test
    fun `sans aucun justificatif, il n'y a rien a annoncer`() {
        assertNull(manager().handshakeAuth(InMemoryTokenStore()))
    }
}
