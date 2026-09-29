import SwiftUI
import MeeshySDK
import MeeshyUI

// **« Publier en réel ? »** (#8603, demande porteur 2026-09-28) : « Lorsqu'on
// fait une publication de post avec UNE VIDÉO, activer automatiquement la
// publication de réel et ne passer en post que si l'utilisateur le souhaite
// vraiment ! »
//
// La capsule Publier ne publie plus directement un POST à une seule vidéo :
// elle ouvre une alerte à deux choix — « C'est un Réel », l'action PRÉFÉRÉE
// (en gras, Entrée au clavier), et « C'est un Post » — plus Annuler. La règle
// est celle du SDK (`ReelComposition.offersReelForPost`, miroir de
// `offersReelForPost` côté TS) ; ce fichier ne fait que lui remettre ce que le
// meuble tient.

/// **Ce que la composition porte comme médias, toutes surfaces confondues.**
///
/// Le média peut vivre dans le DOCUMENT (`documentLocalMedia`) ou sur la SCÈNE
/// (les objets des slides, et l'image de fond d'une slide). Un média du
/// document PONTÉ sur la scène y figure deux fois — il ne se compte qu'une,
/// par la scène.
nonisolated enum ComposerReelOfferRule {

    static func composedMedia(documentMedia: [ComposerDocumentMedia],
                              bridgedSources: Set<URL>,
                              slides: [StorySlide],
                              slideImageIds: Set<String>) -> [(kind: FeedMediaType, durationMs: Int?)] {
        let document = documentMedia
            .filter { !bridgedSources.contains($0.url) }
            .map { (kind: kind(of: $0.mimeType), durationMs: $0.durationMs) }
        let scene = slides.flatMap { ComposerReelGate.mediaKinds(of: $0.effects) }
        let fonds = slides
            .filter { slideImageIds.contains($0.id) }
            .map { _ in (kind: FeedMediaType.image, durationMs: Int?.none) }
        return document + scene + fonds
    }

    /// Le réel doit être CHOISISSABLE au menu de la flèche : proposer un format
    /// que la porte n'offre pas ferait un bouton qui ment. Un choix qui porte
    /// un AGENCEMENT est un post à plusieurs scènes, jamais une seule vidéo.
    static func offers(choice: ComposerPublishChoice,
                       menuEntries: [ComposerPublishMenuRule.Entry]?,
                       origin: ComposerOrigin,
                       formatChosenByAuthor: Bool,
                       media: [(kind: FeedMediaType, durationMs: Int?)]) -> Bool {
        let reelIsChoosable = menuEntries?.contains { $0.format == .reel && $0.isChoosable } ?? false
        guard reelIsChoosable, choice.layout == nil else { return false }
        return ReelComposition.offersReelForPost(type: choice.format.postType,
                                                 mediaKinds: media,
                                                 isRepost: origin.repostedPostId != nil,
                                                 isEdit: isEdit(origin),
                                                 formatChosenByAuthor: formatChosenByAuthor)
    }

    private static func isEdit(_ origin: ComposerOrigin) -> Bool {
        if case .edit = origin { return true }
        return false
    }

    private static func kind(of mime: String) -> FeedMediaType {
        switch ComposerIngestRouter.route(mime: mime) {
        case .image: return .image
        case .video: return .video
        case .audio: return .audio
        case .file: return .document
        }
    }
}

nonisolated enum ComposerReelOfferCopy {
    static var title: String {
        String(localized: "composer.reelOffer.title", defaultValue: "Publier en réel ?", bundle: .main)
    }

    static var body: String {
        String(localized: "composer.reelOffer.body",
               defaultValue: "Votre post n’a qu’une vidéo : en réel, elle s’ouvre en plein écran dans les Réels.",
               bundle: .main)
    }

    static var reel: String {
        String(localized: "composer.reelOffer.reel", defaultValue: "C’est un Réel", bundle: .main)
    }

    static var post: String {
        String(localized: "composer.reelOffer.post", defaultValue: "C’est un Post", bundle: .main)
    }
}

@MainActor
extension MeeshyComposerHost {

    /// **Ce que presse la capsule Publier.** Le seul cas de la règle ouvre
    /// l'alerte ; tout le reste publie comme avant.
    func requestSoclePublish(_ choice: ComposerPublishChoice) {
        let media = ComposerReelOfferRule.composedMedia(
            documentMedia: documentLocalMedia,
            bridgedSources: Set(documentMediaObjectIdBySource.keys),
            slides: viewModel.slides,
            slideImageIds: Set(viewModel.slideImages.keys))
        guard ComposerReelOfferRule.offers(choice: choice,
                                           menuEntries: publishMenuEntries,
                                           origin: intent.origin,
                                           formatChosenByAuthor: armedPublishChoice != nil,
                                           media: media) else {
            performSoclePublish(choice)
            return
        }
        pendingReelOffer = choice
    }

    /// **La réponse ARME le format choisi** avant de publier : la capsule dit
    /// désormais ce qui part, et un envoi refusé qu'on relance ne repose pas la
    /// question — l'auteur a déjà répondu.
    func answerReelOffer(asReel: Bool) {
        guard let pending = pendingReelOffer else { return }
        pendingReelOffer = nil
        let choice = asReel ? ComposerPublishChoice(format: .reel, layout: nil) : pending
        armedPublishChoice = choice
        performSoclePublish(choice)
    }

    /// **L'alerte, montée sur la capsule** : la racine porte déjà ses
    /// présentations (feuille de partage, portails), et SwiftUI n'en honore
    /// qu'UNE par vue.
    func reelOfferPresented<Contenu: View>(_ contenu: Contenu) -> some View {
        contenu.alert(
            ComposerReelOfferCopy.title,
            isPresented: Binding(get: { pendingReelOffer != nil },
                                 set: { if !$0 { pendingReelOffer = nil } })
        ) {
            Button(ComposerReelOfferCopy.reel) { answerReelOffer(asReel: true) }
                .keyboardShortcut(.defaultAction)
                .accessibilityIdentifier("composer.reelOffer.reel")
            Button(ComposerReelOfferCopy.post) { answerReelOffer(asReel: false) }
                .accessibilityIdentifier("composer.reelOffer.post")
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {
                pendingReelOffer = nil
            }
        } message: {
            Text(ComposerReelOfferCopy.body)
        }
    }
}
