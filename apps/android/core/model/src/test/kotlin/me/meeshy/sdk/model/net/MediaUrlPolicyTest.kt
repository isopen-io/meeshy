package me.meeshy.sdk.model.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaUrlPolicyTest {

    private fun allowed(url: String, local: Boolean = false) =
        MediaUrlPolicy.isAllowed(url, localEnvironment = local)

    @Test
    fun `https passe`() {
        assertThat(allowed("https://gate.meeshy.me/api/v1/attachments/file/a.png")).isTrue()
    }

    @Test
    fun `http est refuse hors loopback`() {
        assertThat(allowed("http://gate.meeshy.me/a.png")).isFalse()
    }

    @Test
    fun `http passe sur localhost en environnement local`() {
        assertThat(allowed("http://localhost:3000/a.png", local = true)).isTrue()
    }

    @Test
    fun `http sur le nom localhost passe, http sur 127 est une plage refusee hors local`() {
        assertThat(allowed("http://localhost:3000/a.png")).isTrue()
        assertThat(allowed("http://127.0.0.1:3000/a.png")).isFalse()
        assertThat(allowed("http://127.0.0.1:3000/a.png", local = true)).isTrue()
    }

    @Test
    fun `chaque plage privee est refusee hors environnement local`() {
        listOf(
            "https://10.0.0.5/a", "https://10.255.255.255/a",
            "https://172.16.0.1/a", "https://172.31.255.1/a",
            "https://192.168.1.10/a",
            "https://169.254.169.254/latest/meta-data",
            "https://127.0.0.1/a", "https://127.4.5.6/a",
        ).forEach { assertThat(allowed(it)).isFalse() }
    }

    @Test
    fun `les bornes des plages privees sont exactes`() {
        assertThat(allowed("https://172.15.0.1/a")).isTrue()
        assertThat(allowed("https://172.32.0.1/a")).isTrue()
        assertThat(allowed("https://192.169.0.1/a")).isTrue()
        assertThat(allowed("https://11.0.0.1/a")).isTrue()
    }

    @Test
    fun `une plage privee passe en environnement local`() {
        assertThat(allowed("https://192.168.1.10/a", local = true)).isTrue()
        assertThat(allowed("http://10.0.2.2:3000/a", local = true)).isFalse()
    }

    @Test
    fun `file passe sans controle d hote`() {
        assertThat(allowed("file:///data/user/0/me.meeshy/cache/a.jpg")).isTrue()
    }

    @Test
    fun `un schema inconnu est refuse`() {
        assertThat(allowed("ftp://gate.meeshy.me/a")).isFalse()
        assertThat(allowed("javascript:alert(1)")).isFalse()
        assertThat(allowed("content://media/1")).isFalse()
    }

    @Test
    fun `une adresse sans hote ou vide est refusee`() {
        assertThat(allowed("")).isFalse()
        assertThat(allowed("https://")).isFalse()
        assertThat(allowed("not a url")).isFalse()
    }

    @Test
    fun `le schema est insensible a la casse`() {
        assertThat(allowed("HTTPS://gate.meeshy.me/a")).isTrue()
        assertThat(allowed("HTTPS://10.0.0.1/a")).isFalse()
    }

    @Test
    fun `un hote qui commence comme une plage privee n en est pas une`() {
        assertThat(allowed("https://10.example.com/a")).isTrue()
    }

    @Test
    fun `l environnement local se reconnait a l hote de la base d API`() {
        assertThat(MediaUrlPolicy.isLocalEnvironment("http://localhost:3000/api/v1")).isTrue()
        assertThat(MediaUrlPolicy.isLocalEnvironment("http://10.0.2.2:3000/api/v1")).isTrue()
        assertThat(MediaUrlPolicy.isLocalEnvironment("https://gate.meeshy.me/api/v1")).isFalse()
        assertThat(MediaUrlPolicy.isLocalEnvironment(null)).isFalse()
    }
}
