import SwiftUI
import MeeshySDK
import MeeshyUI

// **Un post passe en story dès qu'on pose une vidéo en fond ou un audio sur une
// image de fond** (#8793 — directive porteur 2026-09-30 : « la création de post
// doit activer directement le mode story lorsqu'on met comme fond une vidéo ou
// qu'on attache un audio à une image de fond ! Libre à l'utilisateur de
// rechoisir post ! »).
//
// La bascule ARME la story sur la capsule Publier — le sélecteur de format que
// l'auteur voit et touche (#7497) — sans rien démonter : la surface montée, la
// scène et sa matière restent où elles sont, seul ce qui PARTIRA change. Le
// choix explicite de l'auteur au chevron verrouille la composition : aucune
// bascule automatique ne l'écrase ensuite.

nonisolated enum ComposerStoryAutoSwitch {

    struct State: Equatable {
        var authorChose = false
        var autoArmed = false
    }

    enum Decision: Equatable {
        case keep
        case armStory
        case disarm
    }

    /// **Ce qui DEMANDE la story** : une vidéo de FOND, ou un son posé sur une
    /// slide dont le fond est une image — l'image d'un `StoryMediaObject` de
    /// fond ou l'image de fond héritée de la slide (`slideImages`). Une vidéo
    /// posée au premier plan ne bascule pas : elle garde l'offre de réel
    /// (#8603).
    static func sceneDemandsStory(_ slides: [StorySlide], slideImageIds: Set<String>) -> Bool {
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
                       storyChoosable: Bool) -> Decision {
        guard !state.authorChose, defaultFormat == .post else { return .keep }
        if demands, !state.autoArmed, storyChoosable { return .armStory }
        if !demands, state.autoArmed { return .disarm }
        return .keep
    }

    static func applying(_ decision: Decision,
                         to state: State,
                         armed: ComposerPublishChoice?) -> (armed: ComposerPublishChoice?, state: State) {
        switch decision {
        case .keep:
            return (armed, state)
        case .armStory:
            return (ComposerPublishChoice(format: .story, layout: nil),
                    State(authorChose: state.authorChose, autoArmed: true))
        case .disarm:
            return (nil, State(authorChose: state.authorChose, autoArmed: false))
        }
    }

    static func authorChose(_ state: State) -> State {
        State(authorChose: true, autoArmed: state.autoArmed)
    }
}

nonisolated enum ComposerStoryAutoSwitchCopy {
    static var announcement: String {
        String(localized: "composer.storySwitch.announcement",
               defaultValue: "Publication passée en story", bundle: .main)
    }
}

@MainActor
extension MeeshyComposerHost {

    /// La composition — toutes slides — demande-t-elle la story ?
    var sceneDemandsStory: Bool {
        ComposerStoryAutoSwitch.sceneDemandsStory(viewModel.slides,
                                                  slideImageIds: Set(viewModel.slideImages.keys))
    }

    /// **La bascule, relue à chaque changement de la demande.** Le retour
    /// visible est la capsule (« Publier la story ») ; l'haptique et l'annonce
    /// VoiceOver le disent à qui ne la regarde pas.
    func applyStoryAutoSwitch(demands: Bool) {
        let storyChoosable = publishMenuEntries?.contains { $0.format == .story && $0.isChoosable } ?? false
        let decision = ComposerStoryAutoSwitch.decide(demands: demands,
                                                      defaultFormat: selectedFormat,
                                                      state: storyAutoSwitch,
                                                      storyChoosable: storyChoosable)
        guard decision != .keep else { return }
        let (choix, etat) = ComposerStoryAutoSwitch.applying(decision, to: storyAutoSwitch,
                                                            armed: armedPublishChoice)
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { armedPublishChoice = choix }
        storyAutoSwitch = etat
        guard decision == .armStory else { return }
        HapticFeedback.medium()
        UIAccessibility.post(notification: .announcement, argument: ComposerStoryAutoSwitchCopy.announcement)
    }

    /// **Le choix de l'auteur au chevron** : il arme ce qu'il a choisi ET
    /// verrouille la composition contre toute bascule automatique.
    func chooseArmedPublish(_ choice: ComposerPublishChoice) {
        armedPublishChoice = choice
        storyAutoSwitch = ComposerStoryAutoSwitch.authorChose(storyAutoSwitch)
    }
}
