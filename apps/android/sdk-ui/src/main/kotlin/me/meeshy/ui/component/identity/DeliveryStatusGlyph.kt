package me.meeshy.ui.component.identity

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import me.meeshy.sdk.model.DeliveryStatusResolver
import me.meeshy.sdk.model.DeliveryTier
import me.meeshy.sdk.model.SendLifecycle
import me.meeshy.sdk.model.SendLifecycleResolver
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette

/** Les huit états de livraison de l'en-tête d'identité (iOS `MeeshyMessage.DeliveryStatus`). */
public enum class IdentityDeliveryStatus {
    Sending, Invisible, Clock, Slow, Sent, Delivered, Read, Failed;

    public companion object {
        /** Au-delà de ce délai sans acquittement, l'envoi est « lent » (iOS : 5 s). */
        public const val SLOW_AFTER_MILLIS: Long = 5_000L

        /**
         * Compose l'état depuis le cycle d'envoi ([SendLifecycleResolver]) puis, une fois acquitté, le
         * palier de [DeliveryStatusResolver] ([tier]). Hors ligne = file d'attente ([Sending]) ; en ligne,
         * invisible avant 200 ms, horloge jusqu'à 5 s, puis lent.
         */
        public fun resolve(
            tier: DeliveryTier,
            isPending: Boolean,
            isFailed: Boolean,
            isOffline: Boolean,
            sendStartedAtMillis: Long?,
            nowMillis: Long,
        ): IdentityDeliveryStatus = when (SendLifecycleResolver.resolve(isPending, isFailed, isOffline)) {
            SendLifecycle.Failed -> Failed
            SendLifecycle.QueuedOffline -> Sending
            SendLifecycle.InFlight -> when {
                !SendLifecycleResolver.shouldRevealSendingGlyph(sendStartedAtMillis, nowMillis) -> Invisible
                sendStartedAtMillis != null && nowMillis - sendStartedAtMillis >= SLOW_AFTER_MILLIS -> Slow
                else -> Clock
            }
            SendLifecycle.Settled -> when (tier) {
                DeliveryTier.Sent -> Sent
                DeliveryTier.Delivered -> Delivered
                DeliveryTier.Read -> Read
            }
        }
    }
}

public enum class DeliveryGlyph { None, Clock, Check, DoubleCheck, DoubleCheckBold, ErrorCircle }

/** La teinte du glyphe : secondaire du contexte, atténuée, alerte, accusé de lecture, erreur. */
public enum class DeliveryTone { Secondary, SecondaryFaded, Warning, Read, Error }

public data class DeliveryGlyphSpec(val glyph: DeliveryGlyph, val tone: DeliveryTone)

/** La table statut -> glyphe (iOS `UserIdentityBar.deliveryView`). */
public object DeliveryStatusGlyph {
    public fun of(status: IdentityDeliveryStatus): DeliveryGlyphSpec = when (status) {
        IdentityDeliveryStatus.Sending -> DeliveryGlyphSpec(DeliveryGlyph.Clock, DeliveryTone.Secondary)
        IdentityDeliveryStatus.Invisible -> DeliveryGlyphSpec(DeliveryGlyph.None, DeliveryTone.Secondary)
        IdentityDeliveryStatus.Clock -> DeliveryGlyphSpec(DeliveryGlyph.Clock, DeliveryTone.SecondaryFaded)
        IdentityDeliveryStatus.Slow -> DeliveryGlyphSpec(DeliveryGlyph.Clock, DeliveryTone.Warning)
        IdentityDeliveryStatus.Sent -> DeliveryGlyphSpec(DeliveryGlyph.Check, DeliveryTone.Secondary)
        IdentityDeliveryStatus.Delivered -> DeliveryGlyphSpec(DeliveryGlyph.DoubleCheck, DeliveryTone.Secondary)
        IdentityDeliveryStatus.Read -> DeliveryGlyphSpec(DeliveryGlyph.DoubleCheckBold, DeliveryTone.Read)
        IdentityDeliveryStatus.Failed -> DeliveryGlyphSpec(DeliveryGlyph.ErrorCircle, DeliveryTone.Error)
    }
}

/**
 * Le glyphe de livraison. [secondary] est la couleur méta du contexte ([tinted] = bulle sortante teintée :
 * « lu » passe alors en blanc plein pour trancher avec « remis », qui réutilise déjà la teinte).
 */
@Composable
public fun DeliveryStatusGlyphView(
    status: IdentityDeliveryStatus,
    secondary: Color,
    tinted: Boolean,
    modifier: Modifier = Modifier,
) {
    val spec = DeliveryStatusGlyph.of(status)
    val vector = when (spec.glyph) {
        DeliveryGlyph.None -> return
        DeliveryGlyph.Clock -> MeeshyIcons.ScheduleFilled
        DeliveryGlyph.Check -> MeeshyIcons.Done
        DeliveryGlyph.DoubleCheck, DeliveryGlyph.DoubleCheckBold -> MeeshyIcons.DoneAll
        DeliveryGlyph.ErrorCircle -> MeeshyIcons.ErrorFilled
    }
    val tint = when (spec.tone) {
        DeliveryTone.Secondary -> secondary
        DeliveryTone.SecondaryFaded -> secondary.copy(alpha = secondary.alpha * MeeshyOpacity.heavy)
        DeliveryTone.Warning -> MeeshyPalette.Warning
        DeliveryTone.Read -> if (tinted) Color.White else MeeshyPalette.ReadReceipt
        DeliveryTone.Error -> MeeshyPalette.Error
    }
    val description = when (status) {
        IdentityDeliveryStatus.Read -> stringResource(R.string.userIdentity_read)
        else -> null
    }
    Box(modifier = modifier) {
        Icon(
            imageVector = vector,
            contentDescription = description,
            tint = tint,
            modifier = Modifier.size(MeeshyIconSize.sm),
        )
    }
}
