package me.meeshy.app.sync

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.map
import me.meeshy.app.theme.UiLanguageBootstrap
import me.meeshy.sdk.fall.FallNotice
import me.meeshy.sdk.fall.FallStore
import me.meeshy.sdk.model.fall.FallPillAnnouncements
import me.meeshy.sdk.user.ProfileCacheSource
import me.meeshy.ui.R

/** Une annonce de chute prête à défiler : [id] la rend unique, [userId] la remplace pour la même personne. */
data class SyncPillFallItem(val id: String, val userId: String, val label: String)

/** Ce que la pastille lit de la chute détectée : une couture, pour que le ViewModel se teste sans socket. */
interface SyncPillFallSource {
    val announcements: Flow<SyncPillFallItem>

    object None : SyncPillFallSource {
        override val announcements: Flow<SyncPillFallItem> = emptyFlow()
    }
}

/**
 * Les annonces de `fall:detected` (avec annonce) et de `fall:cleared` « a répondu » (#18748), app ouverte. « Une chute
 * a été détectée sur la montre d'Awa », puis « Awa va bien » : le nom vient du cache des profils, jamais du réseau — à
 * froid, « un Sang ». La pastille défile et disparaît, elle ne persiste jamais.
 */
@Singleton
class StoreSyncPillFallSource @Inject constructor(
    store: FallStore,
    @ApplicationContext private val context: Context,
    private val profiles: ProfileCacheSource,
) : SyncPillFallSource {

    override val announcements: Flow<SyncPillFallItem> = store.notices.map { notice -> SyncPillFallItem(idOf(notice), notice.userId, label(notice)) }

    private fun idOf(notice: FallNotice): String = when (notice.kind) {
        FallNotice.Kind.DETECTED -> FallPillAnnouncements.detectedId(notice.userId, notice.atMillis)
        FallNotice.Kind.RESPONDED -> FallPillAnnouncements.respondedId(notice.userId, notice.atMillis)
    }

    private suspend fun label(notice: FallNotice): String {
        val texts = UiLanguageBootstrap.localized(context, UiLanguageBootstrap.savedTag(context))
        val name = runCatching { profiles.cached(notice.userId)?.effectiveDisplayName }.getOrNull() ?: texts.getString(R.string.fall_someone)
        return when (notice.kind) {
            FallNotice.Kind.DETECTED -> texts.getString(R.string.fall_pill_detected, name)
            FallNotice.Kind.RESPONDED -> texts.getString(R.string.fall_pill_responded, name)
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface SyncPillFallModule {
    @Binds
    fun bindFallSource(impl: StoreSyncPillFallSource): SyncPillFallSource
}
