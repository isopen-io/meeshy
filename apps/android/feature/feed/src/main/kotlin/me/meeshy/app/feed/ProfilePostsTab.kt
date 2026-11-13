package me.meeshy.app.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.DisposableEffect
import kotlinx.coroutines.CoroutineScope
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.feedback.FeedbackToastKind
import me.meeshy.sdk.model.profile.ProfilePostsEmptyKind
import me.meeshy.ui.component.MeeshyEmptyState
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

private const val SKELETON_CARDS = 3

/**
 * Les éléments de l'onglet Postes d'une fiche, à verser DANS le défilement unique de la fiche (jamais un
 * second défilement imbriqué ni un pull-to-refresh) : la bande de filtres, les cartes du fil (posts et
 * réels), le vide par filtre, le pied « Vous avez tout vu ». Le contenu est injecté par `:app` — la feature
 * du fil reste isolée de celle du profil. [onOpenMyStories] `null` = la tuile Stories reste informative.
 */
@Composable
fun rememberProfilePostsItems(
    userId: String,
    onOpenPost: (String) -> Unit,
    onOpenMyStories: (() -> Unit)?,
    onDismissSheet: () -> Unit = {},
    onOpenReels: ((reelId: String, reelIds: List<String>) -> Unit)? = null,
    onOpenProfile: ((String) -> Unit)? = null,
    hostScope: CoroutineScope? = null,
): LazyListScope.() -> Unit {
    val viewModel: ProfilePostsViewModel = hiltViewModel(key = "profile-posts-$userId")
    LaunchedEffect(userId) { viewModel.bind(userId) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val failure = stringResource(R.string.profile_posts_load_error)
    LaunchedEffect(viewModel, failure) {
        viewModel.effects.collect { effect ->
            when (effect) {
                ProfilePostsEffect.PageFailed -> viewModel.toasts.show(failure, FeedbackToastKind.ERROR)
                is ProfilePostsEffect.Notice -> viewModel.toasts.show(
                    context.getString(effect.notice.messageRes()),
                    if (effect.notice.isError) FeedbackToastKind.ERROR else FeedbackToastKind.SUCCESS,
                )
            }
        }
    }
    DisposableEffect(viewModel) { onDispose { viewModel.flushImpressions() } }
    val onEvent: (ProfilePostsEvent) -> Unit = remember(viewModel) { viewModel::onEvent }
    // La feuille se ferme avant l'ouverture d'un réel : son propre scope mourrait avec elle, celui de l'hôte survit.
    val scope = hostScope ?: rememberCoroutineScope()
    val haptics = rememberMeeshyHaptics()
    val opening = remember(viewModel, scope, onOpenPost, onDismissSheet, onOpenReels) {
        ProfilePostOpening(
            scope = scope,
            reportOpen = viewModel::recordOpen,
            openPost = onOpenPost,
            dismiss = onDismissSheet,
            openReels = onOpenReels,
            haptic = haptics::medium,
        )
    }
    val linkCopied = stringResource(R.string.feed_link_copied)
    val actions = rememberPostCardShareActions(onLinkCopied = { viewModel.toasts.show(linkCopied, FeedbackToastKind.SUCCESS) })
    ProfilePostDialogs(state.dialog, onEvent)
    val locale = Locale.getDefault()
    return {
        profilePostsItems(state, onEvent, opening, actions, onOpenMyStories, onOpenProfile, locale)
    }
}

internal fun LazyListScope.profilePostsItems(
    state: ProfilePostsUiState,
    onEvent: (ProfilePostsEvent) -> Unit,
    opening: ProfilePostOpening,
    actions: PostCardShareActions,
    onOpenMyStories: (() -> Unit)?,
    onOpenProfile: ((String) -> Unit)?,
    locale: Locale,
) {
    item(key = "posts-band", contentType = "posts-band") {
        ProfilePostsFilterBand(
            counts = state.counts,
            selected = state.filter,
            onSelect = { onEvent(ProfilePostsEvent.SelectFilter(it)) },
            onStoriesTap = onOpenMyStories,
            modifier = Modifier.padding(horizontal = MeeshySpacing.xl),
        )
    }
    if (state.showSkeleton) {
        items(SKELETON_CARDS, key = { "posts-skeleton-$it" }, contentType = { "posts-skeleton" }) {
            MeeshySkeletonBox(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.xl)
                    .padding(top = MeeshySpacing.md)
                    .height(120.dp),
                shape = RoundedCornerShape(MeeshyRadius.xl),
            )
        }
    }
    val reelIds = state.posts.filter { it.isReel }.map { it.id }
    items(state.posts, key = { it.id }, contentType = { if (it.showsReelCard) "reel" else "post" }) { post ->
        LaunchedEffect(post.id, state.posts.size) { onEvent(ProfilePostsEvent.CardAppeared(post.id)) }
        LaunchedEffect(post.id) { onEvent(ProfilePostsEvent.Impression(post.id)) }
        PostCard(
            post = post,
            onLike = { onEvent(ProfilePostsEvent.ToggleLike(post.id)) },
            onBookmark = { onEvent(ProfilePostsEvent.ToggleBookmark(post.id)) },
            onFlagTap = { code -> onEvent(ProfilePostsEvent.RequestTranslation(post.id, code)) },
            onClick = { if (post.isReel) opening.reel(post.id, reelIds) else opening.post(post.id) },
            onOpenPost = opening::post,
            onOpenReel = { id -> opening.reel(id, reelIds) },
            onImageTap = { opening.post(post.id) },
            isOwn = ProfilePostActionMenu.isOwn(post.authorId, state.currentUserId),
            onShare = { actions.share(post); onEvent(ProfilePostsEvent.Shared(post.id)) },
            onSend = { actions.send(post); onEvent(ProfilePostsEvent.Shared(post.id)) },
            onCopyLink = { actions.copyLink(post) },
            onCopyText = { actions.copyText(post) },
            onOpenProfile = onOpenProfile,
            onRepost = { onEvent(ProfilePostsEvent.Repost(post.id)) },
            onQuote = { onEvent(ProfilePostsEvent.BeginQuote(post.id)) },
            onPin = { onEvent(ProfilePostsEvent.Pin(post.id)) },
            onReport = { onEvent(ProfilePostsEvent.RequestReport(post.id)) },
            onDelete = { onEvent(ProfilePostsEvent.RequestDelete(post.id)) },
            onComments = { opening.post(post.id) },
            modifier = Modifier
                .padding(horizontal = MeeshySpacing.xl)
                .padding(top = MeeshySpacing.md),
        )
    }
    if (state.isLoadingMore) {
        item(key = "posts-loading-more", contentType = "posts-loading") {
            Box(Modifier.fillMaxWidth().padding(MeeshySpacing.md), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(24.dp), color = MeeshyPalette.Indigo500)
            }
        }
    }
    if (state.empty != ProfilePostsEmptyKind.NONE) {
        item(key = "posts-empty", contentType = "posts-empty") { ProfilePostsEmpty(state.empty) }
    }
    if (state.showsEndFooter) {
        item(key = "posts-end", contentType = "posts-end") { ProfilePostsEndFooter(state.firstPublishedAtIso, locale) }
    }
}

private val ProfilePostsEmptyKind.isFiltered: Boolean
    get() = this == ProfilePostsEmptyKind.NO_REELS || this == ProfilePostsEmptyKind.NO_POSTS

/** Un filtre vide dit comment revenir à tout : retoucher la tuile, le seul chemin, qu'aucun autre signe ne montre. */
@Composable
internal fun ProfilePostsEmpty(kind: ProfilePostsEmptyKind) {
    val title = stringResource(
        when (kind) {
            ProfilePostsEmptyKind.NO_REELS -> R.string.profile_posts_empty_reels
            ProfilePostsEmptyKind.NO_POSTS -> R.string.profile_posts_empty_posts
            else -> R.string.profile_posts_empty
        },
    )
    Box(Modifier.fillMaxWidth().height(220.dp)) {
        MeeshyEmptyState(
            icon = if (kind == ProfilePostsEmptyKind.NO_REELS) MeeshyIcons.Movie else MeeshyIcons.Notes,
            title = title,
            subtitle = if (kind.isFiltered) stringResource(R.string.profile_posts_empty_filter_subtitle) else "",
            compact = true,
        )
    }
}

@Composable
private fun ProfilePostsEndFooter(firstPublishedAtIso: String?, locale: Locale) {
    val date = remember(firstPublishedAtIso, locale) { abbreviatedDate(firstPublishedAtIso, locale) }
    Column(
        Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xl).semantics(mergeDescendants = true) {},
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        Icon(MeeshyIcons.Verified, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary)
        date?.let {
            Text(
                stringResource(R.string.profile_posts_first_published_at, it),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

/** « 12 janv. 2026 » : la date courte localisée d'un instant ISO ; `null` si absent ou illisible. */
internal fun abbreviatedDate(iso: String?, locale: Locale): String? {
    if (iso.isNullOrBlank()) return null
    return runCatching {
        DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).withZone(ZoneId.systemDefault())
            .format(Instant.parse(iso))
    }.getOrNull()
}
