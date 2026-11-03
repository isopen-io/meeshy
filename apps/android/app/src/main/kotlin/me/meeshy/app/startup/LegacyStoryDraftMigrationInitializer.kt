package me.meeshy.app.startup

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.sdk.story.LegacyDraftMigrator
import timber.log.Timber

/** Au lancement, le brouillon unique de l'ancien emplacement rejoint le magasin à brouillons multiples, sans être perdu. */
class LegacyStoryDraftMigrationInitializer @Inject constructor(
    private val migrator: LegacyDraftMigrator,
) : AppInitializer {
    override fun initialize() {
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            runCatching { migrator.migrate() }
                .onFailure { Timber.w(it, "Legacy story draft migration failed") }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface LegacyStoryDraftMigrationModule {
    @Binds
    @IntoSet
    fun legacyStoryDraftMigrationInitializer(impl: LegacyStoryDraftMigrationInitializer): AppInitializer
}
