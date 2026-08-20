package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure sentiment core — [SentimentLevel] and
 * [SentimentAnalyzer]. Every expectation is a hand-written literal asserted through
 * the public API, never the type's internals.
 *
 * Parity source: iOS `TextAnalyzer.computeSentiment` + `SentimentLevel.from(score:)`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Utilities/TextAnalyzer.swift`) — the
 * dictionary-based (FR/EN/ES/DE) scorer that drives the composer's live sentiment
 * emoji (`SmartContextZone`). Distinct from the message-detail sheet's `NLTagger`
 * (Apple ML) scorer, which has no portable Android equivalent and is out of scope.
 */
class SentimentTest {

    // ---- SentimentLevel.from — threshold buckets (parity iOS SentimentLevel.from) ----

    @Test
    fun from_belowMinusPointSix_isVeryNegative() {
        assertThat(SentimentLevel.from(-0.7)).isEqualTo(SentimentLevel.VERY_NEGATIVE)
        assertThat(SentimentLevel.from(-1.0)).isEqualTo(SentimentLevel.VERY_NEGATIVE)
    }

    @Test
    fun from_minusPointSix_isNegative_boundaryBelongsToNegative() {
        assertThat(SentimentLevel.from(-0.6)).isEqualTo(SentimentLevel.NEGATIVE)
        assertThat(SentimentLevel.from(-0.31)).isEqualTo(SentimentLevel.NEGATIVE)
    }

    @Test
    fun from_minusPointThree_isSlightlyNegative_boundaryBelongsToSlightlyNegative() {
        assertThat(SentimentLevel.from(-0.3)).isEqualTo(SentimentLevel.SLIGHTLY_NEGATIVE)
        assertThat(SentimentLevel.from(-0.11)).isEqualTo(SentimentLevel.SLIGHTLY_NEGATIVE)
    }

    @Test
    fun from_neutralBand_isNeutral_bothBoundariesInclusive() {
        assertThat(SentimentLevel.from(-0.1)).isEqualTo(SentimentLevel.NEUTRAL)
        assertThat(SentimentLevel.from(0.0)).isEqualTo(SentimentLevel.NEUTRAL)
        assertThat(SentimentLevel.from(0.1)).isEqualTo(SentimentLevel.NEUTRAL)
    }

    @Test
    fun from_justAbovePointOne_isSlightlyPositive() {
        assertThat(SentimentLevel.from(0.11)).isEqualTo(SentimentLevel.SLIGHTLY_POSITIVE)
        assertThat(SentimentLevel.from(0.29)).isEqualTo(SentimentLevel.SLIGHTLY_POSITIVE)
    }

    @Test
    fun from_pointThree_isPositive_boundaryBelongsToPositive() {
        assertThat(SentimentLevel.from(0.3)).isEqualTo(SentimentLevel.POSITIVE)
        assertThat(SentimentLevel.from(0.59)).isEqualTo(SentimentLevel.POSITIVE)
    }

    @Test
    fun from_pointSixAndAbove_isVeryPositive_boundaryBelongsToVeryPositive() {
        assertThat(SentimentLevel.from(0.6)).isEqualTo(SentimentLevel.VERY_POSITIVE)
        assertThat(SentimentLevel.from(1.0)).isEqualTo(SentimentLevel.VERY_POSITIVE)
    }

    // ---- SentimentLevel.emoji (parity iOS SentimentLevel.emoji, the 7-glyph set) ----

    @Test
    fun emoji_mapsEachLevelToItsGlyph() {
        assertThat(SentimentLevel.VERY_NEGATIVE.emoji).isEqualTo("😡")
        assertThat(SentimentLevel.NEGATIVE.emoji).isEqualTo("😠")
        assertThat(SentimentLevel.SLIGHTLY_NEGATIVE.emoji).isEqualTo("😕")
        assertThat(SentimentLevel.NEUTRAL.emoji).isEqualTo("😐")
        assertThat(SentimentLevel.SLIGHTLY_POSITIVE.emoji).isEqualTo("🙂")
        assertThat(SentimentLevel.POSITIVE.emoji).isEqualTo("😊")
        assertThat(SentimentLevel.VERY_POSITIVE.emoji).isEqualTo("🤩")
    }

    // ---- SentimentAnalyzer.score — empty / blank ----

    @Test
    fun score_emptyText_isZero() {
        assertThat(SentimentAnalyzer.score("")).isEqualTo(0.0)
    }

    @Test
    fun score_blankAndPunctuationOnly_isZero() {
        assertThat(SentimentAnalyzer.score("   \n\t ")).isEqualTo(0.0)
        assertThat(SentimentAnalyzer.score("!!! ... ???")).isEqualTo(0.0)
    }

    // ---- SentimentAnalyzer.score — sign & normalization (sum / wordCount * 2, clamped) ----

    @Test
    fun score_singleStrongPositiveWord_clampsToOne() {
        // "love" = 0.8 → 0.8 / 1 * 2 = 1.6, clamped to 1.0.
        assertThat(SentimentAnalyzer.score("love")).isEqualTo(1.0)
    }

    @Test
    fun score_singleStrongNegativeWord_clampsToMinusOne() {
        // "hate" = -0.8 → -1.6, clamped to -1.0.
        assertThat(SentimentAnalyzer.score("hate")).isEqualTo(-1.0)
    }

    @Test
    fun score_sentimentWordDilutedByNeutralWords_normalizesByWordCount() {
        // "i love this" → only "love" (0.8) scores; 0.8 / 3 * 2 ≈ 0.533.
        assertThat(SentimentAnalyzer.score("i love this")).isWithin(1e-9).of(0.8 / 3.0 * 2.0)
    }

    @Test
    fun score_neutralText_isZero() {
        assertThat(SentimentAnalyzer.score("the sky is blue today")).isEqualTo(0.0)
    }

    @Test
    fun score_mixedPositiveAndNegative_sumsThenNormalizes() {
        // "great" (0.6) + "boring" (-0.4) over 3 words: (0.6 - 0.4) / 3 * 2.
        assertThat(SentimentAnalyzer.score("great but boring")).isWithin(1e-9).of(0.2 / 3.0 * 2.0)
    }

    // ---- SentimentAnalyzer.score — tokenization (case-insensitive, edge punctuation trimmed) ----

    @Test
    fun score_isCaseInsensitive() {
        assertThat(SentimentAnalyzer.score("LOVE")).isEqualTo(SentimentAnalyzer.score("love"))
    }

    @Test
    fun score_trimsLeadingAndTrailingPunctuation() {
        // "Love!" and "(love)" both tokenize to "love".
        assertThat(SentimentAnalyzer.score("Love!")).isEqualTo(1.0)
        assertThat(SentimentAnalyzer.score("(love)")).isEqualTo(1.0)
    }

    @Test
    fun score_recognisesNonEnglishDictionaries() {
        // French "merci" (0.4), Spanish "malo" (-0.5), German "danke" (0.4).
        assertThat(SentimentAnalyzer.score("merci")).isGreaterThan(0.0)
        assertThat(SentimentAnalyzer.score("malo")).isLessThan(0.0)
        assertThat(SentimentAnalyzer.score("danke")).isGreaterThan(0.0)
    }

    // ---- End-to-end: text → level ----

    @Test
    fun scoreThenFrom_projectsTextToLevel() {
        assertThat(SentimentLevel.from(SentimentAnalyzer.score("i love this"))).isEqualTo(SentimentLevel.POSITIVE)
        assertThat(SentimentLevel.from(SentimentAnalyzer.score("i like this movie"))).isEqualTo(SentimentLevel.SLIGHTLY_POSITIVE)
        assertThat(SentimentLevel.from(SentimentAnalyzer.score("the sky is blue today"))).isEqualTo(SentimentLevel.NEUTRAL)
        // "terrible" (-0.7) over 3 words → -0.467 → NEGATIVE (not the clamped VERY_NEGATIVE).
        assertThat(SentimentLevel.from(SentimentAnalyzer.score("this is terrible"))).isEqualTo(SentimentLevel.NEGATIVE)
        // A bare strong-negative word clamps into the deepest bucket.
        assertThat(SentimentLevel.from(SentimentAnalyzer.score("terrible"))).isEqualTo(SentimentLevel.VERY_NEGATIVE)
    }

    @Test
    fun score_isDeterministic_sameTextSameScore() {
        val text = "i love this amazing wonderful day"
        assertThat(SentimentAnalyzer.score(text)).isEqualTo(SentimentAnalyzer.score(text))
    }
}
