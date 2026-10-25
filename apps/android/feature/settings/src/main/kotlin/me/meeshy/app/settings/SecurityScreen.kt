package me.meeshy.app.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.formColumnWidth

/**
 * Page Sécurité unique (SecurityView iOS) : Mot de passe, authentification à deux
 * facteurs, E-mail, Téléphone, Mes appareils chiffrés, puis Sessions. (Conversations verrouillées s'insère entre
 * Téléphone et Sessions quand son lot est livré.) Au retour au premier plan, le statut
 * 2FA est relu et, si un e-mail est en attente, la session aussi.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SecurityScreen(
    onBack: () -> Unit,
    onOpenChangePassword: () -> Unit,
    onOpenTwoFactor: (step: String) -> Unit,
    onOpenSessions: () -> Unit,
    onOpenEncryptedDevices: () -> Unit,
    viewModel: SecurityViewModel = hiltViewModel(),
    contactViewModel: AccountContactViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val contact by contactViewModel.state.collectAsStateWithLifecycle()

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        viewModel.onEvent(SecurityUiEvent.Resumed)
        contactViewModel.onResume()
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
                    ),
                    title = { Text(stringResource(R.string.security_title)) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
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
                    .formColumnWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
            ) {
                SecuritySectionCard(Icons.Filled.Lock, stringResource(R.string.security_section_password)) {
                    SecurityLinkRow(Icons.Filled.Lock, stringResource(R.string.change_password_title), onOpenChangePassword)
                }
                SecurityTwoFactorSection(
                    status = state.twoFactor,
                    onRetry = { viewModel.onEvent(SecurityUiEvent.RetryTwoFactor) },
                    onOpen = { onOpenTwoFactor(it.arg) },
                )
                SecurityEmailSection(contact, contactViewModel)
                SecurityPhoneSection(contact, contactViewModel)
                SecuritySectionCard(MeeshyIcons.Shield, stringResource(R.string.security_section_encrypted_devices)) {
                    SecurityLinkRow(MeeshyIcons.Shield, stringResource(R.string.encrypted_devices_title), onOpenEncryptedDevices)
                }
                SecuritySectionCard(Icons.Filled.Devices, stringResource(R.string.security_section_sessions)) {
                    SecurityLinkRow(Icons.Filled.Devices, stringResource(R.string.security_sessions_manage), onOpenSessions)
                }
                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }
}

@Composable
private fun SecurityLinkRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clickable(role = Role.Button) {
                haptics.light()
                onClick()
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SecurityFieldIcon(icon)
        Spacer(Modifier.size(MeeshySpacing.sm))
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f),
        )
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textMuted,
        )
    }
}
