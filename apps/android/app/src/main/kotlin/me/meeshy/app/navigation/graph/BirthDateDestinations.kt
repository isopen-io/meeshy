package me.meeshy.app.navigation.graph

import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.settings.BirthDateDeclarationScreen

/** L'ecran de declaration de la date de naissance (`PUT me/birth-date`, une seule fois). */
class BirthDateDestinations @Inject constructor() : NavGraphContributor {
    override fun contribute(builder: NavGraphBuilder, navController: NavHostController) {
        builder.composable(ROUTE) { BirthDateDeclarationScreen(onBack = { navController.popBackStack() }) }
    }

    companion object {
        const val ROUTE = "settings/birth-date"
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface BirthDateDestinationsModule {
    @Binds
    @IntoSet
    fun bind(contributor: BirthDateDestinations): NavGraphContributor
}
