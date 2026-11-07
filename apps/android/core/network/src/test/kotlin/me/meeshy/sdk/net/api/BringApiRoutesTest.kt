package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

/** Arrêter un Bring (#13936) : la requête telle qu'elle part, derrière le vrai Retrofit. */
class BringApiRoutesTest {

    @Test
    fun `arreter un Bring appelle DELETE bring bringId et lit l accuse`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"bringId":"b1","stopped":true}}""")

        val served = http.serve(BringApi::class.java).stop("b1").data!!

        assertThat(http.only.method).isEqualTo("DELETE")
        assertThat(http.only.path).isEqualTo("/api/v1/bring/b1")
        assertThat(served.bringId).isEqualTo("b1")
        assertThat(served.stopped).isTrue()
    }
}
