package me.meeshy.ui.component.phonereachability

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityPersonRules
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityState
import me.meeshy.sdk.phonereachability.PhoneReachabilityStore
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Le magasin du téléphone injoignable de la session, fourni à la racine de l'app (`MainActivity`). Absent (aperçus,
 * tests) : [rememberPhoneReachability] rend `null`, donc aucun glyphe — rien n'est fabriqué.
 */
val LocalPhoneReachabilityStore = staticCompositionLocalOf<PhoneReachabilityStore?> { null }

/**
 * L'état du téléphone de [userId], lu AU PLUS BAS niveau : seule la surface qui l'appelle se recompose. `null` quand
 * son téléphone répond, et TOUJOURS pour moi-même (mon propre état ne m'est jamais montré). Cache d'abord.
 */
@Composable
fun rememberPhoneReachability(userId: String?): PhoneReachabilityState? {
    val store = LocalPhoneReachabilityStore.current ?: return null
    if (!PhoneReachabilityPersonRules.shows(userId, store.viewerId)) return null
    val flow = remember(store, userId) { store.stateOf(userId) }
    val initial = remember(store, userId) { store.roster.value.stateOf(userId) }
    val state by flow.collectAsStateWithLifecycle(initialValue = initial)
    return state
}

/** Le glyphe « téléphone injoignable » : un téléphone barré, à la teinte d'avertissement. */
@Composable
fun PhoneUnreachableGlyph(modifier: Modifier = Modifier, size: Dp = 16.dp, tint: Color = MeeshyPalette.Warning) {
    Icon(imageVector = PhoneUnreachableVector, contentDescription = null, tint = tint, modifier = modifier.size(size))
}

/** Le glyphe de l'en-tête de conversation : rien quand le téléphone répond ; un libellé lu par TalkBack sinon. */
@Composable
fun PhoneReachabilityIndicator(userId: String?, name: String, modifier: Modifier = Modifier) {
    rememberPhoneReachability(userId) ?: return
    val description = stringResource(R.string.phone_reachability_a11y, name)
    PhoneUnreachableGlyph(modifier.semantics { contentDescription = description })
}

/** La pastille posée sur l'avatar d'une ligne de liste. */
@Composable
fun PhoneReachabilityAvatarBadge(userId: String?, name: String, modifier: Modifier = Modifier) {
    rememberPhoneReachability(userId) ?: return
    val description = stringResource(R.string.phone_reachability_a11y, name)
    Box(
        modifier = modifier
            .background(MaterialTheme.colorScheme.surface, CircleShape)
            .padding(2.dp)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        PhoneUnreachableGlyph(size = 12.dp)
    }
}

/** Le téléphone barré, tracé ici pour rester hors du catalogue d'icônes miroir d'iOS (SF Symbol `iphone.slash`). */
val PhoneUnreachableVector: ImageVector by lazy {
    ImageVector.Builder(
        name = "PhoneUnreachable",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply {
        path(fill = SolidColor(Color.Black), pathFillType = PathFillType.EvenOdd) {
            moveTo(7f, 2f)
            horizontalLineTo(17f)
            verticalLineTo(22f)
            horizontalLineTo(7f)
            close()
            moveTo(9f, 4f)
            horizontalLineTo(15f)
            verticalLineTo(18f)
            horizontalLineTo(9f)
            close()
        }
        path(
            stroke = SolidColor(Color.Black),
            strokeLineWidth = 2f,
            strokeLineCap = StrokeCap.Round,
        ) {
            moveTo(3f, 3f)
            lineTo(21f, 21f)
        }
    }.build()
}
