package me.meeshy.sdk.model.call.group

/**
 * Les niveaux audio (0…1) d'UN même relevé `getStats` de la liaison principale : celui que le pair principal envoie
 * ([inbound]) et le mien ([outbound]) — iOS `GroupCallAudioLevels`. Jamais deux relevés par échantillon ; un niveau
 * absent (aucune mesure) laisse le maintien de [ActiveSpeakerDetector] s'écouler.
 */
data class CallAudioLevels(val inbound: Double?, val outbound: Double?)
