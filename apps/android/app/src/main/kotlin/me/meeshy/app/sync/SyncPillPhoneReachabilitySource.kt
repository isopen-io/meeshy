package me.meeshy.app.sync

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.time.ZoneId
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import me.meeshy.app.theme.UiLanguageBootstrap
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityAnnouncementKind
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityPillAnnouncements
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityPresentation
import me.meeshy.sdk.phonereachability.PhoneReachabilityForegroundNotices
import me.meeshy.sdk.phonereachability.PhoneReachabilityNotice
import me.meeshy.sdk.phonereachability.PhoneReachabilityStore
import me.meeshy.sdk.user.ProfileCacheSource
import me.meeshy.ui.R

/** Une annonce du téléphone injoignable prête à défiler : [id] la rend unique, [userId] la remplace pour la même personne. */
data class SyncPillPhoneReachabilityItem(val id: String, val userId: String, val label: String)

/** Ce que la pastille lit du téléphone injoignable des Proches : une couture, pour que le ViewModel se teste sans socket. */
interface SyncPillPhoneReachabilitySource {
    val announcements: Flow<SyncPillPhoneReachabilityItem>

    /** Rien : aperçus et tests qui ne le regardent pas. */
    object None : SyncPillPhoneReachabilitySource {
        override val announcements: Flow<SyncPillPhoneReachabilityItem> = emptyFlow()
    }
}

/**
 * Les annonces de `phone:unreachable` / `phone:reachable` (canal `socket`) et celles d'un push `device_unreachable`
 * reçu app ouverte (rendu ICI à la place de la bannière). « Le téléphone de {nom} est injoignable depuis {heure} » :
 * l'heure est celle du LECTEUR, le nom vient du cache des profils, jamais du réseau — à froid, « un proche ».
 */
@Singleton
class StoreSyncPillPhoneReachabilitySource @Inject constructor(
    store: PhoneReachabilityStore,
    foreground: PhoneReachabilityForegroundNotices,
    @ApplicationContext private val context: Context,
    private val profiles: ProfileCacheSource,
) : SyncPillPhoneReachabilitySource {

    override val announcements: Flow<SyncPillPhoneReachabilityItem> = merge(
        store.notices.map { notice ->
            SyncPillPhoneReachabilityItem(
                PhoneReachabilityPillAnnouncements.idOf(notice.userId, notice.announcement),
                notice.userId,
                label(notice),
            )
        },
        foreground.notices.map { SyncPillPhoneReachabilityItem(it.id, it.id, it.label) },
    )

    private suspend fun label(notice: PhoneReachabilityNotice): String {
        val texts = UiLanguageBootstrap.localized(context, UiLanguageBootstrap.savedTag(context))
        val name = runCatching { profiles.cached(notice.userId)?.effectiveDisplayName }.getOrNull()
            ?: texts.getString(R.string.phone_reachability_someone)
        return when (notice.announcement.kind) {
            PhoneReachabilityAnnouncementKind.UNREACHABLE -> {
                val since = notice.unreachableSinceMillis ?: notice.announcement.atMillis
                val locale = texts.resources.configuration.locales[0]
                val time = PhoneReachabilityPresentation.sinceText(since, System.currentTimeMillis(), ZoneId.systemDefault(), locale)
                texts.getString(R.string.phone_reachability_pill_unreachable, name, time)
            }
            PhoneReachabilityAnnouncementKind.REACHABLE -> texts.getString(R.string.phone_reachability_pill_reachable, name)
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface SyncPillPhoneReachabilityModule {
    @Binds
    fun bindPhoneReachabilitySource(impl: StoreSyncPillPhoneReachabilitySource): SyncPillPhoneReachabilitySource
}
