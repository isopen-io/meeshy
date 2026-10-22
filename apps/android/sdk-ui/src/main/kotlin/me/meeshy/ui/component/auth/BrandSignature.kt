package me.meeshy.ui.component.auth

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.pm.PackageManager
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.brand.BrandMarkGeometry
import me.meeshy.sdk.model.brand.BrandSignatureCopy
import me.meeshy.ui.R
import me.meeshy.ui.compatibility.versionCodeCompat
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val MARK_SIZE = 28.dp
private const val VERSION_ALPHA = 0.85f
private const val CREDIT_ALPHA = 0.7f
private const val MARK_ALPHA = 0.85f

/**
 * La signature de marque en pied d'écran (iOS `BrandSignature`) — trois lignes empilées : la
 * version « Meeshy 1.0.0 · 1 », le crédit « by services.ceo », et le logo en petit.
 *
 * Partagée par l'accueil et la connexion : changer le crédit, le style ou le logo ici change
 * tous les écrans qui la montrent. Le crédit est une MARQUE, identique dans toutes les langues,
 * et un lien : le toucher ouvre la plateforme dans le navigateur. Sa zone de toucher atteint
 * 48 dp, comme tout contrôle.
 *
 * @param versionName la version affichée ; par défaut celle du paquet installé.
 * @param buildNumber le numéro de build affiché ; par défaut celui du paquet installé.
 */
@Composable
public fun BrandSignature(
    modifier: Modifier = Modifier,
    versionName: String? = null,
    buildNumber: String? = null,
) {
    val installed = rememberInstalledBuild()
    val stamp = BrandSignatureCopy.stamp(
        version = versionName ?: installed.version,
        build = buildNumber ?: installed.build,
    )
    val tokens = MeeshyTheme.tokens
    val uriHandler = LocalUriHandler.current
    val versionDescription = stringResource(R.string.brand_signature_accessibilityLabel, stamp.version, stamp.build)
    val openCredit = stringResource(R.string.brand_signature_credit_open)

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Text(
            text = stamp.line,
            style = MaterialTheme.typography.labelSmall,
            color = tokens.textMuted.copy(alpha = tokens.textMuted.alpha * VERSION_ALPHA),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.semantics { contentDescription = versionDescription },
        )
        Text(
            text = BrandSignatureCopy.CREDIT,
            style = MaterialTheme.typography.labelSmall,
            color = tokens.textMuted.copy(alpha = tokens.textMuted.alpha * CREDIT_ALPHA),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .minimumInteractiveComponentSize()
                .clickable(onClickLabel = openCredit, role = Role.Button) {
                    openPlatform(uriHandler::openUri)
                },
        )
        Canvas(
            modifier = Modifier
                .padding(top = MeeshySpacing.xs)
                .size(MARK_SIZE)
                .clearAndSetSemantics { },
        ) {
            drawBrandDashes(
                color = MeeshyPalette.Error.copy(alpha = MARK_ALPHA),
                lineWidthPx = size.minDimension * BrandMarkGeometry.LINE_WIDTH_RATIO,
                progress = { 1f },
            )
        }
    }
}

/** Ouvre la plateforme ; sans navigateur pour la servir, le toucher ne fait rien plutôt que de planter. */
internal fun openPlatform(openUri: (String) -> Unit) {
    try {
        openUri(BrandSignatureCopy.CREDIT_URL)
    } catch (noBrowser: ActivityNotFoundException) {
        Unit
    } catch (refused: IllegalArgumentException) {
        Unit
    }
}

/** La version et le build du paquet installé — `null` quand le système ne les donne pas. */
internal data class InstalledBuild(val version: String?, val build: String?)

@Composable
private fun rememberInstalledBuild(): InstalledBuild {
    val context = LocalContext.current
    return remember(context) { readInstalledBuild(context) }
}

@Suppress("DEPRECATION")
private fun readInstalledBuild(context: Context): InstalledBuild = try {
    val info = context.packageManager.getPackageInfo(context.packageName, 0)
    InstalledBuild(
        version = info.versionName,
        build = info.versionCodeCompat().toString(),
    )
} catch (unknownPackage: PackageManager.NameNotFoundException) {
    InstalledBuild(version = null, build = null)
}
