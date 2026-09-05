import Foundation
import UIKit
import MeeshySDK
import MeeshyUI
import os

/// **La pièce partagée depuis une autre app, reprise pour être COMPOSÉE** —
/// vue `2a` de la planche (#5056).
///
/// ## Le pont, et pourquoi il en faut un
///
/// L'extension de partage tourne **sans dépendance SDK** : elle ne peut pas
/// monter le composer, qui vit ici. Elle copie les fichiers dans le conteneur
/// App Group (ce qu'elle fait déjà pour l'envoi) et dépose une fiche ;
/// ce consommateur la reprend, matérialise la pièce en `StoryComposerSeed` et
/// la remet au meuble.
///
/// **Aucune seconde fabrique de graine.** La matérialisation est celle de
/// `ConversationMediaSeeding` — mêmes trois branches, même plafond de 1080 px,
/// mêmes raisons : une vidéo reste un FICHIER (la décoder perdrait le son et le
/// mouvement), une image se décode hors du main actor parce que la POSE, elle,
/// doit rester synchrone (`restoreCanvas` est un instantané qui ne relit jamais
/// ce qui arrive après lui).
///
/// ## Deux déclencheurs, un seul état
///
/// L'extension tente d'ouvrir `meeshy://compose-share?id=…` — un RACCOURCI.
/// `extensionContext.open` peut échouer sans que rien ne le dise ; si elle était
/// le seul déclencheur, la pièce serait perdue. L'app balaie donc ce répertoire
/// à chaque réveil, comme `SharePendingSendConsumer` le fait pour les envois.
///
/// > **Un raccourci ne doit jamais être le seul chemin.** Ce qui décide, c'est
/// > la fiche sur le disque ; l'ouverture ne fait que gagner un geste.
///
/// ## L'invariant repris de son jumeau
///
/// **La suppression suit la consommation, jamais l'inverse.** Un échec
/// transitoire (fichier illisible, décodage raté) laisse la fiche sur le disque
/// pour la tentative suivante. Ce qui est effacé l'est quand l'auteur a fermé le
/// composer — pas quand on la lit.
@MainActor
final class ShareComposeHandoffConsumer: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = ShareComposeHandoffConsumer()

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "share-compose")

    // MARK: - Le contrat, dupliqué

    /// Miroir de `ShareComposeHandoff` (cible MeeshyShareExtension). Les deux
    /// cibles ne peuvent pas partager un type — l'extension est délibérément
    /// sans dépendance SDK — donc le contrat est dupliqué et
    /// `ShareComposeContractTests` vérifie que les miroirs s'accordent.
    nonisolated static let appGroupIdentifier = "group.me.meeshy.apps"
    nonisolated static let directoryName = "share_pending_composes"
    nonisolated static let mediaDirectoryName = "share_pending_media"
    nonisolated static let currentVersion = 1

    nonisolated struct Media: Codable, Equatable, Sendable {
        let relPath: String
        let ext: String
        let mime: String
        let bytes: Int
    }

    nonisolated struct Handoff: Codable, Equatable, Sendable {
        let version: Int
        let shareId: String
        let createdAt: Date
        let text: String?
        let media: [Media]
    }

    // MARK: - Ce que la porte présente

    /// La pièce prête à composer, ou `nil`. `Identifiable` par son `shareId` :
    /// c'est ce qui permet à un `fullScreenCover(item:)` de rouvrir le composer
    /// sur une SECONDE fiche sans démonter la première par un simple booléen.
    struct PendingCompose: Identifiable, Equatable {
        let shareId: String
        let seed: StoryComposerSeed
        var id: String { shareId }

        static func == (lhs: PendingCompose, rhs: PendingCompose) -> Bool {
            lhs.shareId == rhs.shareId
        }
    }

    @Published private(set) var pending: PendingCompose?

    // MARK: - Lecture

    /// Reprend la fiche demandée, ou la PLUS ANCIENNE quand aucun identifiant
    /// n'est donné (le balayage de réveil).
    ///
    /// La plus ancienne et non la plus récente : deux partages rapides
    /// arriveraient dans l'ordre où l'auteur les a faits, pas dans l'inverse.
    func consumeNext(id: String? = nil, fileManager: FileManager = .default) async {
        guard pending == nil else { return }
        guard let fiche = lireFiche(id: id, fileManager: fileManager) else { return }
        guard let graine = await materialiser(fiche, fileManager: fileManager) else {
            // La fiche RESTE : un décodage raté peut venir d'un fichier encore
            // en cours de copie. La supprimer ici perdrait la pièce sans trace.
            Self.logger.warning("compose handoff \(fiche.shareId, privacy: .public) non matérialisable — conservée")
            return
        }
        pending = PendingCompose(shareId: fiche.shareId, seed: graine)
    }

    /// L'auteur a fermé le composer : la fiche et ses fichiers partent.
    ///
    /// Appelé à la publication comme à l'abandon — dans les deux cas la pièce a
    /// été VUE, et la garder ferait rouvrir le composer au prochain réveil sur
    /// un contenu que l'auteur vient de traiter.
    func finish(_ shareId: String, fileManager: FileManager = .default) {
        if pending?.shareId == shareId { pending = nil }
        guard let dossier = Self.directoryURL(fileManager: fileManager) else { return }
        try? fileManager.removeItem(at: dossier.appendingPathComponent("\(shareId).json"))
        if let medias = Self.mediaRootURL(fileManager: fileManager) {
            try? fileManager.removeItem(at: medias.appendingPathComponent(shareId, isDirectory: true))
        }
    }

    // MARK: - Chemins

    nonisolated static func directoryURL(fileManager: FileManager = .default) -> URL? {
        fileManager
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
            .appendingPathComponent(directoryName, isDirectory: true)
    }

    nonisolated static func mediaRootURL(fileManager: FileManager = .default) -> URL? {
        fileManager
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
            .appendingPathComponent(mediaDirectoryName, isDirectory: true)
    }

    // MARK: - Détails

    private func lireFiche(id: String?, fileManager: FileManager) -> Handoff? {
        guard let dossier = Self.directoryURL(fileManager: fileManager),
              let entrees = try? fileManager.contentsOfDirectory(at: dossier, includingPropertiesForKeys: nil)
        else { return nil }
        let fiches = entrees
            .filter { $0.pathExtension == "json" }
            .compactMap { url -> Handoff? in
                guard let donnees = try? Data(contentsOf: url) else { return nil }
                return try? JSONDecoder.meeshyShareCompose.decode(Handoff.self, from: donnees)
            }
            // Une fiche d'une version FUTURE est ignorée, jamais devinée : un
            // champ qu'on ne sait pas lire peut être celui qui porte la
            // protection du contenu.
            .filter { $0.version <= Self.currentVersion }
        if let id { return fiches.first { $0.shareId == id } }
        return fiches.min { $0.createdAt < $1.createdAt }
    }

    /// **La PREMIÈRE pièce, et une seule.** Le composer sème UNE slide ; lui en
    /// remettre plusieurs demanderait de choisir laquelle porte la scène, ce que
    /// la vue `2a` ne tranche pas. Les suivantes restent envoyables par le
    /// chemin nominal — dette NOMMÉE, pas un oubli.
    private func materialiser(_ fiche: Handoff, fileManager: FileManager) async -> StoryComposerSeed? {
        guard let premier = fiche.media.first else {
            // Un partage de TEXTE seul : la description EST le semis. La
            // fabrique du SDK refuse un texte vide, et ce `nil` remonte tel quel.
            return fiche.text.flatMap(StoryComposerSeed.text)
        }
        guard let racine = Self.mediaRootURL(fileManager: fileManager),
              let forme = ComposableAttachment.form(mimeType: premier.mime)
        else { return nil }
        let fichier = racine.appendingPathComponent(premier.relPath)
        guard fileManager.fileExists(atPath: fichier.path) else { return nil }

        switch forme {
        case .video:
            return StoryComposerSeed.video(copying: fichier)
                .map { StoryComposerSeed(payload: $0.payload, description: fiche.text) }
        case .audio:
            return StoryComposerSeed.audio(copying: fichier)
                .map { StoryComposerSeed(payload: $0.payload, description: fiche.text) }
        case .image:
            guard let donnees = try? Data(contentsOf: fichier, options: .mappedIfSafe),
                  let bitmap = await StoryMediaLoader.shared.loadImage(data: donnees, maxDimension: 1080)
            else { return nil }
            return StoryComposerSeed(payload: .image(bitmap), description: fiche.text)
        }
    }
}

extension JSONDecoder {
    /// Dates en ISO 8601 des DEUX côtés — un encodage par défaut traverserait
    /// sans erreur et se relirait faux le jour où l'un des miroirs changerait.
    nonisolated static var meeshyShareCompose: JSONDecoder {
        let decodeur = JSONDecoder()
        decodeur.dateDecodingStrategy = .iso8601
        return decodeur
    }
}
