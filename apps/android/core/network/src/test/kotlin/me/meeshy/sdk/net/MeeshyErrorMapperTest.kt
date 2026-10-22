package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import me.meeshy.sdk.model.error.MeeshyError
import me.meeshy.sdk.model.error.NetworkErrorKind
import org.junit.Test
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class MeeshyErrorMapperTest {

    private fun kind(error: Throwable) = (MeeshyErrorMapper.map(error) as MeeshyError.Network).kind

    @Test
    fun `SocketTimeoutException donne timeout`() {
        assertThat(kind(SocketTimeoutException())).isEqualTo(NetworkErrorKind.TIMEOUT)
        assertThat(MeeshyErrorMapper.map(SocketTimeoutException()).label).isEqualTo("La requête a expiré")
    }

    @Test
    fun `UnknownHost et Connect donnent serveur inaccessible`() {
        assertThat(kind(UnknownHostException())).isEqualTo(NetworkErrorKind.SERVER_UNREACHABLE)
        assertThat(kind(ConnectException())).isEqualTo(NetworkErrorKind.SERVER_UNREACHABLE)
        assertThat(MeeshyErrorMapper.map(ConnectException()).label).isEqualTo("Serveur inaccessible")
    }

    @Test
    fun `toute autre panne d'entree-sortie est une absence de reseau`() {
        assertThat(kind(IOException("Network is unreachable"))).isEqualTo(NetworkErrorKind.NO_CONNECTION)
        assertThat(MeeshyErrorMapper.map(IOException()).iconName).isEqualTo("wifi_off")
    }

    @Test
    fun `une URL refusee avant envoi se dit URL invalide`() {
        assertThat(MeeshyErrorMapper.map(InvalidUrlException("/a//b")).label).isEqualTo("URL invalide")
    }

    @Serializable
    private data class Row(val id: String)

    @Test
    fun `une erreur de decodage cite le champ fautif sans recopier la reponse`() {
        val error = runCatching {
            MeeshyApi.json.decodeFromString(Row.serializer(), """{"secret":"hunter2"}""")
        }.exceptionOrNull() as SerializationException

        val mapped = MeeshyErrorMapper.map(error)

        assertThat(mapped.label).startsWith("Erreur de décodage des données")
        assertThat(mapped.label).doesNotContain("hunter2")
        assertThat(parseApiError(error).message).doesNotContain("hunter2")
    }

    @Test
    fun `le chemin du champ est extrait du message`() {
        val error = SerializationException("Unexpected token at path: \$.data.items[2].id\nJSON input: {}")
        assertThat(MeeshyErrorMapper.decodingPath(error)).isEqualTo("\$.data.items[2].id")
    }

    @Test
    fun `un ApiError HTTP suit la classification du transport`() {
        val mapped = MeeshyErrorMapper.map(ApiError("x", code = "HTTP_403", httpStatus = 403))
        assertThat(mapped).isInstanceOf(MeeshyError.Forbidden::class.java)
    }
}
