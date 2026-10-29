package me.meeshy.sdk.post

import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TranslateRequest
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.net.apiCall

/**
 * The shared translate law over any Prisme content: reject a blank [target] or blank
 * [source] before touching the network, then blocking-translate [source] from
 * [sourceLanguage] into [target]. Returns the non-blank translated text, or `null`
 * when nothing should be stored (blank target/source, network failure, or a blank
 * translation). Callers pass an already-trimmed [target] and fold the result into
 * their own content type via [PostTranslationMerge].
 */
internal suspend fun TranslationApi.translateSource(
    source: String?,
    sourceLanguage: String?,
    target: String,
): String? {
    if (target.isEmpty()) return null
    if (source.isNullOrBlank()) return null

    val translated = when (
        val result = apiCall {
            translate(
                TranslateRequest(
                    text = source,
                    sourceLanguage = sourceLanguage?.trim().orEmpty(),
                    targetLanguage = target,
                ),
            )
        }
    ) {
        is NetworkResult.Success -> result.data.translatedText
        is NetworkResult.Failure -> return null
    }
    return translated.takeUnless { it.isBlank() }
}
