package me.meeshy.app.game.progression

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.app.game.gameString
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.progression.GameSparksHead
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LA TÊTE DES ÉTINCELLES (iOS `GameSparksHeadView` sur `GameFicheHead`) : l'Ombre en rouge au-dessus de tout quand une
 * dette existe, l'emblème, « TA LUMIÈRE », la poche en grand, et en petit ce qui a été reçu depuis toujours. Centrée,
 * un seul élément pour le lecteur d'écran.
 */
@Composable
internal fun GameSparksHeadView(head: GameSparksHead, game: GameBlock?) {
    val tokens = MeeshyTheme.tokens
    val locale = LocalConfiguration.current.locales[0]
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(tokens.backgroundSecondary)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xl)
            .testTag(SPARKS_HEAD_TAG),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        head.shadow?.let { shadow ->
            Text(
                gameString(shadow),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyPalette.Error,
                textAlign = TextAlign.Center,
            )
        }
        ProgressionConceptEmblem(ProgressionConcept.Points, game, size = EMBLEM)
        Text(
            stringResource(R.string.game_fiche_light_label).uppercase(locale),
            Modifier.semantics { heading() },
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = tokens.textMuted,
            textAlign = TextAlign.Center,
        )
        GameValueRoll(
            value = gameString(head.pocket),
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
            color = tokens.textPrimary,
        )
        head.lifetime?.let { lifetime ->
            Text(
                gameString(lifetime),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Medium,
                color = tokens.textPrimary,
                textAlign = TextAlign.Center,
            )
        }
    }
}

internal const val SPARKS_HEAD_TAG = "game.fiche.light"
private val EMBLEM = 72.dp
