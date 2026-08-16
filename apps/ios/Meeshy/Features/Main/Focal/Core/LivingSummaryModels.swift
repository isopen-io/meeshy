import Foundation
import MeeshySDK

/// Modèles PURS du Résumé Vivant (contrat Focal §3.7) — digest déterministe,
/// épisodes, entrées de la Rampe. Fichiers déclarés « non-loi » par
/// l'amendement A2 (`tasks/lentille-workshop-execution.md`, en-tête du
/// contrat Focal) : `LivingSummaryModels` reste Swift, PAS de mirroir
/// TypeScript — seule `FocalRowInput`/`ComposerRichTextContracts` partagent
/// ce statut.
///
/// **RE-PREUVE (§0, avant écriture)** : ce fichier N'EXISTAIT PAS.
/// L'arborescence du contrat §1.1 le place sous `Focal/Core/` (propriété
/// WS-0), mais le Core gelé S1 livré (M-042/043/044) ne porte QUE
/// `ReadingModeOrchestrator`/`FocalFocusCurve`/`ScrollTimePillLaw` — WS-0 ne
/// l'a jamais livré (même constat que `FocalMetrics.swift`, `FocalRowInput.swift`,
/// tâche 0 de ce workshop). `Focal/Core/` n'est pas gelé dans son ensemble :
/// ce fichier est un AJOUT, jamais une édition d'un fichier gelé — créé ici
/// (WS-8/F-087, premier et seul consommateur aujourd'hui) au domicile
/// canonique du contrat.
///
/// **Types NON prescrits littéralement par le §3.7** (le contrat ne donne pas
/// leurs signatures) — construits ici par nécessité, documentés au site :
/// `DigestParticipant`, `DigestInputMessage`, `DigestMediaKind`. Aucun ne
/// rivalise avec un type gelé existant (RE-PREUVE : `rg` vide sur ces trois
/// noms avant écriture).
nonisolated public enum DigestMediaKind: String, Equatable, Sendable {
    case image, video, audio, file, location
}

/// Message vu par le segmenteur d'épisodes (§3.7, prescrit mot pour mot).
nonisolated public struct EpisodeInputMessage: Equatable, Sendable {
    public let id: String
    public let senderId: String
    public let createdAt: Date
    public let replyToId: String?
    public let isSystem: Bool

    public init(id: String, senderId: String, createdAt: Date, replyToId: String?, isSystem: Bool) {
        self.id = id
        self.senderId = senderId
        self.createdAt = createdAt
        self.replyToId = replyToId
        self.isSystem = isSystem
    }
}

/// Message vu par `DeterministicDigestBuilder` — COMPOSE `EpisodeInputMessage`
/// (`base`) plutôt que de dupliquer ses cinq champs : un seul message
/// canonique construit par l'appelant, `base` réutilisable tel quel comme
/// entrée du segmenteur (`messages.map(\.base)`). Aucune seconde loi de
/// résumé (mission F-087) : ce type ne fait QUE porter les signaux déjà
/// résolus par l'appelant (mêmes données que celles qui alimentent
/// `LentilleBridgeFormatter.buildBridgeData`, en plus riche) — il ne
/// réinterprète jamais un texte brut pour DÉCIDER qu'un message mentionne le
/// lecteur : `mentionsViewer` est un signal PRÉ-RÉSOLU, fourni par
/// l'appelant, exactement comme `FocalRowInput.mentionDisplayNames` est
/// résolu en amont plutôt que recalculé par la rangée. Aucun analyseur de
/// mention canonique n'existe côté Swift aujourd'hui (RE-PREUVE : `rg
/// "parseMentions|MentionParser"` vide sous `apps/ios`) — en fabriquer un
/// second ici, approximatif, aurait été la « seconde loi » interdite par la
/// mission ; le déléguer à l'appelant garde ce fichier à zéro donnée
/// fabriquée et à zéro loi rivale.
nonisolated public struct DigestInputMessage: Equatable, Sendable {
    public let base: EpisodeInputMessage
    /// Texte brut — utilisé UNIQUEMENT pour détecter une question finale
    /// (`hasSuffix("?")`, ponctuation réelle, zéro heuristique de contenu).
    public let content: String
    /// `originalLanguage` du message (`MeeshyMessage.originalLanguage`), ou
    /// `nil` si inconnu de l'appelant.
    public let languageCode: String?
    /// Un élément par pièce jointe réelle (`MeeshyMessageAttachment.type`).
    public let attachmentKinds: [DigestMediaKind]
    /// `MeeshyMessage.trackedLinkMap.count` — liens sortants réellement
    /// suivis dans ce message (champ RÉEL, pas un comptage regex inventé).
    public let linkCount: Int
    /// Pré-résolu par l'appelant — voir doc de tête.
    public let mentionsViewer: Bool

    public var id: String { base.id }
    public var senderId: String { base.senderId }
    public var createdAt: Date { base.createdAt }
    public var replyToId: String? { base.replyToId }
    public var isSystem: Bool { base.isSystem }

    public init(
        base: EpisodeInputMessage,
        content: String,
        languageCode: String?,
        attachmentKinds: [DigestMediaKind],
        linkCount: Int,
        mentionsViewer: Bool
    ) {
        self.base = base
        self.content = content
        self.languageCode = languageCode
        self.attachmentKinds = attachmentKinds
        self.linkCount = linkCount
        self.mentionsViewer = mentionsViewer
    }
}

/// Un participant tel que la Rampe/le digest en ont besoin — identité +
/// présence, jamais recalculées ici (`PresenceManager` reste la source de
/// vérité, réutilisation §6.1).
nonisolated public struct DigestParticipant: Equatable, Sendable, Identifiable {
    public let id: String
    public let displayName: String
    public let avatarURL: String?
    public let colorHex: String
    public let presence: PresenceState

    public init(id: String, displayName: String, avatarURL: String?, colorHex: String, presence: PresenceState) {
        self.id = id
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.colorHex = colorHex
        self.presence = presence
    }
}

// MARK: - §3.7 — prescrit mot pour mot

nonisolated public struct ConversationEpisode: Equatable, Sendable, Identifiable {
    public let id: String
    public let start: Date
    public let end: Date
    public let messageIds: [String]
    public let participantIds: [String]
    /// « Lun–Mar · 174 messages » — composé de `MessageDayLabel`. TOUJOURS présent.
    public let deterministicTitle: String
    /// Titre produit par l'agent. `nil` tant qu'aucun agent n'a répondu.
    public let agentTitle: String?
    public var displayTitle: String { agentTitle ?? deterministicTitle }
    public var isAgentTitled: Bool { agentTitle != nil }

    public init(
        id: String,
        start: Date,
        end: Date,
        messageIds: [String],
        participantIds: [String],
        deterministicTitle: String,
        agentTitle: String? = nil
    ) {
        self.id = id
        self.start = start
        self.end = end
        self.messageIds = messageIds
        self.participantIds = participantIds
        self.deterministicTitle = deterministicTitle
        self.agentTitle = agentTitle
    }
}

nonisolated public struct SenderTally: Equatable, Sendable {
    public let userId: String
    public let messageCount: Int
    public let lastAt: Date

    public init(userId: String, messageCount: Int, lastAt: Date) {
        self.userId = userId
        self.messageCount = messageCount
        self.lastAt = lastAt
    }
}

nonisolated public struct LanguageTally: Equatable, Sendable {
    public let code: String
    public let messageCount: Int

    public init(code: String, messageCount: Int) {
        self.code = code
        self.messageCount = messageCount
    }
}

nonisolated public struct MediaTally: Equatable, Sendable {
    public let images: Int
    public let videos: Int
    public let audios: Int
    public let files: Int
    public let locations: Int
    public let links: Int

    public init(images: Int, videos: Int, audios: Int, files: Int, locations: Int, links: Int) {
        self.images = images
        self.videos = videos
        self.audios = audios
        self.files = files
        self.locations = locations
        self.links = links
    }

    public static let empty = MediaTally(images: 0, videos: 0, audios: 0, files: 0, locations: 0, links: 0)
}

/// Une chose qui m'attend. TOUJOURS adossée à des messages réels.
nonisolated public struct AwaitingItem: Equatable, Sendable, Identifiable {
    public enum Kind: String, Sendable { case mention, directReply, unansweredQuestion }
    public let id: String
    public let kind: Kind
    public let fromUserId: String
    /// Non vide par construction. Une ligne sans preuve n'est pas produite.
    public let evidenceMessageIds: [String]
    public let at: Date

    /// `nil` si `evidenceMessageIds` est vide (interdit #2 du contrat §6.3 :
    /// « une ligne sans preuve est rejetée à la construction, pas filtrée à
    /// l'affichage »).
    public init?(id: String, kind: Kind, fromUserId: String, evidenceMessageIds: [String], at: Date) {
        guard !evidenceMessageIds.isEmpty else { return nil }
        self.id = id
        self.kind = kind
        self.fromUserId = fromUserId
        self.evidenceMessageIds = evidenceMessageIds
        self.at = at
    }
}

nonisolated public struct DeterministicConversationDigest: Equatable, Sendable {
    public let messageCount: Int
    public let participantCount: Int
    public let start: Date?
    public let end: Date?
    public let topSenders: [SenderTally]
    public let languages: [LanguageTally]
    public let media: MediaTally
    public let awaitingYou: [AwaitingItem]
    public let episodes: [ConversationEpisode]
    /// `false` ⇒ la fenêtre chargée ne couvre PAS tout le non-lu.
    /// L'UI DOIT alors libeller les chiffres comme partiels.
    public let isComplete: Bool

    public init(
        messageCount: Int,
        participantCount: Int,
        start: Date?,
        end: Date?,
        topSenders: [SenderTally],
        languages: [LanguageTally],
        media: MediaTally,
        awaitingYou: [AwaitingItem],
        episodes: [ConversationEpisode],
        isComplete: Bool
    ) {
        self.messageCount = messageCount
        self.participantCount = participantCount
        self.start = start
        self.end = end
        self.topSenders = topSenders
        self.languages = languages
        self.media = media
        self.awaitingYou = awaitingYou
        self.episodes = episodes
        self.isComplete = isComplete
    }

    public static let empty = DeterministicConversationDigest(
        messageCount: 0, participantCount: 0, start: nil, end: nil,
        topSenders: [], languages: [], media: .empty,
        awaitingYou: [], episodes: [], isComplete: true
    )
}

nonisolated public struct FaceRampEntry: Equatable, Sendable, Identifiable {
    public let id: String // userId ou participantId
    public let displayName: String
    public let avatarURL: String?
    public let colorHex: String
    public let presence: PresenceState
    /// Ce qui est AFFICHÉ sur le badge : le nombre de messages qui m'attendent.
    public let awaitingCount: Int
    /// Ce qui SERT AU TRI. Jamais affiché.
    public let needScore: Double
    public let evidenceMessageIds: [String]

    public init(
        id: String,
        displayName: String,
        avatarURL: String?,
        colorHex: String,
        presence: PresenceState,
        awaitingCount: Int,
        needScore: Double,
        evidenceMessageIds: [String]
    ) {
        self.id = id
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.colorHex = colorHex
        self.presence = presence
        self.awaitingCount = awaitingCount
        self.needScore = needScore
        self.evidenceMessageIds = evidenceMessageIds
    }
}

/// Entrée candidate pour `FaceRampRanking.rank` — un participant + les trois
/// listes de preuves déjà groupées PAR PERSONNE (`FaceRampRanking.makeInputs`
/// fait ce regroupement depuis `DeterministicConversationDigest.awaitingYou`).
nonisolated public struct FaceRampRankingInput: Equatable, Sendable {
    public let id: String
    public let displayName: String
    public let avatarURL: String?
    public let colorHex: String
    public let presence: PresenceState
    /// Preuves (`evidenceMessageIds`) des mentions non répondues de cette personne.
    public let mentionEvidence: [String]
    /// Preuves des réponses directes de cette personne à MES messages.
    public let directReplyEvidence: [String]
    /// Preuves des questions sans réponse posées par cette personne.
    public let unansweredQuestionEvidence: [String]
    /// Horodatage le plus RÉCENT parmi toutes les preuves ci-dessus — `nil`
    /// si aucune (score de récence nul).
    public let mostRecentEvidenceAt: Date?

    public init(
        id: String,
        displayName: String,
        avatarURL: String?,
        colorHex: String,
        presence: PresenceState,
        mentionEvidence: [String],
        directReplyEvidence: [String],
        unansweredQuestionEvidence: [String],
        mostRecentEvidenceAt: Date?
    ) {
        self.id = id
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.colorHex = colorHex
        self.presence = presence
        self.mentionEvidence = mentionEvidence
        self.directReplyEvidence = directReplyEvidence
        self.unansweredQuestionEvidence = unansweredQuestionEvidence
        self.mostRecentEvidenceAt = mostRecentEvidenceAt
    }
}
