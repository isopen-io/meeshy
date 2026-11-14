package me.meeshy.ui.component.talkie

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import me.meeshy.ui.component.MeeshyInfoNote
import me.meeshy.ui.component.MeeshyInfoNoteButton
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

public const val TALKIE_INFO_TAG: String = "talkie.info"
public const val TALKIE_INFO_NOTE_TAG: String = "talkie.info.note"

/**
 * Le (i) à côté du bouton talkie de la fiche (#17141, #17150, iso `TalkieInfoButton.swift`) — l'atome de l'épure
 * (#18099) : son nom accessible est la QUESTION (« Quand utiliser le talkie ? »), TalkBack lit aussi la note repliée, et
 * la note se déplie SOUS la rangée ([TalkieInfoNote]) comme tout autre (i). L'hôte tient l'état. Il ne vit QUE sur la
 * fiche, jamais dans l'en-tête (#17339).
 */
@Composable
public fun TalkieInfoButton(
    expanded: Boolean,
    onToggle: () -> Unit,
    tint: Color = MeeshyPalette.Indigo500,
    modifier: Modifier = Modifier,
) {
    MeeshyInfoNoteButton(
        note = talkieInfo(),
        expanded = expanded,
        onToggle = onToggle,
        tint = tint,
        modifier = modifier.testTag(TALKIE_INFO_TAG),
    )
}

/** La note dépliée : qui, quand. Ce que fait le geste (la voix joue chez l'autre) est déjà dit, visible, par la fiche. */
@Composable
public fun TalkieInfoNote(modifier: Modifier = Modifier) {
    Text(
        text = talkieInfo().text,
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = modifier.testTag(TALKIE_INFO_NOTE_TAG),
    )
}

@Composable
private fun talkieInfo(): MeeshyInfoNote =
    MeeshyInfoNote(question = stringResource(R.string.talkie_info_a11y), text = stringResource(R.string.talkie_info_note))
