package me.meeshy.app.theme

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.stateIn
import me.meeshy.sdk.language.InterfaceLanguageStore
import me.meeshy.sdk.model.AppLanguage
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/**
 * Expose la langue d'interface EFFECTIVE à l'activité : le choix explicite des Réglages, sinon la
 * langue principale du profil (`systemLanguage`), sinon `null` = l'appareil. Elle part de la
 * valeur mémorisée pour le premier rendu (aucun flash d'une mauvaise langue) puis suit les
 * changements en direct. La décision reste dans `AppLanguage.resolveEffectiveTag`.
 */
@HiltViewModel
class LanguageViewModel @Inject constructor(
    interfaceLanguageStore: InterfaceLanguageStore,
    session: SessionRepository,
    @ApplicationContext context: Context,
) : ViewModel() {
    val languageCode: StateFlow<String?> = combine(
        interfaceLanguageStore.languageCode.drop(1).onStart { emit(UiLanguageBootstrap.savedExplicit(context)) },
        session.currentUser.map { it?.systemLanguage }.filter { it != null }.onStart { emit(UiLanguageBootstrap.savedProfile(context)) },
    ) { explicit, profile -> AppLanguage.resolveEffectiveTag(explicit, profile) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, UiLanguageBootstrap.savedTag(context))
}
