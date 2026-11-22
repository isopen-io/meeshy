package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * La confirmation « Montrer ta position réelle ? » vaut pour le partage MONTRÉ (#20248, iso
 * `SharedLocationRestoredBackupTests.swift` #20127) : un autre démarrage ou une personne ajoutée la rend caduque, une
 * personne sortie non ; la question nomme trois personnes au plus.
 */
class SharedLocationPointReplacementTest {

    private val alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private val bob = "bbbbbbbbbbbbbbbbbbbbbbbb"
    private val cyd = "cccccccccccccccccccccccc"
    private val dan = "dddddddddddddddddddddddd"
    private val eve = "eeeeeeeeeeeeeeeeeeeeeeee"

    private fun asked(startedAt: String? = "t1", vararg ids: String) = SharedLocationPointReplacement(startedAt, ids.toSet())

    @Test
    fun `la meme question, ou une personne sortie depuis, vaut encore`() {
        val question = asked("t1", alice, bob)

        assertThat(asked("t1", bob, alice).isCoveredBy(question)).isTrue()
        assertThat(asked("t1", alice).isCoveredBy(question)).isTrue()
        assertThat(asked("t1").isCoveredBy(question)).isTrue()
    }

    @Test
    fun `un autre demarrage ou une personne ajoutee rend la reponse caduque`() {
        val question = asked("t1", alice, bob)

        assertThat(asked("t2", alice, bob).isCoveredBy(question)).isFalse()
        assertThat(asked(null, alice, bob).isCoveredBy(question)).isFalse()
        assertThat(asked("t1", alice, bob, cyd).isCoveredBy(question)).isFalse()
    }

    @Test
    fun `les identifiants se comparent sans la casse`() {
        assertThat(asked("t1", alice.uppercase()).isCoveredBy(asked("t1", alice))).isTrue()
        assertThat(asked("t1", alice.uppercase())).isEqualTo(asked("t1", alice))
    }

    @Test
    fun `la question nomme trois personnes au plus, dans l'ordre des noms connus, et compte les autres`() {
        val question = asked("t1", alice, bob, cyd, dan, eve)
        val known = listOf(dan to "Dan", alice to "Ada", dan to "Dan bis", bob to "Bob", cyd to "Cyd")

        assertThat(question.audience(known)).isEqualTo(SharedLocationPointReplacement.Audience(listOf("Dan", "Ada", "Bob"), 2))
    }

    @Test
    fun `un nom inconnu, vide ou d'une personne qui ne voit pas le point ne se nomme pas`() {
        val question = asked("t1", alice, bob)
        val known = listOf(alice to "  ", cyd to "Cyd", bob.uppercase() to "Bob")

        assertThat(question.audience(known)).isEqualTo(SharedLocationPointReplacement.Audience(listOf("Bob"), 1))
        assertThat(question.audience(emptyList())).isEqualTo(SharedLocationPointReplacement.Audience(emptyList(), 2))
    }

    @Test
    fun `la liste pose la question de ses destinataires depuis le demarrage servi`() {
        val roster = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR, 0L)
            .adding(bob, SharedLocationPrecision.EXACT, SharedLocationShareDuration.ONE_HOUR, 0L)

        assertThat(roster.pointReplacement("t1")).isEqualTo(asked("t1", alice, bob))
    }
}
