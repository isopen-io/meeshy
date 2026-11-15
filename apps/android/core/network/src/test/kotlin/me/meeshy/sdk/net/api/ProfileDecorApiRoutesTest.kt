package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Test

class ProfileDecorApiRoutesTest {

    @Test
    fun `la bibliotheque d autocollants se lit, s enrichit, se vide et note l usage`() = runTest {
        val http = RecordingHttp()
        val api = http.serve(ProfileDecorApi::class.java)
        val image = MultipartBody.Part.createFormData("file", "a.png", ByteArray(4).toRequestBody("image/png".toMediaType()))

        api.stickers()
        api.createSticker(image)
        api.deleteSticker("64b000000000000000000001")
        api.useSticker("64b000000000000000000001")

        assertThat(http.requests.map { it.method to it.path }).containsExactly(
            "GET" to "/api/v1/me/stickers",
            "POST" to "/api/v1/me/stickers",
            "DELETE" to "/api/v1/me/stickers/64b000000000000000000001",
            "POST" to "/api/v1/me/stickers/64b000000000000000000001/use",
        ).inOrder()
        assertThat(http.requests[1].contentType).startsWith("multipart/form-data")
    }
}
