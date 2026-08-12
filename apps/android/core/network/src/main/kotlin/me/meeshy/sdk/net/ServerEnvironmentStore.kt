package me.meeshy.sdk.net

import android.content.Context
import android.content.SharedPreferences
import me.meeshy.sdk.model.auth.ServerEnvironment

/**
 * Persistent store for the login screen's developer/QA backend-environment
 * selection — the Android building block behind iOS `MeeshyConfig`'s
 * `UserDefaults`-backed `selectedEnvironment`/`customHost` computed properties
 * (`packages/MeeshySDK/Sources/MeeshySDK/Configuration/MeeshyConfig.swift`).
 *
 * [NetworkModule.providesMeeshyConfig] reads this store once at Hilt graph
 * construction to derive the initial [MeeshyConfig.apiBaseUrl]/[MeeshyConfig.socketUrl]
 * via [ServerEnvironmentResolver] — the Android equivalent of iOS's
 * `restoreEnvironment()` "at app launch". The pure URL derivations live in
 * [ServerEnvironmentResolver] ([me.meeshy.sdk.model.auth]); this seam owns only
 * durability of the two selected values.
 */
interface ServerEnvironmentStore {
    val selectedEnvironment: ServerEnvironment
    val customHost: String

    /**
     * Selects [env] — mirrors iOS `LoginView`'s non-custom pill tap
     * (`MeeshyConfig.shared.applyEnvironment(env)`), which never touches the
     * persisted custom host.
     */
    fun select(env: ServerEnvironment)

    /**
     * Persists [host] and selects [ServerEnvironment.CUSTOM] in one step —
     * mirrors iOS's checkmark button (`applyEnvironment(.custom, customHost: host)`,
     * whose `selectedEnvironment = env` assignment and `self.customHost = host`
     * happen together).
     */
    fun applyCustomHost(host: String)
}

/** Volatile [ServerEnvironmentStore] — for tests and previews. */
class InMemoryServerEnvironmentStore(
    initialEnvironment: ServerEnvironment = ServerEnvironment.PRODUCTION,
    initialCustomHost: String = "",
) : ServerEnvironmentStore {
    override var selectedEnvironment: ServerEnvironment = initialEnvironment
        private set
    override var customHost: String = initialCustomHost
        private set

    override fun select(env: ServerEnvironment) {
        selectedEnvironment = env
    }

    override fun applyCustomHost(host: String) {
        customHost = host
        selectedEnvironment = ServerEnvironment.CUSTOM
    }
}

/**
 * [ServerEnvironmentStore] backed by SharedPreferences — non-sensitive developer/QA
 * configuration, unlike [TokenStore]'s encrypted storage.
 */
class SharedPrefsServerEnvironmentStore(context: Context) : ServerEnvironmentStore {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    override val selectedEnvironment: ServerEnvironment
        get() = ServerEnvironment.fromId(prefs.getString(KEY_ENVIRONMENT, null))

    override val customHost: String
        get() = prefs.getString(KEY_CUSTOM_HOST, null) ?: ""

    override fun select(env: ServerEnvironment) {
        prefs.edit().putString(KEY_ENVIRONMENT, env.id).apply()
    }

    override fun applyCustomHost(host: String) {
        prefs.edit()
            .putString(KEY_CUSTOM_HOST, host)
            .putString(KEY_ENVIRONMENT, ServerEnvironment.CUSTOM.id)
            .apply()
    }

    private companion object {
        private const val FILE_NAME = "meeshy_server_environment"
        private const val KEY_ENVIRONMENT = "selected_environment"
        private const val KEY_CUSTOM_HOST = "custom_host"
    }
}
