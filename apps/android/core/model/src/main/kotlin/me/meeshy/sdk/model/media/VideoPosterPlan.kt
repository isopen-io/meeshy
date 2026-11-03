package me.meeshy.sdk.model.media

/**
 * D'où vient la première image NETTE d'une vidéo — l'ordre d'essai, décidé sur des faits déjà
 * collectés. Miroir de `VideoPosterPlan` (iOS, `VideoPosterResolver.swift`).
 *
 * Le fichier sur l'appareil gagne toujours (décodage matériel, sans réseau). Sinon, si la politique
 * média autorise le téléchargement, on ATTEND le fichier puis on décode ; en dernier recours,
 * l'extraction distante par `Range` sur le premier Mo — un GESTE sur ce média autorise ce Mo même en
 * économie de données, jamais un simple préchauffage. Sans réseau : rien, le repli
 * thumbHash/vignette s'affiche sans attendre.
 */
public object VideoPosterPlan {

    public sealed interface Step {
        public data class DecodeLocalFile(val path: String) : Step
        public data class DownloadThenDecode(val url: String) : Step
        public data class RangeExtract(val url: String) : Step
    }

    /** QUI demande l'image : seul un geste paie un octet quand la politique média refuse le téléchargement. */
    public enum class Intent { USER_OPENED, AMBIENT_PREWARM }

    public fun steps(
        localFilePath: String?,
        remoteUrl: String?,
        policyAllowsDownload: Boolean,
        allowsNetwork: Boolean,
        intent: Intent,
    ): List<Step> {
        if (localFilePath != null) return listOf(Step.DecodeLocalFile(localFilePath))
        if (!allowsNetwork || remoteUrl.isNullOrEmpty() || ImageLoadPolicy.isLocalFile(remoteUrl)) return emptyList()
        if (policyAllowsDownload) return listOf(Step.DownloadThenDecode(remoteUrl), Step.RangeExtract(remoteUrl))
        if (intent != Intent.USER_OPENED) return emptyList()
        return listOf(Step.RangeExtract(remoteUrl))
    }
}
