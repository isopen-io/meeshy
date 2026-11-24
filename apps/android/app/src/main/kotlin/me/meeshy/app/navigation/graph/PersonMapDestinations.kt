package me.meeshy.app.navigation.graph

import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.contacts.circles.PersonLocationMapRoute
import me.meeshy.app.navigation.popFrom

/**
 * La carte d'une personne en plein écran (#20540, iso `PersonLocationMapScreen`), cadrée sur elle et sur moi : c'est là que
 * mène le toucher d'une alerte « un Sang s'approche », push comme bandeau ou ligne de la cloche.
 */
class PersonMapDestinations @Inject constructor() : NavGraphContributor {
    override fun contribute(builder: NavGraphBuilder, navController: NavHostController) {
        builder.composable(
            ROUTE,
            arguments = listOf(navArgument(USER_ID_ARG) { type = NavType.StringType }),
        ) { entry ->
            val userId = entry.arguments?.getString(USER_ID_ARG).orEmpty()
            PersonLocationMapRoute(userId = userId, onClose = { navController.popFrom(entry) })
        }
    }

    companion object {
        const val USER_ID_ARG = "userId"
        const val ROUTE = "location/person/{$USER_ID_ARG}"

        fun route(userId: String): String = "location/person/$userId"
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface PersonMapDestinationsModule {
    @Binds
    @IntoSet
    fun bind(contributor: PersonMapDestinations): NavGraphContributor
}
