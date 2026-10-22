package me.meeshy.sdk.model.account

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.account.CacheBindAction.ArchiveLive
import me.meeshy.sdk.model.account.CacheBindAction.ClaimUnrecorded
import me.meeshy.sdk.model.account.CacheBindAction.DiscardArchive
import me.meeshy.sdk.model.account.CacheBindAction.MarkInterrupted
import me.meeshy.sdk.model.account.CacheBindAction.MarkNobody
import me.meeshy.sdk.model.account.CacheBindAction.MarkOwner
import me.meeshy.sdk.model.account.CacheBindAction.RestoreArchive
import me.meeshy.sdk.model.account.CacheBindAction.WipeLive
import org.junit.Test

/**
 * Spec de [CacheBindPlan] : lier le cache au compte ACTIF, c'est une suite ordonnée
 * d'actions — mettre de côté le compte quitté s'il est gardé, l'effacer sinon, vider
 * le cache vivant, rendre celui du compte arrivé — et une liaison déjà faite ne
 * fait rien (#8674).
 *
 * Miroir : iOS `CacheCoordinator.bindAccount`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator+Accounts.swift`) et
 * `CacheAccountBindingTests`. La loi est pure : elle rend les actions, l'exécuteur
 * fait les entrées-sorties.
 *
 * Les attentes de séquence sont des littéraux écrits à la main ; la suite des
 * invariants rejoue les plans sur un interpréteur de test et vérifie, après CHAQUE
 * action, qu'un processus tué à cet instant ne laisse jamais le contenu d'un compte
 * sous le nom d'un autre.
 */
class CacheBindPlanTest {

    private val alice = account("alice")
    private val bob = account("bob")

    private fun account(user: String) =
        AccountStorageKey.of(userId = user, serverOrigin = "https://gate.staging.meeshy.me")!!

    private fun plan(
        owner: LiveOwner,
        incoming: AccountStorageKey?,
        preserved: Set<AccountStorageKey> = emptySet(),
        archives: Set<AccountStorageKey> = emptySet(),
    ) = CacheBindPlan.of(
        liveOwner = owner,
        incoming = incoming,
        preserved = preserved,
        archives = archives,
    )

    // --- A vers B ---

    @Test
    fun `A vers B avec A conserve et un cache de B de cote met A de cote et rend celui de B`() {
        val plan = plan(LiveOwner.Account(alice), bob, preserved = setOf(alice), archives = setOf(bob))

        assertThat(plan.actions).containsExactly(
            ArchiveLive(alice),
            MarkInterrupted,
            WipeLive,
            RestoreArchive(bob),
            MarkOwner(bob),
        ).inOrder()
        assertThat(plan.ownerChanged).isTrue()
    }

    @Test
    fun `A vers B avec A conserve et rien de cote pour B laisse B repartir d'un cache vide`() {
        val plan = plan(LiveOwner.Account(alice), bob, preserved = setOf(alice))

        assertThat(plan.actions).containsExactly(
            ArchiveLive(alice),
            MarkInterrupted,
            WipeLive,
            MarkOwner(bob),
        ).inOrder()
    }

    @Test
    fun `A vers B avec A non conserve efface A et ce qui dormait de cote pour lui`() {
        val plan = plan(LiveOwner.Account(alice), bob, preserved = setOf(bob), archives = setOf(alice, bob))

        assertThat(plan.actions).containsExactly(
            DiscardArchive(alice),
            MarkInterrupted,
            WipeLive,
            RestoreArchive(bob),
            MarkOwner(bob),
        ).inOrder()
    }

    @Test
    fun `une mise de cote qui echoue retombe sur l'effacement du compte quitte`() {
        assertThat(ArchiveLive(alice).onFailure).isEqualTo(DiscardArchive(alice))
    }

    @Test
    fun `la conservation se lit sur le compte quitte et non sur le compte arrive`() {
        val plan = plan(LiveOwner.Account(alice), bob, preserved = setOf(bob))

        assertThat(plan.actions.first()).isEqualTo(DiscardArchive(alice))
    }

    // --- Sortie de session ---

    @Test
    fun `une deconnexion d'un compte conserve met son cache de cote puis ne laisse personne`() {
        val plan = plan(LiveOwner.Account(alice), incoming = null, preserved = setOf(alice))

        assertThat(plan.actions).containsExactly(
            ArchiveLive(alice),
            MarkInterrupted,
            WipeLive,
            MarkNobody,
        ).inOrder()
        assertThat(plan.ownerChanged).isTrue()
    }

    @Test
    fun `une deconnexion d'un compte retire efface son cache`() {
        val plan = plan(LiveOwner.Account(alice), incoming = null)

        assertThat(plan.actions).containsExactly(
            DiscardArchive(alice),
            MarkInterrupted,
            WipeLive,
            MarkNobody,
        ).inOrder()
    }

    // --- Bascule interrompue ---

    @Test
    fun `une bascule interrompue efface le contenu orphelin avant toute attribution`() {
        val plan = plan(LiveOwner.Interrupted, bob, preserved = setOf(alice, bob), archives = setOf(bob))

        assertThat(plan.actions).containsExactly(
            MarkInterrupted,
            WipeLive,
            RestoreArchive(bob),
            MarkOwner(bob),
        ).inOrder()
        assertThat(plan.ownerChanged).isTrue()
    }

    @Test
    fun `une bascule interrompue sans cache de cote pour B part d'un cache vide`() {
        val plan = plan(LiveOwner.Interrupted, bob)

        assertThat(plan.actions).containsExactly(MarkInterrupted, WipeLive, MarkOwner(bob)).inOrder()
    }

    @Test
    fun `une bascule interrompue ne met jamais le contenu orphelin de cote`() {
        val plans = listOf(
            plan(LiveOwner.Interrupted, bob, preserved = setOf(alice, bob)),
            plan(LiveOwner.Interrupted, incoming = null, preserved = setOf(alice, bob)),
        )

        plans.forEach { assertThat(it.actions.filterIsInstance<ArchiveLive>()).isEmpty() }
    }

    @Test
    fun `une bascule interrompue sans entrant efface et ne laisse personne`() {
        val plan = plan(LiveOwner.Interrupted, incoming = null)

        assertThat(plan.actions).containsExactly(MarkInterrupted, WipeLive, MarkNobody).inOrder()
    }

    // --- Cache d'avant la loi, cache vide ---

    @Test
    fun `un cache d'avant la loi est attribue au premier compte sans etre efface`() {
        val plan = plan(LiveOwner.Unrecorded, bob, archives = setOf(bob))

        assertThat(plan.actions).containsExactly(ClaimUnrecorded(bob))
        assertThat(plan.ownerChanged).isFalse()
    }

    @Test
    fun `un cache d'avant la loi est efface quand personne ne s'y lie`() {
        val plan = plan(LiveOwner.Unrecorded, incoming = null)

        assertThat(plan.actions).containsExactly(MarkInterrupted, WipeLive, MarkNobody).inOrder()
    }

    @Test
    fun `un cache vide donne directement la main au compte arrive`() {
        val plan = plan(LiveOwner.Nobody, bob)

        assertThat(plan.actions).containsExactly(MarkOwner(bob))
        assertThat(plan.ownerChanged).isTrue()
    }

    @Test
    fun `un cache vide efface avant de rendre le cache de cote du compte arrive`() {
        val plan = plan(LiveOwner.Nobody, bob, archives = setOf(bob))

        assertThat(plan.actions).containsExactly(
            MarkInterrupted,
            WipeLive,
            RestoreArchive(bob),
            MarkOwner(bob),
        ).inOrder()
    }

    // --- Idempotence ---

    @Test
    fun `lier le compte deja actif ne fait rien meme sans etre conserve`() {
        val plan = plan(LiveOwner.Account(bob), bob, archives = setOf(alice))

        assertThat(plan.actions).isEmpty()
        assertThat(plan.ownerChanged).isFalse()
        assertThat(plan.isNoOp).isTrue()
    }

    @Test
    fun `lier personne quand personne n'est lie ne fait rien`() {
        val plan = plan(LiveOwner.Nobody, incoming = null, archives = setOf(alice))

        assertThat(plan.actions).isEmpty()
        assertThat(plan.ownerChanged).isFalse()
        assertThat(plan.isNoOp).isTrue()
    }

    @Test
    fun `une liaison de l'environnement voisin est une bascule et non un no-op`() {
        val production = AccountStorageKey.of(userId = "alice", serverOrigin = "https://gate.meeshy.me")!!

        val plan = plan(LiveOwner.Account(alice), production, preserved = setOf(alice))

        assertThat(plan.isNoOp).isFalse()
        assertThat(plan.actions.first()).isEqualTo(ArchiveLive(alice))
    }

    @Test
    fun `rejouer un plan sur son resultat ne fait rien pour toutes les combinaisons`() {
        scenarios().forEach { scenario ->
            val settled = Simulation.run(scenario)

            val replay = plan(settled.marker, scenario.incoming, scenario.preserved, settled.archives)

            assertThat(replay.isNoOp).isTrue()
        }
    }

    // --- Sûreté : un processus tué entre deux actions ---

    @Test
    fun `apres chaque action le marqueur ne nomme jamais un compte dont le contenu n'est pas le sien`() {
        scenarios().forEach { scenario -> Simulation.run(scenario, checkEachStep = true) }
    }

    @Test
    fun `la liaison aboutit au compte demande avec son contenu ou un cache vide`() {
        scenarios().forEach { scenario ->
            val settled = Simulation.run(scenario)

            val expectedOwner = scenario.incoming?.let(LiveOwner::Account) ?: LiveOwner.Nobody
            assertThat(settled.marker).isEqualTo(expectedOwner)
            val allowedContent = if (scenario.incoming == null) {
                setOf<Content>(Content.Empty)
            } else {
                setOf(Content.Empty, Content.Of(scenario.incoming))
            }
            assertThat(settled.content).isIn(allowedContent)
        }
    }

    @Test
    fun `un compte quitte et conserve garde son cache de cote et un compte retire n'en garde aucun`() {
        scenarios()
            .filter { it.owner is LiveOwner.Account && it.owner.key != it.incoming }
            .forEach { scenario ->
                val leaving = (scenario.owner as LiveOwner.Account).key

                val settled = Simulation.run(scenario)

                assertThat(leaving in settled.archives).isEqualTo(leaving in scenario.preserved)
            }
    }

    // --- Interpréteur de test ---

    private sealed interface Content {
        data object Empty : Content
        data object Foreign : Content
        data class Of(val key: AccountStorageKey) : Content
    }

    private data class Scenario(
        val owner: LiveOwner,
        val incoming: AccountStorageKey?,
        val preserved: Set<AccountStorageKey>,
        val archives: Set<AccountStorageKey>,
    )

    private data class Settled(val marker: LiveOwner, val content: Content, val archives: Set<AccountStorageKey>)

    private fun scenarios(): List<Scenario> {
        val owners = listOf(
            LiveOwner.Unrecorded,
            LiveOwner.Nobody,
            LiveOwner.Interrupted,
            LiveOwner.Account(alice),
            LiveOwner.Account(bob),
        )
        val incomings = listOf(null, alice, bob)
        val preservations = listOf(emptySet(), setOf(alice, bob))
        val archiveSets = listOf(emptySet(), setOf(alice), setOf(bob), setOf(alice, bob))
        return owners.flatMap { owner ->
            incomings.flatMap { incoming ->
                preservations.flatMap { preserved ->
                    archiveSets
                        .filterNot { owner is LiveOwner.Account && owner.key in it }
                        .map { Scenario(owner, incoming, preserved, it) }
                }
            }
        }
    }

    private object Simulation {
        fun run(scenario: Scenario, checkEachStep: Boolean = false): Settled {
            val plan = CacheBindPlan.of(scenario.owner, scenario.incoming, scenario.preserved, scenario.archives)
            var marker = scenario.owner
            var content: Content = when (val owner = scenario.owner) {
                is LiveOwner.Account -> Content.Of(owner.key)
                LiveOwner.Nobody -> Content.Empty
                LiveOwner.Unrecorded, LiveOwner.Interrupted -> Content.Foreign
            }
            var archives = scenario.archives
            plan.actions.forEach { action ->
                when (action) {
                    is ArchiveLive -> {
                        assertThat(content).isEqualTo(Content.Of(action.account))
                        archives = archives + action.account
                    }
                    is DiscardArchive -> archives = archives - action.account
                    MarkInterrupted -> marker = LiveOwner.Interrupted
                    WipeLive -> content = Content.Empty
                    MarkNobody -> marker = LiveOwner.Nobody
                    is RestoreArchive -> {
                        assertThat(marker).isEqualTo(LiveOwner.Interrupted)
                        assertThat(content).isEqualTo(Content.Empty)
                        assertThat(action.account in archives).isTrue()
                        content = Content.Of(action.account)
                        archives = archives - action.account
                    }
                    is MarkOwner -> marker = LiveOwner.Account(action.account)
                    is ClaimUnrecorded -> {
                        marker = LiveOwner.Account(action.account)
                        content = Content.Of(action.account)
                    }
                }
                if (checkEachStep) assertConsistent(marker, content)
            }
            return Settled(marker, content, archives)
        }

        private fun assertConsistent(marker: LiveOwner, content: Content) {
            when (marker) {
                is LiveOwner.Account -> assertThat(content).isAnyOf(Content.Of(marker.key), Content.Empty)
                LiveOwner.Nobody -> assertThat(content).isEqualTo(Content.Empty)
                LiveOwner.Unrecorded, LiveOwner.Interrupted -> Unit
            }
        }
    }
}
