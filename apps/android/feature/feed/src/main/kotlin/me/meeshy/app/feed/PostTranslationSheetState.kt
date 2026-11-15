package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageCodeNormalizer
import kotlin.math.roundToInt

/** Où en est la demande de traduction d'une langue de la rubrique « Autres langues ». */
enum class PostTranslationStatus { IDLE, REQUESTED, TRANSLATING, FAILED }

/**
 * L'état de la feuille de traduction d'un post (iOS `requestingLanguages` / `requestedLanguages`) :
 * ce que cette feuille a demandé, et ce qui a échoué. Pur : la feuille lui passe les langues en
 * vol (venues du modèle de vue) et celles qu'il reste à obtenir.
 *
 * Un échec se lit sur la FIN d'une demande que CETTE feuille a posée — langue sortie du vol alors
 * qu'elle manque toujours ; une traduction qui a atterri la retire de [missing] et ne laisse rien.
 */
@Immutable
data class PostTranslationSheetState(
    private val asked: Set<String> = emptySet(),
    private val failed: Set<String> = emptySet(),
    private val seenInFlight: Set<String> = emptySet(),
) {
    fun asked(code: String): PostTranslationSheetState {
        val key = code.key()
        return copy(asked = asked + key, failed = failed - key)
    }

    fun observing(translating: Set<String>, missing: Set<String>): PostTranslationSheetState {
        val flying = translating.mapTo(mutableSetOf()) { it.key() }
        val stillMissing = missing.mapTo(mutableSetOf()) { it.key() }
        val ended = seenInFlight - flying
        val nowFailed = ended.filter { it in asked && it in stillMissing }
        return PostTranslationSheetState(
            asked = asked - ended,
            failed = (failed + nowFailed).filterTo(mutableSetOf()) { it in stillMissing },
            seenInFlight = flying,
        )
    }

    fun statusOf(code: String, translating: Set<String>): PostTranslationStatus {
        val key = code.key()
        return when {
            translating.any { it.key() == key } -> PostTranslationStatus.TRANSLATING
            key in failed -> PostTranslationStatus.FAILED
            key in asked -> PostTranslationStatus.REQUESTED
            else -> PostTranslationStatus.IDLE
        }
    }

    private fun String.key(): String = LanguageCodeNormalizer.normalizeForDedup(trim().lowercase())
}

/** La confiance d'une traduction en pourcentage entier ; absente sans score. */
fun postTranslationConfidencePercent(score: Double?): Int? = score?.let { (it * 100).roundToInt() }
