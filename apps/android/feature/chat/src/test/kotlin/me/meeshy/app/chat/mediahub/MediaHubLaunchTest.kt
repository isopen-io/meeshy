package me.meeshy.app.chat.mediahub

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.mediahub.MediaHubAttachment
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.mediahub.MediaHubPayload
import me.meeshy.sdk.model.mediahub.MediaHubRowExit
import me.meeshy.sdk.util.resolveMediaUrl
import org.junit.Test

class MediaHubLaunchTest {

    private val base = "https://gate.meeshy.me/api/v1"
    private val resolve = { url: String -> resolveMediaUrl(url, base) }

    private fun piece(url: String, encrypted: Boolean = false, mime: String? = "application/pdf") = MediaHubPayload.Attachment(
        MediaHubAttachment(
            id = "a", url = url, thumbnailUrl = null, name = "doc.pdf", mimeType = mime, sizeBytes = null,
            durationMs = null, isVideo = false, isEncrypted = encrypted, alt = null,
        ),
    )

    private val open = MediaHubRowExit.of(ApiMessage(id = "m", conversationId = "c", content = ""), conversationIsEncrypted = false)

    private fun link(url: String) = MediaHubPayload.Link(url, "host")

    @Test
    fun `un lien a schema dangereux n est jamais ouvert`() {
        listOf(
            "javascript:alert(1)",
            "intent://scan/#Intent;scheme=zxing;package=com.evil;end",
            "file:///data/data/me.meeshy.app/shared_prefs/auth.xml",
        ).forEach { url ->
            assertThat(mediaHubLaunchFor(link(url), base, resolve, open)).isEqualTo(MediaHubLaunch.Ignored)
        }
    }

    @Test
    fun `un lien web passe par le chemin des liens du fil`() {
        assertThat(mediaHubLaunchFor(link("https://example.org/a"), base, resolve, open))
            .isEqualTo(MediaHubLaunch.ChatLink("https://example.org/a"))
    }

    @Test
    fun `une piece a schema dangereux ou hors de la passerelle n est jamais ouverte`() {
        listOf(
            "intent://x#Intent;component=com.evil/.A;end",
            "javascript:alert(1)",
            "file:///sdcard/secret.pdf",
            "content://com.evil.provider/x",
            "http://gate.meeshy.me/api/v1/attachments/file/a.pdf",
            "https://evil.example/api/v1/attachments/file/a.pdf",
            "https://gate.meeshy.me.evil.example/a.pdf",
            "https://user@gate.meeshy.me/a.pdf",
        ).forEach { url ->
            assertThat(mediaHubLaunchFor(piece(url), base, resolve, open)).isEqualTo(MediaHubLaunch.Ignored)
        }
    }

    @Test
    fun `une piece servie par la passerelle s ouvre a son adresse resolue`() {
        assertThat(mediaHubLaunchFor(piece("/api/v1/attachments/file/2026/10/a.pdf"), base, resolve, open))
            .isEqualTo(MediaHubLaunch.GatewayFile("https://gate.meeshy.me/api/v1/attachments/file/2026/10/a.pdf", "application/pdf"))
    }

    @Test
    fun `une piece scellee ne s ouvre pas`() {
        assertThat(mediaHubLaunchFor(piece("/api/v1/attachments/file/a.bin", encrypted = true), base, resolve, open))
            .isEqualTo(MediaHubLaunch.Ignored)
    }

    @Test
    fun `http n est admis que si la passerelle configuree l est, meme hote et meme port`() {
        val local = "http://10.0.2.2:3000/api/v1"
        val localResolve = { url: String -> resolveMediaUrl(url, local) }
        assertThat(mediaHubLaunchFor(piece("/api/v1/attachments/file/a.pdf"), local, localResolve, open))
            .isInstanceOf(MediaHubLaunch.GatewayFile::class.java)
        assertThat(mediaHubLaunchFor(piece("http://10.0.2.2:4000/a.pdf"), local, localResolve, open))
            .isEqualTo(MediaHubLaunch.Ignored)
    }

    @Test
    fun `un lieu part par le chemin des liens en geo`() {
        assertThat(mediaHubLaunchFor(MediaHubPayload.Place(48.85, 2.35, null), base, resolve, open))
            .isEqualTo(MediaHubLaunch.ChatLink("geo:48.85,2.35?q=48.85,2.35"))
    }

    @Test
    fun `une video de la passerelle se lit dans le lecteur de Meeshy`() {
        val video = MediaHubPayload.Attachment(
            MediaHubAttachment("v", "/api/v1/attachments/file/v.mp4", null, "v.mp4", "video/mp4", null, null, true, false, null),
        )
        assertThat(mediaHubLaunchFor(video, base, resolve, open))
            .isEqualTo(MediaHubLaunch.Video("https://gate.meeshy.me/api/v1/attachments/file/v.mp4", shieldsCapture = false))
    }

    @Test
    fun `un fichier dont le porteur ne laisse rien sortir est refuse`() {
        assertThat(mediaHubLaunchFor(piece("/api/v1/attachments/file/a.pdf"), base, resolve, MediaHubRowExit.Sealed))
            .isEqualTo(MediaHubLaunch.Refused)
    }

    @Test
    fun `une video dont le porteur protege la capture le dit au lecteur`() {
        val video = MediaHubPayload.Attachment(
            MediaHubAttachment("v", "/api/v1/attachments/file/v.mp4", null, "v.mp4", "video/mp4", null, null, true, false, null),
        )
        assertThat(mediaHubLaunchFor(video, base, resolve, MediaHubRowExit.Sealed))
            .isEqualTo(MediaHubLaunch.Video("https://gate.meeshy.me/api/v1/attachments/file/v.mp4", shieldsCapture = true))
    }
}
