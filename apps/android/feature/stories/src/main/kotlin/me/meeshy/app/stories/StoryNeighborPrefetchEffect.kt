package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import coil.imageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.story.StoryNeighborPrefetchQueue

private const val MAX_IN_FLIGHT = 2

/**
 * Prépare les images du voisinage dans l'ordre de priorité, deux à la fois : une image décodée en cache mémoire
 * avant qu'on y arrive. Un changement de slide annule ce qui n'a pas démarré, jamais un téléchargement parti ; la
 * file est vidée à la fermeture. Les démarrages vivent dans la portée de l'effet, pas dans celle du plan.
 */
@Composable
internal fun StoryNeighborPrefetchEffect(images: List<String>) {
    val context = LocalContext.current
    val queue = remember { StoryNeighborPrefetchQueue<String>() }
    val scope = rememberCoroutineScope()
    fun pump() {
        while (queue.inFlight.size < MAX_IN_FLIGHT) {
            val url = queue.next() ?: return
            scope.launch {
                val result = context.imageLoader.execute(ImageRequest.Builder(context).data(url).build())
                if (result is SuccessResult) queue.complete(url) else queue.fail(url)
                pump()
            }
        }
    }
    LaunchedEffect(images) {
        queue.plan(images)
        pump()
    }
    DisposableEffect(queue) { onDispose { queue.clear() } }
}
