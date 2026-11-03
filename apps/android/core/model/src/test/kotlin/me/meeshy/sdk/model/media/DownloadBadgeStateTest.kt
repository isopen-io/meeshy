package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DownloadBadgeStateTest {
    private fun badge(
        kind: AttachmentKind = AttachmentKind.IMAGE,
        url: String = "https://gate.meeshy.me/u/p.jpg",
        optimistic: Boolean = false,
        onDevice: Boolean = false,
        landed: Boolean = false,
        progress: DownloadProgress? = null,
        size: Long = 2_000,
        hostsPlayer: Boolean = true,
    ) = DownloadBadgeState.of(kind, url, optimistic, onDevice, landed, progress, size, hostsPlayer)

    @Test
    fun `une image a distance propose la fleche avec sa taille`() {
        assertThat(badge()).isEqualTo(DownloadBadgeState.Idle(2_000))
    }

    @Test
    fun `un transfert montre l'anneau avec pourcentage et octets`() {
        assertThat(badge(progress = DownloadProgress(500, 2_000)))
            .isEqualTo(DownloadBadgeState.Downloading(25, 500, 2_000))
    }

    @Test
    fun `une taille de transfert inconnue retombe sur la taille declaree`() {
        assertThat(badge(progress = DownloadProgress(1_000, 0)))
            .isEqualTo(DownloadBadgeState.Downloading(50, 1_000, 2_000))
    }

    @Test
    fun `jamais de badge pour un media local, optimiste ou deja sur l'appareil`() {
        assertThat(badge(url = "file:///data/p.jpg")).isEqualTo(DownloadBadgeState.Hidden)
        assertThat(badge(optimistic = true)).isEqualTo(DownloadBadgeState.Hidden)
        assertThat(badge(onDevice = true)).isEqualTo(DownloadBadgeState.Hidden)
        assertThat(badge(landed = true, progress = DownloadProgress(1, 2))).isEqualTo(DownloadBadgeState.Hidden)
    }

    @Test
    fun `les videos n'ont pas de badge sauf sur une tuile sans lecteur`() {
        assertThat(badge(kind = AttachmentKind.VIDEO)).isEqualTo(DownloadBadgeState.Hidden)
        assertThat(badge(kind = AttachmentKind.VIDEO, hostsPlayer = false)).isEqualTo(DownloadBadgeState.Idle(2_000))
    }

    @Test
    fun `un document ou un audio n'ont pas de badge d'image`() {
        assertThat(badge(kind = AttachmentKind.PDF)).isEqualTo(DownloadBadgeState.Hidden)
        assertThat(badge(kind = AttachmentKind.AUDIO)).isEqualTo(DownloadBadgeState.Hidden)
    }

    @Test
    fun `une url vide ne propose rien`() {
        assertThat(badge(url = "")).isEqualTo(DownloadBadgeState.Hidden)
    }
}

class DownloadPresenceTest {
    private val none: (String) -> Boolean = { false }

    @Test
    fun `un file existant est sur l'appareil, un file absent non`() {
        assertThat(DownloadPresence.isOnDevice("file:///a/b.jpg", none) { it == "/a/b.jpg" }).isTrue()
        assertThat(DownloadPresence.isOnDevice("file:///a/c.jpg", none) { it == "/a/b.jpg" }).isFalse()
    }

    @Test
    fun `les deux ecritures d'une adresse file sont reconnues`() {
        assertThat(DownloadPresence.isOnDevice("file:/a/b.jpg", none) { it == "/a/b.jpg" }).isTrue()
        assertThat(DownloadPresence.isOnDevice("FILE:///a/b.jpg", none) { it == "/a/b.jpg" }).isTrue()
        assertThat(LocalFileUrl.pathOf("https://x.me/a.jpg")).isNull()
    }

    @Test
    fun `une url distante se cherche sous sa cle de cache`() {
        val url = "https://gate.meeshy.me/u/p.jpg"
        val key = me.meeshy.sdk.model.mediacache.MediaCacheKey.of(url)
        assertThat(DownloadPresence.isOnDevice(url, { it == key }, { false })).isTrue()
        assertThat(DownloadPresence.isOnDevice("", { true }, { true })).isFalse()
    }

    @Test
    fun `une image est sur l'appareil des qu'une de ses formes l'est`() {
        val variant = "https://gate.meeshy.me/u/p-480.jpg"
        val key = me.meeshy.sdk.model.mediacache.MediaCacheKey.of(variant)
        assertThat(
            DownloadPresence.isImageOnDevice("https://gate.meeshy.me/u/p.jpg", null, listOf(variant), { it == key }, { false }),
        ).isTrue()
        assertThat(
            DownloadPresence.isImageOnDevice("https://gate.meeshy.me/u/p.jpg", null, emptyList(), { it == key }, { false }),
        ).isFalse()
    }
}
