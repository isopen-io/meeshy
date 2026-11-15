package me.meeshy.sdk.model.waveform

/**
 * Quelle prise on garde. Sous [ACCIDENTAL_TOUCH_SECONDS] (iOS `duration > 0.5`) c'est un effleurement
 * du micro : elle est écartée et son fichier supprimé. Un préréglage peut relever ce plancher (voix
 * échantillon : 10 s). Il n'existe AUCUN plafond : une prise longue n'est jamais coupée.
 */
public object RecordingTakePolicy {
    public const val ACCIDENTAL_TOUCH_SECONDS: Double = 0.5

    public fun minimumSeconds(settings: AudioRecordingSettings): Double =
        maxOf(ACCIDENTAL_TOUCH_SECONDS, settings.minimumTakeSeconds)

    public fun keeps(durationSeconds: Double, settings: AudioRecordingSettings): Boolean =
        durationSeconds >= minimumSeconds(settings)
}
