package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [ServerEnvironment] and [ServerEnvironmentResolver], the
 * pure backend-environment selector + URL derivations backing the login screen's
 * developer/QA environment picker.
 *
 * Parity source: iOS `MeeshyConfig`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Configuration/MeeshyConfig.swift`): the
 * `ServerEnvironment` enum (`rawValue` / `label` / `origin`), `selectedEnvironment`'s
 * `?? .production` fallback, and the `apiBaseURL` / `serverOrigin` / `webOrigin` /
 * `applyEnvironment` derivations.
 *
 * Every assertion is on observable behaviour through the public API — the resolved
 * label/origin/id, the API base URL, the parsed server origin, and the derived web
 * origin — never on internal shape. Expectations are hand-written literals,
 * independent of how production derives them (not tautological).
 */
class ServerEnvironmentTest {

    // --- enum: id / label / origin ---

    @Test
    fun ids_matchPersistedRawValues() {
        assertThat(ServerEnvironment.PRODUCTION.id).isEqualTo("gate.meeshy.me")
        assertThat(ServerEnvironment.STAGING.id).isEqualTo("gate.staging.meeshy.me")
        assertThat(ServerEnvironment.LOCALHOST.id).isEqualTo("localhost:3000")
        assertThat(ServerEnvironment.CUSTOM.id).isEqualTo("custom")
    }

    @Test
    fun labels_areHumanFacingNames() {
        assertThat(ServerEnvironment.PRODUCTION.label).isEqualTo("Production")
        assertThat(ServerEnvironment.STAGING.label).isEqualTo("Staging")
        assertThat(ServerEnvironment.LOCALHOST.label).isEqualTo("Localhost")
        assertThat(ServerEnvironment.CUSTOM.label).isEqualTo("Custom")
    }

    @Test
    fun origin_production_isHttpsGateHost() {
        assertThat(ServerEnvironment.PRODUCTION.origin).isEqualTo("https://gate.meeshy.me")
    }

    @Test
    fun origin_staging_isHttpsStagingGateHost() {
        assertThat(ServerEnvironment.STAGING.origin).isEqualTo("https://gate.staging.meeshy.me")
    }

    @Test
    fun origin_localhost_isHttpLocalhostWithPort() {
        assertThat(ServerEnvironment.LOCALHOST.origin).isEqualTo("http://localhost:3000")
    }

    @Test
    fun origin_custom_isEmpty() {
        assertThat(ServerEnvironment.CUSTOM.origin).isEmpty()
    }

    @Test
    fun entries_areFourInPickerOrder() {
        assertThat(ServerEnvironment.entries)
            .containsExactly(
                ServerEnvironment.PRODUCTION,
                ServerEnvironment.STAGING,
                ServerEnvironment.LOCALHOST,
                ServerEnvironment.CUSTOM,
            )
            .inOrder()
    }

    // --- enum: fromId fallback ---

    @Test
    fun fromId_knownRawValue_resolvesEnvironment() {
        assertThat(ServerEnvironment.fromId("gate.staging.meeshy.me"))
            .isEqualTo(ServerEnvironment.STAGING)
        assertThat(ServerEnvironment.fromId("localhost:3000"))
            .isEqualTo(ServerEnvironment.LOCALHOST)
        assertThat(ServerEnvironment.fromId("custom"))
            .isEqualTo(ServerEnvironment.CUSTOM)
    }

    @Test
    fun fromId_unknownRawValue_fallsBackToProduction() {
        assertThat(ServerEnvironment.fromId("gate.example.com"))
            .isEqualTo(ServerEnvironment.PRODUCTION)
    }

    @Test
    fun fromId_null_fallsBackToProduction() {
        assertThat(ServerEnvironment.fromId(null))
            .isEqualTo(ServerEnvironment.PRODUCTION)
    }

    @Test
    fun fromId_empty_fallsBackToProduction() {
        assertThat(ServerEnvironment.fromId(""))
            .isEqualTo(ServerEnvironment.PRODUCTION)
    }

    // --- normalizeCustomHost ---

    @Test
    fun normalizeCustomHost_bareHost_getsHttpsPrefix() {
        assertThat(ServerEnvironmentResolver.normalizeCustomHost("dev.meeshy.internal"))
            .isEqualTo("https://dev.meeshy.internal")
    }

    @Test
    fun normalizeCustomHost_httpsUrl_keptVerbatim() {
        assertThat(ServerEnvironmentResolver.normalizeCustomHost("https://staging.example.com"))
            .isEqualTo("https://staging.example.com")
    }

    @Test
    fun normalizeCustomHost_httpUrl_keptVerbatim() {
        assertThat(ServerEnvironmentResolver.normalizeCustomHost("http://192.168.1.10:3000"))
            .isEqualTo("http://192.168.1.10:3000")
    }

    @Test
    fun normalizeCustomHost_surroundingWhitespace_isTrimmedBeforePrefixing() {
        assertThat(ServerEnvironmentResolver.normalizeCustomHost("  dev.meeshy.internal  "))
            .isEqualTo("https://dev.meeshy.internal")
    }

    // --- canApplyCustomHost ---

    @Test
    fun canApplyCustomHost_nonEmptyHost_isEnabled() {
        assertThat(ServerEnvironmentResolver.canApplyCustomHost("dev.local")).isTrue()
    }

    @Test
    fun canApplyCustomHost_empty_isDisabled() {
        assertThat(ServerEnvironmentResolver.canApplyCustomHost("")).isFalse()
    }

    @Test
    fun canApplyCustomHost_whitespaceOnly_isDisabled() {
        assertThat(ServerEnvironmentResolver.canApplyCustomHost("   ")).isFalse()
    }

    // --- apiBaseUrl ---

    @Test
    fun apiBaseUrl_production_appendsVersionPath() {
        assertThat(ServerEnvironmentResolver.apiBaseUrl(ServerEnvironment.PRODUCTION))
            .isEqualTo("https://gate.meeshy.me/api/v1")
    }

    @Test
    fun apiBaseUrl_staging_appendsVersionPath() {
        assertThat(ServerEnvironmentResolver.apiBaseUrl(ServerEnvironment.STAGING))
            .isEqualTo("https://gate.staging.meeshy.me/api/v1")
    }

    @Test
    fun apiBaseUrl_localhost_appendsVersionPath() {
        assertThat(ServerEnvironmentResolver.apiBaseUrl(ServerEnvironment.LOCALHOST))
            .isEqualTo("http://localhost:3000/api/v1")
    }

    @Test
    fun apiBaseUrl_customBareHost_normalizesThenAppendsPath() {
        assertThat(ServerEnvironmentResolver.apiBaseUrl(ServerEnvironment.CUSTOM, "dev.meeshy.internal"))
            .isEqualTo("https://dev.meeshy.internal/api/v1")
    }

    @Test
    fun apiBaseUrl_customWithScheme_keepsSchemeThenAppendsPath() {
        assertThat(ServerEnvironmentResolver.apiBaseUrl(ServerEnvironment.CUSTOM, "http://dev.local:3000"))
            .isEqualTo("http://dev.local:3000/api/v1")
    }

    // --- serverOrigin ---

    @Test
    fun serverOrigin_https_stripsPath() {
        assertThat(ServerEnvironmentResolver.serverOrigin("https://gate.meeshy.me/api/v1"))
            .isEqualTo("https://gate.meeshy.me")
    }

    @Test
    fun serverOrigin_localhost_preservesPort() {
        assertThat(ServerEnvironmentResolver.serverOrigin("http://localhost:3000/api/v1"))
            .isEqualTo("http://localhost:3000")
    }

    @Test
    fun serverOrigin_malformed_returnedVerbatim() {
        assertThat(ServerEnvironmentResolver.serverOrigin("not a url"))
            .isEqualTo("not a url")
    }

    @Test
    fun serverOrigin_noScheme_returnedVerbatim() {
        assertThat(ServerEnvironmentResolver.serverOrigin("gate.meeshy.me/api/v1"))
            .isEqualTo("gate.meeshy.me/api/v1")
    }

    // --- webOrigin ---

    @Test
    fun webOrigin_productionGateHost_stripsGatePrefix() {
        assertThat(ServerEnvironmentResolver.webOrigin("https://gate.meeshy.me"))
            .isEqualTo("https://meeshy.me")
    }

    @Test
    fun webOrigin_stagingGateHost_stripsOnlyLeadingGate() {
        assertThat(ServerEnvironmentResolver.webOrigin("https://gate.staging.meeshy.me"))
            .isEqualTo("https://staging.meeshy.me")
    }

    @Test
    fun webOrigin_localhost_remapsDevPortTo3100() {
        assertThat(ServerEnvironmentResolver.webOrigin("http://localhost:3000"))
            .isEqualTo("http://localhost:3100")
    }

    @Test
    fun webOrigin_loopbackIp_remapsDevPortTo3100() {
        assertThat(ServerEnvironmentResolver.webOrigin("http://127.0.0.1:3000"))
            .isEqualTo("http://127.0.0.1:3100")
    }

    @Test
    fun webOrigin_hostWithoutGatePrefix_returnedVerbatim() {
        assertThat(ServerEnvironmentResolver.webOrigin("https://meeshy.me"))
            .isEqualTo("https://meeshy.me")
    }

    @Test
    fun webOrigin_malformed_returnedVerbatim() {
        assertThat(ServerEnvironmentResolver.webOrigin("not a url"))
            .isEqualTo("not a url")
    }

    // --- composition: full derivation chain ---

    @Test
    fun composition_productionChain_apiToServerToWebOrigin() {
        val api = ServerEnvironmentResolver.apiBaseUrl(ServerEnvironment.PRODUCTION)
        val server = ServerEnvironmentResolver.serverOrigin(api)
        val web = ServerEnvironmentResolver.webOrigin(server)
        assertThat(server).isEqualTo("https://gate.meeshy.me")
        assertThat(web).isEqualTo("https://meeshy.me")
    }

    @Test
    fun composition_localhostChain_apiToServerToWebOrigin() {
        val api = ServerEnvironmentResolver.apiBaseUrl(ServerEnvironment.LOCALHOST)
        val server = ServerEnvironmentResolver.serverOrigin(api)
        val web = ServerEnvironmentResolver.webOrigin(server)
        assertThat(server).isEqualTo("http://localhost:3000")
        assertThat(web).isEqualTo("http://localhost:3100")
    }
}
