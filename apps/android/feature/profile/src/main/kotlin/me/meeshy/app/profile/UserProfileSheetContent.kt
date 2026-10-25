package me.meeshy.app.profile

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.profile.ProfileActionPlan
import me.meeshy.sdk.model.profile.ProfileHeaderMetrics
import me.meeshy.sdk.model.profile.ProfileLayout
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.profile.ProfileTab
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.profile.ProfileFullscreenImage
import me.meeshy.ui.profile.ProfileFullscreenImageViewer
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** La présence se relit au rythme des fenêtres 60 s / 3 min / 5 min, sans attendre un événement. */
private const val PRESENCE_TICK_MS: Long = 30_000L

/**
 * La fiche peinte (cache ou réseau), en UN SEUL défilement (miroir de `collapsibleLayout` iOS) : le
 * grand en-tête repliable, les onglets épinglés sous la barre compacte (Détails par défaut), puis le
 * contenu de l'onglet ; la barre compacte apparaît par-dessus avec la progression. Une personne que
 * j'ai bloquée n'a pas d'onglets : l'en-tête grisé puis la carte « Débloquer ».
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun ProfileSheetLoadedContent(
    state: UserProfileSheetUiState,
    actionsState: ProfileActionsState,
    environment: ProfileSheetEnvironment,
    accent: Color,
    catalog: AppearanceCatalog?,
    isExpanded: Boolean,
    actions: ProfileActionCallbacks,
) {
    val profile = state.profile ?: return
    val header = remember(profile) { ProfileHeaderBuilder.build(profile, System.currentTimeMillis()) }
    val stats = remember(state.stats) { state.stats?.let { UserStatsBuilder.build(it) } }
    val tabs = rememberProfileTabBarState(profile.id)
    val signsFlow = remember(profile.id, environment.liveSigns) {
        environment.liveSigns?.invoke(profile.id) ?: flowOf(ProfileLiveSigns.NONE)
    }
    val live by signsFlow.collectAsStateWithLifecycle(ProfileLiveSigns.NONE)
    val now by rememberPresenceClock()
    val plan = actionsState.plan?.takeIf { actionsState.userId == profile.id }
    val isBlockedByMe = plan?.layout == ProfileLayout.BLOCKED_BY_ME
    val signs = ProfileHeaderSigns.of(live, profile, isBlockedByMe, state.isBlockedByTarget, now)
    val showsTabs = plan?.showsTabs ?: true

    val listState = rememberLazyListState()
    val density = LocalDensity.current
    val progress by remember(listState, density) {
        derivedStateOf {
            val offsetDp = with(density) { listState.firstVisibleItemScrollOffset.toDp().value }
            ProfileHeaderMetrics.progress(-ProfileHeaderMetrics.scrolledDp(listState.firstVisibleItemIndex, offsetDp))
        }
    }
    val statusBarTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val scope = rememberCoroutineScope()
    var fullscreen by remember { mutableStateOf<ProfileFullscreenImage?>(null) }
    var moodOpen by remember { mutableStateOf(false) }
    val openMood: () -> Unit = { moodOpen = signs.moodEmoji != null }

    Box(Modifier.fillMaxWidth()) {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxWidth(),
            contentPadding = PaddingValues(bottom = MeeshySpacing.xxxl + MeeshySpacing.sm),
        ) {
            item(key = "header", contentType = "header") {
                ProfileCollapsibleHeader(
                    profile = profile,
                    header = header,
                    catalog = catalog,
                    accent = accent,
                    accentHex = state.accentHex,
                    progress = progress,
                    signs = signs,
                    onOpenImage = { fullscreen = it },
                    onViewStory = { environment.onViewStory?.invoke(profile.id) },
                    onMoodTap = openMood,
                )
            }
            if (showsTabs) {
                stickyHeader(key = "tabs", contentType = "tabs") {
                    val statusInset = if (isExpanded) statusBarTop else 0.dp
                    ProfileTabBar(
                        selected = tabs.selected,
                        accent = accent,
                        onSelect = { tabs.select(it) },
                        topInset = ProfileHeaderMetrics.tabBarTopInsetDp(progress).dp + statusInset * progress.coerceIn(0f, 1f),
                    )
                }
                item(key = "tab-content", contentType = "tab-content") {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = MeeshySpacing.xl)
                            .padding(top = MeeshySpacing.lg),
                        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
                    ) {
                        ProfileSheetTabContent(
                            tab = tabs.selected,
                            state = state,
                            profile = profile,
                            header = header,
                            stats = stats,
                            plan = plan,
                            isOpeningConversation = actionsState.isOpeningConversation,
                            isInteractionDisabled = isBlockedByMe || state.isBlockedByTarget,
                            environment = environment,
                            actions = actions,
                        )
                    }
                }
            } else {
                item(key = "blocked", contentType = "blocked") {
                    Column(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.xl).padding(top = MeeshySpacing.lg)) {
                        plan?.let { ProfileActionsSection(it, header.displayName, actionsState.isOpeningConversation, actions) }
                    }
                }
            }
        }
        ProfileCompactBar(
            progress = progress,
            displayName = header.displayName,
            handle = header.handle,
            avatarUrl = profile.avatar,
            accent = accent,
            presence = signs.presence,
            moodEmoji = signs.moodEmoji,
            insetForStatusBar = isExpanded,
            onTap = { scope.launch { listState.animateScrollToItem(0) } },
            onMoodTap = openMood,
            modifier = Modifier.align(Alignment.TopStart),
        )
    }
    fullscreen?.let { image -> ProfileFullscreenImageViewer(image = image, onDismiss = { fullscreen = null }) }
    val mood = signs.moodEmoji
    if (moodOpen && mood != null) ProfileMoodBubble(emoji = mood, text = live.moodText, onDismiss = { moodOpen = false })
}

/** L'horloge de présence : l'instant courant, relu toutes les [PRESENCE_TICK_MS]. */
@Composable
private fun rememberPresenceClock(): State<Long> = produceState(System.currentTimeMillis()) {
    while (true) {
        delay(PRESENCE_TICK_MS)
        value = System.currentTimeMillis()
    }
}

/** Le contenu de l'onglet choisi (miroir de `tabContent` iOS). */
@Composable
private fun ProfileSheetTabContent(
    tab: ProfileTab,
    state: UserProfileSheetUiState,
    profile: MeeshyUser,
    header: ProfileHeaderPresentation,
    stats: UserStatsPresentation?,
    plan: ProfileActionPlan?,
    isOpeningConversation: Boolean,
    isInteractionDisabled: Boolean,
    environment: ProfileSheetEnvironment,
    actions: ProfileActionCallbacks,
) {
    when (tab) {
        ProfileTab.POSTS -> environment.postsContent?.invoke(profile.id)
            ?: ProfilePostsRow(onClick = { environment.onViewPosts(profile.id) })
        ProfileTab.CONVERSATIONS -> ProfileConversationsEmpty(isInteractionDisabled = isInteractionDisabled)
        ProfileTab.DETAILS -> {
            ProfileAboutSection(header)
            if (!state.isSelf && plan != null) {
                ProfileActionsSection(
                    plan = plan,
                    displayName = header.displayName,
                    isOpeningConversation = isOpeningConversation,
                    callbacks = actions,
                )
            }
            when {
                stats != null -> ProfileStatsSection(stats)
                state.isLoadingStats -> MeeshySkeletonBox(Modifier.fillMaxWidth().height(60.dp))
            }
        }
    }
}

/** « À propos » (miroir de `aboutSection` iOS) : bio, langues, pays, fuseau, membre depuis. */
@Composable
private fun ProfileAboutSection(header: ProfileHeaderPresentation) {
    header.bio?.let {
        Text(text = it, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
    }
    ProfileDetailsSection(header)
    header.memberSinceEpochMillis?.let { millis ->
        Text(
            text = stringResource(R.string.profile_member_since, formatMemberSince(millis)),
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

/**
 * L'onglet Conversations sans conversation commune (miroir de l'état vide de `conversationsTab`
 * iOS) : « Aucune conversation en commun », ou « Interactions désactivées » quand on ne peut plus
 * échanger. La liste des conversations communes attend son chargeur.
 */
@Composable
private fun ProfileConversationsEmpty(isInteractionDisabled: Boolean) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        Icon(
            imageVector = if (isInteractionDisabled) MeeshyIcons.Block else MeeshyIcons.ForumFilled,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textMuted.copy(alpha = if (isInteractionDisabled) MeeshyOpacity.medium else MeeshyOpacity.strong),
            modifier = Modifier.size(40.dp),
        )
        Text(
            text = stringResource(
                if (isInteractionDisabled) R.string.profile_conversations_interactionsDisabled else R.string.profile_conversations_noShared,
            ),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
    }
}

/** Ce que la surface d'origine savait de la personne, quand aucun profil n'a pu être peint. */
@Composable
internal fun ProfileSheetIdentity(user: ProfileSheetUser) {
    Text(
        text = user.resolvedDisplayName,
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.Bold,
    )
    user.username.takeIf { it.isNotBlank() && it != user.resolvedDisplayName }?.let { username ->
        Text(
            text = "@$username",
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}
