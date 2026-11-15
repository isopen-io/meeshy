package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.security.InMemorySecureStore
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Test

class VisitorReaderKeyTest {

    private fun key(store: InMemorySecureStore = InMemorySecureStore(), uuid: String = "0123") =
        VisitorReaderKey(store) { uuid }

    @Test
    fun `la cle porte le prefixe visitor_`() {
        assertThat(key().readerKey()).isEqualTo("visitor_0123")
    }

    @Test
    fun `la cle est tiree une fois et persistee`() {
        val store = InMemorySecureStore()
        val first = key(store, "aaa").readerKey()
        assertThat(key(store, "bbb").readerKey()).isEqualTo(first)
    }

    @Test
    fun `storedReaderKey ne tire jamais de cle neuve`() {
        val provider = key()
        assertThat(provider.storedReaderKey()).isNull()
        provider.readerKey()
        assertThat(provider.storedReaderKey()).isEqualTo("visitor_0123")
    }

    @Test
    fun `la purge efface la cle et la suivante est neuve`() {
        val store = InMemorySecureStore()
        key(store, "aaa").readerKey()
        key(store).purge()
        assertThat(key(store).storedReaderKey()).isNull()
        assertThat(key(store, "bbb").readerKey()).isEqualTo("visitor_bbb")
    }

    @Test
    fun `une valeur sans le prefixe n'est pas une cle visiteur`() {
        val store = InMemorySecureStore().apply { put(VisitorReaderKey.STORAGE_KEY, "intrus") }
        assertThat(key(store).storedReaderKey()).isNull()
    }

    @Test
    fun `la connexion d'un compte purge la cle visiteur`() {
        val vault = InMemorySecureStore()
        val visitor = key(vault)
        visitor.readerKey()
        EncryptedTokenStore(vault).jwt = "jwt"
        assertThat(visitor.storedReaderKey()).isNull()
    }

    private fun sentHeaders(store: TokenStore, visitor: VisitorReaderKeyProviding): okhttp3.mockwebserver.RecordedRequest {
        val server = MockWebServer().apply { enqueue(MockResponse().setBody("{}")); start() }
        val client = OkHttpClient.Builder().addInterceptor(AuthInterceptor(store, visitorKey = visitor)).build()
        client.newCall(Request.Builder().url(server.url("/api/v1/conversations")).build()).execute().close()
        return server.takeRequest().also { server.shutdown() }
    }

    @Test
    fun `sans compte ni invite l'en-tete porte la cle visiteur`() {
        val sent = sentHeaders(InMemoryTokenStore(), key())
        assertThat(sent.getHeader("X-Session-Token")).isEqualTo("visitor_0123")
        assertThat(sent.getHeader("Authorization")).isNull()
    }

    @Test
    fun `le jeton invite prime sur la cle visiteur`() {
        val sent = sentHeaders(InMemoryTokenStore(sessionToken = "anon_1"), key())
        assertThat(sent.getHeader("X-Session-Token")).isEqualTo("anon_1")
    }

    @Test
    fun `un compte presente son Bearer et jamais la cle visiteur`() {
        val sent = sentHeaders(InMemoryTokenStore(jwt = "jwt"), key())
        assertThat(sent.getHeader("Authorization")).isEqualTo("Bearer jwt")
        assertThat(sent.getHeader("X-Session-Token")).isNull()
    }
}
