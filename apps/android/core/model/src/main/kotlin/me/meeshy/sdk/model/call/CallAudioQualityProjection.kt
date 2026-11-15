package me.meeshy.sdk.model.call

/**
 * Projection de l'échelle à 5 niveaux de l'émetteur sur les 4 paliers que la passerelle accepte
 * (`excellent|good|fair|poor`) : `critical` est envoyé `poor` (iOS `connectionQualityLabel(for:)`).
 */
fun VideoQualityLevel.gatewayTier(): ConnectionQuality = ConnectionQuality.from(this)
