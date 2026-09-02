package me.meeshy.app.feed

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.LocationOff
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material.icons.filled.PlayCircle
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import me.meeshy.feature.feed.R
import me.meeshy.sdk.location.awaitFreshLocationFix
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
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

    fun captureAndLoad() {
        scope.launch {
            val fix = context.awaitFreshLocationFix()
            if (fix != null) viewModel.loadNearby(fix.latitude, fix.longitude) else viewModel.onLocationUnavailable()
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { results ->
        val granted = results[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            results[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) captureAndLoad() else viewModel.onPermissionDenied()
    }

    fun requestLocation() {
        viewModel.onLocating()
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        if (fine || coarse) {
            captureAndLoad()
        } else {
            permissionLauncher.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
            )
        }
    }

    LaunchedEffect(Unit) {
        if (!state.hasLocation) requestLocation()
    }

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
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
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
                    state.permissionDenied -> NearbyStatusCard(
                        icon = Icons.Filled.LocationOff,
                        title = stringResource(R.string.nearby_permission_title),
                        message = stringResource(R.string.nearby_permission_message),
                        actionLabel = stringResource(R.string.nearby_permission_action),
                        onRetry = ::requestLocation,
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
                            NearbyPostCard(
                                post = post,
                                onClick = { if (post.isReel) onPostClick(post.id) else onOpenPost(post.id) },
                            )
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

@Composable
private fun NearbyPostCard(
    post: FeedPostPresentation,
    onClick: () -> Unit,
) {
    val unknownAuthor = stringResource(R.string.feed_unknown_author)
    MeeshyGlassSurface(
        shape = RoundedCornerShape(MeeshyRadius.xl),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Column(Modifier.padding(MeeshySpacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(contentAlignment = Alignment.Center) {
                    MeeshyAvatar(name = post.authorName ?: unknownAuthor, size = 40.dp)
                    if (!post.authorAvatarUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = post.authorAvatarUrl,
                            contentDescription = post.authorName ?: unknownAuthor,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(40.dp)
                                .clip(CircleShape),
                        )
                    }
                }
                Spacer(Modifier.width(MeeshySpacing.md))
                Text(
                    text = post.authorName ?: unknownAuthor,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = Modifier.weight(1f),
                )
                if (post.isReel) {
                    Icon(
                        imageVector = Icons.Filled.PlayCircle,
                        contentDescription = stringResource(R.string.feed_reel),
                        tint = MeeshyPalette.Indigo500,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }

            if (post.content.isNotBlank()) {
                Spacer(Modifier.height(MeeshySpacing.sm))
                Text(
                    text = post.content,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            post.distanceMeters?.let { meters ->
                Spacer(Modifier.height(MeeshySpacing.sm))
                Row(verticalAlignment = Alignment.CenterVertically) {
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
        }
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
