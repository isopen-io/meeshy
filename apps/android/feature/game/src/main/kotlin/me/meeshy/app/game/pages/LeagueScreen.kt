package me.meeshy.app.game.pages

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.game.GameErrorMessages
import me.meeshy.app.game.GameMissionTitles
import me.meeshy.app.game.gameString
import me.meeshy.app.game.progression.ProgressionNoticeView
import me.meeshy.app.game.progression.ProgressionViewModel
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.game.DuoBlockStatus
import me.meeshy.sdk.model.game.DuoActor
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameDuo
import me.meeshy.sdk.model.game.GameDuoBlock
import me.meeshy.sdk.model.game.GameLeague
import me.meeshy.sdk.model.game.GameLeagueBlock
import me.meeshy.sdk.model.game.LeagueAccess
import me.meeshy.sdk.model.game.LeagueFriendsEntry
import me.meeshy.sdk.model.game.LeagueFriendsResponse
import me.meeshy.sdk.model.game.pages.GameLeagueRules
import me.meeshy.sdk.model.game.pages.GameWeekClock
import me.meeshy.sdk.model.game.pages.LeagueStandings
import me.meeshy.sdk.model.game.progression.ProgressionNotice
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.motion.staggeredAppear
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private enum class LeagueTab { Mine, Friends }

/**
 * LA PAGE « JOUTE » (iOS `GameLeaguePage`) — la ligue publique, la ligue entre amis, l'alliance. Une page dédiée du
 * hub, atteinte depuis la fiche du concept : retour, titre, hors-ligne dit.
 *
 * CACHE-FIRST. Le bloc `game` vient du cache de la progression (la même clé que le hub : aucune requête de plus à
 * l'ouverture) ; le classement et la ligue Amis sont des lectures à part, servies depuis leur cache disque dès qu'il
 * existe et rafraîchies en silence. Un squelette ne paraît que sur un cache VIDE.
 *
 * Le classement public est servi SOUS PSEUDONYMES et figé à 4 h : aucune ligne n'a d'avatar ni de présence. La ligue
 * Amis, restreinte aux amis acceptés, est le seul endroit où un classement porte des identités — avatars et présence
 * y sont ceux que la passerelle sert, rien de plus. La liste est paresseuse, ses lignes à clé stable : un rang qui
 * change se déplace en glissant.
 */
@Composable
fun LeagueScreen(
    onBack: () -> Unit,
    progressionViewModel: ProgressionViewModel = hiltViewModel(),
    viewModel: LeagueViewModel = hiltViewModel(),
    arrangement: GameArrangementViewModel = hiltViewModel(),
) {
    val progression by progressionViewModel.state.collectAsStateWithLifecycle()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val writes by arrangement.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf(LeagueTab.Mine) }
    val game = progression.snapshot?.game
    val league = game?.league
    val offline = progression.plan.notices.any { it is ProgressionNotice.Offline }

    LaunchedEffect(tab, league?.access) {
        viewModel.wantWeek(tab == LeagueTab.Mine && league?.access == LeagueAccess.Open)
        viewModel.wantFriends(tab == LeagueTab.Friends)
    }

    GameListPageScaffold(
        title = stringResource(R.string.game2_league_title),
        onBack = onBack,
        isRefreshing = progression.isRefreshing,
        onRefresh = {
            progressionViewModel.refresh()
            if (tab == LeagueTab.Mine) viewModel.retryWeek() else viewModel.retryFriends()
        },
    ) {
        item(key = "notices") {
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                progression.plan.notices.filterNot { it == ProgressionNotice.Empty }.forEach {
                    ProgressionNoticeView(it, onRetry = progressionViewModel::refresh)
                }
            }
        }
        if (game == null) {
            item(key = "base") {
                if (progression.plan.showsSkeleton) GameRowsSkeleton(rows = 4) else if (progression.snapshot != null) {
                    GameCard { GameNote(stringResource(R.string.game2_unavailable)) }
                }
            }
            return@GameListPageScaffold
        }
        if (league == null) {
            item(key = "unavailable") { GameCard { GameNote(stringResource(R.string.game2_unavailable)) } }
            return@GameListPageScaffold
        }
        item(key = "tabs") { LeagueTabs(tab) { tab = it } }
        when (tab) {
            LeagueTab.Mine -> mineSection(game, league, state, offline, viewModel, writes, arrangement)
            LeagueTab.Friends -> friendsSection(state, viewModel)
        }
        game.duo?.let { duo ->
            item(key = "duo") { DuoCard(duo, levelRecord = game.level.shown.record, writes = writes, arrangement = arrangement, modifier = animateRow()) }
        }
    }
}

@Composable
private fun LeagueTabs(selected: LeagueTab, onSelect: (LeagueTab) -> Unit) {
    val haptics = rememberMeeshyHaptics()
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        listOf(
            LeagueTab.Mine to R.string.game2_league_tab_mine,
            LeagueTab.Friends to R.string.game2_league_tab_friends,
        ).forEach { (tab, label) ->
            val on = tab == selected
            Box(
                Modifier
                    .weight(1f)
                    .heightIn(min = 44.dp)
                    .clip(RoundedCornerShape(MeeshyRadius.md))
                    .background(if (on) MeeshyPalette.Indigo500.copy(alpha = TAB_ALPHA) else MeeshyTheme.tokens.backgroundSecondary)
                    .semantics { this.selected = on }
                    .clickable(role = Role.Tab) {
                        if (!on) {
                            haptics.light()
                            onSelect(tab)
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    stringResource(label),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = if (on) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textPrimary,
                )
            }
        }
    }
}

// MARK: - Ma ligue : les quatre états que la passerelle sert

private fun LazyListScope.mineSection(
    game: GameBlock,
    league: GameLeagueBlock,
    state: LeagueUiState,
    offline: Boolean,
    viewModel: LeagueViewModel,
    writes: GameArrangementUiState,
    arrangement: GameArrangementViewModel,
) {
    when (league.access) {
        LeagueAccess.Locked -> item(key = "locked") {
            GameCard(title = stringResource(R.string.game2_league_title)) {
                GameNote(
                    stringResource(
                        R.string.game2_league_locked,
                        count(GameLeague.MIN_LEVEL),
                        count(game.level.shown.record),
                    ),
                )
            }
        }
        LeagueAccess.Minor -> item(key = "minor") {
            GameCard(title = stringResource(R.string.game2_league_title)) { GameNote(stringResource(R.string.game2_league_minor)) }
        }
        LeagueAccess.ConsentRequired -> item(key = "consent") {
            ConsentCard(state, offline, onAccept = { viewModel.setConsent(true) })
        }
        LeagueAccess.Open -> {
            item(key = "placed") { PlacedCard(league) }
            standingsSection(state, viewModel)
            item(key = "account") { AccountCard(league, state, offline, writes, arrangement, onLeave = { viewModel.setConsent(false) }) }
        }
    }
}

@Composable
private fun ConsentCard(state: LeagueUiState, offline: Boolean, onAccept: () -> Unit) {
    GameCard(title = stringResource(R.string.game2_league_consent_title)) {
        listOf(
            R.string.game2_league_consent_shown,
            R.string.game2_league_consent_who,
            R.string.game2_league_consent_how,
            R.string.game2_league_consent_risk,
            R.string.game2_league_consent_withdraw_info,
        ).forEach { GameNote(stringResource(it)) }
        GameNote(stringResource(R.string.game2_league_pseudonym_drawn))
        GameErrorLine(consentMessage(state.consentRefusal))
        GameActionButton(
            title = stringResource(R.string.game2_league_consent_accept),
            busy = state.consentBusy,
            enabled = !offline,
            onClick = onAccept,
        )
        GameOfflineNote(online = !offline)
    }
}

@Composable
private fun consentMessage(refusal: ConsentRefusal?): String? {
    val resources = LocalContext.current.resources
    return when (refusal) {
        null -> null
        ConsentRefusal.Offline -> stringResource(R.string.game2_offline_action)
        is ConsentRefusal.Code -> GameErrorMessages.message(resources, refusal.wire)
    }
}

@Composable
private fun PlacedCard(league: GameLeagueBlock) {
    val title = stringResource(R.string.game2_league_title) + " · " +
        stringResource(R.string.game2_league_week, weekDateLabel(league.weekKey, currentLocale()))
    GameCard(title = title) {
        val current = league.current
        if (current == null) {
            GameNote(stringResource(R.string.game2_league_waiting))
            return@GameCard
        }
        val now by rememberMinuteClock()
        val closes = stringResource(R.string.game2_league_closes, durationText(GameWeekClock.remaining(league.closes, now)))
        val name = stringResource(leagueNameRes(current.league))
        val rankLine = stringResource(R.string.game2_league_rank_line, count(current.rank), count(current.groupSize))
        val zone = stringResource(zoneRes(current.zone))
        Row(
            Modifier.semantics(mergeDescendants = true) { },
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LeagueGem(current.league, 64.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                Text(name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MeeshyTheme.tokens.textPrimary)
                Text(rankLine, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary)
                Text(
                    "$zone · ${gapText(current)}",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Medium,
                    color = zoneColor(current.zone),
                )
                GameNote(closes)
            }
        }
    }
}

private fun LazyListScope.standingsSection(state: LeagueUiState, viewModel: LeagueViewModel) {
    item(key = "standings-title") {
        Text(
            stringResource(R.string.game2_league_tab_mine).uppercase(),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textMuted,
        )
    }
    val board = state.week
    val served = board.value
    when {
        served != null && served.entries.isEmpty() -> item(key = "standings-empty") { GameNote(stringResource(R.string.game2_league_empty)) }
        served != null -> {
            val rows = LeagueStandings.rows(served.entries)
            items(rows, key = { "row-${it.entry.rank}" }) { row ->
                Column(animateRow()) {
                    if (row.opensZone) ZoneLabel(row.entry.zone)
                    LeagueStandingRow(row.entry)
                }
            }
        }
        board.showsSkeleton -> item(key = "standings-skeleton") { GameRowsSkeleton(rows = 5) }
        board.failedWithoutValue -> item(key = "standings-retry") {
            GameRetryBlock(message = stringResource(R.string.game2_unavailable), onRetry = viewModel::retryWeek)
        }
    }
    item(key = "standings-snapshot") { GameNote(stringResource(R.string.game2_league_snapshot)) }
}

@Composable
private fun AccountCard(
    league: GameLeagueBlock,
    state: LeagueUiState,
    offline: Boolean,
    writes: GameArrangementUiState,
    arrangement: GameArrangementViewModel,
    onLeave: () -> Unit,
) {
    GameCard(title = stringResource(R.string.game2_league_pseudonym_title)) {
        league.pseudonym?.let { GameNote(stringResource(R.string.game2_league_pseudonym_current, it)) }
        if (GameLeagueRules.CHOSEN_PSEUDONYM_OPEN) PseudonymField(writes, offline, arrangement::setPseudonym)
        GameQuietButton(
            title = stringResource(R.string.game2_league_consent_leave),
            enabled = !offline && !state.consentBusy,
            destructive = true,
            onClick = onLeave,
        )
        GameErrorLine(consentMessage(state.consentRefusal))
        GameOfflineNote(online = !offline)
    }
}

// MARK: - La ligue entre amis

private fun LazyListScope.friendsSection(state: LeagueUiState, viewModel: LeagueViewModel) {
    item(key = "friends-head") {
        GameCard(title = stringResource(R.string.game2_league_friends_title)) {
            GameNote(stringResource(R.string.game2_league_friends_body))
            state.friends.value?.let { FriendsHeader(it) }
        }
    }
    val board = state.friends
    val served = board.value
    when {
        served != null -> {
            if (LeagueStandings.friendsAreAlone(served.entries.size)) {
                item(key = "friends-empty") { GameNote(stringResource(R.string.game2_league_friends_empty)) }
            }
            items(served.entries, key = { "friend-${it.userId}" }) { entry ->
                FriendRow(entry, state.directory[entry.userId], animateRow())
            }
        }
        board.showsSkeleton -> item(key = "friends-skeleton") { GameRowsSkeleton(rows = 3) }
        board.failedWithoutValue -> item(key = "friends-retry") {
            GameRetryBlock(message = stringResource(R.string.game2_unavailable), onRetry = viewModel::retryFriends)
        }
    }
}

@Composable
private fun FriendsHeader(value: LeagueFriendsResponse) {
    val now by rememberMinuteClock()
    val week = stringResource(R.string.game2_league_week, weekDateLabel(value.weekKey, currentLocale()))
    val closes = stringResource(R.string.game2_league_closes, durationText(GameWeekClock.remaining(value.closes, now)))
    GameNote("$week · $closes")
}

/** Un ami du classement : son avatar et sa présence SERVIE (jamais fabriquée), son nom, son total. */
@Composable
private fun FriendRow(entry: LeagueFriendsEntry, friend: FriendRequestUser?, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val me = stringResource(R.string.game2_league_me)
    val name = when {
        entry.isMe -> me
        else -> friend?.let(::friendName) ?: stringResource(R.string.game2_league_friends_unknown)
    }
    val total = points(entry.weekPoints)
    val rank = count(entry.rank)
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(if (entry.isMe) MeeshyPalette.Indigo500.copy(alpha = ME_ALPHA) else androidx.compose.ui.graphics.Color.Transparent)
            .padding(horizontal = MeeshySpacing.md)
            .semantics(mergeDescendants = true) { contentDescription = "$rank, $name, $total" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(rank, Modifier.size(width = 28.dp, height = 20.dp), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = tokens.textMuted)
        if (!entry.isMe) {
            MeeshyAvatar(
                name = name,
                size = 36.dp,
                imageUrl = friend?.avatar,
                presence = rememberPresence(entry.userId),
            )
        }
        Text(
            name,
            Modifier.weight(1f),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = tokens.textPrimary,
            maxLines = 1,
            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
        )
        Text(total, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary)
    }
}

private fun friendName(friend: FriendRequestUser): String =
    friend.displayName?.takeIf { it.isNotBlank() }
        ?: listOfNotNull(friend.firstName, friend.lastName).joinToString(" ").ifBlank { friend.username }

// MARK: - L'alliance (lecture)

/**
 * L'alliance de la semaine : sa mission, la part de chacun, la récompense que la passerelle sert — et les trois gestes
 * (inviter un ami, accepter, décliner ou quitter). L'identifiant de l'alliance, sa mission et la part de l'autre ne
 * naissent que chez la passerelle : pendant le vol l'écran dit « en cours », puis relit ce qu'elle sert. Hors ligne, les
 * gestes se taisent et l'écran le dit.
 */
@Composable
private fun DuoCard(
    duo: GameDuoBlock,
    levelRecord: Int,
    writes: GameArrangementUiState,
    arrangement: GameArrangementViewModel,
    modifier: Modifier = Modifier,
) {
    GameCard(title = stringResource(R.string.game2_duo_title), modifier = modifier) {
        if (!duo.unlocked) {
            GameNote(stringResource(R.string.game2_duo_locked, count(GameDuo.MIN_LEVEL), count(levelRecord)))
            return@GameCard
        }
        val partner = duo.partner?.displayName ?: stringResource(R.string.game2_league_friends_unknown)
        val duoId = duo.duoId
        val busy = ArrangementWrite.Duo in writes.busy
        when (duo.status) {
            DuoBlockStatus.Invited -> {
                GameNote(
                    if (duo.role == DuoActor.Invitee) stringResource(R.string.game2_duo_invited_invitee, partner)
                    else stringResource(R.string.game2_duo_invited_inviter, partner),
                )
                if (duo.role == DuoActor.Invitee && duoId != null) {
                    GameActionButton(
                        title = stringResource(R.string.game2_duo_accept),
                        busy = busy,
                        enabled = writes.online,
                        onClick = { arrangement.accept(duoId) },
                    )
                }
                if (duoId != null) {
                    GameQuietButton(
                        title = stringResource(if (duo.role == DuoActor.Invitee) R.string.game2_duo_decline else R.string.game2_duo_cancel),
                        enabled = writes.online && !busy,
                        destructive = true,
                        onClick = { arrangement.abandon(duoId) },
                    )
                }
            }
            DuoBlockStatus.Active, DuoBlockStatus.Completed -> {
                DuoRunning(duo, partner)
                if (duo.status == DuoBlockStatus.Active && duoId != null) {
                    GameQuietButton(
                        title = stringResource(R.string.game2_duo_abandon),
                        enabled = writes.online && !busy,
                        destructive = true,
                        onClick = { arrangement.abandon(duoId) },
                    )
                }
            }
            DuoBlockStatus.Abandoned -> DuoIdle(R.string.game2_duo_abandoned, duo, writes, arrangement)
            DuoBlockStatus.Expired -> DuoIdle(R.string.game2_duo_expired, duo, writes, arrangement)
            DuoBlockStatus.None -> DuoIdle(R.string.game2_duo_none, duo, writes, arrangement)
        }
        GameErrorLine(arrangementFailureMessage(writes.failures[ArrangementWrite.Duo]))
        GameOfflineNote(online = writes.online)
    }
}

/** Sans alliance : huit amis au plus, on invite d'un toucher, sans sélecteur à chercher. */
@Composable
private fun DuoIdle(sentence: Int, duo: GameDuoBlock, writes: GameArrangementUiState, arrangement: GameArrangementViewModel) {
    val pickLabel = stringResource(R.string.game2_duo_pick)
    GameNote(stringResource(sentence))
    if (duo.status != DuoBlockStatus.None) return
    if (writes.friends.isEmpty()) {
        GameNote(stringResource(R.string.game2_duo_no_friends))
        return
    }
    val busy = ArrangementWrite.Duo in writes.busy
    Column(
        Modifier.semantics { contentDescription = pickLabel },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        writes.friends.forEach { friend ->
            GameActionButton(
                title = stringResource(R.string.game2_duo_invite, friend.name),
                busy = busy && writes.invitingFriendId == friend.id,
                enabled = writes.online && !busy,
                onClick = { arrangement.invite(friend) },
            )
        }
    }
}

@Composable
private fun DuoRunning(duo: GameDuoBlock, partner: String) {
    val mission = duo.mission
    if (mission != null) {
        Text(
            GameMissionTitles.title(LocalContext.current.resources, mission.templateKey, mission.partTarget),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        duo.progress?.let { progress ->
            val target = maxOf(1, mission.partTarget)
            val mine = minOf(progress.mine, mission.partTarget)
            val theirs = minOf(progress.partner, mission.partTarget)
            val mineText = stringResource(R.string.game2_duo_progress_me, count(mine), count(mission.partTarget))
            val theirText = stringResource(R.string.game2_duo_progress_partner, partner, count(theirs), count(mission.partTarget))
            GameNote(mineText)
            GameProgressBar(mine.toFloat() / target, MeeshyPalette.Indigo500, mineText)
            GameNote(theirText)
            GameProgressBar(theirs.toFloat() / target, MeeshyPalette.Success, theirText)
            GameNote(stringResource(R.string.game2_duo_progress_common, count(progress.common), count(mission.commonTarget)))
        }
    }
    duo.reward?.let { reward ->
        GameNote(
            stringResource(if (reward.doubled) R.string.game2_duo_reward_doubled else R.string.game2_duo_reward, points(reward.points)),
            tone = if (reward.doubled) MeeshyPalette.Success else null,
        )
    }
    GameNote(stringResource(if (duo.status == DuoBlockStatus.Completed) R.string.game2_duo_completed else R.string.game2_duo_reward_hint))
}

private const val TAB_ALPHA = 0.14f
private const val ME_ALPHA = 0.14f

/**
 * Le champ du nom de joute choisi — FERMÉ tant que le contrat ne l'ouvre pas ([GameLeagueRules.CHOSEN_PSEUDONYM_OPEN]) :
 * le proposer ferait échouer le geste de qui le remplit. Vide ou invalide, le bouton se tait.
 */
@Composable
private fun PseudonymField(writes: GameArrangementUiState, offline: Boolean, onSave: (String) -> Unit) {
    var proposed by rememberSaveable { mutableStateOf("") }
    val trimmed = proposed.trim()
    val invalid = trimmed.isNotEmpty() && !GameLeague.isValidPseudonym(trimmed)
    OutlinedTextField(
        value = proposed,
        onValueChange = { proposed = it },
        modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp),
        singleLine = true,
        label = { Text(stringResource(R.string.game2_league_pseudonym_new)) },
        isError = invalid,
    )
    if (invalid) GameErrorLine(stringResource(R.string.game2_league_pseudonym_invalid))
    GameNote(stringResource(R.string.game2_league_pseudonym_hint_change))
    GameErrorLine(arrangementFailureMessage(writes.failures[ArrangementWrite.Pseudonym]))
    GameActionButton(
        title = stringResource(R.string.game2_league_pseudonym_save),
        busy = ArrangementWrite.Pseudonym in writes.busy,
        enabled = !offline && trimmed.isNotEmpty() && !invalid,
        onClick = { onSave(trimmed) },
    )
}
