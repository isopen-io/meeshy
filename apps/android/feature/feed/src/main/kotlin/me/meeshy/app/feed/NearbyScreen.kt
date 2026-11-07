package me.meeshy.app.feed

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOff
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import me.meeshy.feature.feed.R
import me.meeshy.sdk.location.awaitFreshLocationFix
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.openAppSettings
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Geolocated discovery feed — parity with iOS's Nearby screen. A single fresh GPS/
 * network fix seeds the query; the list itself is a plain cursor-paginated feed
 * ([NearbyViewModel]) rendered in the gateway's own distance order. Pull-to-refresh
 * re-queries the same coordinates (never a new GPS fix — that only happens from the
 * permission/unavailable retry actions).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NearbyScreen(
    onBack: () -> Unit = {},
    onPostClick: (String) -> Unit = {},
    onOpenPost: (String) -> Unit = {},
    onOpenProfile: ((String) -> Unit)? = null,
    onOpenHashtag: (String) -> Unit = {},
    viewModel: NearbyViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let { snackbar.showSnackbar(it) }
    }
    val sheets = rememberListedPostSheets()
    val share = rememberListedPostShare(snackbar)
    ListedPostOverlays(
        sheets = sheets,
        actions = viewModel.cards,
        quoteComposer = state.quoteComposer,
        notice = state.notice,
        commentCount = { id -> state.posts.firstOrNull { it.id == id }?.commentCount ?: 0 },
        commentsClosed = { id -> state.posts.firstOrNull { it.id == id }?.commentsClosed },
        snackbar = snackbar,
    )

    val permissions = rememberPermissionFlow()
    val access = remember(permissions) {
        NearbyLocationAccess(
            stateOf = { nature -> permissions.stateOf(nature) },
            ensure = { nature, announcesRefusal -> permissions.ensure(nature, announcesRefusal) },
        )
    }

    suspend fun settle(outcome: NearbyAccess) {
        when (outcome) {
            NearbyAccess.Granted -> {
                viewModel.onLocating()
                val fix = context.awaitFreshLocationFix()
                if (fix != null) viewModel.loadNearby(fix.latitude, fix.longitude) else viewModel.onLocationUnavailable()
            }
            NearbyAccess.NeedsGesture -> viewModel.onAwaitingAccess()
            NearbyAccess.Denied -> viewModel.onPermissionDenied()
        }
    }

    fun requestLocation() {
        scope.launch { settle(access.onGesture()) }
    }

    fun onDeniedAction() {
        scope.launch {
            when (access.deniedAction()) {
                NearbyDeniedAction.RequestAgain -> requestLocation()
                NearbyDeniedAction.OpenSettings -> context.openAppSettings()
            }
        }
    }

    LaunchedEffect(Unit) {
        if (!state.hasLocation) settle(access.onOpen())
    }

    val currentState by rememberUpdatedState(state)
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, access) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME && currentState.permissionDenied) {
                scope.launch { access.onResumedWhileDenied().takeIf { it == NearbyAccess.Granted }?.let { settle(it) } }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    PermissionFlowHost(permissions)

    MeeshyBackground {
        Scaffold(
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    title = {
                        Text(stringResource(R.string.nearby_title), fontWeight = FontWeight.Bold)
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                imageVector = MeeshyIcons.Back,
                                contentDescription = stringResource(R.string.nearby_back),
                                tint = MeeshyTheme.tokens.textPrimary,
                            )
                        }
                    },
                )
            },
            snackbarHost = { SnackbarHost(snackbar) },
            containerColor = Color.Transparent,
        ) { padding ->
            PullToRefreshBox(
                isRefreshing = state.isRefreshing,
                onRefresh = viewModel::refresh,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
                when {
                    state.isLocating -> NearbySkeleton()
                    state.awaitingAccess -> NearbyStatusCard(
                        icon = Icons.Filled.NearMe,
                        title = stringResource(R.string.nearby_permission_title),
                        message = stringResource(R.string.nearby_permission_message),
                        actionLabel = stringResource(R.string.nearby_permission_action),
                        onRetry = ::requestLocation,
                    )
                    state.permissionDenied -> NearbyStatusCard(
                        icon = Icons.Filled.LocationOff,
                        title = stringResource(R.string.nearby_denied_title),
                        message = stringResource(R.string.nearby_denied_detail),
                        actionLabel = stringResource(R.string.nearby_denied_action),
                        onRetry = ::onDeniedAction,
                    )
                    state.locationUnavailable -> NearbyStatusCard(
                        icon = Icons.Filled.LocationOff,
                        title = stringResource(R.string.nearby_title),
                        message = stringResource(R.string.nearby_location_unavailable),
                        actionLabel = stringResource(R.string.nearby_retry),
                        onRetry = ::requestLocation,
                    )
                    state.showSkeleton -> NearbySkeleton()
                    state.hasLocation && state.posts.isEmpty() && !state.isLoading -> Box(
                        Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            stringResource(R.string.nearby_empty),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MeeshyTheme.tokens.textSecondary,
                        )
                    }
                    else -> LazyColumn(
                        state = listState,
                        contentPadding = PaddingValues(MeeshySpacing.lg),
                        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                    ) {
                        items(state.posts, key = { it.id }) { post ->
                            LaunchedEffect(post.id, state.posts.size) {
                                viewModel.loadMoreIfNeeded(post.id)
                            }
                            Column(Modifier.animateItem()) {
                                ListedPostCard(
                                    post = post,
                                    actions = viewModel.cards,
                                    sheets = sheets,
                                    share = share,
                                    onOpenPost = onOpenPost,
                                    onOpenReel = onPostClick,
                                    onOpenProfile = onOpenProfile,
                                    onOpenHashtag = onOpenHashtag,
                                )
                                post.distanceMeters?.let { NearbyDistanceLine(it) }
                            }
                        }
                        if (state.isLoadingMore) {
                            item(key = "nearby_load_more") {
                                Box(
                                    Modifier
                                        .fillMaxWidth()
                                        .padding(MeeshySpacing.md),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    CircularProgressIndicator(
                                        strokeWidth = 2.dp,
                                        modifier = Modifier.size(24.dp),
                                        color = MeeshyPalette.Indigo500,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NearbyStatusCard(
    icon: ImageVector,
    title: String,
    message: String,
    actionLabel: String,
    onRetry: () -> Unit,
) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.padding(MeeshySpacing.xxl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MeeshyPalette.Indigo500,
                modifier = Modifier.size(40.dp),
            )
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
            Button(onClick = onRetry) {
                Text(actionLabel)
            }
        }
    }
}

/** La distance SERVIE par le serveur sous la carte d'un post d'à côté (iOS `NearbyPostRow` : `NearbyDistanceLabel`). */
@Composable
private fun NearbyDistanceLine(meters: Double) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(start = MeeshySpacing.lg, top = MeeshySpacing.xs),
    ) {
        Icon(
            imageVector = Icons.Filled.NearMe,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(14.dp),
        )
        Spacer(Modifier.width(MeeshySpacing.xs))
        Text(
            text = when (val label = NearbyDistanceFormat.label(meters)) {
                is NearbyDistanceLabel.Meters -> stringResource(R.string.nearby_distance_meters, label.meters)
                is NearbyDistanceLabel.Kilometers -> stringResource(R.string.nearby_distance_km, label.km)
            },
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

@Composable
private fun NearbySkeleton() {
    LazyColumn(
        contentPadding = PaddingValues(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        items(6) {
            MeeshySkeletonBox(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(96.dp),
                shape = RoundedCornerShape(MeeshyRadius.xl),
            )
        }
    }
}
