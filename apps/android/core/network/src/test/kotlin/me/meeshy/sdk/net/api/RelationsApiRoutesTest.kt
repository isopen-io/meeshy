package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

/** L'appel du niveau de lien, tel qu'il part — requête capturée derrière le vrai Retrofit. */
class RelationsApiRoutesTest {

    @Test
    fun `lire le niveau appelle relations userId et decode userId et effectiveLevel`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"userId":"64b7f0c2a1b2c3d4e5f60718","effectiveLevel":"CLOSE"}}""",
        )

        val served = http.serve(RelationsApi::class.java).byUserId("64b7f0c2a1b2c3d4e5f60718").data!!

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/relations/64b7f0c2a1b2c3d4e5f60718")
        assertThat(served.userId).isEqualTo("64b7f0c2a1b2c3d4e5f60718")
        assertThat(served.effectiveLevel).isEqualTo("CLOSE")
    }

    @Test
    fun `un champ ajoute par le serveur ne casse pas la lecture`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"userId":"u","effectiveLevel":"FRIEND","since":"2026-10-01"}}""",
        )

        assertThat(http.serve(RelationsApi::class.java).byUserId("u").data!!.effectiveLevel).isEqualTo("FRIEND")
    }
}
