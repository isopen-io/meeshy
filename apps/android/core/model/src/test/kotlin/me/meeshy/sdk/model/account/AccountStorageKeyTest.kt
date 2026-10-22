package me.meeshy.sdk.model.account

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.auth.ServerEnvironment
import org.junit.Test

/**
 * Spec de [AccountStorageKey] : le compte à qui appartient tout ce que l'appareil
 * garde en local (cache, base des messages, outbox) se dit « utilisateur +
 * environnement API », parce qu'un même identifiant existe en production ET en
 * staging.
 *
 * Miroirs : iOS `MessageStoreAccountKey` (`packages/MeeshySDK/Tests/MeeshySDKTests/
 * Persistence/MessageStoreAccountKeyTests.swift`). Les empreintes attendues sont
 * celles de la formule iOS `SHA256("<hôte>|<utilisateur>")`, 16 premiers octets en
 * hexadécimal, calculées hors du code testé : une dérive de la formule rend un
 * compte illisible pour la base qu'il a déjà écrite.
 */
class AccountStorageKeyTest {

    private val production = ServerEnvironment.PRODUCTION.origin
    private val staging = ServerEnvironment.STAGING.origin
    private val userId = "507f1f77bcf86cd799439011"

    private fun key(user: String? = userId, origin: String? = production) =
        AccountStorageKey.of(userId = user, serverOrigin = origin)

    @Test
    fun `le meme utilisateur en production et en staging donne deux comptes distincts`() {
        val prod = key(origin = production)
        val stag = key(origin = staging)

        assertThat(prod).isNotNull()
        assertThat(stag).isNotNull()
        assertThat(prod).isNotEqualTo(stag)
        assertThat(prod!!.fingerprint).isNotEqualTo(stag!!.fingerprint)
    }

    @Test
    fun `deux utilisateurs du meme environnement donnent deux empreintes`() {
        assertThat(key(user = "a1")!!.fingerprint).isNotEqualTo(key(user = "b2")!!.fingerprint)
    }

    @Test
    fun `l'empreinte suit la formule iOS pour la production`() {
        assertThat(key(origin = production)!!.fingerprint)
            .isEqualTo("941deb263c827bfbbd5c5cee10ff74ef")
    }

    @Test
    fun `l'empreinte suit la formule iOS pour le staging`() {
        assertThat(key(origin = staging)!!.fingerprint)
            .isEqualTo("b96b4b4fb41ac0afe6a83ea97eeb2da3")
    }

    @Test
    fun `l'empreinte d'un serveur local garde son port`() {
        assertThat(key(origin = ServerEnvironment.LOCALHOST.origin)!!.fingerprint)
            .isEqualTo("972e02f0f7b3464ccd81251335aa8cfa")
    }

    @Test
    fun `un meme compte garde la meme cle quelle que soit l'ecriture de l'origine`() {
        val canonical = key(origin = production)

        assertThat(key(origin = "HTTPS://Gate.Meeshy.me/")).isEqualTo(canonical)
        assertThat(key(origin = "  https://gate.meeshy.me  ")).isEqualTo(canonical)
        assertThat(key(origin = "https://gate.meeshy.me/api/v1")).isEqualTo(canonical)
        assertThat(key(origin = "gate.meeshy.me")).isEqualTo(canonical)
        assertThat(key(origin = "HTTPS://Gate.Meeshy.me/")!!.fingerprint)
            .isEqualTo(canonical!!.fingerprint)
    }

    @Test
    fun `l'hote conserve un port explicite et abandonne le schema et le chemin`() {
        assertThat(key(origin = "http://localhost:3000")!!.environmentHost).isEqualTo("localhost:3000")
        assertThat(key(origin = "https://gate.meeshy.me:8443/api/v1")!!.environmentHost)
            .isEqualTo("gate.meeshy.me:8443")
        assertThat(key(origin = "https://user:secret@gate.meeshy.me/")!!.environmentHost)
            .isEqualTo("gate.meeshy.me")
    }

    @Test
    fun `un hote saisi sans schema reste lisible tel quel`() {
        assertThat(key(origin = "localhost:3000")!!.environmentHost).isEqualTo("localhost:3000")
        assertThat(key(origin = "/gate.meeshy.me/")!!.environmentHost).isEqualTo("gate.meeshy.me")
    }

    @Test
    fun `une origine absente ou vide donne un hote vide mais un compte valide`() {
        assertThat(key(origin = null)!!.environmentHost).isEmpty()
        assertThat(key(origin = "  ")!!.environmentHost).isEmpty()
        assertThat(key(origin = null)!!.fingerprint).isEqualTo(
            AccountStorageKey.of(userId = userId, serverOrigin = "")!!.fingerprint,
        )
    }

    @Test
    fun `sans utilisateur il n'y a aucun compte`() {
        assertThat(key(user = null)).isNull()
        assertThat(key(user = "")).isNull()
        assertThat(key(user = "   ")).isNull()
    }

    @Test
    fun `l'identifiant est nettoye de ses blancs`() {
        assertThat(key(user = "  $userId\n")).isEqualTo(key(user = userId))
        assertThat(key(user = "  $userId\n")!!.userId).isEqualTo(userId)
    }

    @Test
    fun `l'empreinte ne s'ecrit qu'avec des caracteres surs pour un nom de fichier`() {
        val fingerprints = listOf(
            key(user = "a/b\\c:d*e?f")!!,
            key(user = "é ü ñ 日本語")!!,
            key(user = "../../etc/passwd")!!,
            key(origin = "https://exemple.org/../x")!!,
        ).map { it.fingerprint }

        fingerprints.forEach { assertThat(it).matches("[0-9a-f]{32}") }
        assertThat(fingerprints.toSet()).hasSize(fingerprints.size)
    }

    @Test
    fun `l'empreinte ne laisse apparaitre ni l'identifiant ni l'hote`() {
        val fingerprint = key()!!.fingerprint

        assertThat(fingerprint).doesNotContain(userId)
        assertThat(fingerprint).doesNotContain("meeshy")
    }

    @Test
    fun `l'empreinte nomme un fichier a partir d'un prefixe et d'un suffixe`() {
        val fingerprint = key()!!.fingerprint

        assertThat(key()!!.fileName(prefix = "meeshy_cache_acct_", suffix = ".db"))
            .isEqualTo("meeshy_cache_acct_${fingerprint}.db")
    }

    @Test
    fun `un compte retrouve depuis son marqueur redonne la meme empreinte`() {
        val original = key(origin = staging)!!

        val restored = AccountStorageKey.ofNormalized(
            userId = original.userId,
            environmentHost = original.environmentHost,
        )

        assertThat(restored).isEqualTo(original)
        assertThat(restored.fingerprint).isEqualTo(original.fingerprint)
    }
}
