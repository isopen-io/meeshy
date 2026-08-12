package me.meeshy.sdk.link

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Fetches OpenGraph metadata for a URL. Mirrors iOS's SDK-level `LinkPreviewFetcher`: an opaque
 * seam (URL in, [LinkPreviewOutcome] out) so the app-side store owns *when* to call it while this
 * stays a low-level building block. The pure "is the response worth showing" decision lives in
 * [LinkPreviewFetching]; concrete implementations only carry the IO.
 */
public interface LinkPreviewFetcher {
    /** Fetches and validates [url]. Never throws for a network/HTTP failure — returns [LinkPreviewOutcome.Empty]. */
    public suspend fun fetch(url: String): LinkPreviewOutcome
}

/**
 * The pure mapping of a raw HTTP response into a [LinkPreviewOutcome]. Extracted from the IO so the
 * "worth showing?" gate — status range, content-type, visible-field presence — is JVM-testable,
 * exactly the validation iOS applies after its `URLSession` fetch before surfacing metadata.
 */
public object LinkPreviewFetching {

    /**
     * Decides the outcome of a fetch of [url] that returned [statusCode], [contentType] and [body].
     * A non-2xx status, a non-HTML content-type, an empty body, or HTML with no visible field all
     * degrade to [LinkPreviewOutcome.Empty] (the graceful bare-link fallback). Otherwise the body is
     * parsed and keyed by the canonical (tracker-stripped) URL.
     */
    public fun outcomeFrom(
        statusCode: Int,
        contentType: String?,
        body: String?,
        url: String,
    ): LinkPreviewOutcome {
        if (statusCode !in 200..299) return LinkPreviewOutcome.Empty
        if (!isHtml(contentType)) return LinkPreviewOutcome.Empty
        if (body.isNullOrBlank()) return LinkPreviewOutcome.Empty
        val metadata = LinkPreviewParser.parse(body, LinkPreviewParser.canonicalize(url))
        return if (metadata.hasAnyVisibleField) LinkPreviewOutcome.Resolved(metadata) else LinkPreviewOutcome.Empty
    }

    private fun isHtml(contentType: String?): Boolean {
        val normalized = contentType?.lowercase() ?: return true
        return normalized.contains("text/html") || normalized.contains("application/xhtml")
    }
}

/**
 * The concrete [LinkPreviewFetcher] over OkHttp — the exempt IO glue. Canonicalises the URL, GETs it
 * with a browser-ish header set, reads a capped slice of the body (OG tags live in `<head>`, so a
 * few hundred KB is ample and a huge page never blows up memory), and delegates the verdict to the
 * pure [LinkPreviewFetching.outcomeFrom]. Any failure — malformed URL, timeout, IO — collapses to
 * [LinkPreviewOutcome.Empty].
 */
public class OkHttpLinkPreviewFetcher : LinkPreviewFetcher {

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    override suspend fun fetch(url: String): LinkPreviewOutcome = withContext(Dispatchers.IO) {
        val canonical = LinkPreviewParser.canonicalize(url)
        runCatching {
            val request = Request.Builder()
                .url(canonical)
                .header("User-Agent", USER_AGENT)
                .header("Accept", "text/html,application/xhtml+xml")
                .build()
            client.newCall(request).execute().use { response ->
                val body = if (response.body != null) response.peekBody(MAX_BODY_BYTES).string() else null
                LinkPreviewFetching.outcomeFrom(
                    statusCode = response.code,
                    contentType = response.header("Content-Type"),
                    body = body,
                    url = canonical,
                )
            }
        }.getOrDefault(LinkPreviewOutcome.Empty)
    }

    private companion object {
        private const val USER_AGENT =
            "Mozilla/5.0 (compatible; MeeshyBot/1.0; +https://meeshy.me)"
        private const val MAX_BODY_BYTES: Long = 512L * 1024
    }
}
