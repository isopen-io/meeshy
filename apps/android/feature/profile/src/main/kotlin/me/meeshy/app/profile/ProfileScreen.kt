package me.meeshy.app.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.LanguageData
import androidx.compose.material3.TopAppBarDefaults
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.meeshyPresenceDotColor
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.text.DateFormat
import java.util.Date

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onBack: () -> Unit,
    onReport: (userId: String, username: String) -> Unit = { _, _ -> },
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let { snackbar.showSnackbar(it) }
    }

    MeeshyBackground {
    Scaffold(
        containerColor = Color.Transparent,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
                    scrolledContainerColor = Color.Transparent,
                    titleContentColor = MeeshyTheme.tokens.textPrimary,
                    navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                    actionIconContentColor = MeeshyPalette.Indigo500,
                ),
                title = { Text(if (state.isEditing) stringResource(R.string.profile_edit_title) else stringResource(R.string.profile_title)) },
                navigationIcon = {
                    IconButton(onClick = if (state.isEditing) viewModel::cancelEditing else onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.profile_back))
                    }
                },
                actions = {
                    when {
                        state.isEditing -> Unit
                        state.isOwnProfile -> {
                            IconButton(onClick = viewModel::startEditing) {
                                Icon(Icons.Default.Edit, contentDescription = stringResource(R.string.profile_edit))
                            }
                        }
                        else -> {
                            state.user?.let { user ->
                                IconButton(onClick = { onReport(user.id, user.username) }) {
                                    Icon(Icons.Default.Flag, contentDescription = stringResource(R.string.profile_report))
                                }
                            }
                        }
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        if (state.isLoading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(MeeshySpacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            val header = state.user?.let { ProfileHeaderBuilder.build(it, System.currentTimeMillis()) }

            // Avatar — completion ring + presence dot when viewing (not editing).
            Box(contentAlignment = Alignment.Center) {
                val user = state.user
                val avatarDescription = stringResource(R.string.profile_avatar)
                if (!state.isEditing) {
                    header?.completionPercent?.let { percent ->
                        ProfileCompletionRing(
                            percent = percent,
                            color = MeeshyPalette.Indigo500,
                            track = MeeshyTheme.tokens.backgroundTertiary,
                            modifier = Modifier.size(108.dp),
                        )
                    }
                }
                if (user?.avatar != null) {
                    AsyncImage(
                        model = user.avatar,
                        contentDescription = user.displayName ?: avatarDescription,
                        modifier = Modifier
                            .size(96.dp)
                            .clip(CircleShape),
                    )
                } else {
                    MeeshyAvatar(
                        name = user?.displayName ?: user?.username ?: "?",
                        modifier = Modifier.size(96.dp),
                    )
                }
                if (!state.isEditing) {
                    meeshyPresenceDotColor(header?.presence)?.let { dot ->
                        Surface(
                            color = dot,
                            shape = CircleShape,
                            border = BorderStroke(2.dp, MeeshyTheme.tokens.backgroundPrimary),
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .size(20.dp),
                        ) {}
                    }
                }
            }

            if (state.isEditing) {
                OutlinedTextField(
                    value = state.firstName,
                    onValueChange = viewModel::onFirstNameChange,
                    label = { Text(stringResource(R.string.profile_first_name_label)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.lastName,
                    onValueChange = viewModel::onLastNameChange,
                    label = { Text(stringResource(R.string.profile_last_name_label)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.displayName,
                    onValueChange = viewModel::onDisplayNameChange,
                    label = { Text(stringResource(R.string.profile_display_name_label)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.bio,
                    onValueChange = viewModel::onBioChange,
                    label = { Text(stringResource(R.string.profile_bio_label)) },
                    minLines = 3,
                    maxLines = 5,
                    modifier = Modifier.fillMaxWidth(),
                )
                ContentLanguageField(
                    label = stringResource(R.string.profile_system_language_label),
                    selectedCode = state.systemLanguage,
                    onSelect = viewModel::onSystemLanguageChange,
                )
                ContentLanguageField(
                    label = stringResource(R.string.profile_regional_language_label),
                    selectedCode = state.regionalLanguage,
                    onSelect = viewModel::onRegionalLanguageChange,
                )
                ContentLanguageField(
                    label = stringResource(R.string.profile_custom_language_label),
                    selectedCode = state.customDestinationLanguage,
                    onSelect = viewModel::onCustomDestinationLanguageChange,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    TextButton(onClick = viewModel::cancelEditing, modifier = Modifier.weight(1f)) {
                        Text(stringResource(R.string.profile_cancel))
                    }
                    Button(
                        onClick = viewModel::saveProfile,
                        enabled = !state.isSaving,
                        modifier = Modifier.weight(1f),
                    ) {
                        if (state.isSaving) CircularProgressIndicator(Modifier.size(20.dp))
                        else Text(stringResource(R.string.profile_save))
                    }
                }
            } else {
                Text(
                    text = header?.displayName ?: stringResource(R.string.profile_unknown),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                header?.handle?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
                header?.bio?.let {
                    Spacer(Modifier.height(4.dp))
                    Text(text = it, style = MaterialTheme.typography.bodyMedium)
                }
                if (header?.hasE2EE == true) {
                    Spacer(Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Lock,
                            contentDescription = null,
                            tint = MeeshyPalette.Indigo500,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = stringResource(R.string.profile_e2ee),
                            style = MaterialTheme.typography.labelMedium,
                            color = MeeshyPalette.Indigo500,
                        )
                    }
                }
                header?.completionPercent?.let { percent ->
                    Text(
                        text = stringResource(R.string.profile_completion, percent),
                        style = MaterialTheme.typography.labelMedium,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
                header?.memberSinceEpochMillis?.let { millis ->
                    Text(
                        text = stringResource(R.string.profile_member_since, formatMemberSince(millis)),
                        style = MaterialTheme.typography.labelMedium,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
                header?.let { ProfileDetailsSection(it) }
                state.stats?.let { ProfileStatsSection(it) }
                state.timeline?.let { ProfileTimelineSection(it) }
            }
        }
    }
    }
}

/** The read-only activity stats dashboard — counter tiles + achievement badges. */
@Composable
private fun ProfileStatsSection(stats: UserStatsPresentation) {
    if (stats.tiles.isEmpty()) return
    Spacer(Modifier.height(MeeshySpacing.md))
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            text = stringResource(R.string.profile_stats_title),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        stats.tiles.chunked(2).forEach { rowTiles ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                rowTiles.forEach { tile ->
                    StatTileView(tile, modifier = Modifier.weight(1f))
                }
                if (rowTiles.size == 1) Spacer(Modifier.weight(1f))
            }
        }

        if (stats.badges.isNotEmpty()) {
            Spacer(Modifier.height(MeeshySpacing.xs))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.profile_achievements_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                )
                Text(
                    text = stringResource(
                        R.string.profile_achievements_unlocked,
                        stats.unlockedCount,
                        stats.totalCount,
                    ),
                    style = MaterialTheme.typography.labelMedium,
                    color = MeeshyTheme.tokens.textSecondary,
                )
            }
            stats.badges.forEach { AchievementBadgeView(it) }
        }
    }
}

/** The read-only 30-day activity sparkline — accent-coherent line + area chart. */
@Composable
private fun ProfileTimelineSection(timeline: StatsTimelinePresentation) {
    if (timeline.bars.isEmpty()) return
    val accent = MeeshyPalette.Indigo500
    Spacer(Modifier.height(MeeshySpacing.md))
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.profile_activity_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = stringResource(R.string.profile_activity_average, timeline.averagePerDay),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        if (timeline.hasActivity) {
            ActivitySparkline(
                bars = timeline.bars,
                color = accent,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(80.dp),
            )
        } else {
            Text(
                text = stringResource(R.string.profile_activity_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

/**
 * A fixed-height sparkline over the per-day normalized activity. Draws a subtle
 * top-to-bottom area fill under an accent line. Pure rendering — every decision
 * (normalization, ordering, activity gating) is made upstream in
 * [StatsTimelineBuilder], so this Composable only maps `0f..1f` heights to pixels.
 */
@Composable
private fun ActivitySparkline(
    bars: List<TimelineBar>,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier) {
        val count = bars.size
        val stepX = if (count > 1) size.width / (count - 1) else 0f
        val usableHeight = size.height - 4.dp.toPx()

        fun pointAt(index: Int): Offset {
            val x = if (count > 1) stepX * index else size.width / 2f
            val y = 2.dp.toPx() + usableHeight * (1f - bars[index].normalized)
            return Offset(x, y)
        }

        val linePath = Path().apply {
            moveTo(pointAt(0).x, pointAt(0).y)
            for (i in 1 until count) lineTo(pointAt(i).x, pointAt(i).y)
        }
        val areaPath = Path().apply {
            addPath(linePath)
            lineTo(pointAt(count - 1).x, size.height)
            lineTo(pointAt(0).x, size.height)
            close()
        }

        drawPath(
            path = areaPath,
            brush = Brush.verticalGradient(
                colors = listOf(color.copy(alpha = 0.28f), color.copy(alpha = 0f)),
            ),
        )
        drawPath(
            path = linePath,
            color = color,
            style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round),
        )
    }
}

@Composable
private fun StatTileView(tile: StatTile, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        color = MeeshyTheme.tokens.backgroundTertiary,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(MeeshySpacing.md),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = tile.formattedValue,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = stringResource(statMetricLabel(tile.metric)),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

@Composable
private fun AchievementBadgeView(badge: AchievementBadge) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = badge.name,
            style = MaterialTheme.typography.bodyMedium,
            color = if (badge.isUnlocked) MeeshyTheme.tokens.textPrimary
            else MeeshyTheme.tokens.textSecondary,
            fontWeight = if (badge.isUnlocked) FontWeight.SemiBold else FontWeight.Normal,
        )
        Text(
            text = "${badge.progressPercent}%",
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

private fun statMetricLabel(metric: StatMetric): Int = when (metric) {
    StatMetric.MESSAGES -> R.string.profile_stat_messages
    StatMetric.CONVERSATIONS -> R.string.profile_stat_conversations
    StatMetric.TRANSLATIONS -> R.string.profile_stat_translations
    StatMetric.FRIEND_REQUESTS -> R.string.profile_stat_friend_requests
    StatMetric.LANGUAGES -> R.string.profile_stat_languages
    StatMetric.MEMBER_DAYS -> R.string.profile_stat_member_days
}

/** Localized medium-date label for the "member since" line. */
private fun formatMemberSince(epochMillis: Long): String =
    DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(epochMillis))

/** The read-only secondary identity rows (languages · country · timezone). */
@Composable
private fun ProfileDetailsSection(header: ProfileHeaderPresentation) {
    val rows = remember(header) { ProfileDetailRows.build(header) }
    if (rows.isEmpty()) return
    Spacer(Modifier.height(4.dp))
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        rows.forEach { row -> ProfileDetailRowView(row) }
    }
}

@Composable
private fun ProfileDetailRowView(row: ProfileDetailRow) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(profileDetailLabel(row.kind)),
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            row.flag?.let {
                Text(text = it, style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.width(6.dp))
            }
            Text(text = row.value, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

private fun profileDetailLabel(kind: ProfileDetailKind): Int = when (kind) {
    ProfileDetailKind.SYSTEM_LANGUAGE -> R.string.profile_detail_system_language
    ProfileDetailKind.REGIONAL_LANGUAGE -> R.string.profile_detail_regional_language
    ProfileDetailKind.COUNTRY -> R.string.profile_detail_country
    ProfileDetailKind.TIMEZONE -> R.string.profile_detail_timezone
}

/** A circular progress ring around the avatar showing the profile-completion percentage. */
@Composable
private fun ProfileCompletionRing(
    percent: Int,
    color: Color,
    track: Color,
    modifier: Modifier = Modifier,
) {
    val sweep = 360f * (percent.coerceIn(0, 100) / 100f)
    Canvas(modifier = modifier) {
        val stroke = Stroke(width = 4.dp.toPx(), cap = StrokeCap.Round)
        val inset = stroke.width / 2f
        val arcSize = androidx.compose.ui.geometry.Size(size.width - stroke.width, size.height - stroke.width)
        val topLeft = androidx.compose.ui.geometry.Offset(inset, inset)
        drawArc(
            color = track,
            startAngle = 0f,
            sweepAngle = 360f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = stroke,
        )
        drawArc(
            color = color,
            startAngle = -90f,
            sweepAngle = sweep,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = stroke,
        )
    }
}

/**
 * A content-language slot in the edit form. Renders the current selection as a
 * flag + name (via the `LanguageData` SSOT) in a read-only field that opens a
 * dropdown of every supported language; an unset slot shows the empty label.
 * The selected code is reported back through [onSelect] — the ViewModel owns the
 * buffer, keeping this composable a stateless projection of its argument.
 */
@Composable
private fun ContentLanguageField(
    label: String,
    selectedCode: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    val selected = LanguageData.info(selectedCode)
    val display = selected?.let { "${it.flag} ${it.name}" }
        ?: stringResource(R.string.profile_language_unset)
    Box(modifier = modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = display,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { Icon(Icons.Filled.ArrowDropDown, contentDescription = null) },
            modifier = Modifier.fillMaxWidth(),
        )
        // Transparent overlay so a tap anywhere on the field opens the menu — a
        // read-only OutlinedTextField does not emit clicks on its own.
        Box(
            modifier = Modifier
                .matchParentSize()
                .clickable { expanded = true },
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            LanguageData.allLanguagesCommonFirst.forEach { lang ->
                DropdownMenuItem(
                    text = { Text("${lang.flag} ${lang.name}") },
                    onClick = {
                        onSelect(lang.code)
                        expanded = false
                    },
                )
            }
        }
    }
}
