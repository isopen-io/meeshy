package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.net.routes.ApiRoutesAuth
import me.meeshy.sdk.net.routes.ApiRoutesConversations
import okhttp3.ResponseBody
import org.junit.Test
import retrofit2.Call
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * Une constante générée est une constante de COMPILATION : Retrofit la lit dans une
 * annotation. Si le générateur émettait un `val` ordinaire, ce fichier ne compilerait pas.
 */
class GeneratedRoutesCompileSmokeTest {

    private interface Probe {
        @POST(ApiRoutesAuth.LOGIN)
        fun login(): Call<ResponseBody>

        @GET(ApiRoutesConversations.BY_ID)
        fun conversation(): Call<ResponseBody>
    }

    @Test
    fun `a generated constant feeds a Retrofit annotation`() {
        assertThat(Probe::class.java.getMethod("login").getAnnotation(POST::class.java)?.value)
            .isEqualTo("auth/login")
        assertThat(Probe::class.java.getMethod("conversation").getAnnotation(GET::class.java)?.value)
            .isEqualTo("conversations/{id}")
    }
}
