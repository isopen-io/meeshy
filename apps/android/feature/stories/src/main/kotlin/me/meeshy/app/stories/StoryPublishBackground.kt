package me.meeshy.app.stories


/** Le fond média qu'une slide publie : le média désigné et son cadrage (le filtre de la scène voyage sur les effets). */
internal object StoryPublishBackground {

    /**
     * Le média que le plateau peint en fond de [slide] : le désigné s'il est envoyé ou en attente, sinon le premier média
     * de la slide qui n'est pas posé (envoyé d'abord, puis en attente). C'est le fond que la scène MONTRE, celui que la
     * publication porte dès qu'elle part en scène (#14302).
     */
    fun paintedId(slide: StorySlide, state: StoryComposerUiState): String? {
        val uploaded = slide.mediaIds.filter { id -> state.attachments.any { it.id == id } }
        val pending = slide.mediaIds.filter { id -> state.pendingUploads.any { it.cmid == id } }
        val posed = slide.placedMedia.mapTo(mutableSetOf()) { it.mediaId }
        return slide.backgroundMediaId?.takeIf { it in uploaded || it in pending }
            ?: uploaded.firstOrNull { it !in posed }
            ?: pending.firstOrNull { it !in posed }
    }

    /** [slide] dont le fond peint ([paintedId]) est désigné : ce que la scène montre en fond part comme son fond. */
    fun designated(slide: StorySlide, state: StoryComposerUiState): StorySlide =
        paintedId(slide, state)?.takeIf { it != slide.backgroundMediaId }?.let { slide.copy(backgroundMediaId = it) } ?: slide

    /**
     * Resolves a [slide]'s designated background media to the [StoryBackgroundMedia] the
     * wire mapping needs, from the already-uploaded [attachments]. Returns `null` when
     * nothing is designated or the id names no media of the slide. A designated media still waiting on its
     * offline upload publishes its object anyway, URL-less and under its placeholder `cmid` (#13605): the
     * duration probed at pick time (#13606), the framing and the loop travel with the outbox row and the write-back swaps in the real id. Carries
     * the slide's author-chosen [StorySlide.backgroundLoop] (honoured only for a video) and
     * the canvas pan/zoom — the plateau paints the designated media, so the gesture framed it (honoured for a framed image or video alike).
     */
    fun resolve(slide: StorySlide, state: StoryComposerUiState): StoryBackgroundMedia? {
        val designated = slide.backgroundMediaId?.takeIf { it in slide.mediaIds } ?: return null
        val framing = slide.transform.toBackgroundFraming(state.canvasWidthPx, state.canvasHeightPx)
        state.attachments.firstOrNull { it.id == designated }?.let { media ->
            return StoryBackgroundMedia(
                mediaId = media.id,
                url = media.url,
                mimeType = media.mimeType,
                durationSeconds = media.durationMs?.let { it / 1000.0 },
                loop = slide.backgroundLoop,
                framing = framing,
                adjustments = slide.backgroundAdjustments,
                window = slide.backgroundTrim,
            setting = slide.backgroundSetting,
            )
        }
        val pending = state.pendingUploads.firstOrNull { it.cmid == designated } ?: return null
        return StoryBackgroundMedia(
            mediaId = pending.cmid,
            url = null,
            mimeType = pending.item.mimeType,
            durationSeconds = pending.item.durationMs?.let { it / 1000.0 },
            loop = slide.backgroundLoop,
            framing = framing,
            adjustments = slide.backgroundAdjustments,
            window = slide.backgroundTrim,
            setting = slide.backgroundSetting,
        )
    }
}
