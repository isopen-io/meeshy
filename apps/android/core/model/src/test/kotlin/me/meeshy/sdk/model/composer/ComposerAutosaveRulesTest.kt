package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerAutosaveRulesTest {
    private fun gate(opening: ComposerAutosaveOpening, stored: Boolean, account: Boolean = true) =
        ComposerAutosaveGate.bind(opening, hasAccount = account, storedDraftExists = stored)

    @Test
    fun `an account needs both a user and an origin`() {
        assertThat(ComposerAutosaveAccount.of(null, "https://gate")).isNull()
        assertThat(ComposerAutosaveAccount.of("u1", " ")).isNull()
        val a = ComposerAutosaveAccount.of("u1", "https://gate.meeshy.me")
        assertThat(a).isNotEqualTo(ComposerAutosaveAccount.of("u1", "https://gate.staging.meeshy.me"))
        assertThat(a).isEqualTo(ComposerAutosaveAccount.of("u1", "https://gate.meeshy.me"))
    }

    @Test
    fun `a publication slot names its mutation`() {
        assertThat(ComposerAutosaveSlot.publication("cm1").publicationId).isEqualTo("cm1")
        assertThat(ComposerAutosaveSlot.CREATION.publicationId).isNull()
    }

    @Test
    fun `opening decision`() {
        assertThat(ComposerAutosaveOpening.decide(opensEdition = true, isSeeded = true)).isEqualTo(ComposerAutosaveOpening.DISABLED)
        assertThat(ComposerAutosaveOpening.decide(opensEdition = false, isSeeded = true)).isEqualTo(ComposerAutosaveOpening.PRESERVES_STORED_DRAFT)
        assertThat(ComposerAutosaveOpening.decide(opensEdition = false, isSeeded = false)).isEqualTo(ComposerAutosaveOpening.RESTORES)
    }

    @Test
    fun `a seeded session never overwrites a stored draft it did not make its own`() {
        val g = gate(ComposerAutosaveOpening.PRESERVES_STORED_DRAFT, stored = true)
        assertThat(g.actionFor(hasContent = true)).isEqualTo(ComposerAutosaveAction.SKIP)
        assertThat(g.actionFor(hasContent = false)).isEqualTo(ComposerAutosaveAction.SKIP)
    }

    @Test
    fun `a seeded session writes when the slot is free`() {
        assertThat(gate(ComposerAutosaveOpening.PRESERVES_STORED_DRAFT, stored = false).actionFor(true)).isEqualTo(ComposerAutosaveAction.WRITE)
    }

    @Test
    fun `emptying deletes only the draft the session owns`() {
        val owner = gate(ComposerAutosaveOpening.RESTORES, stored = true)
        assertThat(owner.actionFor(false)).isEqualTo(ComposerAutosaveAction.DELETE)
        val fresh = gate(ComposerAutosaveOpening.RESTORES, stored = false)
        assertThat(fresh.actionFor(false)).isEqualTo(ComposerAutosaveAction.SKIP)
        assertThat(fresh.wrote().actionFor(false)).isEqualTo(ComposerAutosaveAction.DELETE)
        assertThat(fresh.wrote().deleted().actionFor(false)).isEqualTo(ComposerAutosaveAction.SKIP)
    }

    @Test
    fun `after an accepted publication nothing is written`() {
        val g = gate(ComposerAutosaveOpening.RESTORES, stored = true).discard()
        assertThat(g.actionFor(true)).isEqualTo(ComposerAutosaveAction.SKIP)
        assertThat(g.keepsDraft).isFalse()
    }

    @Test
    fun `no account or a disabled opening never writes`() {
        assertThat(gate(ComposerAutosaveOpening.RESTORES, stored = false, account = false).actionFor(true)).isEqualTo(ComposerAutosaveAction.SKIP)
        assertThat(gate(ComposerAutosaveOpening.DISABLED, stored = false).actionFor(true)).isEqualTo(ComposerAutosaveAction.SKIP)
    }

    @Test
    fun `debounce is 1200 ms`() {
        assertThat(ComposerAutosaveTiming.DEBOUNCE_MS).isEqualTo(1_200L)
    }
}
