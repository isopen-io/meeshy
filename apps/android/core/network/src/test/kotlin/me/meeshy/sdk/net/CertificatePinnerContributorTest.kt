package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.net.CertificatePinPolicy
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.Assert.assertThrows
import org.junit.Test
import javax.net.ssl.SSLPeerUnverifiedException

class CertificatePinnerContributorTest {

    private class Fixture(val server: MockWebServer, val serverCert: HeldCertificate, val clientCerts: HandshakeCertificates) {
        val host: String = server.hostName
        val spki: String = CertificatePinning.spkiSha256Base64(serverCert.certificate)!!
    }

    private fun fixture(keyAlgorithm: String = "EC"): Fixture {
        val held = HeldCertificate.Builder()
            .commonName("gate.test")
            .addSubjectAlternativeName("localhost")
            .apply { if (keyAlgorithm == "RSA") rsa2048() }
            .build()
        val serverCerts = HandshakeCertificates.Builder().heldCertificate(held).build()
        val clientCerts = HandshakeCertificates.Builder().addTrustedCertificate(held.certificate).build()
        val server = MockWebServer().apply {
            useHttps(serverCerts.sslSocketFactory(), false)
            enqueue(MockResponse().setBody("ok"))
            start()
        }
        return Fixture(server, held, clientCerts)
    }

    private fun client(f: Fixture, current: Set<String>, backup: Set<String> = emptySet(), expiresAt: Long = Long.MAX_VALUE, logs: MutableList<String> = mutableListOf()): OkHttpClient =
        HttpClientAssembler.build(
            listOf(
                CertificatePinnerContributor.of(
                    policy = CertificatePinPolicy(setOf(f.host), current, backup, expiresAt),
                    clock = { 0L },
                    sink = { logs += it },
                ),
            ),
            OkHttpClient.Builder().sslSocketFactory(f.clientCerts.sslSocketFactory(), f.clientCerts.trustManager),
        )

    private fun get(client: OkHttpClient, f: Fixture): String =
        client.newCall(Request.Builder().url(f.server.url("/")).build()).execute().use { it.body!!.string() }

    @Test
    fun `le bon pin laisse passer la requete`() {
        val f = fixture()
        assertThat(get(client(f, current = setOf(f.spki)), f)).isEqualTo("ok")
        f.server.shutdown()
    }

    @Test
    fun `le pin de secours laisse passer la requete`() {
        val f = fixture()
        assertThat(get(client(f, current = setOf("autre="), backup = setOf(f.spki)), f)).isEqualTo("ok")
        f.server.shutdown()
    }

    @Test
    fun `un mauvais pin refuse la connexion sans journaliser la chaine`() {
        val f = fixture()
        val logs = mutableListOf<String>()
        assertThrows(SSLPeerUnverifiedException::class.java) {
            get(client(f, current = setOf("AAAA="), logs = logs), f)
        }
        assertThat(logs).hasSize(1)
        assertThat(logs.single()).doesNotContain(f.spki)
        assertThat(logs.single()).doesNotContain("BEGIN CERTIFICATE")
        assertThat(f.server.requestCount).isEqualTo(0)
        f.server.shutdown()
    }

    @Test
    fun `un certificat RSA 2048 est epingle comme un EC`() {
        val f = fixture("RSA")
        assertThat(get(client(f, current = setOf(f.spki)), f)).isEqualTo("ok")
        f.server.shutdown()
    }

    @Test
    fun `un hote hors pin-set n'est pas epingle`() {
        val f = fixture()
        val unpinned = HttpClientAssembler.build(
            listOf(
                CertificatePinnerContributor.of(
                    policy = CertificatePinPolicy(setOf("gate.meeshy.me"), setOf("AAAA="), emptySet(), Long.MAX_VALUE),
                    clock = { 0L },
                ),
            ),
            OkHttpClient.Builder().sslSocketFactory(f.clientCerts.sslSocketFactory(), f.clientCerts.trustManager),
        )
        assertThat(get(unpinned, f)).isEqualTo("ok")
        f.server.shutdown()
    }

    @Test
    fun `un pin-set expire retombe sur la validation systeme et le dit`() {
        val f = fixture()
        val logs = mutableListOf<String>()
        val c = client(f, current = setOf("AAAA="), expiresAt = 0L, logs = logs)
        assertThat(get(c, f)).isEqualTo("ok")
        assertThat(logs.single()).contains("expired")
        f.server.shutdown()
    }
}
