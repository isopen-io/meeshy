package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.call.CallReliabilityPolicy
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.random.Random

/**
 * Le recul avant la relance ICE de la tentative [attempt] (1-based), en millisecondes : zéro pour la première,
 * puis exponentiel plafonné, avec gigue ([CallReliabilityPolicy.reconnectBackoffSeconds]). Une couture pour
 * que l'échelle d'escalade se prouve sans horloge murale.
 */
fun interface CallRestartBackoff {
    fun delayMs(attempt: Int): Long

    companion object {
        /** Sans recul : la relance part à l'expiration, comme avant l'introduction du recul. */
        val None: CallRestartBackoff = CallRestartBackoff { 0L }
    }
}

@Singleton
class RealCallRestartBackoff @Inject constructor() : CallRestartBackoff {
    override fun delayMs(attempt: Int): Long =
        (CallReliabilityPolicy.reconnectBackoffSeconds(attempt, Random.nextDouble()) * MS_PER_SECOND).toLong()

    private companion object {
        const val MS_PER_SECOND = 1_000.0
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallRestartBackoffModule {
    @Binds
    fun bindCallRestartBackoff(impl: RealCallRestartBackoff): CallRestartBackoff
}
