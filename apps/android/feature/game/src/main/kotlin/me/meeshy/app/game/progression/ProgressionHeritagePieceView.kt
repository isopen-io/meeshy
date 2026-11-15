package me.meeshy.app.game.progression

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import me.meeshy.app.game.gameString
import me.meeshy.app.game.gestures.GameGesturesUiState
import me.meeshy.app.game.gestures.MintGestures
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.MeeshCoinFace
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.TreasuryStanding
import me.meeshy.sdk.model.game.ceremony.GameHeritageHold
import me.meeshy.sdk.model.game.progression.HeritageCoin
import me.meeshy.sdk.model.game.progression.ProgressionHeritagePiece
import me.meeshy.sdk.model.game.progression.ProgressionPieceDetails
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.game.GameBounceButton
import me.meeshy.ui.component.game.MeeshCoin
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LA TÊTE DE L'HÉRITAGE (iOS `GameHeritageHeadView` sur `GameFicheHead`) — « qu'est-ce que je garde ? » : la dernière
 * pièce frappée, côté revers, dans son édition DESSINÉE (le flan d'argent quand rien n'a été frappé) ; le contenant en
 * petit, qui se touche et ouvre ses précisions ; les Meeshes gardées en grand ; le contenant suivant ; les frappées
 * depuis toujours. Une nouvelle pièce prend la tête d'un mouvement court, aucun sous « réduire les animations ».
 */
@Composable
internal fun HeritagePiece(head: ProgressionHeritagePiece, treasury: TreasuryStanding) {
    val tokens = MeeshyTheme.tokens
    val locale = LocalConfiguration.current.locales[0]
    var opened by remember { mutableStateOf<GameElementDetail?>(null) }
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(tokens.backgroundSecondary)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xl)
            .testTag(HERITAGE_PIECE_TAG),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        HeritageCoinView(head.coin)
        val label = gameString(head.label).uppercase(locale)
        val labelStyle = MaterialTheme.typography.labelMedium
        if (head.tierOpens) {
            GameBounceButton(
                onClick = { opened = GameElementDetails.treasuryTier(treasury) },
                modifier = Modifier.testTag(HERITAGE_TIER_TAG),
            ) {
                Box(Modifier.heightIn(min = 44.dp), contentAlignment = Alignment.Center) {
                    Text(label, Modifier.semantics { heading() }, style = labelStyle, fontWeight = FontWeight.SemiBold, color = tokens.textMuted)
                }
            }
        } else {
            Text(label, Modifier.semantics { heading() }, style = labelStyle, fontWeight = FontWeight.SemiBold, color = tokens.textMuted)
        }
        GameValueRoll(
            value = gameString(head.held),
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
            color = tokens.textPrimary,
        )
        head.opens?.let {
            Text(gameString(it), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium, color = tokens.textPrimary, textAlign = TextAlign.Center)
        }
        head.minted?.let {
            Text(gameString(it), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = tokens.textMuted, textAlign = TextAlign.Center)
        }
    }
    opened?.let { detail -> GameElementSheet(detail, onDismiss = { opened = null }) }
}

/**
 * L'HÉRITAGE PUIS LE CADRE DE LA FRAPPE, en tête de la fiche de la Meesh (iOS `ProgressionConceptPage.heritage`) : au
 * toucher, la tête garde ce qu'elle montrait (`GameHeritageHold`) jusqu'à la fin de la cérémonie ET la réponse de la
 * passerelle ; alors seulement le compte monte et la nouvelle pièce prend la tête — jamais avant la frappe qu'on voit.
 */
@Composable
internal fun HeritageAndMint(served: ProgressionHeritagePiece, game: GameBlock, gestures: GameGesturesUiState, onMint: () -> Unit) {
    var hold by remember { mutableStateOf<GameHeritageHold?>(null) }
    HeritagePiece(GameHeritageHold.shown(served, hold, gestures.mintSettlement), game.treasury)
    MintGestures(
        game,
        gestures,
        onMint = onMint,
        onCeremonyStarted = { hold = GameHeritageHold.of(served, gestures.mintSettlement) },
        onCeremonyEnded = { hold = hold?.ended() },
    )
}

/** La dernière pièce frappée, côté revers ; le flan d'argent quand rien n'a été frappé. Décorative : le chiffre dit tout. */
@Composable
private fun HeritageCoinView(coin: HeritageCoin?) {
    val reduce = LocalReduceMotion.current
    AnimatedContent(
        targetState = coin,
        transitionSpec = {
            if (reduce) {
                fadeIn(snap()) togetherWith fadeOut(snap())
            } else {
                (scaleIn(spring(dampingRatio = 0.7f, stiffness = 300f), initialScale = 0.6f) + fadeIn()) togetherWith fadeOut()
            }
        },
        label = "heritage-coin",
    ) { shown ->
        val year = remember { LocalDate.now().year }
        MeeshCoin(
            modifier = Modifier.size(COIN),
            face = shown?.let { MeeshCoinFace.Reverse(it.number, year) } ?: MeeshCoinFace.Obverse,
            edition = shown?.edition ?: MeeshEdition.Silver,
        )
    }
}

/** Les précisions du contenant (iOS `GameElementDetails.treasuryTier`). */
internal fun GameElementDetails.treasuryTier(treasury: TreasuryStanding): GameElementDetail.Piece =
    GameElementDetail.Piece(ProgressionPieceDetails.treasuryTier(treasury), PieceEmblem.Coin)

internal const val HERITAGE_PIECE_TAG = "game.fiche.heritage"
internal const val HERITAGE_TIER_TAG = "game.fiche.heritage.tier"
private val COIN = 96.dp
