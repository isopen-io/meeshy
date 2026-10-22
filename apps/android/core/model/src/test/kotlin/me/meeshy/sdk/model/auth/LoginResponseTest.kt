package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * `POST /auth/login` (et `verify-email`, `login/2fa`, `magic-link/validate`) sert
 * QUATRE formes sous un seul 200 : la session, le défi de second facteur, l'adresse
 * à vérifier, la confirmation du compte qu'un lien ouvrirait. Une seule charge
 * tolérante les lit toutes — aucune ne doit produire d'erreur de décodage, et ce que
 * le serveur ajoutera demain ne doit pas non plus (#9223).
 */
class LoginResponseTest {

    /** Le même réglage que `MeeshyApi.json` (:core:network), seul à décoder en production. */
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun decode(raw: String): LoginResponse = json.decodeFromString(raw)

    private val sessionBody = """
        {
          "user": { "id": "u1", "username": "atabeth", "displayName": "Ata" },
          "token": "jwt-123",
          "sessionToken": "sess-456",
          "expiresIn": 86400,
          "session": { "id": "s1", "isTrusted": true },
          "usedBackupCode": false
        }
    """.trimIndent()

    @Test
    fun `une session complete devient Authenticated avec ses jetons`() {
        val outcome = decode(sessionBody).outcome()

        val authenticated = outcome as LoginOutcome.Authenticated
        assertThat(authenticated.session.user.id).isEqualTo("u1")
        assertThat(authenticated.session.token).isEqualTo("jwt-123")
        assertThat(authenticated.session.sessionToken).isEqualTo("sess-456")
        assertThat(authenticated.session.expiresIn).isEqualTo(86400)
    }

    @Test
    fun `un compte protege rend le defi de second facteur et aucune session`() {
        val outcome = decode(
            """{ "requires2FA": true, "twoFactorToken": "tmp-2fa", "adoptWithinSeconds": 300 }""",
        ).outcome()

        assertThat(outcome).isEqualTo(LoginOutcome.TwoFactorRequired("tmp-2fa", adoptWithinSeconds = 300))
    }

    @Test
    fun `requires2FA sans jeton de defi n'est pas exploitable`() {
        assertThat(decode("""{ "requires2FA": true }""").outcome()).isNull()
    }

    @Test
    fun `verification-required rend l'adresse a prouver, creee ou renvoyee`() {
        val outcome = decode(
            """
            { "status": "verification-required", "accountCreated": true,
              "email": "ata@meeshy.me", "pendingSessionToken": "pending-1" }
            """.trimIndent(),
        ).outcome(typedIdentifier = "ata")

        assertThat(outcome).isEqualTo(
            LoginOutcome.VerificationRequired(
                PendingEmailVerification(email = "ata@meeshy.me", accountCreated = true, pendingSessionToken = "pending-1"),
            ),
        )
    }

    @Test
    fun `l'adresse servie prime sur l'adresse tapee`() {
        val pending = (
            decode("""{ "status": "verification-required", "email": " served@meeshy.me " }""")
                .outcome(typedIdentifier = "typed@meeshy.me") as LoginOutcome.VerificationRequired
            ).pending

        assertThat(pending.email).isEqualTo("served@meeshy.me")
    }

    @Test
    fun `l'adresse tapee ne sert que si le serveur a omis la sienne`() {
        val pending = (
            decode("""{ "status": "verification-required", "email": "   " }""")
                .outcome(typedIdentifier = "  typed@meeshy.me ") as LoginOutcome.VerificationRequired
            ).pending

        assertThat(pending.email).isEqualTo("typed@meeshy.me")
        assertThat(pending.accountCreated).isFalse()
        assertThat(pending.pendingSessionToken).isNull()
    }

    @Test
    fun `verification-required sans aucune adresse n'est pas exploitable`() {
        assertThat(decode("""{ "status": "verification-required" }""").outcome(typedIdentifier = " ")).isNull()
    }

    @Test
    fun `un jeton d'attente vide se lit absent`() {
        val pending = (
            decode("""{ "status": "verification-required", "email": "a@b.co", "pendingSessionToken": "" }""")
                .outcome() as LoginOutcome.VerificationRequired
            ).pending

        assertThat(pending.pendingSessionToken).isNull()
    }

    @Test
    fun `requiresConfirmation rend le compte cible sans session`() {
        val outcome = decode(
            """
            { "requiresConfirmation": true,
              "account": { "id": "u9", "username": "bob", "displayName": "Bob", "avatar": "https://cdn/b.jpg" },
              "intent": "claim-email", "maskedEmail": "bo....b@e*****om" }
            """.trimIndent(),
        ).outcome()

        assertThat(outcome).isEqualTo(
            LoginOutcome.LinkConfirmationRequired(
                account = LinkSignInAccount(id = "u9", username = "bob", displayName = "Bob", avatar = "https://cdn/b.jpg"),
                intent = LinkSignInIntent.CLAIM_EMAIL,
                maskedEmail = "bo....b@e*****om",
            ),
        )
    }

    @Test
    fun `une intention absente ou inconnue se lit sign-in`() {
        val absent = decode("""{ "requiresConfirmation": true, "account": { "id": "u9", "username": "bob" } }""").outcome()
        val inconnue = decode(
            """{ "requiresConfirmation": true, "account": { "id": "u9", "username": "bob" }, "intent": "teleport" }""",
        ).outcome()

        assertThat((absent as LoginOutcome.LinkConfirmationRequired).intent).isEqualTo(LinkSignInIntent.SIGN_IN)
        assertThat((inconnue as LoginOutcome.LinkConfirmationRequired).intent).isEqualTo(LinkSignInIntent.SIGN_IN)
    }

    @Test
    fun `requiresConfirmation sans compte lisible n'est pas exploitable`() {
        assertThat(decode("""{ "requiresConfirmation": true, "account": { "id": "u9" } }""").outcome()).isNull()
    }

    @Test
    fun `un status inconnu sans session n'est pas pris en charge`() {
        assertThat(decode("""{ "status": "device-check-required", "email": "a@b.co" }""").outcome()).isNull()
    }

    @Test
    fun `un status inconnu portant une session ouvre la session`() {
        val outcome = decode(sessionBody.replace("{", """{ "status": "welcome-back",""")).outcome()

        assertThat(outcome).isInstanceOf(LoginOutcome.Authenticated::class.java)
    }

    @Test
    fun `les champs inconnus du serveur sont ignores`() {
        val response = decode("""{ "requires2FA": true, "twoFactorToken": "t", "futureField": { "a": [1, 2] }, "flag": true }""")

        assertThat(response.outcome()).isInstanceOf(LoginOutcome.TwoFactorRequired::class.java)
    }

    @Test
    fun `une charge vide se decode et n'est pas exploitable`() {
        val response = decode("{}")

        assertThat(response).isEqualTo(LoginResponse())
        assertThat(response.outcome()).isNull()
    }

    @Test
    fun `un champ de confirmation mal type se lit absent sans faire echouer la charge`() {
        val response = decode(
            """
            { "requires2FA": true, "twoFactorToken": "t", "adoptWithinSeconds": "bientot",
              "requiresConfirmation": "oui", "account": "bob", "intent": 7, "maskedEmail": { "x": 1 } }
            """.trimIndent(),
        )

        assertThat(response.adoptWithinSeconds).isNull()
        assertThat(response.requiresConfirmation).isNull()
        assertThat(response.account).isNull()
        assertThat(response.maskedEmail).isNull()
        assertThat(response.outcome()).isEqualTo(LoginOutcome.TwoFactorRequired("t"))
    }

    @Test
    fun `un jeton sans identite lisible n'ouvre aucune session`() {
        val response = decode("""{ "token": "jwt", "user": { "id": 12 } }""")

        assertThat(response.user).isNull()
        assertThat(response.outcome()).isNull()
    }

    @Test
    fun `la charge se reecrit en JSON sans nul`() {
        val raw = json.encodeToString(LoginResponse.serializer(), LoginResponse(requires2FA = true, twoFactorToken = "t"))

        assertThat(raw).isEqualTo("""{"requires2FA":true,"twoFactorToken":"t"}""")
    }
}
