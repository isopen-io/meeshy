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
import me.meeshy.sdk.model.phonecall.PhoneCallAnnouncementKind
import me.meeshy.sdk.model.phonecall.PhoneCallPillAnnouncements
import me.meeshy.sdk.phonecall.PhoneCallNotice
import me.meeshy.sdk.phonecall.PhoneCallStore
import me.meeshy.sdk.user.ProfileCacheSource
import me.meeshy.ui.R

/** Une annonce « en appel » prête à défiler : [id] la rend unique, [userId] la remplace pour la même personne. */
data class SyncPillPhoneCallItem(val id: String, val userId: String, val label: String)

/** Ce que la pastille lit d'« en appel » : une couture, pour que le ViewModel se teste sans socket. */
interface SyncPillPhoneCallSource {
    val announcements: Flow<SyncPillPhoneCallItem>

    /** Rien : aperçus et tests qui ne le regardent pas. */
    object None : SyncPillPhoneCallSource {
        override val announcements: Flow<SyncPillPhoneCallItem> = emptyFlow()
    }
}

/**
 * Les annonces de `phone-call:started` / `phone-call:ended` (#18753), qui n'arrivent que quand je suis en conversation
 * avec la personne — aucun push pour cette feature. « Jacques est en appel », « Jacques a raccroché » : le nom vient du
 * cache des profils, jamais du réseau — à froid, « un proche ». Jamais d'interlocuteur.
 */
@Singleton
class StoreSyncPillPhoneCallSource @Inject constructor(
    store: PhoneCallStore,
    @ApplicationContext private val context: Context,
    private val profiles: ProfileCacheSource,
) : SyncPillPhoneCallSource {

    override val announcements: Flow<SyncPillPhoneCallItem> = store.notices.map { notice ->
        SyncPillPhoneCallItem(PhoneCallPillAnnouncements.idOf(notice.userId, notice.announcement), notice.userId, label(notice))
    }

    private suspend fun label(notice: PhoneCallNotice): String {
        val texts = UiLanguageBootstrap.localized(context, UiLanguageBootstrap.savedTag(context))
        val name = runCatching { profiles.cached(notice.userId)?.effectiveDisplayName }.getOrNull()
            ?: texts.getString(R.string.phone_call_someone)
        return when (notice.announcement.kind) {
            PhoneCallAnnouncementKind.STARTED -> texts.getString(R.string.phone_call_pill_started, name)
            PhoneCallAnnouncementKind.ENDED -> texts.getString(R.string.phone_call_pill_ended, name)
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface SyncPillPhoneCallModule {
    @Binds
    fun bindPhoneCallSource(impl: StoreSyncPillPhoneCallSource): SyncPillPhoneCallSource
}
