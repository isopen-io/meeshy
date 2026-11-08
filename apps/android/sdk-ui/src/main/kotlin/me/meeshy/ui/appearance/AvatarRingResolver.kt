package me.meeshy.ui.appearance

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.appearance.AvatarRingDesign

/**
 * Résout le contour ÉQUIPÉ d'une personne (la référence servie avec elle, `profileDecor.avatarRing`) en dessin :
 * miroir de la résolution par le catalogue que fait `MeeshyAvatar` d'iOS. Fourni UNE fois à la racine par `:app`
 * (qui détient le catalogue embarqué) ; l'absence DÉGRADE en « aucun contour », elle ne plante jamais.
 */
@Immutable
public fun interface AvatarRingResolver {
    public fun resolve(item: ServedProfileDecorItem?): AvatarRingDesign?

    public companion object {
        /** Aucun catalogue : aucun contour (previews, tests, catalogue pas encore chargé). */
        public val Absent: AvatarRingResolver = AvatarRingResolver { null }
    }
}

public val LocalAvatarRingResolver: ProvidableCompositionLocal<AvatarRingResolver> =
    staticCompositionLocalOf { AvatarRingResolver.Absent }

/** Le dessin du contour équipé [item] ; `null` sans contour équipé, ou tant que le catalogue n'est pas là. */
@Composable
public fun rememberAvatarRing(item: ServedProfileDecorItem?): AvatarRingDesign? {
    val resolver = LocalAvatarRingResolver.current
    return remember(resolver, item) { resolver.resolve(item) }
}
