package me.meeshy.app.share

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.startup.AppInitializer
import me.meeshy.sdk.share.SharePendingSendScheduler

/**
 * Au lancement, les cibles d'un partage que le processus a laissées en route (tué entre la fiche et l'enfilage, réseau
 * coupé) reprennent : le travail attend le réseau et sort sans rien faire quand aucune fiche ne reste.
 */
class SharePendingSendResumeInitializer @Inject constructor(
    private val scheduler: SharePendingSendScheduler,
) : AppInitializer {
    override fun initialize() {
        scheduler.schedule()
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface SharePendingSendResumeModule {
    @Binds
    @IntoSet
    fun sharePendingSendResumeInitializer(impl: SharePendingSendResumeInitializer): AppInitializer
}
