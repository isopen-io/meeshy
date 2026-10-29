package me.meeshy.app.calls

import androidx.compose.foundation.layout.Spacer
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.rotateRad
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import me.meeshy.sdk.call.frames.CallFrameMotionScene
import me.meeshy.sdk.model.call.frames.CallFrameMotionCurve
import me.meeshy.sdk.model.call.frames.CallFrameMotionPose
import me.meeshy.sdk.model.call.frames.CallFrameMotionStyle
import me.meeshy.sdk.model.call.frames.CallFrameMotionTrack
import me.meeshy.sdk.model.call.frames.CallLiveFrameGeometry

private const val NANOS_PER_SECOND = 1_000_000_000.0

/** Un ornement animé prêt à poser : sa piste et ses groupes, déjà confiés à la carte graphique. */
private class CallFrameMotionSpriteImages(val track: CallFrameMotionTrack, val images: List<ImageBitmap>)

/**
 * **LA COUCHE DES ORNEMENTS ANIMÉS** (#13687, miroir de iOS `CallFrameMotionLayer`) : posée au-dessus du cadre fixe,
 * dans le repère de la toile peinte, et masquée hors des visages. Les images sont peintes UNE fois ; à chaque image
 * l'horloge de Compose avance, et seule cette couche se REDESSINE (l'horloge est lue au dessin, jamais à la
 * composition) : rien n'est repeint, rien n'est alloué, l'écran d'appel ne se recompose pas.
 */
@Composable
internal fun CallFrameMotionLayer(scene: CallFrameMotionScene, modifier: Modifier = Modifier) {
    val sprites = remember(scene) { scene.sprites.map { CallFrameMotionSpriteImages(it.track, it.images.map { image -> image.asImageBitmap() }) } }
    val mask = remember(scene) { scene.mask.asImageBitmap() }
    val clock = remember(scene) { mutableLongStateOf(0L) }
    val pose = remember { CallFrameMotionPose() }
    LaunchedEffect(scene) {
        val start = withFrameNanos { it }
        while (true) withFrameNanos { clock.longValue = it - start }
    }
    Spacer(
        modifier
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .drawWithCache {
                val fit = CallLiveFrameGeometry.fit(scene.width.toDouble(), scene.height.toDouble(), size.width.toDouble(), size.height.toDouble())
                onDrawBehind {
                    val seconds = clock.longValue / NANOS_PER_SECOND
                    translate(fit.offsetX.toFloat(), fit.offsetY.toFloat()) {
                        scale(fit.scale.toFloat(), fit.scale.toFloat(), pivot = Offset.Zero) {
                            for (s in sprites.indices) {
                                val sprite = sprites[s]
                                for (index in sprite.images.indices) {
                                    CallFrameMotionCurve.sample(sprite.track, index, seconds, scene.height.toDouble(), scene.unit, pose)
                                    drawSprite(sprite.images[index], sprite.track, pose, scene)
                                }
                            }
                            drawImage(mask, blendMode = BlendMode.DstIn)
                        }
                    }
                }
            },
    )
}

/** Un groupe à sa pose ; ce qui tombe ou monte se dessine deux fois, bout à bout, pour ne jamais laisser de trou. */
private fun DrawScope.drawSprite(image: ImageBitmap, track: CallFrameMotionTrack, pose: CallFrameMotionPose, scene: CallFrameMotionScene) {
    val alpha = pose.alpha.toFloat().coerceIn(0f, 1f)
    if (alpha <= 0f) return
    val pivot = Offset(scene.width / 2f, scene.height / 2f)
    translate(pose.dx.toFloat(), pose.dy.toFloat()) {
        rotateRad(pose.rotation.toFloat(), pivot) {
            drawImage(image, alpha = alpha)
            if (track.travels) {
                val wrap = if (track.style is CallFrameMotionStyle.Rise) scene.height.toFloat() else -scene.height.toFloat()
                drawImage(image, topLeft = Offset(0f, wrap), alpha = alpha)
            }
        }
    }
}
