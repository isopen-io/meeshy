package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import me.meeshy.app.startup.AppLocalsProvider
import me.meeshy.sdk.linkcard.ContentCardService
import me.meeshy.sdk.model.contentcard.ContentCard
import me.meeshy.sdk.model.contentcard.ContentLinkCardState
import me.meeshy.sdk.model.deeplink.ContentLinkTarget
import me.meeshy.ui.component.contentcard.ContentLinkCards
import me.meeshy.ui.component.contentcard.LocalContentLinkCards

/**
 * La route qu'ouvre le toucher d'une carte de contenu (#19331) : celle que la table unique du routeur de liens
 * ([DeepLinkRouter]) donne à l'adresse canonique du contenu — post et story au détail du post, réel au lecteur de
 * réels, humeur au détail de son post —, jamais un navigateur.
 */
internal object ContentLinkRoute {
    fun of(card: ContentCard): String? =
        (DeepLinkRouter.action(ContentLinkTarget.webUrl(DeepLinkRouter.WEB_ORIGIN, card.type, card.postId)) as? DeepLinkAction.Navigate)?.route
}

/**
 * Les cartes de contenu de toute l'application : la mémoire et la relecture de [ContentCardService], et le toucher
 * qui empile le contenu par le routeur de l'application ([AppNavigator]) au-dessus de l'écran qui le montre — le
 * retour y revient. Le toucher d'une carte de lien suivi compte son clic, comme le lien ouvert par le routeur.
 */
internal class AppContentLinkCards(
    private val service: ContentCardService,
    private val appNavigator: AppNavigator?,
    private val scope: CoroutineScope,
) : ContentLinkCards {
    override fun initial(target: ContentLinkTarget): ContentLinkCardState = service.initial(target)

    override fun states(target: ContentLinkTarget): Flow<ContentLinkCardState> = service.states(target)

    override fun open(card: ContentCard, target: ContentLinkTarget) {
        val navigator = appNavigator ?: return
        val route = ContentLinkRoute.of(card) ?: return
        scope.launch { service.recordOpen(target) }
        navigator.navigate(route)
    }
}

/** Fournit `LocalContentLinkCards` à tout l'arbre de navigation (lot carte-de-contenu-19333). */
class ContentLinkCardsProvider @Inject constructor(
    private val service: ContentCardService,
) : AppLocalsProvider {
    @Composable
    override fun Provide(content: @Composable () -> Unit) {
        val appNavigator = LocalAppNavigator.current
        val scope = rememberCoroutineScope()
        val cards = remember(service, appNavigator, scope) { AppContentLinkCards(service, appNavigator, scope) }
        CompositionLocalProvider(LocalContentLinkCards provides cards, content = content)
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ContentLinkCardsModule {
    @Binds
    @IntoSet
    abstract fun bindContentLinkCardsProvider(provider: ContentLinkCardsProvider): AppLocalsProvider
}
