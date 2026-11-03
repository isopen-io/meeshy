package me.meeshy.app.stories

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.location.PlaceLabels
import me.meeshy.ui.story.canvas.rememberSceneLocationTapFrame
import kotlin.math.roundToInt

internal const val STORY_LOCATION_TAP_TAG: String = "story-location-tap"

/** La cible minimale d'une pastille touchable (Material, 48 dp). */
private const val MINIMUM_TARGET_DP = 48

/**
 * Les cibles de tap invisibles posées sur les pastilles de lieu d'une story en LECTURE (miroir de
 * `StoryLocationReaderTapOverlay`, iOS). Rendue AU-DESSUS de la couche gestuelle, la cible consomme le toucher : la
 * story n'avance pas. Le cadre vient de [rememberSceneLocationTapFrame], la mesure exacte du rendu, avec au moins 48 dp.
 * [hidden] (saisie d'un commentaire) l'efface : aucune cible ne reste active sous le clavier. L'hôte pose le même
 * cadrage que le canevas, met la story en pause dans [onTap] et reprend à la fermeture.
 */
@Composable
internal fun StoryLocationTapOverlay(
    locations: List<StoryLocationObject>,
    onTap: (SharedPlace) -> Unit,
    modifier: Modifier = Modifier,
    hidden: Boolean = false,
) {
    if (hidden || locations.isEmpty()) return
    BoxWithConstraints(modifier.fillMaxSize()) {
        val widthPx = with(LocalDensity.current) { maxWidth.toPx() }
        val heightPx = with(LocalDensity.current) { maxHeight.toPx() }
        val minimumPx = with(LocalDensity.current) { MINIMUM_TARGET_DP.dp.toPx() }
        locations.forEach { location ->
            LocationTarget(location, widthPx, heightPx, minimumPx, onTap)
        }
    }
}

@Composable
private fun LocationTarget(
    location: StoryLocationObject,
    widthPx: Float,
    heightPx: Float,
    minimumPx: Float,
    onTap: (SharedPlace) -> Unit,
) {
    val frame = rememberSceneLocationTapFrame(location, widthPx, heightPx, minimumPx)
    val density = LocalDensity.current
    val label = stringResource(R.string.story_place_pastille_a11y, location.label)
    val hint = stringResource(R.string.story_location_open_hint)
    val silent = remember { MutableInteractionSource() }
    Box(
        Modifier
            .offset { androidx.compose.ui.unit.IntOffset(frame.left.roundToInt(), frame.top.roundToInt()) }
            .size(with(density) { frame.width.toFloat().toDp() }, with(density) { frame.height.toFloat().toDp() })
            .testTag(STORY_LOCATION_TAP_TAG)
            .clickable(interactionSource = silent, indication = null, role = Role.Button) { onTap(location.place) }
            .clearAndSetSemantics {
                contentDescription = label
                role = Role.Button
                onClick(label = hint) { onTap(location.place); true }
            },
    )
}

/** Ouvre le lieu dans l'application de cartes (`geo:`), sinon sur la page web de la carte ; `false` si rien ne l'ouvre. */
internal fun openStoryPlaceOnMap(context: Context, place: SharedPlace): Boolean =
    listOf(PlaceLabels.geoUri(place), PlaceLabels.webMapsUri(place)).any { uri ->
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (_: ActivityNotFoundException) {
            false
        }
    }
