package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Recherche globale plein ecran — parite iOS `GlobalSearchView` : pilule de recherche
 * autofocus avec effacement, trois onglets (Messages / Conversations / Utilisateurs) avec
 * compteurs, une seule requete pour les trois volets, etats hors ligne / erreur / panne
 * partielle, et fiche utilisateur en feuille.
 *
 * [userSheet] est la couture de la fiche profil en feuille (fournie par `:app`, jamais une
 * autre feature) ; sans elle, toucher un utilisateur retombe sur [onOpenUser].
 */
@Composable
fun GlobalSearchScreen(
    onBack: () -> Unit,
    onOpenConversation: (String) -> Unit,
    onOpenUser: (String) -> Unit,
    userSheet: (@Composable (userId: String, onDismiss: () -> Unit) -> Unit)? = null,
    viewModel: GlobalSearchViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val focusRequester = remember { FocusRequester() }
    val haptics = rememberMeeshyHaptics()
    var sheetUserId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { focusRequester.requestFocus() }
    LaunchedEffect(viewModel, userSheet) {
        viewModel.effects.collect { effect ->
            when (effect) {
                GlobalSearchEffect.Haptic -> haptics.light()
                is GlobalSearchEffect.OpenUserProfile ->
                    if (userSheet != null) sheetUserId = effect.userId else onOpenUser(effect.userId)
            }
        }
    }

    MeeshyBackground {
        // Cet ecran n'a pas de Scaffold : il pose lui-meme son inset depuis que le
        // Scaffold racine ne reserve plus les barres systeme (MeeshyApp.kt). Le fond
        // reste plein ecran, seul le contenu est retreci.
        Column(modifier = Modifier.fillMaxSize().systemBarsPadding()) {
            SearchHeader(
                query = state.query,
                onQueryChange = viewModel::setQuery,
                onBack = onBack,
                focusRequester = focusRequester,
            )
            SearchTabRow(
                current = state.selectedTab,
                countFor = state::countFor,
                onSelect = viewModel::selectTab,
            )
            when (state.screenContent()) {
                GlobalSearchContent.SEARCHING -> SearchStatus(
                    label = stringResource(R.string.global_search_searching),
                    showSpinner = true,
                )
                GlobalSearchContent.RECENTS -> RecentSearchesSection(
                    recents = state.recentSearches,
                    onSelect = viewModel::relaunchRecentSearch,
                    onRemove = viewModel::removeRecentSearch,
                    onClear = viewModel::clearRecentSearches,
                )
                GlobalSearchContent.INITIAL -> SearchStatus(
                    label = stringResource(R.string.global_search_empty_title),
                    sublabel = stringResource(R.string.global_search_empty_subtitle),
                )
                GlobalSearchContent.OFFLINE -> SearchOfflineState(onRetry = viewModel::retryLastSearch)
                GlobalSearchContent.ERROR -> SearchFailureState(onRetry = viewModel::retryLastSearch)
                GlobalSearchContent.NO_RESULTS -> SearchStatus(
                    label = stringResource(R.string.global_search_no_results),
                    sublabel = stringResource(R.string.global_search_no_results_hint),
                )
                GlobalSearchContent.RESULTS -> Column {
                    if (state.showsPartialBanner) SearchStateBanner(state = state, onRetry = viewModel::retryLastSearch)
                    // La pastille de revalidation est en SURIMPRESSION : elle ne pousse ni ne remplace une ligne.
                    Box(modifier = Modifier.fillMaxSize()) {
                        SearchResults(
                            state = state,
                            onOpenConversation = { id ->
                                viewModel.onResultTapped()
                                onOpenConversation(id)
                            },
                            onUserTapped = viewModel::onUserTapped,
                        )
                        if (state.isRevalidating) {
                            SearchRevalidationPill(modifier = Modifier.align(Alignment.TopCenter))
                        }
                    }
                }
            }
        }
    }

    val openedUser = sheetUserId
    if (userSheet != null && openedUser != null) {
        userSheet(openedUser) { sheetUserId = null }
    }
}

private val ResultsPadding = PaddingValues(
    start = MeeshySpacing.lg,
    end = MeeshySpacing.lg,
    top = MeeshySpacing.sm,
    bottom = 120.dp,
)

@Composable
private fun SearchResults(
    state: GlobalSearchUiState,
    onOpenConversation: (String) -> Unit,
    onUserTapped: (String) -> Unit,
) {
    val nowMillis = remember(state.results) { System.currentTimeMillis() }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = ResultsPadding,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        when (state.selectedTab) {
            GlobalSearchTab.MESSAGES -> items(
                state.results.messages,
                key = { it.message.id },
                contentType = { "message" },
            ) { hit ->
                MessageHitRow(
                    hit = hit,
                    resultsQuery = state.resultsQuery,
                    onClick = { onOpenConversation(hit.message.conversationId) },
                )
            }
            GlobalSearchTab.CONVERSATIONS -> items(
                state.results.conversations,
                key = { it.id },
                contentType = { "conversation" },
            ) { conversation ->
                ConversationHitRow(
                    conversation = conversation,
                    currentUserId = state.currentUserId,
                    readerPrism = state.readerPrism,
                    nowMillis = nowMillis,
                    onClick = { onOpenConversation(conversation.id) },
                )
            }
            GlobalSearchTab.USERS -> items(
                state.results.users,
                key = { it.id },
                contentType = { "user" },
            ) { user ->
                UserHitRow(user = user, onClick = { onUserTapped(user.id) })
            }
        }
    }
}
