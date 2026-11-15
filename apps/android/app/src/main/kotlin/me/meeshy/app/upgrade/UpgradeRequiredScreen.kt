package me.meeshy.app.upgrade

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.app.R
import me.meeshy.app.onboarding.hiddenBehindOnboarding
import me.meeshy.sdk.model.net.UpgradeRequirement
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La rupture, telle qu'elle se montre (iOS `UpgradeGateView`, #13954). **Aucun bouton de fermeture, et c'est tout son
 * propos** : la passerelle refuse ce binaire, laisser croire qu'on peut « continuer quand même » ferait perdre ce que
 * l'utilisateur compose. Le retour système met l'application en arrière-plan sans rien naviguer dessous.
 *
 * Disposition iOS : le propos centré (icône, titre, message, version minimale), l'unique bouton « Mettre à jour » posé en
 * bas. TalkBack : titre (en-tête), message, version, puis le bouton ; l'icône est décorative. Le calque consomme les touches,
 * et [UpgradeGateHost] retire tout ce qui est dessous de l'arbre d'accessibilité.
 */
@Composable
fun UpgradeRequiredScreen(requirement: UpgradeRequirement, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val uriHandler = LocalUriHandler.current
    val context = LocalContext.current
    BackHandler { context.findActivity()?.moveTaskToBack(true) }
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(tokens.backgroundPrimary)
            .pointerInput(Unit) {}
            .safeDrawingPadding()
            .padding(horizontal = MeeshySpacing.xxl)
            .padding(bottom = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg, Alignment.CenterVertically),
        ) {
            Icon(
                imageVector = MeeshyIcons.ArrowCircleUpFilled,
                contentDescription = null,
                tint = MeeshyPalette.Indigo500,
                modifier = Modifier.size(64.dp),
            )
            Text(
                text = stringResource(R.string.upgrade_required_title),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = tokens.textPrimary,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = stringResource(R.string.upgrade_required_message),
                style = MaterialTheme.typography.bodyLarge,
                color = tokens.textSecondary,
                textAlign = TextAlign.Center,
            )
            requirement.shownMinVersion?.let { minVersion ->
                Text(
                    text = stringResource(R.string.upgrade_required_min_version, minVersion),
                    style = MaterialTheme.typography.labelLarge,
                    color = tokens.textSecondary,
                    textAlign = TextAlign.Center,
                )
            }
        }
        MeeshyPrimaryButton(
            text = stringResource(R.string.upgrade_required_action),
            onClick = { runCatching { uriHandler.openUri(requirement.resolvedStoreUrl) } },
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
        )
    }
}

/**
 * La porte posée sur TOUTE la racine (iOS `.fullScreenCover` sur `RootView`) : tant que le serveur refuse ce binaire, rien
 * de ce qui est dessous — navigation, bannières, parcours d'accueil, fin d'invité, appels — n'est lu par TalkBack ni
 * touché. Le contenu reste COMPOSÉ (ses brouillons et ses effets survivent), il quitte seulement l'arbre d'accessibilité.
 */
@Composable
fun UpgradeGateHost(requirement: UpgradeRequirement?, content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().hiddenBehindOnboarding(isPresented = requirement != null)) { content() }
        requirement?.let { UpgradeRequiredScreen(requirement = it) }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
