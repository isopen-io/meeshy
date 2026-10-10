#if DEBUG
import Foundation
import MeeshySDK

/// Ce qu'un écran annonce une fois RENDU (#8921) : « prêt » n'en part qu'après l'avoir observé.
nonisolated enum VitrineEvenement: Hashable, Sendable {
    /// Une conversation dont `markAsRead` a reçu des bulles VISIBLES.
    case conversation(String)
    case progression
    case lien
    case fil
    /// La carte d'Imagine peinte, médias compris.
    case imagine
    /// La fiche d'un concept du jeu, lue (#9805) : la célébration s'y joue.
    case fiche(ProgressionConcept)
    /// La bande d'émojis du menu unifié, montée (#9810).
    case menuDeReactions
    /// Le composeur de commentaire du détail d'un post, monté (#9810).
    case composeurDeCommentaire
    /// Le cœur du détail d'un post, qui ouvre la palette d'émojis, monté (#9810).
    case paletteDeReactionsPrete
    /// La palette d'émojis d'un post, ouverte (#9810).
    case paletteDeReactions
    /// Le composeur, monté (#9810).
    case composeur
    /// La feuille des stickers du composeur, ouverte (#9810).
    case feuilleDeStickers
    /// Le réel publié par la passerelle de la vitrine, annoncé au fil (#9820).
    case reelPublie
    /// La racine de l'app, montée (#9904).
    case racine
    /// Le lecteur immersif des réels, monté sur ses réels (#9904).
    case lecteurDeReels
    /// Une story, révélée dans son lecteur après l'intermède de l'auteur (#9904).
    case story
}

/// Le média que le composeur reçoit à l'ouverture, comme le choix de la photothèque (#9810, #9820).
nonisolated struct VitrineMediaDOuverture: Equatable, Sendable {
    let url: URL
    let mimeType: String
}

nonisolated enum VitrineAppareil: Sendable {
    case iphone
    case ipad
}

extension VitrineScene {
    /// Les rendus qui prouvent la scène. Sur iPad, sans conversation ouverte, la racine montre le
    /// fil à gauche (#8922) : il doit être peint lui aussi. Une conversation inconnue n'est jamais
    /// observée : la capture échoue en nommant la scène plutôt que de photographier autre chose.
    nonisolated func rendusAttendus(conversationId: String?, appareil: VitrineAppareil) -> Set<VitrineEvenement> {
        switch self {
        case .global, .amour, .groupe, .imagine, .interactionEmoji: return [.conversation(conversationId ?? "")]
        case .progression, .interactionFrappe: return appareil == .ipad ? [.progression, .fil] : [.progression]
        case .lien: return [.lien]
        case .interactionCommentaireAudio: return appareil == .ipad ? [.composeurDeCommentaire, .fil] : [.composeurDeCommentaire]
        case .interactionSticker: return [.composeur]
        case .interactionReel: return [.fil, .composeur]
        case .interactionDefilement: return [.lecteurDeReels]
        case .interactionStory: return appareil == .ipad ? [.fil] : [.racine]
        case .interactionVocal: return [.conversation(conversationId ?? "")]
        case .interactionEmojiPost: return appareil == .ipad ? [.paletteDeReactionsPrete, .fil] : [.paletteDeReactionsPrete]
        case .jeuRang, .jeuCoffre, .jeuFrappe, .jeuNiveau, .jeuBadge:
            let fiche = VitrineEvenement.fiche(celebration?.concept ?? .level)
            return appareil == .ipad ? [fiche, .fil] : [fiche]
        }
    }
}

/// Le relais entre les écrans et la scène : les écrans SIGNALENT, la scène ATTEND.
@MainActor
final class VitrineRendu {
    static let shared = VitrineRendu(actif: VitrineLaunch.isActive)

    private let actif: Bool
    private(set) var observes: Set<VitrineEvenement> = []
    /// La conversation affichée : la scène y fait le geste du lecteur.
    private(set) weak var conversation: ConversationViewModel?
    /// Ouvre une page du jeu par le routeur de l'écran Progression rendu (#9805) — comme le toucher d'une carte.
    private(set) var ouvrirLeJeu: ((Route) -> Void)?
    private var attentes: [(attendus: Set<VitrineEvenement>, suite: CheckedContinuation<Void, Never>)] = []

    init(actif: Bool) {
        self.actif = actif
    }

    // Deinit isolée synthétisée (SE-0466) : double libération sous iOS 26.1 hors d'une tâche
    // (MainActorDeinitSourceGuardTests).
    nonisolated deinit {}

    func signaler(_ evenement: VitrineEvenement) {
        guard actif, observes.insert(evenement).inserted else { return }
        let comblees = attentes.filter { $0.attendus.isSubset(of: observes) }
        attentes.removeAll { $0.attendus.isSubset(of: observes) }
        comblees.forEach { $0.suite.resume() }
    }

    /// L'écran Progression est rendu : il prête son routeur, la scène du jeu y pousse sa fiche.
    func progressionAffichee(ouvrir: @escaping (Route) -> Void) {
        guard actif else { return }
        ouvrirLeJeu = ouvrir
        signaler(.progression)
    }

    func conversationAffichee(_ viewModel: ConversationViewModel, visibles: [String]) {
        guard actif, !visibles.isEmpty else { return }
        conversation = viewModel
        signaler(.conversation(viewModel.conversationId))
    }

    /// L'appui long sur un message, tel que la liste le remet à la conversation (#9810).
    private(set) var appuyerLongtemps: ((String) -> Void)?
    /// Le toucher d'un émoji de la bande du menu unifié ouvert (#9810).
    private(set) var reagirAuMenu: ((String) -> Void)?

    /// La liste de messages tourne : elle prête son gestionnaire d'appui long, la scène y ouvre le menu unifié.
    func listeDeMessagesAffichee(appuiLong: @escaping (String) -> Void) {
        guard actif else { return }
        appuyerLongtemps = appuiLong
    }

    /// La bande d'émojis du menu est montée : elle prête son geste, la scène y pose l'émoji.
    func menuDeReactionsAffiche(reagir: @escaping (String) -> Void) {
        guard actif else { return }
        reagirAuMenu = reagir
        signaler(.menuDeReactions)
    }

    /// La fin d'un enregistrement envoyé, dans le composeur de commentaire d'un post (#9810).
    private(set) var envoyerUnVocal: ((URL, TimeInterval) -> Void)?
    /// L'appui long sur le cœur d'un post, qui ouvre la palette (#9810).
    private(set) var ouvrirLaPalette: (() -> Void)?
    /// Le toucher d'un émoji de la palette ouverte (#9810).
    private(set) var choisirDansLaPalette: ((String) -> Void)?

    /// Le défilement du détail d'un post jusqu'à ses commentaires (#9810) : le commentaire envoyé — le premier de la
    /// liste — est ramené dans la vue, comme le doigt le ferait.
    private(set) var montrerLesCommentaires: (() -> Void)?

    func commentairesAffiches(montrer: @escaping () -> Void) {
        guard actif else { return }
        montrerLesCommentaires = montrer
    }

    func composeurDeCommentaireAffiche(envoyerUnVocal: @escaping (URL, TimeInterval) -> Void) {
        guard actif else { return }
        self.envoyerUnVocal = envoyerUnVocal
        signaler(.composeurDeCommentaire)
    }

    func paletteDeReactionsPrete(ouvrir: @escaping () -> Void) {
        guard actif else { return }
        ouvrirLaPalette = ouvrir
        signaler(.paletteDeReactionsPrete)
    }

    func paletteDeReactionsAffichee(choisir: @escaping (String) -> Void) {
        guard actif else { return }
        choisirDansLaPalette = choisir
        signaler(.paletteDeReactions)
    }

    /// Le média que le composeur reçoit à l'ouverture, comme le choix de la photothèque (#9810). Remis UNE fois.
    var mediaDuComposeur: VitrineMediaDOuverture?
    /// La porte du sticker du rail (#9810).
    private(set) var ouvrirLesStickers: (() -> Void)?
    /// Le choix d'un sticker dans la feuille ouverte (#9810).
    private(set) var choisirUnSticker: ((StickerSheetChoice) -> Void)?

    /// Le composeur est monté : il prête sa porte du sticker, et reçoit le média d'ouverture s'il y en a un.
    func composeurAffiche(ouvrirLesStickers: @escaping () -> Void) -> VitrineMediaDOuverture? {
        guard actif else { return nil }
        self.ouvrirLesStickers = ouvrirLesStickers
        let media = mediaDuComposeur
        mediaDuComposeur = nil
        signaler(.composeur)
        return media
    }

    /// Le chevron du socle (#9820) : l'auteur y arme « Réel ».
    private(set) var armerDepuisLeComposeur: ((ComposerPublishChoice) -> Void)?
    /// La flèche du socle, pressée une fois le choix armé et relu : « Publier ».
    private(set) var publierDepuisLeComposeur: ((ComposerPublishChoice) -> Void)?

    func composeurPretAPublier(armer: @escaping (ComposerPublishChoice) -> Void, publier: @escaping (ComposerPublishChoice) -> Void) {
        guard actif else { return }
        armerDepuisLeComposeur = armer
        publierDepuisLeComposeur = publier
    }

    /// Révèle le fil sur iPhone, comme l'accès rapide de la liste (#9820). Sur iPad, le fil occupe déjà la colonne gauche.
    private(set) var montrerLeFil: (() -> Void)?

    func racineAffichee(montrerLeFil: @escaping () -> Void) {
        guard actif else { return }
        self.montrerLeFil = montrerLeFil
        signaler(.racine)
    }

    /// Le passage au réel suivant, comme le pouce qui remonte la page (#9904) : `nil` hors du lecteur des réels.
    private(set) var reelSuivant: (() -> Void)?

    /// Le lecteur des réels est monté sur ses réels : il prête son passage au suivant.
    func lecteurDeReelsAffiche(suivant: @escaping () -> Void) {
        guard actif else { return }
        reelSuivant = suivant
        signaler(.lecteurDeReels)
    }

    func feuilleDeStickersAffichee(choisir: @escaping (StickerSheetChoice) -> Void) {
        guard actif else { return }
        choisirUnSticker = choisir
        signaler(.feuilleDeStickers)
    }

    func attendre(_ attendus: Set<VitrineEvenement>) async {
        guard !attendus.isSubset(of: observes) else { return }
        await withCheckedContinuation { attentes.append((attendus, $0)) }
    }
}
#endif
