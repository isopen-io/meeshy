package me.meeshy.app.contacts.circles

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.relation.RelationPersonSwitch
import me.meeshy.sdk.model.relation.RelationReceptionSetting
import me.meeshy.ui.theme.MeeshyTheme

internal fun RelationReceptionSetting.titleRes(): Int = when (this) {
    RelationReceptionSetting.BRING -> R.string.circles_settings_block_bring
    RelationReceptionSetting.TALKIE -> R.string.circles_settings_block_talkie
}

internal fun RelationReceptionSetting.detailRes(): Int? =
    if (this == RelationReceptionSetting.TALKIE) R.string.circles_settings_block_talkie_detail else null

/**
 * Les blocages de réception d'une personne SANS lien (#16643) — un collègue de l'équipe, que la passerelle laisse sonner
 * à `accessLevel` Sang sans cercle : la même feuille de réglages que celle d'un lien, sans cercle fabriqué. Rien quand
 * [settings] est vide (le niveau d'outils servi n'ouvre ni Bring ni talkie). Iso `CircleLinkSheet.swift` pour les lignes.
 */
@Composable
fun ReceptionBlockSection(userId: String, settings: List<RelationReceptionSetting>, modifier: Modifier = Modifier) {
    if (settings.isEmpty()) return
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = stringResource(R.string.circles_sheet_settings_title),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.semantics { heading() },
        )
        settings.forEach { setting ->
            CircleReceptionBlockToggle(
                userId = userId,
                personSwitch = RelationPersonSwitch.Reception(setting),
                title = stringResource(setting.titleRes()),
                detail = setting.detailRes()?.let { stringResource(it) },
            )
        }
    }
}
