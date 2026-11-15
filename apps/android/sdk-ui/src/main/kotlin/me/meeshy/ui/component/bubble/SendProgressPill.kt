package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.model.BubbleSendProgress
import me.meeshy.sdk.model.media.MediaUploadProgress
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Ce que la pastille d'envoi lit (#16133) : les octets en vol de la conversation, par `cmid` de téléversement — le
 * registre `MediaUploadProgressLedger` — et ce qui a déjà atterri ([landed], le pont `UploadedAttachmentIds`), que le
 * registre oublie à la fin de chaque pièce. Sans le second, la bulle de plusieurs pièces repartirait de zéro à chacune.
 */
public class BubbleUploadProgress(
    public val progress: StateFlow<Map<String, MediaUploadProgress>>,
    public val landed: (String) -> Boolean,
)

/** Posé par l'écran de conversation. `null` hors de lui : une bulle montrée ailleurs (aperçu, partage) garde son horloge. */
public val LocalUploadProgress = compositionLocalOf<BubbleUploadProgress?> { null }

/**
 * Les pièces de la bulle, dont les identifiants sont les `cmid` de leurs téléversements tant qu'elles n'ont pas
 * d'identifiant serveur. Une vidéo figure à la fois dans [BubbleContent.videos] et dans [BubbleContent.files] : elle
 * n'est citée qu'une fois.
 */
internal fun BubbleContent.uploadPieces(): List<BubbleSendProgress.Piece> =
    (
        images.map { BubbleSendProgress.Piece(it.attachmentId, it.sizeBytes) } +
            videos.map { BubbleSendProgress.Piece(it.attachmentId, it.sizeBytes?.toLong()) } +
            files.map { BubbleSendProgress.Piece(it.attachmentId, it.sizeBytes?.toLong()) } +
            audios.map { BubbleSendProgress.Piece(it.attachmentId, it.sizeBytes?.toLong()) }
        ).distinctBy { it.id }

/**
 * La pastille d'envoi d'une bulle (iOS #14702) : un anneau et son pourcentage à la place de l'horloge. SEULE cette
 * pastille observe le registre : le flux est réduit au pourcentage ENTIER de SES pièces (atterries comprises) puis
 * dédoublonné, donc ni la liste ni la bulle ne recomposent à chaque tronçon — au plus cent recompositions de la
 * pastille par envoi. Sans progression connue (pièce encore en file, texte seul), [fallback] rend l'horloge. TalkBack
 * dit « Envoi en cours, 42 % ».
 */
@Composable
internal fun SendProgressPill(
    pieces: List<BubbleSendProgress.Piece>,
    source: BubbleUploadProgress,
    color: Color,
    fallback: @Composable () -> Unit,
    modifier: Modifier = Modifier,
) {
    val percentFlow = remember(source, pieces) {
        source.progress.map { BubbleSendProgress.percent(pieces, it, source.landed) }.distinctUntilChanged()
    }
    val percent by percentFlow.collectAsState(initial = BubbleSendProgress.percent(pieces, source.progress.value, source.landed))
    val shown = percent
    if (shown == null) {
        fallback()
        return
    }
    val label = stringResource(R.string.bubble_send_progress_a11y, shown)
    Row(
        modifier = modifier.semantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        CircularProgressIndicator(
            progress = { shown / 100f },
            modifier = Modifier.size(12.dp).clearAndSetSemantics {},
            color = color,
            strokeWidth = 1.5.dp,
        )
        Text(
            text = stringResource(R.string.bubble_send_progress_percent, shown),
            fontSize = MeeshyFontSize.small,
            color = color,
            maxLines = 1,
            modifier = Modifier.clearAndSetSemantics {},
        )
    }
}
