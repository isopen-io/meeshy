package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** La session sauvegardée appartient à UN serveur : la production ne relit jamais celle du staging (#14058). */
class SessionBackupKeyTest {

    @Test
    fun `deux serveurs ont deux emplacements`() {
        assertThat(SessionBackupKey.of("https://gate.meeshy.me/api/v1/"))
            .isNotEqualTo(SessionBackupKey.of("https://gate.staging.meeshy.me/api/v1/"))
    }

    @Test
    fun `la barre finale ne change pas l'emplacement`() {
        assertThat(SessionBackupKey.of("https://gate.meeshy.me/api/v1/"))
            .isEqualTo(SessionBackupKey.of("https://gate.meeshy.me/api/v1"))
    }

    @Test
    fun `l'emplacement ne porte que des caracteres surs et ne revele pas l'adresse`() {
        val key = SessionBackupKey.of("https://gate.example.com/api/v1/")

        assertThat(key).matches("[a-z0-9._]+")
        assertThat(key).doesNotContain("example")
    }

    @Test
    fun `la session sauvegardee se relit telle qu'elle a ete ecrite sur le meme appareil`() {
        val session = BackedUpSession(userId = "u1", jwt = "a.b.c", sessionToken = "sess")

        assertThat(BackedUpSession.decode(session.encode(deviceId = "device-a"), deviceId = "device-a")).isEqualTo(session)
    }

    @Test
    fun `une session transferee depuis un autre appareil ne s'ouvre pas`() {
        val session = BackedUpSession(userId = "u1", jwt = "a.b.c", sessionToken = "sess")

        assertThat(BackedUpSession.decode(session.encode(deviceId = "device-a"), deviceId = "device-b")).isNull()
    }

    @Test
    fun `une sauvegarde illisible ou incomplete se lit comme une absence`() {
        assertThat(BackedUpSession.decode("pas du json".toByteArray(), deviceId = "d")).isNull()
        assertThat(
            BackedUpSession.decode(
                """{"deviceId":"d","session":{"userId":"","jwt":"x","sessionToken":"y"}}""".toByteArray(),
                deviceId = "d",
            ),
        ).isNull()
    }
}
