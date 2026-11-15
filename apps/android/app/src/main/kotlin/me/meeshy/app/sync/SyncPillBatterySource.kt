package me.meeshy.app.sync

import android.content.Context
import androidx.annotation.StringRes
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
import me.meeshy.sdk.battery.BatteryForegroundNotices
import me.meeshy.sdk.battery.BatteryNotice
import me.meeshy.sdk.battery.BatteryStore
import me.meeshy.sdk.model.battery.BatteryAnnouncementKind
import me.meeshy.sdk.model.battery.BatteryPillAnnouncements
import me.meeshy.sdk.model.battery.BatteryPresentation
import me.meeshy.sdk.user.ProfileCacheSource
import me.meeshy.ui.R

/** Une annonce de batterie prête à défiler : [id] la rend unique (jamais rejouée), [userId] la remplace pour la même personne. */
data class SyncPillBatteryItem(val id: String, val userId: String, val label: String)

/** Ce que la pastille lit de la batterie des Proches : une couture, pour que le ViewModel se teste sans socket. */
interface SyncPillBatterySource {
    val announcements: Flow<SyncPillBatteryItem>

    /** Aucune batterie : aperçus et tests qui ne la regardent pas. */
    object None : SyncPillBatterySource {
        override val announcements: Flow<SyncPillBatteryItem> = emptyFlow()
    }
}

/**
 * Les annonces de `battery:changed` / `battery:cleared` (canal `socket`) et celles d'un push `device_battery` reçu app
 * ouverte (rendu ICI à la place de la bannière). Le nom vient du cache des profils, jamais du réseau : à froid, « Un
 * proche ».
 */
@Singleton
class StoreSyncPillBatterySource @Inject constructor(
    store: BatteryStore,
    foreground: BatteryForegroundNotices,
    @ApplicationContext private val context: Context,
    private val profiles: ProfileCacheSource,
) : SyncPillBatterySource {

    override val announcements: Flow<SyncPillBatteryItem> = merge(
        store.notices.map { notice -> SyncPillBatteryItem(BatteryPillAnnouncements.idOf(notice.userId, notice.announcement), notice.userId, label(notice)) },
        foreground.notices.map { SyncPillBatteryItem(it.id, it.id, it.label) },
    )

    private suspend fun label(notice: BatteryNotice): String {
        val texts = UiLanguageBootstrap.localized(context, UiLanguageBootstrap.savedTag(context))
        val name = runCatching { profiles.cached(notice.userId)?.effectiveDisplayName }.getOrNull()
            ?: texts.getString(R.string.battery_someone)
        val level = BatteryPresentation.pillLevel(notice.announcement)
        val leveled = leveledRes(notice.announcement.kind)
        return when {
            leveled != null && level != null -> texts.getString(leveled, name, level)
            leveled != null -> texts.getString(R.string.battery_pill_generic, name)
            else -> texts.getString(plainRes(notice.announcement.kind), name)
        }
    }

    @StringRes
    private fun leveledRes(kind: BatteryAnnouncementKind): Int? = when (kind) {
        BatteryAnnouncementKind.LOW -> R.string.battery_pill_low
        BatteryAnnouncementKind.THRESHOLD -> R.string.battery_pill_threshold
        BatteryAnnouncementKind.CRITICAL -> R.string.battery_pill_critical
        BatteryAnnouncementKind.CRITICAL_DROP -> R.string.battery_pill_critical_drop
        else -> null
    }

    @StringRes
    private fun plainRes(kind: BatteryAnnouncementKind): Int = when (kind) {
        BatteryAnnouncementKind.PROBABLY_OFF -> R.string.battery_pill_probably_off
        BatteryAnnouncementKind.CHARGING -> R.string.battery_pill_charging
        BatteryAnnouncementKind.BACK_ON -> R.string.battery_pill_back_on
        BatteryAnnouncementKind.RECHARGED -> R.string.battery_pill_recharged
        BatteryAnnouncementKind.ENDED -> R.string.battery_pill_ended
        else -> R.string.battery_pill_generic
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface SyncPillBatteryModule {
    @Binds
    fun bindBatterySource(impl: StoreSyncPillBatterySource): SyncPillBatterySource
}
