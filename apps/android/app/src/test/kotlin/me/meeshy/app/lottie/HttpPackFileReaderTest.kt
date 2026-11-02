package me.meeshy.app.lottie

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.pack.PackAssetRef
import org.junit.Test

/** #13952 — l'adresse d'un fichier de pack, et la taille au-delà de laquelle on ne le télécharge pas. */
class HttpPackFileReaderTest {
    private val sha = "9eeb258fda7680b6" + "0".repeat(48)
    private fun ref(bytes: Long = 1_872) = PackAssetRef.of("9eeb258fda7680b6.json", bytes, sha)!!

    @Test fun `a pack file is fetched under the versioned api prefix`() {
        assertThat(HttpPackFileReader.url("https://gate.meeshy.me/api/v1/", ref()))
            .isEqualTo("https://gate.meeshy.me/api/v1/pack-assets/9eeb258fda7680b6.json")
    }

    @Test fun `a base without its trailing slash gives the same address`() {
        assertThat(HttpPackFileReader.url("https://staging.meeshy.me/api/v1", ref()))
            .isEqualTo("https://staging.meeshy.me/api/v1/pack-assets/9eeb258fda7680b6.json")
    }

    @Test fun `a body longer than declared is read only up to the cap`() {
        val read = with(HttpPackFileReader) { ByteArray(50_000) { 1 }.inputStream().readAtMost(20_001) }
        assertThat(read.size).isEqualTo(20_001)
    }

    @Test fun `a layer declared heavier than the cap is never fetched`() {
        assertThat(HttpPackFileReader.mayFetch(ref())).isTrue()
        assertThat(HttpPackFileReader.mayFetch(ref(bytes = HttpPackFileReader.MAX_BYTES + 1))).isFalse()
    }
}
