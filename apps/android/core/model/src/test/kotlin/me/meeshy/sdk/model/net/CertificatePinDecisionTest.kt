package me.meeshy.sdk.model.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CertificatePinDecisionTest {

    private val pins = setOf("current=", "backup=")

    @Test
    fun `sans empreinte configuree la decision est non configuree`() {
        assertThat(CertificatePinEvaluator.evaluate(listOf("a="), emptySet()))
            .isEqualTo(CertificatePinDecision.Unconfigured)
    }

    @Test
    fun `un certificat de la chaine qui porte l'empreinte courante est accepte`() {
        val decision = CertificatePinEvaluator.evaluate(listOf("leaf=", "current="), pins)
        assertThat(decision).isEqualTo(CertificatePinDecision.Matched("current="))
        assertThat(decision.isAllowed).isTrue()
    }

    @Test
    fun `l'empreinte de secours est acceptee`() {
        assertThat(CertificatePinEvaluator.evaluate(listOf("leaf=", "backup="), pins))
            .isEqualTo(CertificatePinDecision.Matched("backup="))
    }

    @Test
    fun `aucune empreinte ne correspond le verdict est refuse`() {
        val decision = CertificatePinEvaluator.evaluate(listOf("leaf=", "root="), pins)
        assertThat(decision).isEqualTo(CertificatePinDecision.Mismatch)
        assertThat(decision.isAllowed).isFalse()
    }

    @Test
    fun `une chaine vide ou entierement illisible echoue ferme`() {
        assertThat(CertificatePinEvaluator.evaluate(emptyList(), pins))
            .isEqualTo(CertificatePinDecision.ChainUnreadable)
        assertThat(CertificatePinEvaluator.evaluate(listOf(null, null), pins))
            .isEqualTo(CertificatePinDecision.ChainUnreadable)
    }

    @Test
    fun `un certificat illisible n'empeche pas un autre de correspondre`() {
        assertThat(CertificatePinEvaluator.evaluate(listOf(null, "current="), pins))
            .isEqualTo(CertificatePinDecision.Matched("current="))
    }

    private fun policy(
        current: Set<String> = setOf("current="),
        backup: Set<String> = setOf("backup="),
        expiresAt: Long = 1_000L,
    ) = CertificatePinPolicy(CertificatePinPolicy.PINNED_HOSTS, current, backup, expiresAt)

    @Test
    fun `production et staging sont epingles courant plus secours`() {
        listOf("gate.meeshy.me", "gate.staging.meeshy.me").forEach { host ->
            assertThat(policy().modeFor(host, 0L))
                .isEqualTo(CertificatePinMode.Enforced(setOf("current=", "backup=")))
        }
    }

    @Test
    fun `localhost l'alias emulateur et un hote personnalise ne sont pas epingles`() {
        listOf("localhost", "10.0.2.2", "mon-serveur.example.org").forEach { host ->
            assertThat(policy().modeFor(host, 0L)).isEqualTo(CertificatePinMode.Unconfigured)
        }
    }

    @Test
    fun `un pin-set vide laisse l'hote non configure`() {
        assertThat(policy(current = emptySet(), backup = emptySet()).modeFor("gate.meeshy.me", 0L))
            .isEqualTo(CertificatePinMode.Unconfigured)
    }

    @Test
    fun `passe la date d'expiration le mode est expire et non refuse`() {
        assertThat(policy().modeFor("gate.meeshy.me", 1_000L)).isEqualTo(CertificatePinMode.Expired)
    }

    @Test
    fun `la casse de l'hote ne contourne pas l'epinglage`() {
        assertThat(policy().modeFor("GATE.meeshy.me", 0L)).isInstanceOf(CertificatePinMode.Enforced::class.java)
    }
}
