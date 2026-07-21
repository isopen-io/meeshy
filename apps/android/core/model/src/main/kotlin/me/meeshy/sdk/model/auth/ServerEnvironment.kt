package me.meeshy.sdk.model.auth

import java.net.URI

/**
 * Selectable backend environment for login — faithful port of
 * `MeeshyConfig.ServerEnvironment` in iOS
 * (`packages/MeeshySDK/Sources/MeeshySDK/Configuration/MeeshyConfig.swift`).
 *
 * The developer/QA environment selector on the login screen lets a build point at
 * production, staging, a localhost gateway, or an arbitrary custom host. Each case
 * carries the persisted [id] (iOS `rawValue`), a human [label], and the API
 * [origin] (scheme + host, no path). The `custom` case has no fixed origin — its
 * host is supplied at resolve time (see [ServerEnvironmentResolver]).
 *
 * @property id the stable string persisted in preferences (iOS `rawValue`).
 */
enum class ServerEnvironment(val id: String) {
    PRODUCTION("gate.meeshy.me"),
    STAGING("gate.staging.meeshy.me"),
    LOCALHOST("localhost:3000"),
    CUSTOM("custom");

    /** Human-facing name for the environment picker (iOS `label`). */
    val label: String
        get() = when (this) {
            PRODUCTION -> "Production"
            STAGING -> "Staging"
            LOCALHOST -> "Localhost"
            CUSTOM -> "Custom"
        }

    /**
     * API origin (scheme + host + optional port, no path). Empty for [CUSTOM],
     * whose origin is derived from the operator-supplied host at resolve time
     * (iOS `origin` returns `""` for `.custom`).
     */
    val origin: String
        get() = when (this) {
            PRODUCTION -> "https://gate.meeshy.me"
            STAGING -> "https://gate.staging.meeshy.me"
            LOCALHOST -> "http://localhost:3000"
            CUSTOM -> ""
        }

    companion object {
        /**
         * Resolves a persisted [id] back to an environment, defaulting to
         * [PRODUCTION] for an unknown or absent value — mirrors iOS
         * `selectedEnvironment`'s `?? .production` fallback so a corrupted or
         * missing preference never leaves the app pointed at a dead host.
         */
        fun fromId(raw: String?): ServerEnvironment =
            entries.firstOrNull { it.id == raw } ?: PRODUCTION
    }
}

/**
 * Pure URL derivations for the selected [ServerEnvironment] — port of the
 * `apiBaseURL` / `serverOrigin` / `webOrigin` / `applyEnvironment` logic in iOS
 * `MeeshyConfig`.
 *
 * iOS keeps these as computed properties on a stateful `UserDefaults`-backed
 * singleton; Android lifts the pure string derivations into a framework-free
 * object so every branch is JVM-testable and the app-side config store only owns
 * persistence + the mutable "currently selected" state.
 */
object ServerEnvironmentResolver {

    /** The API version path appended to every origin (iOS `defaultApiPath`). */
    const val API_PATH: String = "/api/v1"

    /**
     * Normalizes an operator-supplied custom host into a full origin — mirrors iOS
     * `applyEnvironment`'s `host.hasPrefix("http") ? host : "https://\(host)"`: a
     * value that already carries a scheme is kept verbatim, otherwise `https://` is
     * prepended. Surrounding whitespace is trimmed first — a hardening over iOS,
     * which binds the raw `TextField` value, so a stray trailing space cannot
     * corrupt the resolved URL.
     */
    fun normalizeCustomHost(host: String): String {
        val trimmed = host.trim()
        return if (trimmed.startsWith("http")) trimmed else "https://$trimmed"
    }

    /**
     * Whether the "apply custom host" action is enabled for [host] — mirrors iOS
     * `LoginView`'s `.disabled(customHost.trimmingCharacters(in: .whitespaces).isEmpty)`
     * on the custom-host apply button: a blank or whitespace-only host cannot be
     * applied.
     */
    fun canApplyCustomHost(host: String): Boolean = host.trim().isNotEmpty()

    /**
     * Full API base URL (origin + [API_PATH]) for [env] — iOS
     * `applyEnvironment` sets `apiBaseURL = origin + defaultApiPath`. For [CUSTOM]
     * the origin comes from [normalizeCustomHost]; every other case uses the fixed
     * [ServerEnvironment.origin].
     */
    fun apiBaseUrl(env: ServerEnvironment, customHost: String = ""): String {
        val origin = when (env) {
            ServerEnvironment.CUSTOM -> normalizeCustomHost(customHost)
            else -> env.origin
        }
        return origin + API_PATH
    }

    /**
     * Server origin (scheme + host + optional port, no path) parsed out of a full
     * [apiBaseUrl] — iOS `serverOrigin`. A URL that fails to parse (missing scheme
     * or host) is returned verbatim, matching iOS's `guard let ... else { return
     * apiBaseURL }`.
     */
    fun serverOrigin(apiBaseUrl: String): String {
        val uri = runCatching { URI(apiBaseUrl) }.getOrNull() ?: return apiBaseUrl
        val scheme = uri.scheme ?: return apiBaseUrl
        val host = uri.host ?: return apiBaseUrl
        val port = if (uri.port >= 0) ":${uri.port}" else ""
        return "$scheme://$host$port"
    }

    /**
     * Public web origin for user-facing share / deep links, derived from a
     * [serverOrigin] — iOS `webOrigin`. Strips the leading `gate.` API subdomain
     * (`gate.meeshy.me` → `meeshy.me`, `gate.staging.meeshy.me` →
     * `staging.meeshy.me`) and remaps the localhost dev port (API `:3000` → web
     * `:3100`). A host without a `gate.` prefix is returned verbatim; an
     * unparseable input falls through unchanged.
     */
    fun webOrigin(serverOrigin: String): String {
        val uri = runCatching { URI(serverOrigin) }.getOrNull() ?: return serverOrigin
        val scheme = uri.scheme ?: return serverOrigin
        val host = uri.host ?: return serverOrigin
        if (host == "localhost" || host == "127.0.0.1") return "$scheme://$host:3100"
        val webHost = if (host.startsWith("gate.")) host.removePrefix("gate.") else host
        return "$scheme://$webHost"
    }
}
