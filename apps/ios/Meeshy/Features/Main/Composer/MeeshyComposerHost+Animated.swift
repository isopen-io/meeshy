import SwiftUI
import MeeshySDK
import MeeshyUI

// **Le mode ANIMÉ de la scène plein écran** (#8415, maquette `Main.dc.html` :
// « Scène animée : chaque objet a sa piste »).
//
// La frise existait, complète, mais seul l'atelier l'atteignait — c'est-à-dire
// deux ouvertures sur toutes (vidéo caméra, reprise de brouillon). La bascule
// « Animé » — l'éclair, au rail gauche après le lieu depuis #8713
// (`sceneToggleEntries`) — l'ouvre sur la scène du meuble : chaque objet y
// devient une piste, avec lecture et tête. La refermer rend ses pistes à la
// slide ; publier aussi (`performSoclePublish`).
extension MeeshyComposerHost {

    /// **La frise de la MAQUETTE**, pas l'éditeur de montage de l'atelier :
    /// lecture, temps, « Entre ici » / « Sort ici », une piste par objet, la
    /// tête ambre (`ComposerSceneFrise`).
    var sceneTimelinePanel: AnyView? {
        guard viewModel.timelineIsOpen else { return nil }
        return AnyView(
            ComposerSceneFrise(timeline: viewModel.timelineViewModel,
                               plateauTint: tint.color,
                               onWindowEdited: { commitSceneFriseWindow() })
                .padding(.horizontal, ComposerRailGeometry.outerMargin)
                .padding(.bottom, 4)
        )
    }

    /// **Animé** (maquette `toggleDynamic`) : allumer rend la scène animée ET
    /// ouvre sa frise, la tête à zéro ; éteindre referme la frise — ses pistes
    /// rendues à la slide — et rend la scène statique.
    func toggleSceneAnimation() {
        HapticFeedback.light()
        if sceneIsAnimated {
            sceneIsAnimated = false
            sceneAnimatedKnownIds = [:]
            if viewModel.timelineIsOpen { viewModel.closeTimelinePanel() }
        } else {
            sceneIsAnimated = true
            sceneAnimatedKnownIds = [viewModel.currentSlide.id: Set(viewModel.currentSlide.effects.timedObjectIds)]
            openSceneFrise()
            // La tête repart de zéro quand la scène DEVIENT animée (maquette
            // `toggleDynamic`) — jamais quand on rouvre seulement sa frise.
            viewModel.timelineViewModel.scrub(to: 0)
        }
    }

    /// **Temps** (maquette `toggleTimeline`) : montre ou range la frise d'une
    /// scène qui RESTE animée.
    func toggleSceneFrise() {
        HapticFeedback.light()
        if viewModel.timelineIsOpen {
            viewModel.closeTimelinePanel()
        } else {
            openSceneFrise()
        }
    }

    /// **Un objet posé sur une scène animée ENTRE À LA TÊTE** (maquette
    /// `mkObj`), au plus tard à 80 % de la durée, et reste jusqu'à la fin.
    /// Statique, la scène garde ses objets sur toute la slide.
    func placeNewSceneObjectsAtPlayhead() {
        guard sceneIsAnimated else { return }
        var slide = viewModel.currentSlide
        let ids = slide.effects.timedObjectIds
        let connus = sceneAnimatedKnownIds[slide.id]
        sceneAnimatedKnownIds[slide.id] = Set(ids)
        guard let connus else { return }
        let nouveaux = ids.filter { !connus.contains($0) }
        guard !nouveaux.isEmpty else { return }
        let fenetre = SceneEntryWindow.forNewObject(
            playhead: Double(viewModel.timelineViewModel.currentTime),
            slideDuration: Double(slide.effects.slideDuration ?? Float(slide.duration)))
        nouveaux.forEach { slide.effects.setWindow(id: $0, start: fenetre.start, duration: fenetre.duration) }
        viewModel.currentSlide = slide
    }

    func commitSceneFriseWindow() {
        viewModel.commitTimelineToCurrentSlide()
        viewModel.canvasTimelineBridge.scrub(seconds: Double(viewModel.timelineViewModel.currentTime))
    }

    private func openSceneFrise() {
        // La frise prend le bas : une bande ouverte s'efface devant elle.
        requestedSceneBand = nil
        viewModel.openTimelinePanel()
    }
}

nonisolated enum ComposerAnimatedCopy {
    static var toggle: String {
        String(localized: "composer.animated.toggle", defaultValue: "Animé", bundle: .main)
    }
}
