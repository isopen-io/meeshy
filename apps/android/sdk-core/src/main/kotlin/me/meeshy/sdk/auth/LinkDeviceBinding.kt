package me.meeshy.sdk.auth

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le lien de connexion est LIÉ À L'APPAREIL qui l'a demandé (iOS `LinkDeviceBindingProviding`, #10872).
 *
 * À la demande, l'appareil tire un secret (32 octets aléatoires), le garde dans son coffre et n'envoie que son
 * EMPREINTE ; à l'ouverture du lien, il présente le secret. Un lien ouvert ailleurs — ou forgé par un tiers qui
 * l'a demandé pour SON compte — ne porte pas ce secret : la passerelle n'ouvre alors aucune session sans
 * confirmation explicite (« login CSRF »).
 */
interface LinkDeviceBindingProviding {
    /** Tire un secret neuf, le garde, et rend son empreinte ; `null` si le coffre manque : la demande part sans liaison. */
    fun issueHash(): String?

    /** Le secret à présenter avec le jeton d'un lien, s'il y en a un. */
    fun presentedSecret(): String?

    /** Oublie le secret — une fois la preuve rendue définitive. */
    fun forget()
}

/** Sans liaison : ni empreinte ni secret — les tests et la compatibilité des constructeurs existants. */
object NoLinkDeviceBinding : LinkDeviceBindingProviding {
    override fun issueHash(): String? = null

    override fun presentedSecret(): String? = null

    override fun forget() = Unit
}

class LinkDeviceBinding(
    private val store: LinkDeviceSecretStore,
    private val random: () -> ByteArray,
) : LinkDeviceBindingProviding {

    @Inject
    constructor(store: LinkDeviceSecretStore) : this(store, { SecureRandom().let { rng -> ByteArray(SECRET_BYTE_COUNT).also(rng::nextBytes) } })

    override fun issueHash(): String? {
        val secret = newSecret(random()) ?: return null
        if (!store.save(secret)) return null
        return hash(secret)
    }

    override fun presentedSecret(): String? = store.load()

    override fun forget() = store.delete()

    companion object {
        const val SECRET_BYTE_COUNT: Int = 32

        /** Base64url sans remplissage (43 caractères pour 32 octets) ; `null` si l'aléa n'a pas la bonne taille. */
        fun newSecret(bytes: ByteArray): String? =
            if (bytes.size != SECRET_BYTE_COUNT) null else Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)

        /** SHA-256 de la chaîne UTF-8 du secret, en hexadécimal minuscule — la forme que la passerelle recalcule. */
        fun hash(secret: String): String =
            MessageDigest.getInstance("SHA-256").digest(secret.toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class LinkDeviceModule {
    @Binds
    @Singleton
    abstract fun bindsLinkDeviceSecretStore(impl: VaultLinkDeviceSecretStore): LinkDeviceSecretStore

    @Binds
    @Singleton
    abstract fun bindsLinkDeviceBinding(impl: LinkDeviceBinding): LinkDeviceBindingProviding
}
