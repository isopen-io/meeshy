package me.meeshy.sdk.model.error

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.net.EndpointAuthKind
import me.meeshy.sdk.model.net.EndpointRejectionPolicy
import org.junit.Test

class MeeshyErrorTest {

    @Test
    fun `chaque categorie expose un libelle FR et une icone`() {
        assertThat(MeeshyError.Network(NetworkErrorKind.NO_CONNECTION).label).isEqualTo("Pas de connexion internet")
        assertThat(MeeshyError.Network(NetworkErrorKind.TIMEOUT).label).isEqualTo("La requête a expiré")
        assertThat(MeeshyError.Network(NetworkErrorKind.SERVER_UNREACHABLE).label).isEqualTo("Serveur inaccessible")
        assertThat(MeeshyError.Network(NetworkErrorKind.TIMEOUT).iconName).isEqualTo("wifi_off")
        assertThat(MeeshyError.Auth(AuthErrorKind.SESSION_EXPIRED).iconName).isEqualTo("lock")
        assertThat(MeeshyError.Server(500, "x").iconName).isEqualTo("dns")
        assertThat(MeeshyError.Forbidden().iconName).isEqualTo("lock_open")
    }

    @Test
    fun `401 sur identifiants porte la raison du serveur`() {
        val error = MeeshyError.fromHttp(401, "Mot de passe incorrect", authKind = EndpointAuthKind.CREDENTIALS)
        assertThat(error).isEqualTo(MeeshyError.Auth(AuthErrorKind.INVALID_CREDENTIALS, "Mot de passe incorrect"))
        assertThat(error.label).isEqualTo("Mot de passe incorrect")
    }

    @Test
    fun `401 bearer est une session expiree`() {
        assertThat(MeeshyError.fromHttp(401, "x")).isEqualTo(MeeshyError.Auth(AuthErrorKind.SESSION_EXPIRED))
    }

    @Test
    fun `403 est un refus de ressource, pas une session`() {
        assertThat(MeeshyError.fromHttp(403, null)).isEqualTo(MeeshyError.Forbidden(null))
    }

    @Test
    fun `refus structure porte code et champ sauf pour 401 403 429`() {
        val structured = MeeshyError.fromHttp(
            409, "pris", rejectionPolicy = EndpointRejectionPolicy.STRUCTURED,
            code = "USERNAME_TAKEN", fieldName = "username", suggestions = listOf("a1"),
        )
        assertThat(structured).isInstanceOf(MeeshyError.Rejected::class.java)
        assertThat((structured as MeeshyError.Rejected).rejection.fieldName).isEqualTo("username")
        assertThat(MeeshyError.fromHttp(409, "pris")).isEqualTo(MeeshyError.Server(409, "pris"))
        assertThat(
            MeeshyError.fromHttp(429, null, rejectionPolicy = EndpointRejectionPolicy.STRUCTURED),
        ).isEqualTo(MeeshyError.Server(429, "Trop de requêtes"))
    }

    @Test
    fun `429 quotidien devient un refus type`() {
        val error = MeeshyError.fromHttp(429, null, code = "DAILY_REACTION_LIMIT")
        assertThat(error).isInstanceOf(MeeshyError.Rejected::class.java)
    }

    @Test
    fun `5xx et defaut portent un message de repli`() {
        assertThat(MeeshyError.fromHttp(502, null)).isEqualTo(MeeshyError.Server(502, "Erreur serveur"))
        assertThat(MeeshyError.fromHttp(404, null)).isEqualTo(MeeshyError.Server(404, "Erreur inconnue"))
        assertThat(MeeshyError.fromHttp(426, null)).isEqualTo(MeeshyError.Server(426, "Mise à jour requise"))
    }
}
