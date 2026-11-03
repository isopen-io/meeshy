package me.meeshy.ui.component.bubble

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.sdk.model.YouTubeLink

/** La façade d'une vidéo YouTube : vignette + lecture, la lecture s'ouvre dehors (jamais de lecteur embarqué). */
@Composable
public fun YouTubeFacade(
    link: YouTubeLink,
    contentDescription: String,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .clip(RoundedCornerShape(12.dp))
            .background(Color.Black)
            .clickable(role = Role.Button, onClickLabel = contentDescription) {
                runCatching {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link.watchUrl)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        AsyncImage(
            model = link.thumbnailUrl,
            contentDescription = contentDescription,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
        )
        Box(Modifier.size(56.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.6f)), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = Color.White, modifier = Modifier.size(32.dp))
        }
    }
}
