package me.meeshy.app.theme

import android.content.Context
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.lifecycleScope
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.onStart
import me.meeshy.app.push.NotificationChannelInstaller
import me.meeshy.app.startup.AppInitializer
import me.meeshy.sdk.language.InterfaceLanguageStore
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/**
 * Tient le miroir de la langue d'interface a jour et la propage a chaque changement : choix
 * explicite des Reglages OU `systemLanguage` du profil (restauration de session comprise).
 * La locale du process change sans redemarrage et les canaux de notification sont reecrits
 * dans la nouvelle langue. Un profil sans langue ne vide pas la derniere connue : seul un
 * compte qui en porte une la remplace.
 */
class InterfaceLanguageSync(
    private val context: Context,
    private val explicit: Flow<String?>,
    private val profileLanguage: Flow<String?>,
    private val onEffectiveChanged: (Context, String?) -> Unit,
) {
    fun start(scope: CoroutineScope) {
        combine(explicit, profileLanguage) { choice, profile -> choice to profile }
            .distinctUntilChanged()
            .map { (choice, profile) -> UiLanguageBootstrap.remember(context, choice, profile) }
            .distinctUntilChanged()
            .onEach { tag ->
                UiLanguageBootstrap.applyToPlatform(context, tag)
                onEffectiveChanged(context, tag)
            }
            .launchIn(scope)
    }
}

class InterfaceLanguageInitializer @Inject constructor(
    @ApplicationContext private val context: Context,
    private val store: InterfaceLanguageStore,
    private val session: SessionRepository,
    private val channels: NotificationChannelInstaller,
) : AppInitializer {
    override fun initialize() {
        InterfaceLanguageSync(
            context = context,
            // Le DataStore demarre a null avant sa lecture : on part du miroir, jamais de ce faux « Systeme ».
            explicit = store.languageCode.drop(1).onStart { emit(UiLanguageBootstrap.savedExplicit(context)) },
            // Avant la restauration de session (ou sans compte) la derniere langue de profil connue reste.
            profileLanguage = session.currentUser
                .map { it?.systemLanguage }
                .filter { it != null }
                .onStart { emit(UiLanguageBootstrap.savedProfile(context)) },
            onEffectiveChanged = { ctx, tag -> channels.install(UiLanguageBootstrap.localized(ctx, tag)) },
        ).start(ProcessLifecycleOwner.get().lifecycleScope)
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface InterfaceLanguageInitializerModule {
    @Binds
    @IntoSet
    fun interfaceLanguageInitializer(impl: InterfaceLanguageInitializer): AppInitializer
}
