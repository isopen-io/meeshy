package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [ComposerLanguageState] — the pure "smart context zone"
 * language state behind the chat composer's live language pill/picker. Port of
 * iOS `TextAnalyzer` language tracking + `ComposerLanguageResolver.resolve`:
 *
 *  - The pill follows the on-device detection as the user types.
 *  - A manual pick (the picker override) ALWAYS wins and freezes detection.
 *  - Once the draft reaches [ComposerLanguageState.WORD_LOCK_THRESHOLD] words the
 *    detected language is locked and re-analysis stops.
 *  - Emptying the composer releases the lock (unless a manual pick is active),
 *    so the next message re-detects from scratch.
 *
 * Detection itself is delegated to the already-tested [me.meeshy.sdk.lang.ComposeLanguageDetector];
 * these tests pin the STATE MACHINE around it, using inputs whose detected code
 * is fixed by that detector's own spec.
 */
class ComposerLanguageStateTest {

    // A clearly-French sentence, under the word-lock threshold (5 words).
    private val frenchShort = "Bonjour, comment allez-vous aujourd'hui ?"

    // A clearly-Spanish sentence, under the word-lock threshold (few words).
    private val spanishShort = "Hola, ¿cómo estás? ¿Qué tal todo por allá?"

    // A clearly-German sentence at 11 words — crosses the 10-word lock threshold.
    private val germanLong = "Der Hund ist mit dem Ball und läuft für die Straße"

    // MARK: - display() precedence

    @Test
    fun `display uses the fallback when nothing is detected or overridden`() {
        assertThat(ComposerLanguageState().display(fallback = "en")).isEqualTo("en")
    }

    @Test
    fun `display prefers a detected language over the fallback`() {
        val state = ComposerLanguageState(detected = "es")
        assertThat(state.display(fallback = "fr")).isEqualTo("es")
    }

    @Test
    fun `display prefers a manual override over both detection and fallback`() {
        val state = ComposerLanguageState(detected = "es", manualOverride = "de")
        assertThat(state.display(fallback = "fr")).isEqualTo("de")
    }

    // MARK: - onDraftChanged: detection

    @Test
    fun `typing a detectable sentence surfaces its language on the pill`() {
        val state = ComposerLanguageState().onDraftChanged(spanishShort)
        assertThat(state.detected).isEqualTo("es")
        assertThat(state.display(fallback = "fr")).isEqualTo("es")
    }

    @Test
    fun `an undetectable draft leaves the pill on the live fallback, never pinned`() {
        // English is not a scored pattern → no confident detection. The pill must
        // stay on whatever fallback the caller supplies at read time (the user's
        // resolved content language), NOT get pinned to a stale guess.
        val state = ComposerLanguageState().onDraftChanged("hello there friend")
        assertThat(state.detected).isNull()
        assertThat(state.display(fallback = "de")).isEqualTo("de")
        assertThat(state.isLocked).isFalse()
    }

    @Test
    fun `a draft below the alpha floor never detects`() {
        val state = ComposerLanguageState().onDraftChanged("hi")
        assertThat(state.detected).isNull()
        assertThat(state.isLocked).isFalse()
    }

    @Test
    fun `detection re-evaluates on every keystroke while unlocked`() {
        // French first, then the user rewrites in Spanish — the pill follows.
        val state = ComposerLanguageState()
            .onDraftChanged(frenchShort)
            .also { assertThat(it.detected).isEqualTo("fr") }
            .onDraftChanged(spanishShort)
        assertThat(state.detected).isEqualTo("es")
    }

    // MARK: - onDraftChanged: word-count lock

    @Test
    fun `reaching the word threshold locks the detected language`() {
        val state = ComposerLanguageState().onDraftChanged(germanLong)
        assertThat(state.detected).isEqualTo("de")
        assertThat(state.isLocked).isTrue()
    }

    @Test
    fun `a locked state stops re-detecting even for a strong foreign signal`() {
        val locked = ComposerLanguageState().onDraftChanged(germanLong)
        assertThat(locked.isLocked).isTrue()

        val next = locked.onDraftChanged("$germanLong. $spanishShort")
        assertThat(next).isEqualTo(locked)
        assertThat(next.detected).isEqualTo("de")
    }

    @Test
    fun `an undetectable draft never locks even past the word threshold`() {
        // 11 English words: crosses the count but yields no detection, so it must
        // keep re-analysing — a later foreign phrase can still flip it.
        val state = ComposerLanguageState()
            .onDraftChanged("one two three four five six seven eight nine ten eleven")
        assertThat(state.isLocked).isFalse()
        assertThat(state.detected).isNull()
    }

    // MARK: - onDraftChanged: manual override wins

    @Test
    fun `a manual override suppresses detection entirely`() {
        val state = ComposerLanguageState(manualOverride = "en").onDraftChanged(germanLong)
        assertThat(state.detected).isNull()
        assertThat(state.display(fallback = "fr")).isEqualTo("en")
    }

    // MARK: - onDraftChanged: emptying releases the lock

    @Test
    fun `emptying the composer releases the detection lock`() {
        val locked = ComposerLanguageState().onDraftChanged(germanLong)
        assertThat(locked.isLocked).isTrue()

        val cleared = locked.onDraftChanged("")
        assertThat(cleared).isEqualTo(ComposerLanguageState())
        assertThat(cleared.isLocked).isFalse()
        assertThat(cleared.detected).isNull()
    }

    @Test
    fun `emptying keeps a manual override in place`() {
        val overridden = ComposerLanguageState(manualOverride = "en", isLocked = true)
        val cleared = overridden.onDraftChanged("   ")
        assertThat(cleared).isEqualTo(overridden)
        assertThat(cleared.display(fallback = "fr")).isEqualTo("en")
    }

    @Test
    fun `a released lock re-detects on the next draft`() {
        val state = ComposerLanguageState()
            .onDraftChanged(germanLong)
            .onDraftChanged("")
            .onDraftChanged(spanishShort)
        assertThat(state.detected).isEqualTo("es")
        assertThat(state.isLocked).isFalse()
    }

    // MARK: - withManualPick

    @Test
    fun `withManualPick records the choice and locks detection`() {
        val state = ComposerLanguageState(detected = "es").withManualPick("de")
        assertThat(state.manualOverride).isEqualTo("de")
        assertThat(state.isLocked).isTrue()
        assertThat(state.display(fallback = "fr")).isEqualTo("de")
    }

    // MARK: - purity

    @Test
    fun `onDraftChanged is deterministic for the same input`() {
        val a = ComposerLanguageState().onDraftChanged(spanishShort)
        val b = ComposerLanguageState().onDraftChanged(spanishShort)
        assertThat(a).isEqualTo(b)
    }
}
