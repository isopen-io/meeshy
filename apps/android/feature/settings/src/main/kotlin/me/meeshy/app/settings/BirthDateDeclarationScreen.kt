package me.meeshy.app.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.Instant
import java.time.ZoneOffset
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.BirthDateDeclarationError
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** « Date de naissance » : declaree une seule fois, par le selecteur natif (aucune saisie libre). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BirthDateDeclarationScreen(
    onBack: () -> Unit,
    viewModel: BirthDateDeclarationViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    if (state.isPickerOpen) {
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = state.pickedUtcMillis,
            selectableDates = PastDaysOnly,
        )
        DatePickerDialog(
            onDismissRequest = { viewModel.onEvent(BirthDateDeclarationUiEvent.DismissPicker) },
            confirmButton = {
                TextButton(
                    enabled = pickerState.selectedDateMillis != null,
                    onClick = {
                        pickerState.selectedDateMillis?.let {
                            viewModel.onEvent(BirthDateDeclarationUiEvent.PickDay(it))
                        }
                    },
                ) { Text(stringResource(R.string.birth_date_confirm)) }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.onEvent(BirthDateDeclarationUiEvent.DismissPicker) }) {
                    Text(stringResource(R.string.common_cancel))
                }
            },
        ) { DatePicker(state = pickerState) }
    }

    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
                    title = { Text(stringResource(R.string.birth_date_title)) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                MeeshyIcons.Back,
                                contentDescription = stringResource(R.string.settings_back),
                            )
                        }
                    },
                )
            },
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                if (state.isDeclared) {
                    Text(
                        text = stringResource(
                            if (state.isWriteRestricted) R.string.birth_date_done_restricted else R.string.birth_date_done,
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MeeshyTheme.tokens.textPrimary,
                    )
                    Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.common_done))
                    }
                } else {
                    Text(
                        text = stringResource(R.string.birth_date_message),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MeeshyTheme.tokens.textPrimary,
                    )
                    OutlinedButton(
                        onClick = { viewModel.onEvent(BirthDateDeclarationUiEvent.OpenPicker) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(state.pickedWireDay ?: stringResource(R.string.birth_date_pick))
                    }
                    state.error?.let {
                        Text(
                            text = stringResource(it.messageRes()),
                            style = MaterialTheme.typography.bodySmall,
                            color = MeeshyPalette.Error,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    Button(
                        onClick = { viewModel.onEvent(BirthDateDeclarationUiEvent.Submit) },
                        enabled = state.canSubmit,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(stringResource(R.string.birth_date_confirm)) }
                }
            }
        }
    }
}

/** Une date de naissance n'est jamais dans le futur ; le selecteur rend minuit UTC. */
@OptIn(ExperimentalMaterial3Api::class)
private object PastDaysOnly : SelectableDates {
    override fun isSelectableDate(utcTimeMillis: Long): Boolean =
        utcTimeMillis <= Instant.now().atOffset(ZoneOffset.UTC).toLocalDate()
            .atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

    override fun isSelectableYear(year: Int): Boolean = year in 1900..Instant.now().atOffset(ZoneOffset.UTC).year
}

private fun BirthDateDeclarationError.messageRes(): Int = when (this) {
    BirthDateDeclarationError.ALREADY_SET -> R.string.birth_date_error_already_set
    BirthDateDeclarationError.BELOW_MINIMUM_AGE -> R.string.birth_date_error_below_minimum
    BirthDateDeclarationError.INVALID_DATE -> R.string.birth_date_error_invalid
    BirthDateDeclarationError.UNSUPPORTED -> R.string.birth_date_error_unsupported
    BirthDateDeclarationError.UNAVAILABLE -> R.string.birth_date_error_unavailable
}
