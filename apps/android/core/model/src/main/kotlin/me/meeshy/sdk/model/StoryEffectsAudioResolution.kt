package me.meeshy.sdk.model

/**
 * L'audio de fond résolu d'une slide — miroir de `StoryEffects+AudioResolution` (iOS).
 *
 * - le premier `audioPlayerObjects` avec `isBackground == true` l'emporte ;
 * - sinon, si aucun objet n'a de drapeau explicite ET que les champs hérités
 *   `backgroundAudioId/Volume/Start/End` existent, un objet virtuel est synthétisé ;
 * - un `isBackground: false` explicite signale que l'auteur a manipulé les drapeaux : plus de synthèse.
 *
 * `backgroundAudioStart/End` ROGNENT LA SOURCE (`sourceStart`/`sourceEnd`) ; ce ne sont pas des
 * bornes sur le plan — les poser en `startTime` ferait jouer `start` secondes de silence puis le
 * fichier depuis zéro.
 */
val StoryEffects.resolvedBackgroundAudio: StoryAudioPlayerObject?
    get() {
        audioPlayerObjects?.firstOrNull { it.isBackground == true }?.let { return it }
        val untouched = audioPlayerObjects.orEmpty().all { it.isBackground == null }
        val bgId = backgroundAudioId
        if (!untouched || bgId == null) return null
        val start = backgroundAudioStart
        val end = backgroundAudioEnd
        val duration = if (start != null && end != null && end > start) (end - start).toFloat() else null
        return StoryAudioPlayerObject(
            id = LEGACY_BACKGROUND_AUDIO_ID,
            postMediaId = bgId,
            placement = "background",
            volume = backgroundAudioVolume ?: DEFAULT_LEGACY_BACKGROUND_VOLUME,
            waveformSamples = emptyList(),
            isBackground = true,
            backgroundAudioVariants = backgroundAudioVariants,
            startTime = null,
            duration = duration,
            loop = true,
            sourceStart = start?.toFloat(),
            sourceEnd = end?.toFloat(),
        )
    }

/** Les audios de premier plan (pastilles). */
val StoryEffects.resolvedForegroundAudioPlayers: List<StoryAudioPlayerObject>
    get() = audioPlayerObjects.orEmpty().filter { it.isBackground != true }

private const val LEGACY_BACKGROUND_AUDIO_ID = "legacy-bg-audio"
private const val DEFAULT_LEGACY_BACKGROUND_VOLUME = 0.5f
