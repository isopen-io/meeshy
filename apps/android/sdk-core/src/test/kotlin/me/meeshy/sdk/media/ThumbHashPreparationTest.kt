package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import java.util.Base64
import me.meeshy.sdk.model.media.ThumbHash
import org.junit.Test

class ThumbHashPreparationTest {
    private fun raster(w: Int, h: Int) = ByteArray(w * h * 4) { if (it % 4 == 3) -1 else 90 }

    @Test fun `l'empreinte est celle de ThumbHash encode en base64`() {
        val rgba = raster(8, 6)
        val expected = Base64.getEncoder().encodeToString(ThumbHash.encode(8, 6, rgba))
        assertThat(ThumbHashPreparation.encodeBase64(8, 6, rgba)).isEqualTo(expected)
    }

    @Test fun `un raster incoherent ou trop grand ne donne pas d'empreinte`() {
        assertThat(ThumbHashPreparation.encodeBase64(8, 6, ByteArray(3))).isNull()
        assertThat(ThumbHashPreparation.encodeBase64(0, 0, ByteArray(0))).isNull()
        assertThat(ThumbHashPreparation.encodeBase64(400, 300, raster(400, 300))).isNull()
    }
}
