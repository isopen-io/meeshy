import SwiftUI
import MeeshySDK
import MeeshyUI

// **Un post passe en réel dès qu'on pose une vidéo en fond ou un audio sur une
// image de fond** (#8793 — directive porteur 2026-09-30, corrigée le même jour :
// la bascule va vers le mode RÉEL, pas vers la story ; « Libre à l'utilisateur
// de rechoisir post ! »).
//
// La bascule ARME le réel sur la capsule Publier — le sélecteur de format que
// l'auteur voit et touche (#7497) — sans rien démonter : la surface montée, la
// scène et sa matière restent où elles sont, seul ce qui PARTIRA change. Le
// choix explicite de l'auteur au chevron (post, story ou tout autre mode)
// verrouille la composition : aucune bascule automatique ne l'écrase ensuite.
//
// Le réel n'est armé que si le menu l'OFFRE — `ComposerReelGate` (vidéo ou son
// d'au moins 3 s, ou deux images) : armer un format que le serveur refuserait
// serait un bouton qui ment. La demande et l'offre sont relues ENSEMBLE, parce
// que la durée d'un média se mesure après sa pose : l'offre peut arriver une
// image après la demande.

nonisolated enum ComposerReelAutoSwitch {

    struct State: Equatable {
        var authorChose = false
        var autoArmed = false
    }

    enum Decision: Equatable {
        case keep
        case armReel
        case disarm
    }

    /// Ce que la bascule relit : la demande de la scène et l'offre du menu.
    struct Input: Equatable {
        let demands: Bool
        let reelChoosable: Bool
    }

    /// **Ce qui DEMANDE le réel** : une vidéo de FOND, ou un son posé sur une
    /// slide dont le fond est une image — l'image d'un `StoryMediaObject` de
    /// fond ou l'image de fond héritée de la slide (`slideImages`). Une vidéo
    /// posée au premier plan ne bascule pas : elle garde l'offre de réel à la
    /// publication (#8603).
    static func sceneDemandsReel(_ slides: [StorySlide], slideImageIds: Set<String>) -> Bool {
        slides.contains { slide in
            let fond = slide.effects.mediaObjects?.first(where: \.isBackground)
            if fond?.kind == .video { return true }
            let fondImage = fond != nil || slideImageIds.contains(slide.id)
            return fondImage && carriesSound(slide.effects)
        }
    }

    static func carriesSound(_ effects: StoryEffects) -> Bool {
        !(effects.audioPlayerObjects ?? []).isEmpty
            || effects.backgroundAudioId != nil
            || effects.voiceAttachmentId != nil
    }

    /// Seule la création de POST bascule ; un choix de l'auteur n'est jamais
    /// écrasé ni désarmé ; un format que le menu n'offre pas n'est jamais armé.
    static func decide(demands: Bool,
                       defaultFormat: ComposerFormat,
                       state: State,
                       reelChoosable: Bool) -> Decision {
        guard !state.authorChose, defaultFormat == .post else { return .keep }
        if demands, !state.autoArmed, reelChoosable { return .armReel }
        if !demands, state.autoArmed { return .disarm }
        return .keep
    }

    static func applying(_ decision: Decision,
                         to state: State,
                         armed: ComposerPublishChoice?) -> (armed: ComposerPublishChoice?, state: State) {
        switch decision {
        case .keep:
            return (armed, state)
        case .armReel:
            return (ComposerPublishChoice(format: .reel, layout: nil),
                    State(authorChose: state.authorChose, autoArmed: true))
        case .disarm:
            return (nil, State(authorChose: state.authorChose, autoArmed: false))
        }
    }

    static func authorChose(_ state: State) -> State {
        State(authorChose: true, autoArmed: state.autoArmed)
    }
}

nonisolated enum ComposerReelAutoSwitchCopy {
    static var announcement: String {
        String(localized: "composer.reelSwitch.announcement",
               defaultValue: "Publication passée en réel", bundle: .main)
    }
}

@MainActor
extension MeeshyComposerHost {

    /// La demande (toutes slides) et l'offre du menu, relues ensemble.
    var reelAutoSwitchInput: ComposerReelAutoSwitch.Input {
        ComposerReelAutoSwitch.Input(
            demands: ComposerReelAutoSwitch.sceneDemandsReel(viewModel.slides,
                                                             slideImageIds: Set(viewModel.slideImages.keys)),
            reelChoosable: publishMenuEntries?.contains { $0.format == .reel && $0.isChoosable } ?? false)
    }

    /// **La bascule, relue à chaque changement de la demande ou de l'offre.** Le
    /// retour visible est la capsule (« Publier le réel ») ; l'haptique et
    /// l'annonce VoiceOver le disent à qui ne la regarde pas.
    func applyReelAutoSwitch(_ input: ComposerReelAutoSwitch.Input) {
        let decision = ComposerReelAutoSwitch.decide(demands: input.demands,
                                                     defaultFormat: selectedFormat,
                                                     state: reelAutoSwitch,
                                                     reelChoosable: input.reelChoosable)
        guard decision != .keep else { return }
        let (choix, etat) = ComposerReelAutoSwitch.applying(decision, to: reelAutoSwitch,
                                                           armed: armedPublishChoice)
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { armedPublishChoice = choix }
        reelAutoSwitch = etat
        guard decision == .armReel else { return }
        HapticFeedback.medium()
        UIAccessibility.post(notification: .announcement, argument: ComposerReelAutoSwitchCopy.announcement)
    }

    /// **Le choix de l'auteur au chevron** : il arme ce qu'il a choisi ET
    /// verrouille la composition contre toute bascule automatique.
    func chooseArmedPublish(_ choice: ComposerPublishChoice) {
        armedPublishChoice = choice
        reelAutoSwitch = ComposerReelAutoSwitch.authorChose(reelAutoSwitch)
    }
}
