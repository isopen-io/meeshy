package me.meeshy.sdk.auth

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.async
import javax.inject.Inject
import javax.inject.Singleton

/** Ce qui remplit les caches pendant la célébration de l'arrivée (miroir de `ArrivalPrefetching`, iOS). */
fun interface ArrivalPreloading {
    suspend fun run()
}

/**
 * Une étape du préchargement d'arrivée : les MÊMES chargeurs que les écrans, donc les mêmes clés de cache.
 * Un lot contribue la sienne en `@Binds @IntoSet` ; une étape qui échoue n'interrompt ni les autres ni la fête.
 */
fun interface ArrivalPreloadStep {
    suspend fun preload()
}

/** Lance toutes les étapes en parallèle ; la panne d'une étape est absorbée, l'annulation, elle, se propage. */
@Singleton
class ArrivalPreload @Inject constructor(
    private val steps: Set<@JvmSuppressWildcards ArrivalPreloadStep>,
) : ArrivalPreloading {
    override suspend fun run() = coroutineScope {
        steps.map { step -> async { runCatchingStep(step) } }.awaitAll()
        Unit
    }

    private suspend fun runCatchingStep(step: ArrivalPreloadStep) {
        try {
            step.preload()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            // Le préchargement est une avance : sa panne ne se voit pas, l'écran chargera lui-même.
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ArrivalPreloadModule {
    @Multibinds
    abstract fun steps(): Set<@JvmSuppressWildcards ArrivalPreloadStep>

    @Binds
    abstract fun preloading(impl: ArrivalPreload): ArrivalPreloading
}
