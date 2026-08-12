package me.meeshy.ui.format

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.ui.R

/**
 * Binds the app's localized `time_relative_long_*` resources to a [RelativeTimeLongStrings], so a
 * Composable can hand the wording to the pure [RelativeTimeLongText.long] renderer. Thin resource
 * glue only — every branch worth testing lives in the pure formatter.
 */
@Composable
fun rememberRelativeTimeLongStrings(): RelativeTimeLongStrings = RelativeTimeLongStrings(
    now = stringResource(R.string.time_relative_long_now),
    yesterday = stringResource(R.string.time_relative_long_yesterday),
    secondsAgo = stringResource(R.string.time_relative_long_seconds),
    minutesAgo = stringResource(R.string.time_relative_long_minutes),
    hoursAgo = stringResource(R.string.time_relative_long_hours),
    daysAgo = stringResource(R.string.time_relative_long_days),
    weeksAgo = stringResource(R.string.time_relative_long_weeks),
    monthsAgo = stringResource(R.string.time_relative_long_months),
)
