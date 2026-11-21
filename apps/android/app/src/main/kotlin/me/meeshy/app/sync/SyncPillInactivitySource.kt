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
import kotlinx.coroutines.flow.merge
import me.meeshy.app.theme.UiLanguageBootstrap
import me.meeshy.sdk.inactivity.InactivityForegroundNotices
import me.meeshy.sdk.inactivity.InactivityNotice
import me.meeshy.sdk.inactivity.InactivityStore
import me.meeshy.sdk.model.inactivity.InactivityAnnouncementKind
import me.meeshy.sdk.model.inactivity.InactivityPillAnnouncements
import me.meeshy.sdk.user.ProfileCacheSource
import me.meeshy.ui.R

/** Une annonce d'inactivité prête à défiler : [id] la rend unique, [userId] la remplace pour la même personne. */
data class SyncPillInactivityItem(val id: String, val userId: String, val label: String)

/** Ce que la pastille lit des alertes d'inactivité des Sangs : une couture, pour que le ViewModel se teste sans socket. */
interface SyncPillInactivitySource {
    val announcements: Flow<SyncPillInactivityItem>

    /** Rien : aperçus et tests qui ne le regardent pas. */
    object None : SyncPillInactivitySource {
        override val announcements: Flow<SyncPillInactivityItem> = emptyFlow()
    }
}

/**
 * Les annonces de `inactivity:alert` / `inactivity:cleared` et celles d'un push `inactivity_alert` reçu app ouverte
 * (rendu ICI à la place de la bannière), quel que soit l'écran. « Jacques n'a pas répondu à « Tout va bien ? » »,
 * « Jacques va bien » : le nom vient du cache des profils, jamais du réseau — à froid, « un proche ».
 */
@Singleton
class StoreSyncPillInactivitySource @Inject constructor(
    store: InactivityStore,
    foreground: InactivityForegroundNotices,
    @ApplicationContext private val context: Context,
    private val profiles: ProfileCacheSource,
) : SyncPillInactivitySource {

    override val announcements: Flow<SyncPillInactivityItem> = merge(
        store.notices.map { notice ->
            SyncPillInactivityItem(InactivityPillAnnouncements.idOf(notice.userId, notice.announcement), notice.userId, label(notice))
        },
        foreground.notices.map { SyncPillInactivityItem(it.id, it.personKey, it.label) },
    )

    private suspend fun label(notice: InactivityNotice): String {
        val texts = UiLanguageBootstrap.localized(context, UiLanguageBootstrap.savedTag(context))
        val name = runCatching { profiles.cached(notice.userId)?.effectiveDisplayName }.getOrNull()
            ?: texts.getString(R.string.inactivity_someone)
        return when (notice.announcement.kind) {
            InactivityAnnouncementKind.ALERT -> texts.getString(R.string.inactivity_pill_alert, name)
            InactivityAnnouncementKind.RESPONDED -> texts.getString(R.string.inactivity_pill_responded, name)
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface SyncPillInactivityModule {
    @Binds
    fun bindInactivitySource(impl: StoreSyncPillInactivitySource): SyncPillInactivitySource
}
