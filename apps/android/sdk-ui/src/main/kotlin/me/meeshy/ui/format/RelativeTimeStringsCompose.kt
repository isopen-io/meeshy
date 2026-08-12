package me.meeshy.ui.format

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.ui.R

/**
 * Binds the app's localized `time_relative_*` resources to a [RelativeTimeStrings], so a
 * Composable can hand the wording to the pure [RelativeTimeFormat.short] classifier. Thin
 * resource glue only — every branch worth testing lives in the pure formatter.
 */
@Composable
fun rememberRelativeTimeStrings(): RelativeTimeStrings = RelativeTimeStrings(
    now = stringResource(R.string.time_relative_now),
    secondsAgo = stringResource(R.string.time_relative_seconds),
    minutesAgo = stringResource(R.string.time_relative_minutes),
    hoursAgo = stringResource(R.string.time_relative_hours),
    daysAgo = stringResource(R.string.time_relative_days),
    weeksAgo = stringResource(R.string.time_relative_weeks),
    monthsAgo = stringResource(R.string.time_relative_months),
)
