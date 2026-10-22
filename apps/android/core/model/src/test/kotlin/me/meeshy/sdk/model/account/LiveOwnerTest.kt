package me.meeshy.sdk.model.account

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Spec du marqueur [LiveOwner] : ce qui est gravé survit au processus, et ce qui
 * est illisible n'est JAMAIS attribué à un compte — il vaut « bascule interrompue »
 * et le contenu est effacé.
 *
 * Miroir : iOS `CacheCoordinator.liveOwner` / `markLiveOwner`
 * (`CacheCoordinator+Accounts.swift`), dont les valeurs gravées sont conservées.
 */
class LiveOwnerTest {

    private fun account(user: String = "a1", origin: String? = "https://gate.meeshy.me") =
        AccountStorageKey.of(userId = user, serverOrigin = origin)!!

    @Test
    fun `aucun marqueur grave signifie un cache d'avant la loi`() {
        assertThat(LiveOwner.decode(null)).isEqualTo(LiveOwner.Unrecorded)
        assertThat(LiveOwner.Unrecorded.encode()).isNull()
    }

    @Test
    fun `personne et bascule interrompue ont leurs valeurs gravees`() {
        assertThat(LiveOwner.Nobody.encode()).isEqualTo("")
        assertThat(LiveOwner.Interrupted.encode()).isEqualTo("~")
        assertThat(LiveOwner.decode("")).isEqualTo(LiveOwner.Nobody)
        assertThat(LiveOwner.decode("~")).isEqualTo(LiveOwner.Interrupted)
    }

    @Test
    fun `un compte se grave sous la forme hote retour-ligne utilisateur`() {
        assertThat(LiveOwner.Account(account()).encode()).isEqualTo("gate.meeshy.me\na1")
    }

    @Test
    fun `un compte survit a un aller-retour par le marqueur`() {
        val owners = listOf(
            LiveOwner.Unrecorded,
            LiveOwner.Nobody,
            LiveOwner.Interrupted,
            LiveOwner.Account(account()),
            LiveOwner.Account(account(origin = "https://gate.staging.meeshy.me")),
            LiveOwner.Account(account(origin = "http://localhost:3000")),
            LiveOwner.Account(account(origin = null)),
        )

        owners.forEach { assertThat(LiveOwner.decode(it.encode())).isEqualTo(it) }
    }

    @Test
    fun `un marqueur illisible vaut une bascule interrompue`() {
        assertThat(LiveOwner.decode("gate.meeshy.me")).isEqualTo(LiveOwner.Interrupted)
        assertThat(LiveOwner.decode("gate.meeshy.me\n")).isEqualTo(LiveOwner.Interrupted)
        assertThat(LiveOwner.decode("gate.meeshy.me\n   ")).isEqualTo(LiveOwner.Interrupted)
        assertThat(LiveOwner.decode("n'importe quoi")).isEqualTo(LiveOwner.Interrupted)
    }

    @Test
    fun `les comptes de deux environnements ne se confondent pas dans le marqueur`() {
        val production = LiveOwner.Account(account(origin = "https://gate.meeshy.me")).encode()
        val staging = LiveOwner.Account(account(origin = "https://gate.staging.meeshy.me")).encode()

        assertThat(production).isNotEqualTo(staging)
        assertThat(LiveOwner.decode(production)).isNotEqualTo(LiveOwner.decode(staging))
    }
}
