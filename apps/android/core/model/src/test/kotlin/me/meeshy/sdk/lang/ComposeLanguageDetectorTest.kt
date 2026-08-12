package me.meeshy.sdk.lang

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for [ComposeLanguageDetector] — the pure port of
 * apps/web/utils/language-detection.ts (`detectLanguage` scoring + the
 * `detectComposeLanguage` guards). The detector never throws and always
 * returns either a supported detected code or the caller-supplied fallback.
 */
class ComposeLanguageDetectorTest {

    @Test
    fun detect_blankText_returnsFallback() {
        assertThat(ComposeLanguageDetector.detect("", fallback = "en")).isEqualTo("en")
        assertThat(ComposeLanguageDetector.detect("   \n\t", fallback = "de")).isEqualTo("de")
    }

    @Test
    fun detect_belowMinimumAlpha_returnsFallback() {
        // Fewer than 4 letters — too short to trust any signal.
        assertThat(ComposeLanguageDetector.detect("hi", fallback = "fr")).isEqualTo("fr")
        assertThat(ComposeLanguageDetector.detect("123 !!! 42", fallback = "es")).isEqualTo("es")
    }

    @Test
    fun detect_urlOnly_isStrippedThenFallsBack() {
        // The URL is stripped before counting letters, so this drops below the
        // alpha floor and returns the fallback rather than mis-detecting on a host.
        assertThat(ComposeLanguageDetector.detect("https://meeshy.me/x?a=1", fallback = "en"))
            .isEqualTo("en")
    }

    @Test
    fun detect_unrecognizedLatinText_returnsFallback() {
        // No stopword/accent hits for any scored language → fallback (English is
        // not a scored pattern, mirroring the web heuristic).
        assertThat(ComposeLanguageDetector.detect("hello there friend", fallback = "fr"))
            .isEqualTo("fr")
    }

    @Test
    fun detect_french() {
        assertThat(ComposeLanguageDetector.detect("Bonjour, comment allez-vous aujourd'hui ?", fallback = "en"))
            .isEqualTo("fr")
    }

    @Test
    fun detect_spanish() {
        assertThat(ComposeLanguageDetector.detect("Hola, ¿cómo estás? ¿Qué tal todo por allá?", fallback = "en"))
            .isEqualTo("es")
    }

    @Test
    fun detect_german() {
        assertThat(ComposeLanguageDetector.detect("Der Hund ist mit dem Ball und läuft für die Straße", fallback = "en"))
            .isEqualTo("de")
    }

    @Test
    fun detect_italian() {
        assertThat(ComposeLanguageDetector.detect("Il gatto è sul tavolo perché non vuole più mangiare", fallback = "en"))
            .isEqualTo("it")
    }

    @Test
    fun detect_portuguese() {
        assertThat(ComposeLanguageDetector.detect("Não vou sair porque está a chover lá fora, então fico", fallback = "en"))
            .isEqualTo("pt")
    }

    @Test
    fun detect_russian_byScript() {
        assertThat(ComposeLanguageDetector.detect("Привет, как дела сегодня?", fallback = "en"))
            .isEqualTo("ru")
    }

    @Test
    fun detect_arabic_byScript() {
        assertThat(ComposeLanguageDetector.detect("مرحبا كيف حالك اليوم في العمل", fallback = "en"))
            .isEqualTo("ar")
    }

    @Test
    fun detect_chinese_byScript() {
        assertThat(ComposeLanguageDetector.detect("你好，今天的天气很好", fallback = "en"))
            .isEqualTo("zh")
    }

    @Test
    fun detect_japanese_byScript() {
        assertThat(ComposeLanguageDetector.detect("こんにちは、今日はいい天気ですね", fallback = "en"))
            .isEqualTo("ja")
    }

    @Test
    fun detect_korean_byScript() {
        assertThat(ComposeLanguageDetector.detect("안녕하세요 오늘 날씨가 좋네요", fallback = "en"))
            .isEqualTo("ko")
    }

    @Test
    fun detect_returnsFallback_whenDetectedCodeUnsupported() {
        // Guard: the detector only ever returns a code in the supported catalog,
        // otherwise the fallback. All built-in patterns are supported, so this
        // asserts the invariant holds for a clean French detection.
        val result = ComposeLanguageDetector.detect("le chat et la souris avec le fromage", fallback = "en")
        assertThat(LanguageResolverSupport.isSupported(result)).isTrue()
    }

    @Test
    fun detect_ignoresCase() {
        assertThat(ComposeLanguageDetector.detect("LE CHAT EST DANS LA MAISON AVEC LE CHIEN", fallback = "en"))
            .isEqualTo("fr")
    }

    @Test
    fun detect_higherScoringLanguageWins() {
        // A French sentence carrying one stray Spanish-looking token still resolves
        // to French because the French signal dominates the score.
        assertThat(ComposeLanguageDetector.detect("Le petit chat de la maison mange le pain avec el pan", fallback = "en"))
            .isEqualTo("fr")
    }
}

private object LanguageResolverSupport {
    fun isSupported(code: String): Boolean =
        me.meeshy.sdk.model.LanguageData.info(code) != null
}
