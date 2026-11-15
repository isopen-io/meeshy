package me.meeshy.app.feed

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.engagement.PostViewerPointsStore
import me.meeshy.ui.component.chrome.PostPointsMark
import me.meeshy.ui.theme.MeeshySpacing
import androidx.compose.foundation.layout.padding

@EntryPoint
@InstallIn(SingletonComponent::class)
internal interface PostViewerPointsEntryPoint {
    fun viewerPointsStore(): PostViewerPointsStore
}

/**
 * « · ✦+N » à côté de la date de la carte (iOS `PostDateWithPoints`) : la lecture servie ([seed]) est notée
 * à chaque valeur neuve, et `engagement:post-updated` fait rouler le nombre — jamais une valeur plus
 * ancienne que la plus récente connue ([PostViewerPointsStore]). Rien à zéro ni sans valeur.
 */
@Composable
internal fun PostViewerPointsMark(postId: String, seed: Int?, color: Color, modifier: Modifier = Modifier) {
    val context = LocalContext.current.applicationContext
    val store = remember(context) {
        EntryPointAccessors.fromApplication(context, PostViewerPointsEntryPoint::class.java).viewerPointsStore()
    }
    LaunchedEffect(postId, seed) { store.noteRead(postId, seed) }
    val points by remember(store, postId, seed) { store.displayedFlow(postId, seed) }.collectAsState(initial = seed)
    PostPointsMark(viewerPoints = points, color = color, modifier = modifier.padding(start = MeeshySpacing.xs))
}
