package me.meeshy.app.navigation.graph

import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.navigation.sheetComposable
import me.meeshy.app.settings.VoiceProfileWizardScreen

/**
 * L'assistant de création du profil vocal, présenté en feuille comme sur iOS. Le point d'entrée est la note de
 * consentement manquant d'une bulle vocale (et les réglages) : ils naviguent vers [ROUTE].
 */
class VoiceProfileWizardDestinations @Inject constructor() : NavGraphContributor {
    override fun contribute(builder: NavGraphBuilder, navController: NavHostController) {
        builder.sheetComposable(ROUTE, navController) { _, dismiss -> VoiceProfileWizardScreen(onClose = dismiss) }
    }

    companion object {
        const val ROUTE = "settings/voice-profile-wizard"
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface VoiceProfileWizardDestinationsModule {
    @Binds
    @IntoSet
    fun bind(contributor: VoiceProfileWizardDestinations): NavGraphContributor
}
