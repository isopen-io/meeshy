package me.meeshy.sdk.model.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaRequestCredentialTest {

    private val api = "https://gate.meeshy.me/api/v1/"

    private fun headers(url: String, jwt: String? = "j", session: String? = null, apiBaseUrl: String? = api) =
        MediaRequestCredential.headers(url, apiBaseUrl = apiBaseUrl, jwt = jwt, sessionToken = session)

    @Test
    fun `un son de la bibliotheque sur l origine de l API porte le Bearer`() {
        assertThat(headers("https://gate.meeshy.me/api/v1/static/s.m4a"))
            .containsExactly("Authorization", "Bearer j")
    }

    @Test
    fun `le port implicite du schema est la meme origine`() {
        assertThat(headers("https://gate.meeshy.me:443/api/v1/static/s.m4a"))
            .containsExactly("Authorization", "Bearer j")
    }

    @Test
    fun `une session anonyme presente son jeton de session`() {
        assertThat(headers("https://gate.meeshy.me/api/v1/static/s.m4a", jwt = null, session = "s"))
            .containsExactly("X-Session-Token", "s")
    }

    @Test
    fun `aucun jeton ne quitte l origine de l API`() {
        assertThat(headers("https://static.meeshy.me/u/a.m4a")).isEmpty()
        assertThat(headers("https://cdn.example.com/api/v1/static/s.m4a")).isEmpty()
        assertThat(headers("http://gate.meeshy.me/api/v1/static/s.m4a")).isEmpty()
        assertThat(headers("https://gate.meeshy.me:8443/api/v1/static/s.m4a")).isEmpty()
    }

    @Test
    fun `sans base ni jeton ni URL lisible la requete reste nue`() {
        assertThat(headers("https://gate.meeshy.me/api/v1/static/s.m4a", apiBaseUrl = null)).isEmpty()
        assertThat(headers("https://gate.meeshy.me/api/v1/static/s.m4a", jwt = null)).isEmpty()
        assertThat(headers("file:///data/a.m4a")).isEmpty()
        assertThat(headers("not a url")).isEmpty()
    }
}
