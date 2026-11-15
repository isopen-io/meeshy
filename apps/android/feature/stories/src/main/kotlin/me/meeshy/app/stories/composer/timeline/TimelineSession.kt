package me.meeshy.app.stories.composer.timeline

import me.meeshy.sdk.model.StorySlide
import me.meeshy.sdk.model.StoryTransitionEffect
import me.meeshy.sdk.model.composer.timeline.TimelineEditor
import me.meeshy.sdk.model.composer.timeline.TimelineSlideBinding
import me.meeshy.sdk.model.timeline.CommandStack
import me.meeshy.sdk.model.timeline.CommandStackSnapshot

/**
 * Le cycle de vie PARESSEUX de la timeline du composer (miroir de `StoryComposerViewModel+Timeline.swift`) :
 * le [TimelineViewModel] n'existe que si la timeline est ouverte. À l'ouverture la slide courante est chargée
 * (fond image = clip synthétique), à la fermeture elle est réécrite ; [commit] vide les éditions SANS fermer,
 * pour que publier ou autosauver une timeline ouverte ne perde rien.
 *
 * L'historique d'annulation est rangé par slide : changer de slide ne le fait pas fuir sur la suivante.
 */
class TimelineSession {

    private var viewModel: TimelineViewModel? = null
    private var loadedSlideId: String? = null
    private val histories = mutableMapOf<String, CommandStackSnapshot>()

    val isOpen: Boolean get() = viewModel != null

    /** Le ViewModel de la timeline ouverte, `null` fermée : lire ceci ne la crée jamais. */
    val current: TimelineViewModel? get() = viewModel

    fun open(
        slide: StorySlide,
        hasBackgroundImage: Boolean = false,
        imageAspectRatio: Double? = null,
        openingEffect: StoryTransitionEffect? = slide.effects.opening,
        closingEffect: StoryTransitionEffect? = slide.effects.closing,
    ): TimelineViewModel {
        stashHistory()
        val project = TimelineSlideBinding.load(slide, hasBackgroundImage, imageAspectRatio, openingEffect, closingEffect)
        val stack = histories[slide.id]?.let { CommandStack().restoring(it) } ?: CommandStack()
        val editor = TimelineEditor.open(project, stack)
        val existing = viewModel
        loadedSlideId = slide.id
        return if (existing == null) {
            TimelineViewModel(editor).also { viewModel = it }
        } else {
            existing.also { it.replace(editor) }
        }
    }

    /** Les éditions de la timeline ouverte rendues à [slide] ; une timeline fermée laisse la slide intacte. */
    fun commit(slide: StorySlide): StorySlide {
        val vm = viewModel ?: return slide
        if (loadedSlideId != slide.id) return slide
        stashHistory()
        return TimelineSlideBinding.commit(vm.editor.value.cancelDrag().project, slide)
    }

    /** Ferme la timeline en rendant ses pistes à la slide. */
    fun close(slide: StorySlide): StorySlide {
        val written = commit(slide)
        shutdown()
        return written
    }

    fun shutdown() {
        stashHistory()
        viewModel?.shutdown()
        viewModel = null
        loadedSlideId = null
    }

    fun historySnapshot(slideId: String): CommandStackSnapshot? {
        if (slideId == loadedSlideId) stashHistory()
        return histories[slideId]
    }

    fun restoreHistory(slideId: String, snapshot: CommandStackSnapshot) {
        histories[slideId] = snapshot
    }

    private fun stashHistory() {
        val id = loadedSlideId ?: return
        val vm = viewModel ?: return
        histories[id] = vm.editor.value.stack.snapshot()
    }
}
