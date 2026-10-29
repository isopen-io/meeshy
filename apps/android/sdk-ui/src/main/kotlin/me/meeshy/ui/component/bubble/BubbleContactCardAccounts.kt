package me.meeshy.ui.component.bubble

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.user.ContactCardMeeshyAccount
import me.meeshy.ui.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshySpacing

/**
 * **Qui, parmi les contacts d'une carte de visite, est sur Meeshy** (miroir du compte principal de `ContactCardView`,
 * iOS). L'hôte du fil le fournit à toutes les bulles ; une bulle ne pose JAMAIS la question à un service.
 *
 * - [cached] répond sans attendre ni réseau (une bulle qui revient à l'écran s'affiche d'emblée) ;
 * - [lookup] n'est appelée que pour une carte que le fil a DÉJÀ téléchargée, et rend « rien » hors d'une conversation
 *   en clair (échec fermé, #13622). L'adresse SERVIE d'une pièce n'est jamais lue, même `content://` ou `file://` : elle
 *   viendrait du serveur, et désignerait un fichier de l'appareil (le carnet d'adresses, un fichier privé).
 */
@Stable
public interface BubbleContactCardAccounts {
    public fun cached(file: BubbleFile): ContactCardMeeshyAccount?

    public suspend fun lookup(file: BubbleFile): ContactCardMeeshyAccount?

    public companion object {
        /** Aucun hôte ne le fournit (aperçu, hub, témoin) : la rangée n'apparaît jamais. */
        public val None: BubbleContactCardAccounts = object : BubbleContactCardAccounts {
            override fun cached(file: BubbleFile): ContactCardMeeshyAccount? = null
            override suspend fun lookup(file: BubbleFile): ContactCardMeeshyAccount? = null
        }
    }
}

public val LocalBubbleContactCardAccounts = compositionLocalOf { BubbleContactCardAccounts.None }

/**
 * Faut-il même demander ? Une carte que le fil n'a pas téléchargée, ou que sa conversation interdit de résoudre, ne
 * fait AUCUN appel : ni lecture, ni requête. Pur, donc testé sans écran.
 */
internal fun BubbleFile.asksForMeeshyAccount(isDownloaded: Boolean): Boolean =
    isContactCard && !isSealed && contactScope.mayResolveOnServer && isDownloaded

/**
 * Le compte Meeshy de la carte, tant que la bulle est composée. Clés STABLES (l'identifiant de la pièce et le fait
 * qu'elle soit prête) : un défilement ou une recomposition ne relance rien, et une bulle qui revient s'affiche avec
 * le compte déjà connu. Un hôte qui change (portée fermée) repose la question : la rangée d'avant ne survit pas.
 */
@Composable
internal fun rememberMeeshyAccount(file: BubbleFile, isDownloaded: Boolean): ContactCardMeeshyAccount? {
    val accounts = LocalBubbleContactCardAccounts.current
    val asks = file.asksForMeeshyAccount(isDownloaded)
    val initial = remember(accounts, file.attachmentId, asks) { if (asks) accounts.cached(file) else null }
    val account by produceState(initial, accounts, file.attachmentId, asks) {
        value = if (asks) accounts.cached(file) ?: accounts.lookup(file) else null
    }
    return account
}

/** Ce que TalkBack dit de la carte entière : la rangée « Sur Meeshy » se lit avec elle, pas à part. */
@Composable
internal fun meeshyAccountSpoken(account: ContactCardMeeshyAccount?): String? =
    account?.let { stringResource(R.string.bubble_contact_card_a11y_on_meeshy, it.displayName) }

/** La rangée « Sur Meeshy » sous une carte de visite : le visage et le nom de l'inscrit, ou rien. */
@Composable
internal fun BubbleMeeshyAccountRow(account: ContactCardMeeshyAccount?, onColor: Color) {
    AnimatedVisibility(
        visible = account != null,
        enter = fadeIn(MeeshyMotion.springDefault()) + expandVertically(MeeshyMotion.springDefault()),
        exit = fadeOut(MeeshyMotion.springDefault()) + shrinkVertically(MeeshyMotion.springDefault()),
    ) {
        val shown = remember(account) { account }
        if (shown == null) return@AnimatedVisibility
        val label = stringResource(R.string.bubble_contact_card_on_meeshy)
        Row(
            modifier = Modifier
                .padding(top = MeeshySpacing.xs)
                .heightIn(min = 32.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            MeeshyAvatar(name = shown.displayName, size = 28.dp, imageUrl = shown.avatarUrl)
            Column {
                Text(label, style = MaterialTheme.typography.labelSmall, color = onColor.copy(alpha = 0.7f), maxLines = 1)
                Text(
                    shown.displayName,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = onColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
