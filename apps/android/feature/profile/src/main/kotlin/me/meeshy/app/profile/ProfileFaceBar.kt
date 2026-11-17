package me.meeshy.app.profile

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.profile.ProfileFace
import me.meeshy.ui.component.kit.MeeshyGlass
import me.meeshy.ui.component.kit.MeeshyGlassDensity
import me.meeshy.ui.component.kit.MeeshySegmented
import me.meeshy.ui.component.kit.MeeshySegmentedOption
import me.meeshy.ui.component.kit.MeeshySegmentedRole
import me.meeshy.ui.component.kit.MeeshySegmentedTone

internal const val PROFILE_FACE_BAR_TAG = "profile-face-bar"

/** La hauteur que la barre prend au pied de la fiche : le défilement lui laisse cette place. */
internal val PROFILE_FACE_BAR_CLEARANCE = 84.dp

/**
 * Le sélecteur de faces, au pied de la fiche (loi 5 : dans la zone du pouce) : K03 en onglets sur un verre dense. Il ne porte
 * que le choix de la face ; ce que chaque face montre se décide ailleurs.
 */
@Composable
internal fun ProfileFaceBar(
    faces: List<ProfileFace>,
    selected: ProfileFace,
    onSelect: (ProfileFace) -> Unit,
    modifier: Modifier = Modifier,
) {
    val options = faces.map { MeeshySegmentedOption(id = it, title = stringResource(it.titleRes())) }
    MeeshyGlass(
        modifier = modifier.fillMaxWidth().testTag(PROFILE_FACE_BAR_TAG),
        shape = RoundedCornerShape(32.dp),
        density = MeeshyGlassDensity.Dense,
    ) {
        MeeshySegmented(
            label = stringResource(R.string.fiche_faces_label),
            selected = selected,
            onSelect = onSelect,
            options = options,
            modifier = Modifier.fillMaxWidth().padding(6.dp),
            role = MeeshySegmentedRole.Tabs,
            tone = MeeshySegmentedTone.Theme,
        )
    }
}

internal fun ProfileFace.titleRes(): Int = when (this) {
    ProfileFace.VITRINE -> R.string.fiche_face_vitrine
    ProfileFace.LIENS -> R.string.fiche_face_links
    ProfileFace.ACTIONS -> R.string.fiche_face_actions
}
