package me.meeshy.app.stories


/** Le fond média qu'une slide publie : le média désigné et son cadrage (le filtre de la scène voyage sur les effets). */
internal object StoryPublishBackground {

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
