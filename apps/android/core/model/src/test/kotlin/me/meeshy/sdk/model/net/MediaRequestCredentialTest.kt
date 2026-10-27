package me.meeshy.sdk.model.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaRequestCredentialTest {

    private val api = "https://gate.meeshy.me/api/v1/"

    private fun headers(url: String, jwt: String? = "j", session: String? = null, apiBaseUrl: String? = api) =
        MediaRequestCredential.headers(url, apiBaseUrl = apiBaseUrl, jwt = jwt, sessionToken = session)

    @Test
    fun `un son de la bibliotheque sur l origine de l API porte le Bearer`() {
        assertThat(headers("https://gate.meeshy.me/api/v1/static/s_1-a.m4a"))
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
    fun `sur l origine de l API seule la route des sons de la bibliotheque recoit le jeton`() {
        assertThat(headers("https://gate.meeshy.me/api/v1/users/me")).isEmpty()
        assertThat(headers("https://gate.meeshy.me/api/v1/attachments/file/a.m4a")).isEmpty()
        assertThat(headers("https://gate.meeshy.me/api/v1/static/")).isEmpty()
        assertThat(headers("https://gate.meeshy.me/static/s.m4a")).isEmpty()
    }

    @Test
    fun `une traversee claire ou encodee ne recoit jamais le jeton`() {
        assertThat(headers("https://gate.meeshy.me/api/v1/static/../users/me")).isEmpty()
        assertThat(headers("https://gate.meeshy.me/api/v1/static/..")).isEmpty()
        assertThat(headers("https://gate.meeshy.me/api/v1/static/%2e%2e%2fusers")).isEmpty()
        assertThat(headers("https://gate.meeshy.me/api/v1/static/a%2Fb.m4a")).isEmpty()
        assertThat(headers("https://gate.meeshy.me/api/v1/static/a/b.m4a")).isEmpty()
        assertThat(headers("https://gate.meeshy.me/api/v1/static/s.m4a?redirect=x")).isEmpty()
        assertThat(headers("https://gate.meeshy.me/api/v1/static/s.m4a#x")).isEmpty()
    }

    @Test
    fun `sans base ni jeton ni URL lisible la requete reste nue`() {
        assertThat(headers("https://gate.meeshy.me/api/v1/static/s.m4a", apiBaseUrl = null)).isEmpty()
        assertThat(headers("https://gate.meeshy.me/api/v1/static/s.m4a", jwt = null)).isEmpty()
        assertThat(headers("file:///data/a.m4a")).isEmpty()
        assertThat(headers("not a url")).isEmpty()
    }

    @Test
    fun `le chemin relatif servi par la passerelle devient l adresse absolue du son`() {
        assertThat(MediaRequestCredential.libraryAudioUrl("/api/v1/static/s.m4a", "https://gate.staging.meeshy.me/api/v1/"))
            .isEqualTo("https://gate.staging.meeshy.me/api/v1/static/s.m4a")
        assertThat(MediaRequestCredential.libraryAudioUrl("https://gate.meeshy.me/api/v1/static/s.m4a", api))
            .isEqualTo("https://gate.meeshy.me/api/v1/static/s.m4a")
    }

    @Test
    fun `une mediaURL ecrite par l auteur hors de la route des sons ne se joue pas`() {
        listOf(
            "/api/v1/users/me",
            "/api/v1/static/../conversations",
            "/api/v1/static/%2e%2e%2fconversations",
            "//evil.example/api/v1/static/s.m4a",
            "https://evil.example/api/v1/static/s.m4a",
            "/api/v1/static/s.m4a?x=1",
            "",
            null,
        ).forEach { assertThat(MediaRequestCredential.libraryAudioUrl(it, api)).isNull() }
    }
}
