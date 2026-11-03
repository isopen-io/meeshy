package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.app.startup.AppLocalsProvider
import me.meeshy.sdk.model.navigation.PresentedSurfaceKind
import me.meeshy.sdk.model.navigation.PresentedSurfaceLedger
import me.meeshy.sdk.model.navigation.PresentedSurfaceScope
import me.meeshy.sdk.model.navigation.PresentedSurfaceToken
import me.meeshy.sdk.model.navigation.PresentedSurfaceYield
import me.meeshy.ui.component.surface.LocalPresentedSurfaces
import me.meeshy.ui.component.surface.PresentedSurfaceDeclarations
import javax.inject.Inject
import javax.inject.Singleton

/**
 * **Ce qui est présenté par-dessus la navigation, et qui s'efface devant une conversation** (iOS
 * `PresentedSurfaceRegistry.shared`). Les surfaces s'y déclarent par `DeclarePresentedSurface` ; [AppNavigator] y
 * passe avant d'ouvrir une conversation. La loi (fermer / retenir, par fenêtre, ouverture retenue périmée) vit dans
 * [PresentedSurfaceLedger], de `:core:model`. Fil principal uniquement.
 */
@Singleton
class PresentedSurfaceRegistry @Inject constructor() : PresentedSurfaceDeclarations {
    private val ledger = PresentedSurfaceLedger(nowMillis = System::currentTimeMillis)

    val declaredKinds: List<PresentedSurfaceKind> get() = ledger.declaredKinds

    override fun declare(
        kind: PresentedSurfaceKind,
        answer: () -> PresentedSurfaceYield,
        close: () -> Unit,
    ): PresentedSurfaceToken = ledger.declare(kind, MAIN_WINDOW, answer, close)

    override fun retire(token: PresentedSurfaceToken) = ledger.retire(token)

    /** Referme ce qui se referme, puis [open] (`true` : une surface est partie, la cible se pose sans animation). */
    fun clearForConversation(open: (closedSurfaces: Boolean) -> Unit) = ledger.clearForConversation(MAIN_WINDOW, open)

    private companion object {
        /** Une seule fenêtre sur téléphone ; la portée existe pour l'écran partagé et les fenêtres multiples. */
        val MAIN_WINDOW = PresentedSurfaceScope("main")
    }
}

/** Fournit le guichet de déclaration à tout l'arbre de navigation. */
class PresentedSurfacesLocalsProvider @Inject constructor(
    private val registry: PresentedSurfaceRegistry,
) : AppLocalsProvider {
    @Composable
    override fun Provide(content: @Composable () -> Unit) {
        CompositionLocalProvider(LocalPresentedSurfaces provides registry, content = content)
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface PresentedSurfacesModule {
    @Binds
    @IntoSet
    fun bindPresentedSurfacesLocals(provider: PresentedSurfacesLocalsProvider): AppLocalsProvider
}
