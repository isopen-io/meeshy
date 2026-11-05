package me.meeshy.app.calls

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.ui.component.chrome.MeeshyBackButton
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La route « Appels » : un mince habillage (barre de titre, retour, fiche de détail) autour de
 * [CallsTab], tant que le hub n'embarque pas l'onglet lui-même. Un toucher sur une ligne ouvre la
 * fiche de détail du journal ; le rappel passe par [onRedial] avec le média choisi.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CallHistoryScreen(
    onBack: () -> Unit,
    onRedial: (record: CallRecord, isVideo: Boolean) -> Unit,
    viewModel: CallHistoryViewModel = hiltViewModel(),
) {
    var detail by remember { mutableStateOf<CallRecord?>(null) }

    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    navigationIcon = { MeeshyBackButton(onClick = onBack) },
                    title = { Text(stringResource(R.string.call_history_title)) },
                )
            },
        ) { padding ->
            CallsTab(
                onOpenDetail = { detail = it },
                onRedial = onRedial,
                modifier = Modifier.fillMaxSize().padding(padding),
                viewModel = viewModel,
            )
        }
    }

    detail?.let { record ->
        CallDetailSheet(
            record = record,
            onRedial = { video ->
                detail = null
                onRedial(record, video)
            },
            onDismiss = { detail = null },
        )
    }
}
