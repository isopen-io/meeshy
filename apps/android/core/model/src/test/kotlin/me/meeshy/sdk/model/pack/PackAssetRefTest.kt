package me.meeshy.sdk.model.pack

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PackAssetRefTest {

    @Test
    fun `le nom d'un fichier est l'empreinte SHA-256 de son contenu`() {
        val ref = PackAssetRef.forContent("abc".toByteArray(), "webp")!!
        assertThat(ref.sha256).isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        assertThat(ref.src).isEqualTo("ba7816bf8f01cfea.webp")
        assertThat(ref.bytes).isEqualTo(3L)
        assertThat(ref.file.name).isEqualTo(ref.src)
    }

    @Test
    fun `une extension hors des quatre types ne s'adresse pas`() {
        assertThat(PackAssetRef.forContent("abc".toByteArray(), "exe")).isNull()
    }

    @Test
    fun `un fichier se lit depuis son chemin servi, jamais depuis un media d'attachment`() {
        assertThat(PackAssetFile.ofServedPath("https://gate.meeshy.me/api/v1/pack-assets/ba7816bf8f01cfea.png")?.namedPrefix)
            .isEqualTo("ba7816bf8f01cfea")
        assertThat(PackAssetFile.ofServedPath("/api/v1/attachments/ba7816bf8f01cfea.png")).isNull()
        assertThat(PackAssetFile.ofServedPath(null)).isNull()
        assertThat(PackAssetFile.of("ba7816bf8f01cfea.png", "0".repeat(64))).isNull()
    }
}
