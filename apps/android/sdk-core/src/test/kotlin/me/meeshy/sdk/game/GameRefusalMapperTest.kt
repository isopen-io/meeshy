package me.meeshy.sdk.game

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameErrorCode
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class GameRefusalMapperTest {

    private fun response(status: Int, body: String): Response<Any> =
        Response.error(status, body.toResponseBody("application/json".toMediaType()))

    @Test
    fun `un 409 lit le code du contrat depuis le corps brut`() {
        val refusal = GameRefusalMapper.refusal(response(409, """{"success":false,"code":"INSUFFICIENT_MEESHES"}"""))

        assertThat(refusal?.code).isEqualTo(GameErrorCode.InsufficientMeeshes)
    }

    @Test
    fun `PRICE_CHANGED garde le prix courant servi a la racine`() {
        val body = """{"success":false,"code":"PRICE_CHANGED","number":7,"price":120,"basePrice":100,"costFactor":1.2}"""

        val refusal = GameRefusalMapper.refusal(HttpException(response(409, body)))

        assertThat(refusal?.code).isEqualTo(GameErrorCode.PriceChanged)
        assertThat(refusal?.priceChanged?.price).isEqualTo(120)
        assertThat(refusal?.priceChanged?.number).isEqualTo(7)
    }

    @Test
    fun `un code inconnu rend null et ne leve jamais`() {
        assertThat(GameRefusalMapper.refusal(response(409, """{"code":"FROM_THE_FUTURE"}"""))).isNull()
    }

    @Test
    fun `un 500 n est pas un refus meme avec un code du contrat`() {
        assertThat(GameRefusalMapper.refusal(response(500, """{"code":"INSUFFICIENT_MEESHES"}"""))).isNull()
    }

    @Test
    fun `un corps illisible rend null`() {
        assertThat(GameRefusalMapper.refusal(response(409, "<html>"))).isNull()
        assertThat(GameRefusalMapper.refusal(RuntimeException("x"))).isNull()
    }
}
