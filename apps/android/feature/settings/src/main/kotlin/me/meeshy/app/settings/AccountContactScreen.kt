package me.meeshy.app.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.ui.component.chrome.CollapsibleHeaderPage
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.formColumnWidth

/**
 * "Change email / phone" settings screen (feature-parity §K) — port of iOS
 * `SecurityView`'s email/phone sections. Two independent sub-flows share this screen:
 * email confirms out-of-band (a link mailed to the new address — this screen never
 * collects a token, exactly like iOS); phone confirms in-app via a 6-digit SMS code.
 * Pure glue over [AccountContactViewModel]; every decision (format gating, submit
 * gating, error mapping) lives in the tested view model.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountContactScreen(
    onBack: () -> Unit,
    viewModel: AccountContactViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    MeeshyBackground {
        CollapsibleHeaderPage(
            title = stringResource(R.string.account_contact_title),
            onBack = onBack,
            titleColor = MeeshyTheme.tokens.textPrimary,
            backArrowColor = MeeshyPalette.Indigo500,
            backgroundColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .formColumnWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
            ) {
                SecurityEmailSection(state, viewModel)
                SecurityPhoneSection(state, viewModel)
                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }
}
