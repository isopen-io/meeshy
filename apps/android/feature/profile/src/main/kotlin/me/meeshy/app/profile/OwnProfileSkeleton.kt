package me.meeshy.app.profile

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import me.meeshy.ui.component.skeleton.SkeletonProfileHeader

/** Le marqueur de test du squelette de MA page. */
internal const val OWN_PROFILE_SKELETON_TAG = "own_profile_skeleton"

/**
 * Le squelette d'en-tete de MA page (iOS `SkeletonProfileHeader`) : seulement quand AUCUNE identite n'est en
 * memoire (premier lancement, apres deconnexion), pour ne jamais faire clignoter des « ? » de repli. Une
 * identite en cache se peint toujours, meme perimee. Jamais de spinner a froid.
 */
@Composable
internal fun OwnProfileSkeleton(modifier: Modifier = Modifier) {
    SkeletonProfileHeader(modifier = modifier.testTag(OWN_PROFILE_SKELETON_TAG))
}
