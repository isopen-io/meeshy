package me.meeshy.sdk.model.waveform

import java.util.Locale

/** Ce que le lecteur montre : fraction, temps écoulé, et si c'est la lecture en direct. */
public data class AudioProgressDisplay(val fraction: Double, val elapsedSeconds: Double, val isLive: Boolean) {
    public companion object {
        /**
         * Miroir d'iOS `AudioPlayerView.progressDisplay` : tant que la lecture n'a pas commencé,
         * le lecteur montre la consommation persistée (fraction au repos, position de reprise).
         */
        public fun of(
            liveFraction: Double,
            liveElapsedSeconds: Double,
            restingFraction: Double,
            resumePositionSeconds: Double?,
            totalSeconds: Double,
        ): AudioProgressDisplay {
            if (liveFraction > 0) return AudioProgressDisplay(liveFraction, liveElapsedSeconds, true)
            val fraction = restingFraction.coerceIn(0.0, 1.0)
            if (totalSeconds <= 0) return AudioProgressDisplay(fraction, 0.0, false)
            val elapsed = resumePositionSeconds?.coerceIn(0.0, totalSeconds) ?: (fraction * totalSeconds)
            return AudioProgressDisplay(fraction, elapsed, false)
        }
    }
}

/** Libellés d'octets du bouton de téléchargement (miroir de `formattedNeedsDownloadLabel` / `formattedDownloadingLabel`). */
public object AudioByteLabels {
    public fun bytes(value: Long): String = when {
        value >= 1_048_576 -> String.format(Locale.ROOT, "%.1f MB", value / 1_048_576.0)
        value >= 1_024 -> String.format(Locale.ROOT, "%d KB", Math.round(value / 1_024.0))
        else -> "$value B"
    }

    public fun needsDownload(fileSize: Long): String = if (fileSize > 0) bytes(fileSize) else ""

    public fun downloading(downloaded: Long, total: Long, fallbackFileSize: Long): String {
        val resolved = if (total > 0) total else fallbackFileSize
        if (resolved <= 0 && downloaded <= 0) return ""
        return "${bytes(downloaded)} / ${if (resolved > 0) bytes(resolved) else "?"}"
    }
}
