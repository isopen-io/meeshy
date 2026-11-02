package me.meeshy.app.game.gestures

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.app.game.ceremony.MintCeremonyCover
import me.meeshy.app.game.ceremony.rememberModestDevice
import me.meeshy.app.game.gameString
import me.meeshy.app.game.pages.GameActionButton
import me.meeshy.app.game.pages.GameCard
import me.meeshy.app.game.pages.GameErrorLine
import me.meeshy.app.game.pages.GameNote
import me.meeshy.app.game.pages.count
import me.meeshy.app.game.pages.points
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameHapticPattern
import me.meeshy.sdk.model.game.GameMint
import me.meeshy.sdk.model.game.GameMintFrame
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.MintFailureKind
import me.meeshy.sdk.model.game.MintFrameBlocker
import me.meeshy.sdk.model.game.MintMee
import me.meeshy.sdk.model.game.ceremony.MintCeremonyRequest
import me.meeshy.sdk.model.game.ceremony.PreparedMintCeremony
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.game.GameMaterial
import me.meeshy.ui.component.game.PrecompileGameShaders
import me.meeshy.ui.component.game.rememberGameHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LE CADRE DE LA FRAPPE (iOS `GameMintPreviewView`) — la section de frappe du jeu, et la seule. Il dit, dans cet
 * ordre : la pièce qui vient ; « La Meesh n° 92 » ; UNE phrase où le prix paraît une fois ; le bouton, avec « +1 000 de
 * gloire » en petit DANS le bouton ; une phrase de Mee. Quand la frappe n'est pas possible, aucun bouton grisé : ce qu'il
 * manque, ou ce qui la ferme (l'Ombre, un rang).
 *
 * Chaque nombre est celui que la passerelle sert ([GameMintFrame]) ; la pièce frappée, son numéro et son édition sont
 * ceux de la RÉPONSE.
 *
 * LE TOUCHER ouvre la CÉRÉMONIE DE FRAPPE (iOS `MintCeremonyCover`, #13327) en même temps que la frappe part : la scène
 * tisse pendant le vol et ne frappe qu'au réglement de la passerelle ([GameGesturesUiState.mintSettlement]).
 * [onCeremonyStarted] et [onCeremonyEnded] bornent la cérémonie pour la tête de l'Héritage, retenue entre les deux.
 * À l'ouverture du cadre, les shaders du jeu se compilent et les particules de la prochaine pièce se tirent hors du fil
 * principal : le toucher n'a plus rien à préparer.
 */
@Composable
internal fun MintGestures(
    game: GameBlock,
    gestures: GameGesturesUiState,
    onMint: () -> Unit,
    onCeremonyStarted: () -> Unit = {},
    onCeremonyEnded: () -> Unit = {},
) {
    val frame = GameMintFrame.of(game.mint, pocket = game.level.sparks ?: game.level.score)
    val celebration = gestures.celebration
    val shownNumber = celebration?.number ?: frame.number
    val haptics = rememberGameHaptics()
    val reduce = LocalReduceMotion.current
    val bounce = remember { Animatable(1f) }
    val edition = game.mint.edition ?: GameMint.edition(game.mint.number)
    val modest = rememberModestDevice()
    var ceremony by remember { mutableStateOf<MintCeremonyRequest?>(null) }
    val prepared by produceState<PreparedMintCeremony?>(null, game.mint.number, edition, modest, reduce) {
        value = if (reduce) null else withContext(Dispatchers.Default) { PreparedMintCeremony.of(game.mint.number, edition, modest) }
    }
    PrecompileGameShaders()

    LaunchedEffect(celebration?.key) {
        if (celebration == null) return@LaunchedEffect
        // La cérémonie vibre elle-même à chaque coup : le cadre ne double pas sa frappe.
        if (ceremony == null) haptics.play(GameHapticPattern.strikeInPlace)
        if (reduce) return@LaunchedEffect
        bounce.snapTo(STRIKE_FROM)
        bounce.animateTo(1f, spring(dampingRatio = STRIKE_DAMPING, stiffness = STRIKE_STIFFNESS))
    }

    GameCard(tint = MeeshyPalette.Warning) {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Icon(
                MeeshyIcons.StarFilled,
                contentDescription = null,
                tint = coinTint(GameMint.displayEdition(shownNumber)),
                modifier = Modifier.size(COIN_SIZE).graphicsLayer { scaleX = bounce.value; scaleY = bounce.value },
            )
        }
        Text(
            stringResource(R.string.game_mint_next_title, count(shownNumber)),
            Modifier.semantics { heading() },
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        if (celebration != null) {
            val edition = gameString(GameCopyLaws.editionName(GameMint.displayEdition(celebration.number)))
            Text(
                stringResource(R.string.game_mint_minted_line, count(celebration.number), edition),
                Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Bold,
                color = MeeshyPalette.Indigo500,
            )
        }
        Text(
            stringResource(R.string.game_fiche_mint_sentence, points(frame.price), count(frame.pocket.coerceAtMost(Int.MAX_VALUE.toLong()).toInt())),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textPrimary,
        )
        frame.missing?.let {
            Text(
                stringResource(R.string.game_fiche_mint_missing, count(it.coerceAtMost(Int.MAX_VALUE.toLong()).toInt())),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
        }
        frame.blocker?.let { GameNote(blockerText(it)) }
        frame.glory?.let { glory ->
            GameActionButton(
                title = stringResource(R.string.game_mint_action),
                busyTitle = stringResource(R.string.game_mint_minting),
                detail = stringResource(R.string.game_mint_chip_glory, count(glory)),
                onClick = {
                    ceremony = MintCeremonyRequest(game.mint.number, edition, gestures.mintSettlement)
                    onCeremonyStarted()
                    onMint()
                },
                busy = gestures.minting,
                enabled = gestures.online,
                tint = MeeshyPalette.Warning,
                ink = MeeshyPalette.Indigo950,
            )
            if (!gestures.online) GameNote(stringResource(R.string.game_mint_offline))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
            Icon(MeeshyIcons.Sparkles, contentDescription = null, tint = MeeshyPalette.Warning, modifier = Modifier.size(MEE_SIZE))
            Text(
                meeText(frame.mee),
                style = MaterialTheme.typography.bodyMedium,
                fontStyle = FontStyle.Italic,
                fontWeight = FontWeight.Medium,
                color = MeeshyTheme.tokens.textMuted,
            )
        }
        if (!gestures.minting) GameErrorLine(mintFailureText(gestures, game))
    }
    MintCeremonyCover(ceremony, gestures.mintSettlement, glory = game.mint.gloryGained, prepared = prepared) {
        ceremony = null
        onCeremonyEnded()
    }
}

@Composable
private fun coinTint(edition: MeeshEdition): Color = when (edition) {
    MeeshEdition.Silver -> GameMaterial.SILVER.lineColor
    MeeshEdition.Gold -> GameMaterial.GOLD.lineColor
    MeeshEdition.Prism -> GameMaterial.PRISM.lineColor
}

@Composable
private fun meeText(mee: MintMee): String = when (mee) {
    MintMee.Wait -> stringResource(R.string.game_fiche_mint_mee_wait)
    MintMee.Gold -> stringResource(R.string.game_fiche_mint_mee_gold)
    MintMee.Prism -> stringResource(R.string.game_fiche_mint_mee_prism)
    is MintMee.NextGold -> stringResource(R.string.game_fiche_mint_mee_next_gold, count(mee.number))
    is MintMee.NextPrism -> stringResource(R.string.game_fiche_mint_mee_next_prism, count(mee.number))
}

@Composable
private fun debtText(amount: Long): String =
    if (amount > 0) stringResource(R.string.game_mint_blocked_debt, count(amount.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()))
    else stringResource(R.string.game_mint_blocked_debt_plain)

@Composable
private fun blockerText(blocker: MintFrameBlocker): String = when (blocker) {
    is MintFrameBlocker.Debt -> debtText(blocker.amount)
    is MintFrameBlocker.ReserveClosed -> stringResource(
        R.string.game_mint_blocked_reserve,
        gameString(GameCopyLaws.treasuryName(blocker.tier)),
        rankLabel(blocker.rank, blocker.division5),
    )
}

@Composable
private fun rankLabel(rank: GloryRank, division5: Int?): String {
    val name = gameString(GameCopyLaws.rankName(rank))
    val roman = division5?.let { listOf("I", "II", "III", "IV", "V").getOrNull(it - 1) } ?: return name
    return "$name $roman"
}

/** Le refus d'une frappe : la dette (son montant quand il est connu), la réserve fermée, le prix changé, sinon le repli. */
@Composable
private fun mintFailureText(gestures: GameGesturesUiState, game: GameBlock): String? =
    mintFailureText(gestures, debt = game.mint.sparksDebt ?: game.level.sparksDebt ?: 0L)

/** Le refus d'une frappe dit SOUS l'action qu'on peut retenter ; sans montant de dette connu, la phrase sans chiffre. */
@Composable
internal fun mintFailureText(gestures: GameGesturesUiState, debt: Long): String? {
    val failure = gestures.failures[GameGesture.Mint] ?: return null
    if (failure.offline) return stringResource(R.string.game_mint_offline)
    return when (MintFailureKind.of(failure.code)) {
        MintFailureKind.Debt -> debtText(debt)
        MintFailureKind.ReserveClosed, MintFailureKind.PriceChanged -> gestureMessage(failure)
        MintFailureKind.Generic -> stringResource(R.string.progression_meesh_mint_error)
    }
}

private val COIN_SIZE = 72.dp
private val MEE_SIZE = 24.dp
private const val STRIKE_FROM = 0.6f
private const val STRIKE_DAMPING = 0.4f
private const val STRIKE_STIFFNESS = 380f
