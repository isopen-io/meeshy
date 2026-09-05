import Foundation

/// **La pièce qu'on veut COMPOSER plutôt qu'envoyer telle quelle** — vue `2a`
/// de la planche, « Entrée externe : publier une pièce jointe » (#5056).
///
/// > « Le format se choisit là où la pièce arrive. Un profil que la pièce ne
/// > peut pas tenir est montré désactivé avec sa raison, jamais masqué :
/// > l'utilisateur apprend la règle au lieu de la deviner. »
///
/// ## Pourquoi un RELAIS et pas une composition dans l'extension
///
/// L'extension tourne **sans dépendance SDK** — c'est un invariant assumé, pas
/// un accident : elle est plafonnée à ~120 Mo et tuable à tout instant. Le
/// composer, lui, vit dans l'app. Composer ici est donc impossible, et le nier
/// aurait produit une seconde surface de composition, plus pauvre, à faire
/// diverger de la première.
///
/// Cette fiche est le seul pont : l'extension COPIE (elle le fait déjà pour
/// l'envoi, `ShareMediaStaging`), DÉCRIT, et rend la main. L'app matérialise et
/// monte le meuble.
///
/// ## Ce que ce relais NE remet pas en cause
///
/// L'en-tête de `ShareViewController` dit « l'extension est AUTONOME […] et
/// n'ouvre jamais l'app ». L'invariant porte sur l'ENVOI, et il tient : envoyer
/// vers une conversation reste entièrement autonome, hors-ligne compris.
/// Composer est une SECONDE voie, qui a besoin de l'app par nature — pas une
/// dépendance nouvelle du chemin nominal.
///
/// **La fiche survit à l'échec de l'ouverture.** `extensionContext.open` peut
/// échouer sans que rien ne le dise ; si elle était le seul déclencheur, la
/// pièce serait perdue. L'app balaie donc ce répertoire à chaque réveil, comme
/// `SharePendingSendConsumer` le fait pour les envois. L'ouverture n'est qu'un
/// RACCOURCI.
///
/// Le contrat est DUPLIQUÉ côté app (`ShareComposeHandoffConsumer.Handoff`) —
/// les deux cibles ne peuvent pas partager un type. `ShareComposeContractTests`
/// compile les deux miroirs et vérifie qu'ils s'accordent, champ par champ.
nonisolated struct ShareComposeHandoff: Codable, Equatable, Sendable {

    typealias Media = ShareStagedMedia

    static let appGroupIdentifier = "group.me.meeshy.apps"
    static let directoryName = "share_pending_composes"
    static let currentVersion = 1

    let version: Int
    /// Le même identifiant que celui du staging : c'est lui qui nomme le
    /// sous-dossier où les fichiers ont été copiés. Le recalculer côté app
    /// ferait deux sources pour un même chemin.
    let shareId: String
    let createdAt: Date
    /// Le texte reçu à côté des fichiers — une légende de départ, jamais une
    /// obligation. `nil` quand le partage ne portait que des fichiers.
    let text: String?
    let media: [Media]

    init(shareId: String, createdAt: Date, text: String?, media: [Media]) {
        self.version = Self.currentVersion
        self.shareId = shareId
        self.createdAt = createdAt
        self.text = text
        self.media = media
    }

    /// Le répertoire des fiches, dans le conteneur App Group.
    static func directoryURL(
        fileManager: FileManager = .default,
        appGroup: String = appGroupIdentifier
    ) -> URL? {
        fileManager
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent(directoryName, isDirectory: true)
    }

    /// **Une écriture ATOMIQUE, et c'est la seule forme acceptable.** L'app peut
    /// balayer ce répertoire à n'importe quel instant, y compris pendant que
    /// l'extension écrit ; une écriture partielle donnerait une fiche qui décode
    /// mal, donc une pièce perdue sans trace.
    func write(fileManager: FileManager = .default) throws {
        guard let dossier = Self.directoryURL(fileManager: fileManager) else {
            throw ShareComposeHandoffError.appGroupUnavailable
        }
        try fileManager.createDirectory(at: dossier, withIntermediateDirectories: true)
        let donnees = try JSONEncoder.meeshyShareCompose.encode(self)
        try donnees.write(to: dossier.appendingPathComponent("\(shareId).json"), options: .atomic)
    }

    /// L'URL qui demande à l'app d'ouvrir le composer sur cette fiche.
    ///
    /// Elle porte l'identifiant pour que l'app sache LAQUELLE ouvrir quand
    /// plusieurs fiches attendent — sans lui, un partage rapide en suivrait un
    /// autre et la seconde ouverture montrerait la première pièce.
    var openURL: URL? {
        var composants = URLComponents()
        composants.scheme = "meeshy"
        composants.host = "compose-share"
        composants.queryItems = [URLQueryItem(name: "id", value: shareId)]
        return composants.url
    }
}

nonisolated enum ShareComposeHandoffError: Error, Equatable {
    case appGroupUnavailable
}

extension JSONEncoder {
    /// Dates en ISO 8601 des DEUX côtés — un encodage par défaut
    /// (`timeIntervalSinceReferenceDate`) traverserait sans erreur et se
    /// relirait faux le jour où l'un des deux miroirs changerait de stratégie.
    nonisolated static var meeshyShareCompose: JSONEncoder {
        let encodeur = JSONEncoder()
        encodeur.dateEncodingStrategy = .iso8601
        return encodeur
    }
}

extension JSONDecoder {
    nonisolated static var meeshyShareCompose: JSONDecoder {
        let decodeur = JSONDecoder()
        decodeur.dateDecodingStrategy = .iso8601
        return decodeur
    }
}
