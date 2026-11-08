package me.meeshy.sdk.auth

import me.meeshy.core.datastore.SecretVault
import me.meeshy.sdk.model.security.SecureStore
import javax.inject.Inject

/**
 * Le coffre du secret qui lie un lien de connexion à l'appareil qui l'a demandé (iOS
 * `KeychainLinkDeviceBinding`, #10872). Le secret ne quitte jamais l'appareil : seule son empreinte part.
 */
interface LinkDeviceSecretStore {
    /** `true` quand le secret est durablement gardé ; `false` sur toute panne du coffre. */
    fun save(secret: String): Boolean

    fun load(): String?

    fun delete()
}

/** Le secret dans le coffre chiffré par le Keystore (`EncryptedSharedPreferences`), sans compte : il précède la session. */
class VaultLinkDeviceSecretStore @Inject constructor(
    @SecretVault private val vault: SecureStore,
) : LinkDeviceSecretStore {
    override fun save(secret: String): Boolean = vault.put(KEY, secret)

    override fun load(): String? = vault.get(KEY)?.takeIf { it.isNotEmpty() }

    override fun delete() = vault.remove(KEY)

    private companion object {
        const val KEY = "auth.linkDeviceSecret"
    }
}

/** Coffre volatil — tests et aperçus. */
class InMemoryLinkDeviceSecretStore(private val failWrites: Boolean = false) : LinkDeviceSecretStore {
    private var secret: String? = null

    override fun save(secret: String): Boolean {
        if (failWrites) return false
        this.secret = secret
        return true
    }

    override fun load(): String? = secret

    override fun delete() {
        secret = null
    }
}
