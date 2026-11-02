package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.app.profile.UserProfileSheet
import me.meeshy.app.startup.AppLocalsProvider
import me.meeshy.app.startup.AppOverlay
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.ui.profile.LocalProfileSheetOpener
import me.meeshy.ui.profile.ProfileSheetOpener

/**
 * L'état UNIQUE de la fiche profil présentée par la racine (pendant du `.sheet(item:)` de la racine
 * iOS) : une seule fiche à la fois, qu'une nouvelle ouverture REMPLACE. Une sortie qui navigue
 * ([dismissThen]) ferme d'abord la feuille puis attend [NAVIGATION_DELAY_MS] : naviguer pendant la
 * fermeture faisait courir la feuille et la destination l'une contre l'autre.
 */
@Singleton
class ProfileSheetHostState @Inject constructor() : ProfileSheetOpener {
    private val mutablePresented = MutableStateFlow<ProfileSheetUser?>(null)
    val presented: StateFlow<ProfileSheetUser?> = mutablePresented.asStateFlow()

    override fun open(user: ProfileSheetUser) {
        mutablePresented.value = user
    }

    fun dismiss() {
        mutablePresented.value = null
    }

    /** Ferme la feuille, puis lance [navigate] après [NAVIGATION_DELAY_MS] dans [scope]. */
    fun dismissThen(scope: CoroutineScope, navigate: () -> Unit): Job {
        dismiss()
        return scope.launch {
            delay(NAVIGATION_DELAY_MS)
            navigate()
        }
    }

    companion object {
        const val NAVIGATION_DELAY_MS: Long = 300L
    }
}

/** Fournit l'ouvreur global à tout l'arbre de navigation : toute surface touche une personne par lui. */
class ProfileSheetLocalsProvider @Inject constructor(
    private val host: ProfileSheetHostState,
) : AppLocalsProvider {
    @Composable
    override fun Provide(content: @Composable () -> Unit) {
        CompositionLocalProvider(LocalProfileSheetOpener provides host, content = content)
    }
}

/**
 * Présente la fiche par-dessus le `NavHost`, sans toucher `MeeshyApp`. Les sorties de la feuille
 * deviennent des navigations différées et ses signes en direct viennent de
 * [ProfileSheetEnvironmentImpl] ; une session fermée ferme la feuille.
 */
class ProfileSheetOverlay @Inject constructor(
    private val host: ProfileSheetHostState,
    private val sessionRepository: SessionRepository,
    private val environmentFactory: ProfileSheetEnvironmentImpl,
) : AppOverlay {
    override val order: Int = 200

    @Composable
    override fun Content(navController: NavHostController) {
        val presented by host.presented.collectAsStateWithLifecycle()
        val me by sessionRepository.currentUser.collectAsStateWithLifecycle()
        val scope = rememberCoroutineScope()
        val environment = remember(navController, scope) { environmentFactory.environment(host, scope, navController) }
        LaunchedEffect(me == null) { if (me == null) host.dismiss() }
        val user = presented ?: return
        if (me == null) return
        UserProfileSheet(user = user, onDismiss = host::dismiss, environment = environment)
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface ProfileSheetHostModule {
    @Binds
    @IntoSet
    fun bindOverlay(overlay: ProfileSheetOverlay): AppOverlay

    @Binds
    @IntoSet
    fun bindLocals(provider: ProfileSheetLocalsProvider): AppLocalsProvider
}
