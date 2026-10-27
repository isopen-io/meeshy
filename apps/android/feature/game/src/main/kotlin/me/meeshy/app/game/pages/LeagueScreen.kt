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
) {
    val progression by progressionViewModel.state.collectAsStateWithLifecycle()
    val state by viewModel.state.collectAsStateWithLifecycle()
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
            LeagueTab.Mine -> mineSection(game, league, state, offline, viewModel)
            LeagueTab.Friends -> friendsSection(state, viewModel)
        }
        game.duo?.takeIf { it.shownInReadOnlyPage }?.let { duo ->
            item(key = "duo") { DuoCard(duo, levelRecord = game.level.shown.record) }
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
            item(key = "account") { AccountCard(league, state, offline, onLeave = { viewModel.setConsent(false) }) }
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
private fun AccountCard(league: GameLeagueBlock, state: LeagueUiState, offline: Boolean, onLeave: () -> Unit) {
    GameCard(title = stringResource(R.string.game2_league_pseudonym_title)) {
        league.pseudonym?.let { GameNote(stringResource(R.string.game2_league_pseudonym_current, it)) }
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
 * Sans alliance cette semaine, la carte se tait : son seul contenu serait l'invitation d'un ami, un geste d'une partie
 * suivante — la page ne promet rien qu'elle ne sache faire. Verrouillée, elle dit à quel niveau elle s'ouvre.
 */
private val GameDuoBlock.shownInReadOnlyPage: Boolean get() = !unlocked || status != DuoBlockStatus.None

/**
 * L'alliance de la semaine, EN LECTURE : sa mission, la part de chacun, la récompense que la passerelle sert. Inviter,
 * accepter et quitter sont des gestes d'une partie suivante — cette carte n'en promet aucun.
 */
@Composable
private fun DuoCard(duo: GameDuoBlock, levelRecord: Int) {
    GameCard(title = stringResource(R.string.game2_duo_title)) {
        if (!duo.unlocked) {
            GameNote(stringResource(R.string.game2_duo_locked, count(GameDuo.MIN_LEVEL), count(levelRecord)))
            return@GameCard
        }
        val partner = duo.partner?.displayName ?: stringResource(R.string.game2_league_friends_unknown)
        when (duo.status) {
            DuoBlockStatus.Invited -> GameNote(
                if (duo.role == DuoActor.Invitee) stringResource(R.string.game2_duo_invited_invitee, partner)
                else stringResource(R.string.game2_duo_invited_inviter, partner),
            )
            DuoBlockStatus.Active, DuoBlockStatus.Completed -> DuoRunning(duo, partner)
            DuoBlockStatus.Abandoned -> GameNote(stringResource(R.string.game2_duo_abandoned))
            DuoBlockStatus.Expired -> GameNote(stringResource(R.string.game2_duo_expired))
            DuoBlockStatus.None -> Unit
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
