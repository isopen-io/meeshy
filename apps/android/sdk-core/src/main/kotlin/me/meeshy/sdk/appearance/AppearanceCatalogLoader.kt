package me.meeshy.sdk.appearance

import java.io.InputStream
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.appearance.AppearanceCatalog

/** Où le catalogue embarqué s'ouvre : les assets en production, un texte en test. Appelé HORS du fil principal. */
public fun interface AppearanceCatalogAsset {
    public fun open(): InputStream
}

/** Où une erreur de chargement est journalisée : jamais d'exception, un catalogue vide à la place. */
public fun interface AppearanceCatalogErrorLog {
    public fun error(cause: Throwable, message: String)
}

/**
 * **Charge le catalogue d'apparence embarqué UNE fois, hors du fil principal** — le fond et le
 * contour dont le premier rendu du fil a besoin sont dans l'APK, lisibles sans réseau.
 *
 * - Paresseux : rien ne se lit avant le premier [catalog] (ni au démarrage de l'application, ni
 *   pour un écran qui n'en a pas l'usage).
 * - Une fois : les appels concurrents attendent la même lecture ; le résultat reste en mémoire
 *   (le catalogue est immuable, sa taille ~430 Ko de JSON).
 * - Jamais un plantage : un fichier absent ou illisible produit [AppearanceCatalog.EMPTY] et une
 *   erreur journalisée. Les fonds retombent alors sur Signature (voir `AppearanceCatalog.wallpaper`).
 *   Le résultat vide est mémorisé lui aussi : un fichier d'APK absent ne réapparaît pas en route.
 *
 * Miroir de `AppearanceCatalog.shared` d'iOS (`static let`, paresseux et unique).
 */
@Singleton
public class AppearanceCatalogLoader @Inject constructor(
    private val asset: AppearanceCatalogAsset,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
    private val errors: AppearanceCatalogErrorLog,
) {
    private val gate = Mutex()
    private val loaded = MutableStateFlow<AppearanceCatalog?>(null)

    /** `null` tant que le catalogue n'est pas chargé ; un écran qui peut attendre l'observe. */
    public val state: StateFlow<AppearanceCatalog?> = loaded.asStateFlow()

    /** Le catalogue s'il est déjà chargé, sans jamais bloquer ni lire — pour un rendu qui ne doit pas attendre. */
    public val current: AppearanceCatalog? get() = loaded.value

    public suspend fun catalog(): AppearanceCatalog {
        loaded.value?.let { return it }
        return gate.withLock {
            loaded.value ?: withContext(ioDispatcher) { read() }.also { loaded.value = it }
        }
    }

    private fun read(): AppearanceCatalog =
        try {
            val text = asset.open().use { it.readBytes().toString(Charsets.UTF_8) }
            AppearanceCatalog.decodeOrEmpty(text) { errors.error(it, UNREADABLE) }
        } catch (e: Exception) {
            errors.error(e, MISSING)
            AppearanceCatalog.EMPTY
        }

    public companion object {
        /** Le fichier copié depuis la source partagée (`bun scripts/sync-appearance-catalog-android.ts`). */
        public const val ASSET_NAME: String = "appearance-catalog.json"
        private const val UNREADABLE = "Catalogue d'apparence illisible : un catalogue vide le remplace"
        private const val MISSING = "Catalogue d'apparence introuvable : un catalogue vide le remplace"
    }
}
