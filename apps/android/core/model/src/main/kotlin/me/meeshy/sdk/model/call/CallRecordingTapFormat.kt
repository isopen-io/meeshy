package me.meeshy.sdk.model.call

/**
 * Le format du tampon micro est vérifié AVANT d'ouvrir le fichier — iOS `AudioTapFormatReadiness.mayInstall`.
 * Un taux nul ou un nombre de canaux absurde ne sert à rien à l'encodeur AAC : l'enregistrement n'est pas lancé
 * plutôt que de produire un fichier vide.
 */
object CallRecordingTapFormat {
    private val SUPPORTED_RATES = setOf(8_000, 11_025, 12_000, 16_000, 22_050, 24_000, 32_000, 44_100, 48_000)

    fun mayCapture(sampleRate: Int, channelCount: Int): Boolean = sampleRate in SUPPORTED_RATES && channelCount in 1..2
}
