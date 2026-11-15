import Foundation
import MeeshySDK

/// **Comment une pièce jointe se CONSOMME**, et ce que la fiche « Vu par » en
/// montre (#7228).
///
/// La règle vit ici, hors de `MessageViewsDetailView`, pour trois raisons :
/// elle s'exerce sans SwiftUI ; la vue frôle le plafond du budget du
/// dépôt (1 000–1 200 lignes), donc on extrait avant d'ajouter ; et il n'y a
/// qu'UN site qui décide — la vue rend, elle ne tranche plus.
///
/// Avant ce lot, `loadAttachmentStatuses()` ne chargeait que les médias à
/// piste (`AttachmentKind.hasTimebasedTrack`) : une image ou un document
/// n'apparaissait nulle part, alors que la passerelle sert leurs ouvertures
/// et leurs téléchargements sur la même route
/// (`GET /api/v1/attachments/:id/status-details`,
/// `services/gateway/src/routes/messages-reads.ts:577`).
nonisolated enum MediaConsumptionFamily: String, CaseIterable, Equatable, Sendable {
    /// Piste audio : ça s'ÉCOUTE — position, compteur d'écoutes, « complet ».
    case listened
    /// Piste vidéo : ça se VISIONNE — position, compteur, « complet ».
    case watched
    /// Tout le reste — image, PDF, tableur, présentation, archive, code,
    /// texte, inconnu : ça s'OUVRE. Aucune position, donc aucune barre de
    /// progression ; un compteur d'ouvertures et une date de téléchargement.
    ///
    /// La partition se fait par l'ABSENCE de piste, jamais par une liste de
    /// deux familles : `AttachmentKind` en compte onze, et un `application/pdf`
    /// rend `.pdf` — pas `.document`. Énumérer `image` et `document` laissait
    /// donc dehors le document le plus courant du produit.
    case opened

    init(kind: AttachmentKind) {
        switch kind {
        case .audio: self = .listened
        case .video: self = .watched
        default: self = .opened
        }
    }

    init(mimeType: String) {
        self.init(kind: AttachmentKind(mimeType: mimeType))
    }

    /// Seul un média à piste a une progression à montrer. Une image ouverte
    /// n'est ni « à 40 % » ni « complète ».
    var showsProgress: Bool { self != .opened }
}

/// Ce qu'une LIGNE de participant affiche dans la carte de consommation, une
/// fois la famille connue. Type SOMME rendu par une seule fonction : la vue
/// n'a plus six ternaires à tenir d'accord entre eux.
nonisolated struct MediaConsumptionReading: Equatable, Sendable {
    /// Quand ce participant a consommé la pièce — écoutée, visionnée, ouverte.
    let consumedAt: Date?
    /// Quand il l'a téléchargée. Servi pour TOUTES les familles ; affiché là
    /// où la barre de progression ne prend pas la place.
    let downloadedAt: Date?
    /// Nombre de consommations — écoutes, visionnages ou OUVERTURES.
    let count: Int?
    let isComplete: Bool
    let positionMs: Int?
}

/// `nonisolated` : la règle est PURE. Sans cela, l'isolation MainActor par
/// défaut du projet (SE-0466, `project.yml`) la rendrait inappelable depuis une
/// tâche de fond et intestable hors du MainActor.
nonisolated enum MessageViewsConsumption {

    /// Les pièces jointes dont la fiche charge les statuts : **toutes**.
    ///
    /// Une image et un document ont des ouvertures et des téléchargements à
    /// montrer exactement comme un vocal a des écoutes.
    static func statusTargets(in attachments: [MessageAttachment]) -> [MessageAttachment] {
        attachments
    }

    /// Les pièces jointes qui peuplent l'onglet d'une famille.
    static func attachments(
        _ attachments: [MessageAttachment],
        in family: MediaConsumptionFamily
    ) -> [MessageAttachment] {
        attachments.filter { MediaConsumptionFamily(mimeType: $0.mimeType) == family }
    }

    /// Les familles qui méritent un onglet, dans l'ordre d'affichage. Une
    /// famille sans pièce jointe n'ouvre pas d'onglet vide.
    static func families(in attachments: [MessageAttachment]) -> [MediaConsumptionFamily] {
        MediaConsumptionFamily.allCases.filter { family in
            attachments.contains { MediaConsumptionFamily(mimeType: $0.mimeType) == family }
        }
    }

    /// Ce que la ligne d'un participant montre pour cette famille.
    ///
    /// `viewCount` vient de la passerelle (`MessageReadStatusService
    /// .getAttachmentStatusDetails`) et n'est lu que par `.opened` : c'est le
    /// « Nx » d'une image rouverte trois fois.
    static func reading(
        for user: AttachmentStatusUser,
        in family: MediaConsumptionFamily
    ) -> MediaConsumptionReading {
        switch family {
        case .listened:
            return MediaConsumptionReading(
                consumedAt: user.listenedAt,
                downloadedAt: user.downloadedAt,
                count: user.listenCount,
                isComplete: user.listenedComplete ?? false,
                positionMs: user.lastPlayPositionMs
            )
        case .watched:
            return MediaConsumptionReading(
                consumedAt: user.watchedAt,
                downloadedAt: user.downloadedAt,
                count: user.watchCount,
                isComplete: user.watchedComplete ?? false,
                positionMs: user.lastWatchPositionMs
            )
        case .opened:
            return MediaConsumptionReading(
                consumedAt: user.viewedAt,
                downloadedAt: user.downloadedAt,
                count: user.viewCount,
                isComplete: false,
                positionMs: nil
            )
        }
    }

    /// Un `attachment-status:updated` relance-t-il les cartes de CETTE fiche ?
    /// Seulement s'il porte sur CE message : la fiche retourne au réseau pour
    /// chacune de ses pièces jointes, et l'écoute d'un autre vocal du même fil
    /// n'y change rien (#7360).
    static func refreshesCards(
        on event: AttachmentStatusUpdatedEvent,
        messageId: String,
        conversationId: String
    ) -> Bool {
        event.conversationId == conversationId && event.messageId == messageId
    }
}
