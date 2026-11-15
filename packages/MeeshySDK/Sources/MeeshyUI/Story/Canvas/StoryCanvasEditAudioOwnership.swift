import Foundation
import UIKit
import MeeshySDK

/// **Le son de la scène composée n'a QU'UN propriétaire, et il se passe sans repartir (#10362).**
///
/// Le composer monte plusieurs canevas d'édition sonores à la fois : la scène,
/// et par-dessus elle l'éditeur d'objet plein écran, dont le canevas rend la
/// MÊME slide. Chacun avait son mixer, et chacun, en démarrant, arrêtait les
/// autres (`PlaybackCoordinator.willStartPlaying(external:)`) puis rejouait
/// depuis le début. Ouvrir l'éditeur faisait donc repartir le son ; le fermer
/// laissait la scène muette — son mixer arrêté, que rien ne relançait — et la
/// première touche suivante le refaisait repartir de zéro. Une frappe dans
/// l'éditeur suffisait même à ce que la scène, réveillée par la mise à jour de
/// la slide, reprenne la main et coupe l'éditeur.
///
/// Deux règles :
/// 1. **le DERNIER canevas monté joue, les autres se taisent** — une pile :
///    l'éditeur qui se ferme rend la main à la scène, qui reprend ;
/// 2. **le son ne repart pas quand il change de main** — l'origine `t = 0` de
///    la passe est partagée par slide ; le nouveau propriétaire y entre en
///    cours de boucle, à la phase que l'ancien jouait.
nonisolated struct EditAudioOwnership: Equatable, Sendable {
    private(set) var claimants: [ObjectIdentifier] = []

    var owner: ObjectIdentifier? { claimants.last }

    /// Personne ne tient la main, ou c'est `id` qui la tient.
    func mayPlay(_ id: ObjectIdentifier) -> Bool {
        owner == nil || owner == id
    }

    /// `id` prend la main — en haut de la pile, même s'il y était déjà.
    mutating func claim(_ id: ObjectIdentifier) {
        claimants.removeAll { $0 == id }
        claimants.append(id)
    }

    /// `id` rend la main. Rend le NOUVEAU propriétaire quand `id` la tenait,
    /// `nil` sinon — seul un départ du propriétaire réveille quelqu'un.
    @discardableResult
    mutating func release(_ id: ObjectIdentifier) -> ObjectIdentifier? {
        let wasOwner = owner == id
        claimants.removeAll { $0 == id }
        return wasOwner ? owner : nil
    }

    /// Ne garde que les canevas encore vivants : un canevas libéré sans être
    /// passé par `release` ne doit pas confisquer la main pour toujours.
    mutating func prune(keeping live: Set<ObjectIdentifier>) {
        claimants.removeAll { !live.contains($0) }
    }
}

/// L'origine `t = 0` de la passe sonore d'édition, pour UNE slide.
nonisolated struct EditAudioPhase: Equatable, Sendable {
    let slideId: String
    let originHost: UInt64
}

/// Où entre une passe d'édition planifiée à neuf : à la phase partagée quand
/// elle vaut pour cette slide, sinon à l'ancre du canevas.
enum EditAudioClock {
    static func anchor(phase: EditAudioPhase?,
                       slideId: String,
                       now: UInt64,
                       fallback: (originHost: UInt64, slideElapsed: Double))
        -> (originHost: UInt64, slideElapsed: Double) {
        guard let phase, phase.slideId == slideId, phase.originHost <= now else { return fallback }
        return (phase.originHost,
                ReaderAudioMixer.delaySeconds(forHostTime: now, relativeTo: phase.originHost))
    }
}

// MARK: - StoryCanvasUIView + EditAudioOwnership

extension StoryCanvasUIView {
    @MainActor static var editAudioOwnership = EditAudioOwnership()
    @MainActor static var editAudioPhase: EditAudioPhase?
    @MainActor static let editAudioCanvases = NSHashTable<StoryCanvasUIView>.weakObjects()

    /// Ce canevas sonore d'édition, fenêtré, prend la main sur le son.
    func claimEditAudio() {
        guard mode == .edit, playsAudioInEditMode, window != nil else { return }
        Self.editAudioCanvases.add(self)
        Self.editAudioOwnership.claim(ObjectIdentifier(self))
    }

    /// Ce canevas rend la main ; le précédent, s'il y en a un, reprend le son
    /// à la phase partagée. Sans plus personne, la phase s'oublie — la
    /// prochaine composition repart du début — mais un tour plus tard : un
    /// canevas que SwiftUI détache puis rattache dans la même passe la
    /// retrouve et ne repart pas de zéro.
    func releaseEditAudio() {
        Self.editAudioCanvases.remove(self)
        let next = Self.editAudioOwnership.release(ObjectIdentifier(self))
        Self.pruneEditAudioOwnership()
        guard Self.editAudioOwnership.owner != nil else {
            Task { @MainActor in
                guard StoryCanvasUIView.editAudioOwnership.owner == nil else { return }
                StoryCanvasUIView.editAudioPhase = nil
            }
            return
        }
        guard let next,
              let canvas = Self.editAudioCanvases.allObjects.first(where: { ObjectIdentifier($0) == next })
        else { return }
        canvas.resumeEditAudioIfSilenced()
    }

    var mayPlayEditAudio: Bool {
        Self.pruneEditAudioOwnership()
        return Self.editAudioOwnership.mayPlay(ObjectIdentifier(self))
    }

    /// L'ancre d'une passe d'édition : la phase partagée de la slide, ou celle
    /// du canevas quand personne n'a encore joué.
    func editAudioAnchor() -> (originHost: UInt64, slideElapsed: Double) {
        EditAudioClock.anchor(phase: Self.editAudioPhase,
                              slideId: slide.id,
                              now: mach_absolute_time(),
                              fallback: captureSlideTimelineAnchor())
    }

    /// Le propriétaire publie l'origine de la passe qui joue — la seule
    /// vérité, pauses soldées comprises.
    func publishEditAudioPhase() {
        guard let origin = audioMixer.currentPassOriginHost else { return }
        Self.editAudioPhase = EditAudioPhase(slideId: slide.id, originHost: origin)
    }

    /// Le son d'édition s'est tu sans qu'on le lui demande (un autre lecteur
    /// l'a arrêté) : le propriétaire le relance à la première interaction.
    func resumeEditAudioIfSilenced() {
        guard mode == .edit, playsAudioInEditMode, !isTimelinePreviewActive,
              !audioMixer.isPlaying,
              audioMixer.activeClipCount > 0 || audioMixer.backgroundClipCount > 0
        else { return }
        startEditAudioPlayback()
    }

    private static func pruneEditAudioOwnership() {
        let live = Set(editAudioCanvases.allObjects.map { ObjectIdentifier($0) })
        editAudioOwnership.prune(keeping: live)
    }
}
