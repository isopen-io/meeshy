package me.meeshy.sdk.net

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** [TokenStore] backed by the Android Keystore via EncryptedSharedPreferences. */
class EncryptedTokenStore(context: Context) : TokenStore {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context.applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context.applicationContext,
            FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    override var jwt: String?
        get() = prefs.getString(KEY_JWT, null)
        set(value) = prefs.edit().putOrRemove(KEY_JWT, value).apply()

    override var sessionToken: String?
        get() = prefs.getString(KEY_SESSION, null)
        set(value) = prefs.edit().putOrRemove(KEY_SESSION, value).apply()

    override val isAuthenticated: Boolean get() = jwt != null || sessionToken != null

    override fun clear() {
        prefs.edit().clear().apply()
    }

    private fun SharedPreferences.Editor.putOrRemove(key: String, value: String?): SharedPreferences.Editor =
        if (value == null) remove(key) else putString(key, value)

    companion object {
        private const val FILE_NAME = "meeshy_secure_tokens"
        private const val KEY_JWT = "jwt"
        private const val KEY_SESSION = "session_token"
    }
}
