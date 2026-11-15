package me.meeshy.sdk.socket

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Ce que le handshake Socket.IO transmet, et sous quelle CLÉ (#4213) : le jeton de SESSION d'un
 * compte inscrit voyage avec le JWT ; un invité de lien s'annonce sous `sessionToken`, jamais `token`.
 */
class HandshakeAuthTest {

    @Test
    fun `un compte inscrit annonce son JWT ET sa session`() {
        val rig = SocketRig(jwt = validJwt, session = "sess-1")

        rig.manager.connect()

        val auth = rig.factory.created.single().auth
        assertEquals(validJwt, auth["token"])
        assertEquals("sess-1", auth["sessionToken"])
    }

    @Test
    fun `un compte inscrit declare aussi l'appareil sous client`() {
        val rig = SocketRig()

        rig.manager.connect()

        val client = rig.factory.created.single().auth["client"] as Map<*, *>
        assertEquals("android", client["platform"])
        assertEquals("240", client["appBuild"])
        assertEquals("fr-FR", client["deviceLocale"])
    }

    @Test
    fun `un invite de lien annonce sa session, jamais sous la cle token ni client`() {
        val rig = SocketRig(jwt = null, session = "anon-1")

        rig.manager.connect()

        val auth = rig.factory.created.single().auth
        assertEquals("anon-1", auth["sessionToken"])
        assertNull(auth["token"])
        assertNull(auth["client"])
    }

    @Test
    fun `un compte sans session n'annonce que son JWT et son appareil`() {
        val rig = SocketRig(jwt = validJwt, session = null)

        rig.manager.connect()

        val auth = rig.factory.created.single().auth
        assertEquals(validJwt, auth["token"])
        assertNull(auth["sessionToken"])
        assertTrue(auth.containsKey("client"))
    }

    @Test
    fun `sans aucun justificatif, aucune socket n'est ouverte`() {
        val rig = SocketRig(jwt = null, session = null)

        rig.manager.connect()

        assertTrue(rig.factory.created.isEmpty())
    }
}
