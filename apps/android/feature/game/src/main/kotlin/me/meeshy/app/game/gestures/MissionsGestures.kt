package me.meeshy.app.game.gestures

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.app.game.gameString
import me.meeshy.app.game.pages.GameActionButton
import me.meeshy.app.game.pages.GameCard
import me.meeshy.app.game.pages.GameChip
import me.meeshy.app.game.pages.GameErrorLine
import me.meeshy.app.game.pages.GameNote
import me.meeshy.app.game.pages.GameProgressBar
import me.meeshy.app.game.pages.count
import me.meeshy.app.game.pages.currentLocale
import me.meeshy.app.game.pages.points
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.ChestBonus
import me.meeshy.sdk.model.game.ChestLine
import me.meeshy.sdk.model.game.ChestPhase
import me.meeshy.sdk.model.game.DailyChest
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameChest
import me.meeshy.sdk.model.game.GameChestLines
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameHapticPattern
import me.meeshy.sdk.model.game.CalmDuration
import me.meeshy.sdk.model.game.GameMission
import me.meeshy.sdk.model.game.GameMissionCardLaws
import me.meeshy.sdk.model.game.GameMissionClock
import me.meeshy.sdk.model.game.GameMissionLaws
import me.meeshy.sdk.model.game.GameMissionTitles
import me.meeshy.sdk.model.game.GameSpend
import me.meeshy.sdk.model.game.MissionDifficulty
import me.meeshy.sdk.model.game.MissionPhase
import me.meeshy.sdk.model.game.MissionWindow
import me.meeshy.sdk.model.game.StarFragmentsTotal
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.game.GameBounceButton
import me.meeshy.ui.component.game.rememberGameHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/**
 * LES MISSIONS DU JOUR ET L'OFFRANDE (iOS `GameMissionsView`) — trois actes, leur avancement, un changement par jour
 * (1 Meesh), et l'Offrande qui s'ouvre quand tout est fait.
 *
 * Avant chaque geste, ce qu'il dépense ou exige se dit : le prix d'un changement contre les Meeshes en poche, les actes
 * que l'Offrande attend, le niveau qui ouvre les missions. **Rien n'est inventé côté client** : les actes, leur objectif,
 * leur récompense viennent du bloc `game` ; l'acte remplaçant et le contenu de l'Offrande n'existent qu'une fois la
 * passerelle les a tirés. Pendant l'ouverture, l'Offrande s'annonce « en cours » — jamais un contenu deviné.
 */
@Composable
internal fun MissionsGestures(
    game: GameBlock,
    gestures: GameGesturesUiState,
    onReroll: (String) -> Unit,
    onClaim: () -> Unit,
    onPhotoMission: ((GameMission) -> Unit)? = null,
) {
    val missions = game.missions
    GameCard(title = stringResource(R.string.game_missions_title)) {
        if (!missions.unlocked) {
            GameNote(gameString(GameCopyLaws.missionsLocked(game.level.shown.level)))
            return@GameCard
        }
        val timezone = gestures.accountTimezone
        val dayWindow = remember(missions.dayKey, timezone) { MissionWindow.ofDay(missions.dayKey, timezone) }
        val now by rememberMissionNow(dayWindow)
        if (missions.prismDay) GameNote(stringResource(R.string.game_missions_prism_day))
        game.boosts.prismHour?.let { hour ->
            val locale = currentLocale()
            GameNote(stringResource(R.string.game_missions_prism_hour, clockText(hour.startMinute, locale), clockText(hour.endMinute, locale)))
        }
        val rerollSpend = GameSpend.preview(held = game.treasury.held.toLong(), cost = GameMissionLaws.REROLL_PRICE.toLong())
        missions.items.forEach { mission ->
            MissionRow(
                mission = mission,
                window = dayWindow,
                personal = false,
                canReroll = missions.rerollAvailable,
                pending = gestures.rerollingMissionId == mission.id,
                busy = gestures.rerollingMissionId != null,
                online = gestures.online,
                affordable = rerollSpend.affordable,
                onReroll = onReroll,
            )
        }
        missions.personal?.let { personal ->
            MissionRow(
                mission = personal.mission,
                window = remember(personal.startsAt, personal.endsAt) { MissionWindow.of(personal) },
                personal = true,
                canReroll = false,
                pending = false,
                busy = gestures.rerollingMissionId != null,
                online = gestures.online,
                affordable = rerollSpend.affordable,
                onReroll = onReroll,
                onPhoto = onPhotoMission,
            )
        }
        if (GameMissionCardLaws.rerollRowShown(missions, timezone, rerollSpend.affordable, now)) {
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                GameNote(stringResource(R.string.game_mission_reroll, meeshes(GameMissionLaws.REROLL_PRICE.toLong())))
                SpendRow(rerollSpend, { meeshes(it) }, { stringResource(R.string.game_spend_missing_reroll, it) })
            }
        }
        GameErrorLine(gestureMessage(gestures.failures[GameGesture.Reroll]))
        if (!gestures.online) GameNote(stringResource(R.string.game_missions_offline))
        ChestCard(
            chest = game.chest,
            served = gestures.chestReward,
            opening = gestures.chestOpening,
            online = gestures.online,
            failure = gestures.failures[GameGesture.Chest],
            starFragments = game.starFragments,
            doneMissions = missions.items.count { it.isCompleted },
            totalMissions = missions.items.size,
            onClaim = onClaim,
        )
    }
}

/**
 * L'heure de la carte : le minuteur est CALME (heures et minutes, jamais de secondes), donc une mise à jour par minute
 * tant qu'il reste plus d'une heure, plus serrée ensuite, et à l'heure une fois la plage passée.
 */
@Composable
private fun rememberMissionNow(window: MissionWindow): State<Long> =
    produceState(System.currentTimeMillis(), window) {
        while (true) {
            kotlinx.coroutines.delay(GameMissionCardLaws.refreshDelayMillis(window, value))
            value = System.currentTimeMillis()
        }
    }

/** Une heure du jour, écrite par la locale (chiffres et 12 h / 24 h de l'appareil), jamais à la main. */
internal fun clockText(minuteOfDay: Int, locale: Locale): String =
    LocalTime.ofSecondOfDay((minuteOfDay.coerceIn(0, MINUTES_PER_DAY - 1) * SECONDS_PER_MINUTE).toLong())
        .format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale))

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MissionRow(
    mission: GameMission,
    window: MissionWindow,
    personal: Boolean,
    canReroll: Boolean,
    pending: Boolean,
    busy: Boolean,
    online: Boolean,
    affordable: Boolean,
    onReroll: (String) -> Unit,
    onPhoto: ((GameMission) -> Unit)? = null,
) {
    val tokens = MeeshyTheme.tokens
    val reduce = LocalReduceMotion.current
    val done = mission.isCompleted
    val title = gameString(GameMissionTitles.title(mission.templateKey, mission.target))
    val now by rememberMissionNow(window)
    val phase = window.phase(completed = done, nowMillis = now)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(tokens.textMuted.copy(alpha = ROW_ALPHA))
            .padding(MeeshySpacing.md)
            .graphicsLayer { alpha = if (pending) PENDING_ALPHA else 1f }
            .animateContentSize(animationSpec = if (reduce) snap() else spring(stiffness = ROW_STIFFNESS)),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            if (personal) GameChip(stringResource(R.string.game_mission_personal), tint = MeeshyPalette.Indigo500)
            GameChip(
                gameString(GameCopyLaws.difficultyName(mission.difficulty)),
                tint = if (mission.difficulty == MissionDifficulty.Gold) MeeshyPalette.Warning else MeeshyPalette.Indigo500,
            )
            if (mission.prism) GameChip(stringResource(R.string.game_mission_prism))
            when {
                phase == MissionPhase.Finished -> GameChip(stringResource(R.string.game_mission_finished), tint = MeeshyPalette.Success)
                phase == MissionPhase.Missed -> GameChip(stringResource(R.string.game_mission_missed), tint = MeeshyPalette.Warning)
                done -> GameChip(stringResource(R.string.game_mission_done), tint = MeeshyPalette.Success)
            }
        }
        Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary)
        GameProgressBar(
            value = if (mission.target > 0) mission.progress.toFloat() / mission.target else 0f,
            tint = if (done) MeeshyPalette.Success else MeeshyPalette.Indigo500,
            label = title,
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            Text(
                progressLine(mission),
                Modifier.weight(1f),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Medium,
                color = tokens.textMuted,
            )
            if (GameMissionCardLaws.rerollButtonShown(canReroll, done, phase)) {
                RerollButton(title, enabled = online && !busy && affordable, onClick = { onReroll(mission.id) })
            }
            if (personal && done && onPhoto != null) PhotoButton(title, onClick = { onPhoto(mission) })
        }
        missionTimerLine(phase, window.takeIf { personal })?.let { line ->
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
                Icon(MeeshyIcons.Timer, contentDescription = null, tint = tokens.textMuted, modifier = Modifier.size(TIMER_ICON))
                Text(line, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = tokens.textMuted)
            }
        }
    }
}

/**
 * La ligne du minuteur (iOS `GameCopy.missionTimerLine`) : « Il reste 1 h 23 min » pendant la plage, « Commence dans
 * 12 min » avant, et pour la mission personnelle la plage elle-même (« 14:00 – 16:00 ») une fois passée. `null` quand
 * rien n'est à dire.
 */
@Composable
private fun missionTimerLine(phase: MissionPhase?, window: MissionWindow?): String? = when (phase) {
    is MissionPhase.Running -> stringResource(R.string.game_mission_timer_remaining, calmText(GameMissionClock.calmDuration(phase.remainingMillis)))
    is MissionPhase.Upcoming -> stringResource(R.string.game_mission_timer_starts, calmText(GameMissionClock.calmDuration(phase.startsInMillis)))
    MissionPhase.Finished, MissionPhase.Missed -> windowRange(window)
    MissionPhase.Done, null -> null
}

/** Une durée CALME : des jours et des heures, puis des heures et des minutes, puis des minutes — jamais de secondes. */
@Composable
private fun calmText(duration: CalmDuration): String = when (duration) {
    is CalmDuration.DaysHours -> stringResource(R.string.game2_duration_days_hours, count(duration.days), count(duration.hours))
    is CalmDuration.Hours -> {
        val head = stringResource(R.string.game2_duration_hours, count(duration.hours))
        if (duration.minutes == 0) head else head + " " + stringResource(R.string.game2_duration_minutes, count(duration.minutes))
    }
    is CalmDuration.Minutes -> stringResource(R.string.game2_duration_minutes, count(duration.minutes))
}

/** « 14:00 – 16:00 », écrit par la locale, dans le fuseau de l'appareil (celui de la montre que la personne lit). */
@Composable
private fun windowRange(window: MissionWindow?): String? {
    val start = window?.startMillis ?: return null
    val end = window.endMillis ?: return null
    val locale = currentLocale()
    val format = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).withZone(ZoneId.systemDefault())
    return format.format(Instant.ofEpochMilli(start)) + " – " + format.format(Instant.ofEpochMilli(end))
}

/** La mission personnelle accomplie se photographie : sa carte grave le pseudo gratté. */
@Composable
private fun PhotoButton(missionTitle: String, onClick: () -> Unit) {
    val spoken = stringResource(R.string.game_photo_offer_start) + " — " + missionTitle
    GameBounceButton(onClick = onClick) {
        Box(
            Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(MeeshyPalette.Indigo500.copy(alpha = CAPSULE_ALPHA))
                .semantics { contentDescription = spoken },
            contentAlignment = Alignment.Center,
        ) {
            Icon(MeeshyIcons.Camera, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(TIMER_ICON * 2))
        }
    }
}

@Composable
private fun progressLine(mission: GameMission): String {
    val current = count(minOf(mission.progress, mission.target))
    val target = count(mission.target)
    val reward = "+" + points(mission.reward)
    return if (mission.glory > 0) {
        stringResource(R.string.game_mission_progress_glory, current, target, reward, count(mission.glory))
    } else {
        stringResource(R.string.game_mission_progress, current, target, reward)
    }
}

/** « Changer · 1 Meesh » : une capsule de 44 dp, grisée hors ligne, en vol ou faute de Meesh. */
@Composable
private fun RerollButton(missionTitle: String, enabled: Boolean, onClick: () -> Unit) {
    val price = meeshes(GameMissionLaws.REROLL_PRICE.toLong())
    val spoken = stringResource(R.string.game_mission_reroll_a11y, missionTitle, price)
    GameBounceButton(onClick = { if (enabled) onClick() }) {
        Box(
            Modifier
                .heightIn(min = 44.dp)
                .clip(RoundedCornerShape(MeeshyRadius.lg))
                .background(MeeshyPalette.Indigo500.copy(alpha = if (enabled) CAPSULE_ALPHA else CAPSULE_ALPHA / 2))
                .padding(horizontal = MeeshySpacing.md)
                .semantics { contentDescription = spoken },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                stringResource(R.string.game_mission_reroll, price),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyPalette.Indigo500.copy(alpha = if (enabled) 1f else DISABLED_INK),
            )
        }
    }
}

// MARK: - L'Offrande

@Composable
private fun ChestCard(
    chest: GameChest,
    served: DailyChest?,
    opening: Boolean,
    online: Boolean,
    failure: GameGestureFailure?,
    starFragments: StarFragmentsTotal?,
    doneMissions: Int,
    totalMissions: Int,
    onClaim: () -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    val reward = chest.reward ?: served
    val phase = ChestPhase.of(chest.status, opening, hasReward = reward != null)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(MeeshyPalette.Warning.copy(alpha = ROW_ALPHA))
            .padding(MeeshySpacing.md),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        ChestStage(reward = reward, isOpen = phase == ChestPhase.Opening || phase == ChestPhase.Claimed)
        Text(stringResource(R.string.game_chest_title), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = tokens.textPrimary)
        when (phase) {
            ChestPhase.Locked -> {
                GameNote(stringResource(R.string.game_chest_locked), Modifier.fillMaxWidth(), tone = null)
                GameChip(stringResource(R.string.game_concept_fact_done) + " · " + count(doneMissions) + " / " + count(totalMissions))
            }
            ChestPhase.Opening -> GameNote(stringResource(R.string.game_chest_opening))
            ChestPhase.Ready -> GameActionButton(
                title = stringResource(R.string.game_chest_open),
                onClick = onClaim,
                enabled = online,
                tint = MeeshyPalette.Warning,
                ink = MeeshyPalette.Indigo950,
            )
            ChestPhase.Claimed -> GameNote(stringResource(R.string.game_chest_claimed))
        }
        starFragments?.let {
            val one = it.collected == 1
            GameNote(
                stringResource(if (one) R.string.game_starFragments_one else R.string.game_starFragments_other, count(it.collected)),
                Modifier.fillMaxWidth(),
            )
        }
        if (phase != ChestPhase.Opening) GameErrorLine(gestureMessage(failure))
    }
}

/**
 * L'Offrande et ce qui en sort : le coffre s'ouvre en rebondissant, puis les récompenses se posent AU-DESSUS, une par
 * une, une tape haptique chacune. Le contenu est celui que la passerelle a rendu. Une Offrande déjà ouverte à
 * l'arrivée sur l'écran montre son contenu d'un coup, sans rejouer la scène ; sous « réduire les animations », tout
 * paraît à l'instant.
 */
@Composable
private fun ChestStage(reward: DailyChest?, isOpen: Boolean) {
    val reduce = LocalReduceMotion.current
    val haptics = rememberGameHaptics()
    val lines = reward?.let(GameChestLines::of).orEmpty()
    var arrivedRewarded by remember { mutableStateOf(reward != null) }
    var shown by remember { mutableIntStateOf(if (reward != null) lines.size else 0) }
    val bounce = remember { Animatable(1f) }

    LaunchedEffect(reward) {
        if (reward == null) {
            shown = 0
            arrivedRewarded = false
            return@LaunchedEffect
        }
        if (arrivedRewarded || reduce) {
            arrivedRewarded = false
            shown = lines.size
            return@LaunchedEffect
        }
        haptics.play(GameHapticPattern.chest(rewards = lines.size))
        bounce.snapTo(OPEN_FROM)
        bounce.animateTo(1f, spring(dampingRatio = OPEN_DAMPING, stiffness = OPEN_STIFFNESS))
        shown = 0
        repeat(lines.size) {
            delay(REWARD_STEP_MILLIS)
            shown += 1
        }
    }

    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        lines.take(shown).forEach { line ->
            Text(
                chestLineText(line),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                textAlign = TextAlign.Center,
            )
        }
        Box(Modifier.size(CHEST_SIZE).graphicsLayer { scaleX = bounce.value; scaleY = bounce.value }, contentAlignment = Alignment.Center) {
            Icon(
                if (isOpen) MeeshyIcons.Gift else MeeshyIcons.LockFilled,
                contentDescription = null,
                tint = if (isOpen) MeeshyPalette.Warning else MeeshyTheme.tokens.textMuted,
                modifier = Modifier.size(CHEST_SIZE),
            )
        }
    }
}

@Composable
private fun chestLineText(line: ChestLine): String = when (line) {
    is ChestLine.Points -> stringResource(R.string.game_chest_reward_points, points(line.amount))
    is ChestLine.Glory -> stringResource(R.string.game_chest_reward_glory, count(line.amount))
    is ChestLine.Bonus -> stringResource(
        if (line.kind == ChestBonus.Whole) R.string.game_chest_reward_bonus_whole else R.string.game_chest_reward_bonus_fifth,
        points(line.points),
    )
    ChestLine.Fragment -> stringResource(R.string.game_chest_reward_fragment)
    ChestLine.Freeze -> stringResource(R.string.game_chest_reward_freeze)
}

private const val ROW_ALPHA = 0.1f
private const val ROW_STIFFNESS = 400f
private const val MINUTES_PER_DAY = 1440
private const val SECONDS_PER_MINUTE = 60
private val TIMER_ICON = 14.dp
private const val PENDING_ALPHA = 0.6f
private const val CAPSULE_ALPHA = 0.12f
private const val DISABLED_INK = 0.5f
private const val OPEN_FROM = 0.7f
private const val OPEN_DAMPING = 0.45f
private const val OPEN_STIFFNESS = 300f
private const val REWARD_STEP_MILLIS = 300L
private val CHEST_SIZE = 56.dp
