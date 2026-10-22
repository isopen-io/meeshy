package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.LoginRequest
import me.meeshy.sdk.model.RegisterRequest
import org.junit.Test

/**
 * Le JSON qui PART, mesuré avec le réglage de `MeeshyApi.json` : une valeur égale à
 * son défaut y est omise (`encodeDefaults = false`) et un nul aussi
 * (`explicitNulls = false`). Chaque clé que la passerelle attend DOIT donc être
 * posée sans défaut ou marquée `@EncodeDefault` — ces témoins le gardent.
 */
class AuthWireJsonTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    @Test
    fun `la connexion envoie rememberDevice, meme faux`() {
        val raw = json.encodeToString(LoginRequest.serializer(), LoginRequest("ata", "pw"))

        assertThat(raw).isEqualTo("""{"username":"ata","password":"pw","rememberDevice":false}""")
    }

    @Test
    fun `la connexion envoie rememberDevice vrai`() {
        val raw = json.encodeToString(LoginRequest.serializer(), LoginRequest("ata", "pw", rememberDevice = true))

        assertThat(raw).isEqualTo("""{"username":"ata","password":"pw","rememberDevice":true}""")
    }

    @Test
    fun `l'inscription sans parrainage ni revendication n'envoie aucune des trois cles`() {
        val raw = json.encodeToString(RegisterRequest.serializer(), RegisterRequest(email = "a@b.co", password = "pw"))

        assertThat(raw).doesNotContain("affiliateToken")
        assertThat(raw).doesNotContain("affiliateSessionKey")
        assertThat(raw).doesNotContain("claimEmail")
    }

    @Test
    fun `l'inscription par un lien d'invitation porte le code et la cle de visite`() {
        val request = RegisterRequest(email = "a@b.co", password = "pw", affiliateToken = "ABC123", affiliateSessionKey = "visite-1")

        val raw = json.encodeToString(RegisterRequest.serializer(), request)

        assertThat(raw).contains(""""affiliateToken":"ABC123"""")
        assertThat(raw).contains(""""affiliateSessionKey":"visite-1"""")
    }

    @Test
    fun `un code d'invitation bien forme voyage avec sa cle de visite`() {
        val request = RegisterRequest(email = "a@b.co", password = "pw").referred("  ABC123 ", sessionKey = " visite-1 ")

        assertThat(request.affiliateToken).isEqualTo("ABC123")
        assertThat(request.affiliateSessionKey).isEqualTo("visite-1")
    }

    @Test
    fun `la cle de visite ne voyage jamais sans code`() {
        val sansCode = RegisterRequest(email = "a@b.co", password = "pw").referred(null, sessionKey = "visite-1")
        val malForme = RegisterRequest(email = "a@b.co", password = "pw").referred("deux mots", sessionKey = "visite-1")
        val vide = RegisterRequest(email = "a@b.co", password = "pw").referred("   ", sessionKey = "visite-1")

        listOf(sansCode, malForme, vide).forEach {
            assertThat(it.affiliateToken).isNull()
            assertThat(it.affiliateSessionKey).isNull()
        }
    }

    @Test
    fun `un code trop long n'est pas un code`() {
        val request = RegisterRequest(email = "a@b.co", password = "pw").referred("x".repeat(129))

        assertThat(request.affiliateToken).isNull()
    }

    @Test
    fun `une cle de visite blanche se lit absente`() {
        val request = RegisterRequest(email = "a@b.co", password = "pw").referred("ABC123", sessionKey = "  ")

        assertThat(request.affiliateToken).isEqualTo("ABC123")
        assertThat(request.affiliateSessionKey).isNull()
    }

    @Test
    fun `claimingEmail pose claimEmail`() {
        assertThat(RegisterRequest(email = "a@b.co", password = "pw").claimingEmail().claimEmail).isTrue()
    }

    @Test
    fun `revendiquer une adresse envoie claimEmail vrai`() {
        val raw = json.encodeToString(RegisterRequest.serializer(), RegisterRequest(email = "a@b.co", password = "pw", claimEmail = true))

        assertThat(raw).contains(""""claimEmail":true""")
    }

    @Test
    fun `le defi de second facteur porte le jeton et le code, sans rememberDevice`() {
        val raw = json.encodeToString(TwoFactorLoginRequest.serializer(), TwoFactorLoginRequest("tmp-2fa", "123456"))

        assertThat(raw).isEqualTo("""{"twoFactorToken":"tmp-2fa","code":"123456"}""")
    }

    @Test
    fun `le resume de securite lit hasPassword et tolere son absence`() {
        val avec = json.decodeFromString(MeSecurityEnvelope.serializer(), """{"user":{"id":"u1","security":{"hasPassword":false}}}""")
        val sans = json.decodeFromString(MeSecurityEnvelope.serializer(), """{"user":{"id":"u1"}}""")

        assertThat(avec.user.security?.hasPassword).isFalse()
        assertThat(sans.user.security).isNull()
    }

    @Test
    fun `la recherche d'un compte par telephone decode le compte masque`() {
        val data = json.decodeFromString(
            PhoneRecoveryLookupData.serializer(),
            """{"tokenId":"t-1","maskedUserInfo":{"displayName":"Ata Beth","username":"a*****h","email":"at....h@m*****om","hasAvatar":true,"avatar":"x"}}""",
        )

        assertThat(data.tokenId).isEqualTo("t-1")
        assertThat(data.maskedUserInfo.username).isEqualTo("a*****h")
    }

    @Test
    fun `la verification d'identite et du code portent le jeton d'etape`() {
        val identity = json.encodeToString(PhoneRecoveryIdentityRequest.serializer(), PhoneRecoveryIdentityRequest("t-1", "atabeth", "ata@meeshy.me"))
        val code = json.encodeToString(PhoneRecoveryCodeRequest.serializer(), PhoneRecoveryCodeRequest("t-1", "123456"))

        assertThat(identity).isEqualTo("""{"tokenId":"t-1","fullUsername":"atabeth","fullEmail":"ata@meeshy.me"}""")
        assertThat(code).isEqualTo("""{"tokenId":"t-1","code":"123456"}""")
    }

    @Test
    fun `le transfert de numero omet le pays quand il manque`() {
        val raw = json.encodeToString(
            PhoneTransferInitiateRegistrationRequest.serializer(),
            PhoneTransferInitiateRegistrationRequest(phoneNumber = "0612345678", pendingUsername = "ata", pendingEmail = "a@b.co"),
        )

        assertThat(raw).isEqualTo("""{"phoneNumber":"0612345678","pendingUsername":"ata","pendingEmail":"a@b.co"}""")
    }
}
