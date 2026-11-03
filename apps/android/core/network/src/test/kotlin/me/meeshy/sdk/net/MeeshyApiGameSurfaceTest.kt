package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import okhttp3.OkHttpClient
import org.junit.Test

class MeeshyApiGameSurfaceTest {

    @Test
    fun `MeeshyApi expose le jeu et la progression`() {
        val api = MeeshyApi.from(MeeshyApi.buildRetrofit(MeeshyConfig(), OkHttpClient()))

        assertThat(api.game).isNotNull()
        assertThat(api.engagement).isNotNull()
    }
}
