package me.meeshy.ui.profile

import androidx.compose.foundation.clickable
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.profile.isOpenable
import me.meeshy.ui.R

/**
 * Toucher une personne ouvre sa fiche par [LocalProfileSheetOpener] avec l'identité fabriquée par la surface.
 * `null` ou sans identité exploitable : aucune zone tactile. Libellé TalkBack « Ouvrir le profil de <nom> » ;
 * [minTarget] garantit la cible de 48 dp (à couper sur un nom en ligne dans un texte dense).
 */
@Composable
public fun Modifier.opensProfile(user: ProfileSheetUser?, minTarget: Boolean = true): Modifier {
    if (user == null || !user.isOpenable) return this
    val opener = LocalProfileSheetOpener.current
    val label = stringResource(R.string.profile_open_of, user.resolvedDisplayName)
    val sized = if (minTarget) minimumInteractiveComponentSize() else this@opensProfile
    return sized.clickable(onClickLabel = label, role = Role.Button) { opener.open(user) }
}
