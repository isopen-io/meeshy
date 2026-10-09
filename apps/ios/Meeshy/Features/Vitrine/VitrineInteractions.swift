#if DEBUG
import Foundation
import MeeshySDK

/// Une vraie interaction que la vitrine filme (#9810), pour les aperçus vidéo de l'App Store.
///
/// La scène ouvre le VRAI écran, rempli des fixtures du kit, puis — après le clap du tournage — joue l'interaction par
/// un enchaînement DEBUG qui appelle les MÊMES méthodes que le geste. Les gestes simulés (idb) ont été écartés : leurs
/// coordonnées changent avec l'appareil, la langue et la longueur des textes, et un toucher manqué filme un écran figé
/// sans que rien ne le signale ; l'enchaînement, lui, échoue en nommant la scène.
nonisolated enum VitrineInteraction: String, CaseIterable, Sendable {
    /// Le compteur de Meeshes ouvre la fiche, Mee et Meo frappent (`ProgressionViewModel.mint()`).
    case frappe
    /// Le menu unifié d'un message reçu s'ouvre, un émoji s'y pose (`ConversationViewModel.toggleReaction`).
    case emoji
    /// La palette du cœur d'un post s'ouvre, un émoji s'y choisit (`PostDetailView.sendDetailReaction`).
    case emojiPost
    /// Un vocal part en commentaire d'un post, sa transcription puis sa traduction arrivent (`CommentPublisher`).
    case commentaireAudio
    case sticker

    /// La célébration du jeu que l'interaction déclenche : la passerelle fictive la prépare.
    var celebration: VitrineCelebration? {
        switch self {
        case .frappe: .frappe
        case .emoji, .emojiPost, .commentaireAudio, .sticker: nil
        }
    }
}

extension VitrineScene {
    nonisolated var interaction: VitrineInteraction? {
        switch self {
        case .interactionFrappe: .frappe
        case .interactionEmoji: .emoji
        case .interactionEmojiPost: .emojiPost
        case .interactionCommentaireAudio: .commentaireAudio
        case .interactionSticker: nil
        case .amour, .groupe, .global, .lien, .progression, .imagine, .jeuRang, .jeuCoffre, .jeuFrappe, .jeuNiveau, .jeuBadge: nil
        }
    }

    /// La scène du kit dont l'interaction emprunte la destination (`VitrineFixtures.scenes`) : le kit ne décrit que
    /// ses propres scènes, une interaction rejoue l'écran de l'une d'elles.
    nonisolated var sceneDuKit: VitrineScene {
        switch self {
        case .interactionEmoji: .amour
        case .amour, .groupe, .global, .lien, .progression, .imagine, .jeuRang, .jeuCoffre, .jeuFrappe, .jeuNiveau, .jeuBadge,
             .interactionFrappe, .interactionEmojiPost, .interactionCommentaireAudio, .interactionSticker: self
        }
    }

    /// Le jeu que la passerelle fictive sert : la célébration d'une scène du jeu, ou celle qu'une interaction déclenche.
    nonisolated var jeuServi: VitrineCelebration? {
        celebration ?? interaction?.celebration
    }
}

/// Le déroulé d'une interaction, une fois « prêt » posé : le clap, « début », l'interaction, « fin ».
@MainActor
enum VitrineInteractions {
    /// Le menu unifié se laisse voir entier — sa bande d'émojis joue sa cascade d'entrée — avant le toucher.
    static let tenueDuMenu: Duration = .milliseconds(1100)
    /// Le menu se replie et la réaction se pose sous la bulle.
    static let tenueDeLaReaction: Duration = .milliseconds(1400)
    static let emojiDuMessage = "🥰"

    static func jouer(_ scene: VitrineScene, _ f: VitrineFixtures) async {
        guard let interaction = scene.interaction else { return }
        await VitrineTournage.tourner(scene) {
            switch interaction {
            case .frappe: await frapperDepuisLeCompteur(scene)
            case .emoji: await reagirAuMessage(scene, f)
            case .emojiPost: await reagirAuPost(scene)
            case .commentaireAudio: await commenterDeVive(scene, f)
            case .sticker: break
            }
        }
    }

    static func photoDeLaScene(_ f: VitrineFixtures, dossier: URL) -> URL? { nil }
    static var stickerDeLaScene: StickerSheetChoice? { nil }

    /// Le dernier message REÇU et écrit de la conversation : celui auquel on répond d'un émoji.
    static func messageAReagir(_ f: VitrineFixtures, conversationId: String) -> String? {
        f.messages[conversationId]?.last { message in
            message.senderId != f.lecteur.id
                && !(message.content ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && (message.attachments?.isEmpty ?? true)
        }?.id
    }

    /// L'appui long ouvre le menu unifié (`presentLongPressMenu`), la bande y pose l'émoji (`toggleReaction`).
    private static func reagirAuMessage(_ scene: VitrineScene, _ f: VitrineFixtures) async {
        guard let conversationId = f.destination(scene.sceneDuKit)?.conversationId,
              let messageId = messageAReagir(f, conversationId: conversationId),
              let appuyer = VitrineRendu.shared.appuyerLongtemps else {
            fatalError("Vitrine « \(scene.rawValue) » : aucun message reçu à qui réagir, ou la liste n'a pas prêté son appui long")
        }
        appuyer(messageId)
        await VitrineRendu.shared.attendre([.menuDeReactions])
        try? await Task.sleep(for: tenueDuMenu)
        guard let reagir = VitrineRendu.shared.reagirAuMenu else {
            fatalError("Vitrine « \(scene.rawValue) » : la bande du menu n'a pas prêté son geste")
        }
        reagir(emojiDuMessage)
        try? await Task.sleep(for: tenueDeLaReaction)
    }

    /// Le toucher du compteur (`ProgressionHeaderStanding.onOpenMeesh`) pousse la fiche des Meeshes ; la scène y
    /// frappe par le geste réel une fois la fiche lue et sa transition posée.
    private static func frapperDepuisLeCompteur(_ scene: VitrineScene) async {
        guard let ouvrir = VitrineRendu.shared.ouvrirLeJeu, let concept = scene.jeuServi?.concept else {
            fatalError("Vitrine « \(scene.rawValue) » : l'écran Progression n'a pas prêté son routeur")
        }
        ouvrir(.progressionConcept(concept))
        await VitrineRendu.shared.attendre([.fiche(concept)])
        try? await Task.sleep(for: VitrineStage.pose)
        await VitrineJeu.jouerSurLaFiche(scene)
    }
}
#endif
