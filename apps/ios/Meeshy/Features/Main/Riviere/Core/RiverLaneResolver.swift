import Foundation

/// La Rivière — géométrie des couloirs et navigation à deux axes.
///
/// Miroir Swift EXACT (contrat R-130, workshop `tasks/lentille-workshop-execution.md`
/// §7 amendement R, §7bis amendement R2, §7ter amendement R3) de
/// `packages/shared/utils/river-lanes.ts`. Cette loi est GELÉE par S1 : ce
/// fichier s'ALIGNE sur le TS, il ne le réinterprète jamais. Toute divergence
/// de comportement entre ce fichier et la loi TS est un bug de CE fichier.
///
/// ── Ce que la Rivière est ──
/// Une conversation à plusieurs lue sur DEUX axes :
///   - **vertical** : le temps. Un `rank` par message, ordre chronologique
///     global, strictement celui du DOM et de VoiceOver côté peau (les traits
///     sont décoratifs, le contenu prime).
///   - **horizontal** : les interlocuteurs. Un `laneIndex` par branche.
/// Les deux axes se PARCOURENT (`resolveRiverStep`) : descendre suit une
/// personne, traverser change d'interlocuteur sans quitter l'instant.
///
/// ── Ce qu'une branche est ──
/// Pas une ligne infinie : une SUITE DE SEGMENTS. Une branche NAÎT à la
/// première interaction de son propriétaire, COURT tant que la conversation
/// l'entretient, MEURT `silenceWindowMs` après sa dernière interaction, et
/// RENAÎT plus tard dans LA MÊME COLONNE — la colonne est réservée à vie tant
/// que la rivière tient dans sa largeur (§7ter : au-delà de `maxLanes` voix,
/// les colonnes se PARTAGENT entre voix qui ne parlent jamais ensemble).
///
/// ── Ce qu'un avis système n'est pas ──
/// **Un avis système n'est la voix de personne.** « X a rejoint la
/// conversation » porte l'ARRIVANT pour auteur
/// (`packages/shared/utils/join-notice.ts`) : sans marque
/// (`RiverMessageInput.isSystem`), la loi lui donnait une branche à son nom, le
/// comptait comme une voix — au risque de déplier la rivière en couloirs sur la
/// seule foi d'une annonce — et laissait sa première vraie bulle continuer le
/// groupe de sa propre arrivée. Un avis descend l'axe du TEMPS avec les autres
/// et n'entre dans aucun des deux autres axes : ni voix, ni couloir, ni
/// connecteur, ni groupe. La peau le rend pleine largeur
/// (`RiverBubble.isSystem`).
///
/// ── Combien de branches, et sinon quoi ──
/// L'axe horizontal a une LARGEUR FINIE : `maxLanes` couloirs, et il lui faut
/// `minVoices` voix pour valoir la peine. Hors de ces bornes, la loi rend un
/// verdict `.serialized` — la rivière redevient un fil vertical à une seule
/// colonne. Ce n'est PAS l'éligibilité (`resolveCapabilities`, ≥ 5
/// participants actifs, jamais en `direct`, `reading-modes.ts`) : ce
/// verdict-ci décide de la FORME que prend la fenêtre affichée.
///
/// Fonctions pures, zéro I/O, zéro équivalent de `Date.now()` — le temps
/// entre TOUJOURS en paramètre (`createdAt` sur chaque message). `nonisolated`
/// sur le type ET chaque type imbriqué, comme `FocalFocusCurve`/
/// `LentilleSectionResolver` : la cible app compile sous
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` (project.yml), le bundle
/// `MeeshyTests` sous `nonisolated` — sans cette sortie explicite les témoins
/// synchrones de `RiverLaneVectorTests` ne pourraient ni appeler la loi ni
/// comparer ses résultats sans `await`.
///
/// Les peaux (Canvas/Path SwiftUI, overlay SVG web) consomment cette loi et
/// ses constantes, JAMAIS l'inverse — la géométrie de la rivière ne se
/// recalcule pas à façon par plateforme (garde R15).
///
/// Vérifié par vecteurs inter-plateformes (mêmes fixtures que la suite
/// Jest `packages/shared/__tests__/vectors/river-*.vectors.test.ts`) —
/// `RiverLaneVectorTests`,
/// `packages/shared/fixtures/reading-modes/{river-lanes,river-step,river-headers}.vectors.json`.
///
/// @see packages/shared/utils/river-lanes.ts
/// @see tasks/lentille-workshop-execution.md §7, §7bis, §7ter, ligne R-132
/// @see docs/design/2026-08-15-conversation-modes-verdict.html (le procès gagné)
/// @see docs/design/2026-08-17-riviere-navigation.html (maquette normative post-R3)
nonisolated public enum RiverLaneResolver {

    // MARK: - Horodatage d'entrée (miroir de l'union TS `Date | string | number`)

    /// La loi TS accepte `createdAt: Date | string | number` — un parti pris
    /// défensif contre les payloads qui n'ont pas encore fini d'être
    /// normalisés. Le miroir Swift porte la même souplesse : `.date` est la
    /// forme que prendront les call-sites réels (les modèles de message de
    /// l'app portent déjà un `Date`, comme `LentilleSectionResolver`
    /// `lastMessageAt`/`updatedAt`) ; `.iso8601`/`.epochMilliseconds`
    /// existent pour rejouer FIDÈLEMENT les vecteurs partagés, qui
    /// sérialisent `createdAt` en chaîne ISO 8601, et pour tout appelant qui
    /// reçoit encore une horloge sous cette forme.
    public enum RiverTimestamp: Sendable, Equatable {
        case date(Date)
        case iso8601(String)
        case epochMilliseconds(Double)
    }

    // MARK: - Types d'entrée (miroir de RiverMessageInput / RiverParticipantInput / ResolveRiverLanesInput)

    /// Un message tel que la Rivière a besoin de le connaître — rien de plus.
    public struct RiverMessageInput: Sendable, Equatable {
        public let id: String
        public let senderId: String
        public let createdAt: RiverTimestamp
        /// `nil` = message racine. Une cible hors fenêtre ne produit AUCUN connecteur.
        public let replyToMessageId: String?
        /// Un avis SYSTÈME — « X a rejoint la conversation », résumé d'appel…
        /// Miroir de `RiverMessageInput.isSystem` (OPTIONNEL côté TS) : le
        /// défaut `false` tient le même contrat pour les appelants Swift qui
        /// ne connaissent pas encore cette marque.
        ///
        /// Elle est INDISPENSABLE ici parce que `senderId` ne suffit pas à
        /// trancher : l'avis d'arrivée est écrit avec l'ARRIVANT pour auteur
        /// (`packages/shared/utils/join-notice.ts`).
        public let isSystem: Bool

        public init(
            id: String,
            senderId: String,
            createdAt: RiverTimestamp,
            replyToMessageId: String? = nil,
            isSystem: Bool = false
        ) {
            self.id = id
            self.senderId = senderId
            self.createdAt = createdAt
            self.replyToMessageId = replyToMessageId
            self.isSystem = isSystem
        }
    }

    /// Un participant. `displayName` sert de GRAINE DE COULEUR — c'est elle
    /// que la peau passe à `DynamicColorGenerator.colorForName`. La loi ne
    /// calcule aucune couleur : elle nomme la graine.
    public struct RiverParticipantInput: Sendable, Equatable {
        public let id: String
        public let displayName: String

        public init(id: String, displayName: String) {
            self.id = id
            self.displayName = displayName
        }
    }

    public struct ResolveRiverLanesInput: Sendable {
        public let messages: [RiverMessageInput]
        public let participants: [RiverParticipantInput]
        /// Le lecteur. Sa branche, quand elle existe, tient la colonne 0 (la rive).
        public let silenceWindowMs: Double?
        public let maxLanesOverride: Int?
        public let minVoicesOverride: Int?
        public let dayBoundaryOffsetMinutes: Double?
        public let viewerId: String

        public init(
            messages: [RiverMessageInput],
            participants: [RiverParticipantInput],
            viewerId: String,
            silenceWindowMs: Double? = nil,
            maxLanesOverride: Int? = nil,
            minVoicesOverride: Int? = nil,
            dayBoundaryOffsetMinutes: Double? = nil
        ) {
            self.messages = messages
            self.participants = participants
            self.viewerId = viewerId
            self.silenceWindowMs = silenceWindowMs
            self.maxLanesOverride = maxLanesOverride
            self.minVoicesOverride = minVoicesOverride
            self.dayBoundaryOffsetMinutes = dayBoundaryOffsetMinutes
        }
    }

    // MARK: - Types de sortie (miroir de RiverNode / RiverLaneSpan / RiverLane / RiverBubble / RiverConnector / RiverGeometry)

    /// `bubble` = son propriétaire a écrit ici, la ligne CONTOURNE la bulle et
    /// poursuit sa course. `addressed` = on lui a répondu ici : sa branche
    /// reparaît pour recevoir le connecteur, sans bulle à elle.
    public enum RiverNodeKind: String, Sendable, Equatable {
        case bubble
        case addressed
    }

    public struct RiverNode: Sendable, Equatable {
        public let rank: Int
        public let kind: RiverNodeKind
        /// Le message QUI CAUSE ce nœud : la bulle elle-même, ou la réponse qui interpelle.
        public let messageId: String
    }

    /// Un segment de branche : de sa naissance à sa mort. `isOpen` distingue
    /// « la branche est encore vivante au bas de la fenêtre » (aucun
    /// estompage à dessiner — on ne sait pas encore) de « elle s'est éteinte
    /// ici » (estompage).
    public struct RiverLaneSpan: Sendable, Equatable {
        public let startRank: Int
        public let endRank: Int
        public let isOpen: Bool
        public let nodes: [RiverNode]
    }

    public struct RiverLane: Sendable, Equatable {
        public let laneId: String
        /// Colonne RÉSERVÉE à vie — une branche morte garde la sienne, une
        /// naissance ne déplace personne. TANT QUE la rivière tient dans sa
        /// largeur : au-delà, les colonnes se PARTAGENT
        /// (`resolveRiverLaneAt` dit qui l'occupe à une hauteur donnée) —
        /// deux couloirs peuvent porter le même `laneIndex`.
        public let laneIndex: Int
        public let isViewer: Bool
        public let colorSeed: String
        public let spans: [RiverLaneSpan]
    }

    public struct RiverBubble: Sendable, Equatable {
        public let messageId: String
        /// Le couloir qui porte la bulle — et il n'a de sens que pour une
        /// PRISE DE PAROLE. Un avis système (`isSystem`) n'occupe la colonne
        /// de personne : il se rend pleine largeur, et ces deux champs ne se
        /// lisent pas pour lui.
        public let laneId: String
        public let laneIndex: Int
        public let rank: Int
        /// L'heure vit en base de bulle (amendement R) — la loi la sert, la peau la formate.
        public let createdAtMs: Double
        public let isViewer: Bool
        public let replyToMessageId: String?
        /// Tête de groupe : la bulle porte l'en-tête d'identité (pastille +
        /// nom AU-DESSUS du texte), les suivantes ne le répètent pas. MÊME
        /// règle qu'iOS — l'expéditeur du rang précédent change, ou le jour
        /// calendaire change (`MessageListViewController.isFirstInGroup`).
        public let isFirstInGroup: Bool
        /// L'avis système, servi tel quel : il descend l'axe du TEMPS avec les
        /// autres (il a son rang, il est dans `bubbles`), et la peau le rend
        /// PLEINE LARGEUR plutôt qu'en couloir. C'est la seule marque dont
        /// elle a besoin — la loi a déjà retiré l'avis de tout le reste.
        public let isSystem: Bool
    }

    public struct RiverConnector: Sendable, Equatable {
        public let fromMessageId: String
        public let toMessageId: String
        public let fromLaneIndex: Int
        public let toLaneIndex: Int
        public let fromRank: Int
        public let toRank: Int
    }

    /// `.lanes` — la rivière tient sur ses deux axes. `.serialized` — elle
    /// n'en a plus qu'un : le temps. Une peau sérialisée rend le FIL (une
    /// colonne, l'ordre de `bubbles`), pas une rivière étroite.
    public enum RiverLayout: String, Sendable, Equatable {
        case lanes
        case serialized
    }

    /// POURQUOI la rivière s'est sérialisée — jamais un simple booléen : les
    /// deux causes ne se réparent pas de la même façon.
    /// - `.belowMinimum` — moins de `minVoices` voix dans la fenêtre.
    /// - `.aboveMaximum` — il aurait fallu plus de `maxLanes` colonnes en même temps.
    public enum RiverSerializationReason: String, Sendable, Equatable {
        case belowMinimum
        case aboveMaximum
    }

    public struct RiverGeometry: Sendable, Equatable {
        public let lanes: [RiverLane]
        /// Ordre chronologique STRICT — c'est aussi l'ordre du DOM et de VoiceOver côté peau.
        public let bubbles: [RiverBubble]
        public let connectors: [RiverConnector]
        public let rankCount: Int
        /// Nombre de COLONNES occupées (jamais `lanes.count` : elles se partagent).
        public let laneCount: Int
        /// Voix ENTENDUES dans la fenêtre : celles qui ont au moins une bulle.
        public let voiceCount: Int
        public let layout: RiverLayout
        public let serializationReason: RiverSerializationReason?
        public let silenceWindowMs: Double
        public let maxLanes: Int
        public let minVoices: Int
    }

    // MARK: - Constantes gelées (miroir de RIVER_*)

    /// Miroir de `RIVER_LANE_SILENCE_WINDOW_MS` : fenêtre de silence au bout
    /// de laquelle une branche s'éteint — 30 minutes, la durée d'un
    /// « instant de conversation ». Seul nombre de cette loi qui relève d'un
    /// arbitrage produit ; réglable par `silenceWindowMs`, jamais dupliqué en dur.
    public static let laneSilenceWindowMs: Double = 30 * 60 * 1000

    /// Miroir de `RIVER_MAX_LANES` : largeur maximale de l'axe horizontal —
    /// 7 couloirs SIMULTANÉS (pas un plafond de participants ; les colonnes
    /// se partagent au-delà, `resolveRiverLaneAt`).
    public static let maxLanes: Int = 7

    /// Miroir de `RIVER_MIN_VOICES` : nombre de voix en dessous duquel la
    /// rivière ne vaut pas ses couloirs — 3. Distinct du seuil d'éligibilité
    /// (5 participants ACTIFS, `resolveCapabilities`) : ici on juge la
    /// FENÊTRE affichée, qui peut n'avoir entendu que deux voix.
    public static let minVoices: Int = 3

    /// Miroir de `RIVER_HEADER_FADE_RANKS` : sur combien de rangs le nom
    /// d'un couloir s'allume et s'éteint — 2. Réglable par appel.
    public static let headerFadeRanks: Int = 2

    // MARK: - Étape interne : placement chronologique (miroir de placeMessages)

    private struct PlacedMessage {
        let id: String
        let senderId: String
        let timeMs: Double
        let replyToMessageId: String?
        let isSystem: Bool
        let rank: Int
    }

    /// Miroir des deux formats de rejeu ISO 8601 croisés par les fixtures
    /// (`…T09:00:00.000Z` avec millisecondes ; sans, défensivement).
    // `nonisolated(unsafe)` : `ISO8601DateFormatter` n'est pas `Sendable` aux
    // yeux du compilateur mais est documenté thread-safe (contrairement à
    // `DateFormatter` d'avant iOS 7) — sans l'annotation, la stored static
    // d'un type non isolé ne compile pas sous Swift 6.
    private nonisolated(unsafe) static let iso8601WithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private nonisolated(unsafe) static let iso8601WithoutFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    /// `nil` = chaîne illisible — miroir de `new Date(value).getTime()`
    /// produisant `NaN` sur une chaîne invalide côté TS.
    private static func parseIso8601(_ string: String) -> Double? {
        if let date = iso8601WithFractionalSeconds.date(from: string) {
            return date.timeIntervalSince1970 * 1000
        }
        if let date = iso8601WithoutFractionalSeconds.date(from: string) {
            return date.timeIntervalSince1970 * 1000
        }
        return nil
    }

    /// Miroir de `toEpochMs` — `nil`/chaîne illisible devient `NaN`, filtré
    /// juste après par `placeMessages` (jamais un rang inventé).
    private static func toEpochMs(_ timestamp: RiverTimestamp) -> Double {
        switch timestamp {
        case .date(let date):
            return date.timeIntervalSince1970 * 1000
        case .epochMilliseconds(let ms):
            return ms
        case .iso8601(let string):
            return parseIso8601(string) ?? Double.nan
        }
    }

    /// Un message dont l'horodatage est illisible est ÉCARTÉ : l'axe
    /// vertical EST le temps, une bulle sans place dans le temps n'a pas de
    /// rang. Ordre du fleuve : le temps, puis l'identifiant à égalité
    /// d'horodatage — pour que deux plateformes qui reçoivent le même lot
    /// dessinent la MÊME rivière.
    private static func placeMessages(_ messages: [RiverMessageInput]) -> [PlacedMessage] {
        let withTimes = messages.map { message in
            (
                id: message.id,
                senderId: message.senderId,
                timeMs: toEpochMs(message.createdAt),
                replyToMessageId: message.replyToMessageId,
                isSystem: message.isSystem
            )
        }
        let sorted = withTimes
            .filter { !$0.timeMs.isNaN }
            .sorted { lhs, rhs in
                lhs.timeMs != rhs.timeMs ? lhs.timeMs < rhs.timeMs : lhs.id < rhs.id
            }

        return sorted.enumerated().map { index, message in
            PlacedMessage(
                id: message.id,
                senderId: message.senderId,
                timeMs: message.timeMs,
                replyToMessageId: message.replyToMessageId,
                isSystem: message.isSystem,
                rank: index
            )
        }
    }

    /// Les messages qui sont une PRISE DE PAROLE — miroir de `spokenOnly`.
    ///
    /// **Un avis système n'est la voix de personne.** Il descend l'axe du
    /// TEMPS avec les autres — il garde son rang, il est servi dans `bubbles`,
    /// la peau le rend pleine largeur — et il n'entre dans AUCUN des deux
    /// autres axes : il ne fait naître aucune branche, ne prolonge celle de
    /// personne, ne compte pour aucune voix, et n'est le bout d'aucun
    /// connecteur.
    ///
    /// Sans ce filtre, l'avis d'arrivée — écrit avec l'ARRIVANT pour auteur
    /// (`packages/shared/utils/join-notice.ts`) — donnait un couloir à
    /// quelqu'un qui n'avait jamais parlé, et pouvait faire basculer la
    /// rivière de `.serialized` à `.lanes` sur la seule foi d'une annonce.
    private static func spokenOnly(_ placed: [PlacedMessage]) -> [PlacedMessage] {
        placed.filter { !$0.isSystem }
    }

    // MARK: - Étape interne : interactions qui font vivre une branche (miroir de collectEngagements)

    private struct EngagementEvent {
        let rank: Int
        let kind: RiverNodeKind
        let messageId: String
        let timeMs: Double
    }

    /// Les interactions qui font vivre une branche : écrire (`.bubble`) et se
    /// voir répondre (`.addressed`). « On vit tant qu'on parle — ou qu'on
    /// vous parle. »
    private static func collectEngagements(_ placed: [PlacedMessage]) -> [String: [EngagementEvent]] {
        var senderById: [String: String] = [:]
        for message in placed { senderById[message.id] = message.senderId }

        var engagements: [String: [EngagementEvent]] = [:]
        for message in placed {
            engagements[message.senderId, default: []].append(
                EngagementEvent(rank: message.rank, kind: .bubble, messageId: message.id, timeMs: message.timeMs)
            )

            if let replyTo = message.replyToMessageId,
               let addressee = senderById[replyTo],
               addressee != message.senderId {
                engagements[addressee, default: []].append(
                    EngagementEvent(rank: message.rank, kind: .addressed, messageId: message.id, timeMs: message.timeMs)
                )
            }
        }
        return engagements
    }

    // MARK: - Étape interne : découpage en segments (miroir de toSpans)

    private struct Burst {
        var first: EngagementEvent
        var last: EngagementEvent
        var events: [EngagementEvent]
    }

    /// Découpe les interactions d'un participant en segments de branche.
    /// Deux règles, cœur de l'amendement R2 :
    ///  1. Un segment se coupe quand plus de `silenceWindowMs` sépare deux
    ///     interactions consécutives du propriétaire.
    ///  2. Un segment SURVIT à ses propres bulles : il court jusqu'au dernier
    ///     rang encore contenu dans la fenêtre qui suit sa dernière
    ///     interaction — c'est ce qui donne à la rivière sa LARGEUR.
    private static func toSpans(
        events: [EngagementEvent],
        rankTimes: [Double],
        silenceWindowMs: Double
    ) -> [RiverLaneSpan] {
        let sortedEvents = events.sorted { $0.rank < $1.rank }

        var bursts: [Burst] = []
        for event in sortedEvents {
            if let last = bursts.last, event.timeMs - last.last.timeMs <= silenceWindowMs {
                bursts[bursts.count - 1].last = event
                bursts[bursts.count - 1].events.append(event)
            } else {
                bursts.append(Burst(first: event, last: event, events: [event]))
            }
        }

        let lastRank = rankTimes.count - 1

        return bursts.map { burst in
            let deathTime = burst.last.timeMs + silenceWindowMs
            // Les rangs sont triés par le temps : ceux qui précèdent la mort
            // forment un PRÉFIXE, d'où un simple comptage plutôt qu'une
            // recherche indexée.
            let reachedRank = rankTimes.filter { $0 <= deathTime }.count - 1
            let endRank = max(burst.last.rank, reachedRank)

            return RiverLaneSpan(
                startRank: burst.first.rank,
                endRank: endRank,
                isOpen: endRank == lastRank,
                nodes: burst.events.map { RiverNode(rank: $0.rank, kind: $0.kind, messageId: $0.messageId) }
            )
        }
    }

    // MARK: - Étape interne : ordre des colonnes (miroir de orderLaneIds)

    private struct LaneOrderSeed {
        let laneId: String
        let isViewer: Bool
        let birthRank: Int
    }

    /// Ordre des colonnes — RÉSERVÉ, jamais recalculé sur les vivants du
    /// moment : le lecteur d'abord (colonne 0, la rive), puis les autres par
    /// ordre de naissance, l'identifiant tranchant les naissances simultanées.
    private static func orderLaneIds(_ engagements: [String: [EngagementEvent]], viewerId: String) -> [String] {
        let seeds: [LaneOrderSeed] = engagements.map { laneId, events in
            LaneOrderSeed(laneId: laneId, isViewer: laneId == viewerId, birthRank: events.map(\.rank).min() ?? 0)
        }

        let sorted = seeds.sorted { a, b in
            if a.isViewer != b.isViewer { return a.isViewer && !b.isViewer }
            if a.birthRank != b.birthRank { return a.birthRank < b.birthRank }
            return a.laneId < b.laneId
        }

        return sorted.map(\.laneId)
    }

    // MARK: - Étape interne : partage de colonnes (miroir de columnAccepts / packColumns / assignColumns)

    private static func spansOverlap(_ a: RiverLaneSpan, _ b: RiverLaneSpan) -> Bool {
        a.startRank <= b.endRank && b.startRank <= a.endRank
    }

    /// Une colonne accueille une voix de plus si aucun de ses segments ne
    /// croise les siens.
    private static func columnAccepts(held: [RiverLaneSpan], spans: [RiverLaneSpan]) -> Bool {
        !held.contains { occupied in spans.contains { spansOverlap(occupied, $0) } }
    }

    private struct LaneSeed {
        let laneId: String
        let isViewer: Bool
        let spans: [RiverLaneSpan]
    }

    private struct ColumnPacking {
        var columns: [[RiverLaneSpan]] = []
        var indexByLaneId: [(laneId: String, index: Int)] = []
        var overflowed = false
    }

    /// Range les voix en colonnes quand elles sont PLUS NOMBREUSES que la
    /// largeur permise — coloration gloutonne d'intervalles : chaque voix
    /// prend la colonne libre la plus à gauche. La rive (colonne 0) reste au
    /// lecteur SEUL quand il a une branche : le lecteur étant premier dans
    /// l'ordre, il l'ouvre, et les autres cherchent à partir de la colonne 1.
    private static func packColumns(lanes: [LaneSeed], maxLanes: Int) -> ColumnPacking {
        let shoreIsTaken = lanes.first?.isViewer == true
        var packing = ColumnPacking()

        for lane in lanes {
            if packing.overflowed { break }

            let firstShareable = (lane.isViewer || !shoreIsTaken) ? 0 : 1
            var reused: Int?
            var index = firstShareable
            while index < packing.columns.count {
                if columnAccepts(held: packing.columns[index], spans: lane.spans) {
                    reused = index
                    break
                }
                index += 1
            }
            let target = reused ?? packing.columns.count

            if target >= maxLanes {
                packing.overflowed = true
                break
            }

            if target < packing.columns.count {
                packing.columns[target].append(contentsOf: lane.spans)
            } else {
                packing.columns.append(lane.spans)
            }
            packing.indexByLaneId.append((laneId: lane.laneId, index: target))
        }

        return packing
    }

    private struct ColumnAssignment {
        let indexByLaneId: [String: Int]
        let overflowed: Bool
    }

    /// Colonne de chaque voix. Tant que la rivière tient dans sa largeur, une
    /// voix garde SA colonne, pour elle seule et à vie — le partage n'est pas
    /// une optimisation qu'on applique dès qu'elle est possible, c'est le
    /// recours quand il y a plus de voix que de couloirs.
    private static func assignColumns(lanes: [LaneSeed], maxLanes: Int) -> ColumnAssignment {
        if lanes.count <= maxLanes {
            var indexByLaneId: [String: Int] = [:]
            for (index, lane) in lanes.enumerated() { indexByLaneId[lane.laneId] = index }
            return ColumnAssignment(indexByLaneId: indexByLaneId, overflowed: false)
        }

        let packing = packColumns(lanes: lanes, maxLanes: maxLanes)
        var indexByLaneId: [String: Int] = [:]
        for entry in packing.indexByLaneId { indexByLaneId[entry.laneId] = entry.index }
        return ColumnAssignment(indexByLaneId: indexByLaneId, overflowed: packing.overflowed)
    }

    // MARK: - Étape interne : tête de groupe (miroir de dayIndex / isGroupHead)

    private static let dayMs: Double = 24 * 60 * 60 * 1000

    /// Jour calendaire du LECTEUR pour un instant donné — miroir
    /// arithmétique de `Calendar.current.isDate(_:inSameDayAs:)`.
    private static func dayIndex(timeMs: Double, offsetMinutes: Double) -> Int {
        Int(floor((timeMs + offsetMinutes * 60 * 1000) / dayMs))
    }

    /// Deux rangs voisins appartiennent-ils à la même suite ?
    ///
    /// Un message SYSTÈME n'est pas une prise de parole : il n'entre dans
    /// aucune suite, ni comme prédécesseur ni comme successeur. Décider sur le
    /// seul `senderId` faisait suivre la première vraie bulle d'un nouveau
    /// venu dans le groupe de sa propre annonce d'arrivée — qui porte
    /// l'arrivant pour auteur (`packages/shared/utils/join-notice.ts`) — et la
    /// rangée perdait avatar, nom et heure d'un coup.
    ///
    /// Miroirs de cette règle : `apps/web/utils/message-grouping.ts` et
    /// `MessageDayGrouping.isGroupHead` — toute évolution touche les trois.
    private static func continues(_ earlier: PlacedMessage, _ later: PlacedMessage, offsetMinutes: Double) -> Bool {
        if earlier.isSystem || later.isSystem { return false }
        if earlier.senderId != later.senderId { return false }
        return dayIndex(timeMs: earlier.timeMs, offsetMinutes: offsetMinutes)
            == dayIndex(timeMs: later.timeMs, offsetMinutes: offsetMinutes)
    }

    /// Tête de groupe, règle d'iOS mot pour mot : le rang PRÉCÉDENT change
    /// d'expéditeur, change de jour, ou l'un des deux est un avis système. Le
    /// premier rang ouvre toujours un groupe.
    private static func isGroupHead(placed: [PlacedMessage], index: Int, offsetMinutes: Double) -> Bool {
        guard index > 0 else { return true }
        return !continues(placed[index - 1], placed[index], offsetMinutes: offsetMinutes)
    }

    // MARK: - resolveRiverLanes

    /// Géométrie complète de la Rivière pour une fenêtre de messages : les
    /// branches et leurs segments, les bulles dans l'ordre du temps, les
    /// connecteurs de réponse, et le VERDICT de forme (`.lanes`/`.serialized`).
    /// Zéro pixel — la peau multiplie par ses tokens.
    public static func resolveRiverLanes(_ input: ResolveRiverLanesInput) -> RiverGeometry {
        let effectiveSilenceWindowMs = input.silenceWindowMs ?? laneSilenceWindowMs
        let effectiveMaxLanes = input.maxLanesOverride ?? maxLanes
        let effectiveMinVoices = input.minVoicesOverride ?? minVoices
        let effectiveDayBoundaryOffsetMinutes = input.dayBoundaryOffsetMinutes ?? 0

        let placed = placeMessages(input.messages)
        let spoken = spokenOnly(placed)
        // Les rangs restent ceux de TOUTE la fenêtre, avis compris : une
        // branche survit à un avis qui passe, elle ne s'y coupe pas.
        let rankTimes = placed.map(\.timeMs)
        let engagements = collectEngagements(spoken)
        let laneIds = orderLaneIds(engagements, viewerId: input.viewerId)

        var seedByParticipantId: [String: String] = [:]
        for participant in input.participants { seedByParticipantId[participant.id] = participant.displayName }

        let seeds: [LaneSeed] = laneIds.map { laneId in
            LaneSeed(
                laneId: laneId,
                isViewer: laneId == input.viewerId,
                spans: toSpans(events: engagements[laneId] ?? [], rankTimes: rankTimes, silenceWindowMs: effectiveSilenceWindowMs)
            )
        }

        // Une VOIX est une personne qu'on a entendue : au moins une bulle.
        // Une branche `.addressed` seule ne compte pas — sinon deux personnes
        // qui se répondent feraient trois voix. Et une annonce ne compte pas
        // non plus — sinon la rivière se déplierait en couloirs sur la foi
        // d'une arrivée que personne n'a encore entendue parler.
        let voiceCount = Set(spoken.map(\.senderId)).count
        let assignment = assignColumns(lanes: seeds, maxLanes: effectiveMaxLanes)

        let serializationReason: RiverSerializationReason? = assignment.overflowed
            ? .aboveMaximum
            : (voiceCount < effectiveMinVoices ? .belowMinimum : nil)
        let layout: RiverLayout = serializationReason == nil ? .lanes : .serialized

        // Sérialisée, la rivière n'a qu'un couloir — le fil. Les segments
        // restent servis tels quels (avatars, en-têtes de groupe).
        func columnOf(_ laneId: String) -> Int {
            layout == .serialized ? 0 : (assignment.indexByLaneId[laneId] ?? 0)
        }

        let lanes: [RiverLane] = seeds.map { seed in
            RiverLane(
                laneId: seed.laneId,
                laneIndex: columnOf(seed.laneId),
                isViewer: seed.isViewer,
                // Un participant sorti du groupe n'a plus de nom à servir de
                // graine : son identifiant en tient lieu.
                colorSeed: seedByParticipantId[seed.laneId] ?? seed.laneId,
                spans: seed.spans
            )
        }

        var placedById: [String: PlacedMessage] = [:]
        for message in spoken { placedById[message.id] = message }

        let bubbles: [RiverBubble] = placed.enumerated().map { index, message in
            RiverBubble(
                messageId: message.id,
                laneId: message.senderId,
                laneIndex: columnOf(message.senderId),
                rank: message.rank,
                createdAtMs: message.timeMs,
                isViewer: message.senderId == input.viewerId,
                replyToMessageId: message.replyToMessageId,
                isFirstInGroup: isGroupHead(placed: placed, index: index, offsetMinutes: effectiveDayBoundaryOffsetMinutes),
                isSystem: message.isSystem
            )
        }

        // Un connecteur ne pend JAMAIS dans le vide : une cible hors fenêtre
        // (ou effacée) n'a ni rang ni couloir, donc pas de trait. Un avis
        // système n'est le bout d'aucun trait, ni départ ni arrivée : un
        // connecteur relie deux couloirs, et il n'en a pas.
        let connectors: [RiverConnector] = spoken.compactMap { message in
            guard let replyTo = message.replyToMessageId, let target = placedById[replyTo] else { return nil }
            return RiverConnector(
                fromMessageId: message.id,
                toMessageId: target.id,
                fromLaneIndex: columnOf(message.senderId),
                toLaneIndex: columnOf(target.senderId),
                fromRank: message.rank,
                toRank: target.rank
            )
        }

        return RiverGeometry(
            lanes: lanes,
            bubbles: bubbles,
            connectors: connectors,
            rankCount: placed.count,
            laneCount: Set(lanes.map(\.laneIndex)).count,
            voiceCount: voiceCount,
            layout: layout,
            serializationReason: serializationReason,
            silenceWindowMs: effectiveSilenceWindowMs,
            maxLanes: effectiveMaxLanes,
            minVoices: effectiveMinVoices
        )
    }

    // MARK: - resolveRiverLivingLanes / resolveRiverLaneAt

    private static func spanCovering(_ lane: RiverLane, _ rank: Int) -> RiverLaneSpan? {
        lane.spans.first { $0.startRank <= rank && rank <= $0.endRank }
    }

    /// Les branches VIVANTES à ce rang, PAR COLONNE CROISSANTE — c'est la
    /// largeur réelle de l'axe horizontal à cette hauteur, et ce que la
    /// navigation latérale traverse. L'ordre de `geometry.lanes` est l'ordre de
    /// NAISSANCE, qui ne coïncide avec l'ordre de colonne que tant qu'aucune
    /// colonne n'est partagée : dès que `packColumns` réutilise une colonne
    /// libérée, une voix née plus tard peut occuper une colonne plus BASSE
    /// qu'une voix née plus tôt et encore vivante. On trie donc par colonne,
    /// sans quoi le pas latéral (`resolveRiverStep`, qui prend le plus proche
    /// voisin par `first`) sauterait par-dessus des couloirs vivants. Miroir
    /// exact de la loi TS `resolveRiverLivingLanes`. Une branche morte n'est
    /// pas navigable — on l'enjambe.
    ///
    /// Sérialisée, la rivière n'a qu'un couloir : le fil. Elle rend `[0]` sur
    /// tout rang de la fenêtre, et rien en dehors.
    public static func resolveRiverLivingLanes(_ geometry: RiverGeometry, rank: Int) -> [Int] {
        if geometry.layout == .serialized {
            return (rank >= 0 && rank < geometry.rankCount) ? [0] : []
        }

        return geometry.lanes
            .filter { spanCovering($0, rank) != nil }
            .map(\.laneIndex)
            .sorted()
    }

    /// QUI occupe cette colonne à cette hauteur — la question que le partage
    /// de colonnes rend nécessaire. `nil` si la colonne est éteinte là, ou
    /// n'existe pas. Une colonne n'a JAMAIS deux occupants au même rang
    /// (`packColumns` n'y installe que des voix dont les segments ne se
    /// croisent pas) — ce n'est donc pas un choix arbitraire, c'est le seul.
    ///
    /// Sérialisée, la seule colonne appartient, à chaque rang, à l'auteur du
    /// message de ce rang. Sauf au rang d'un avis système : il n'occupe la
    /// colonne de personne (`RiverBubble.laneId` n'a de sens que pour une prise
    /// de parole), donc `nil` — même règle que `serializedOccupancies`, sans
    /// quoi nommer la colonne à ce rang ferait parler quelqu'un qui vient
    /// seulement d'entrer.
    public static func resolveRiverLaneAt(_ geometry: RiverGeometry, laneIndex: Int, rank: Int) -> RiverLane? {
        if geometry.layout == .serialized {
            guard laneIndex == 0,
                  let bubble = geometry.bubbles.first(where: { $0.rank == rank }),
                  !bubble.isSystem else { return nil }
            return geometry.lanes.first { $0.laneId == bubble.laneId }
        }

        return geometry.lanes.first { $0.laneIndex == laneIndex && spanCovering($0, rank) != nil }
    }

    // MARK: - resolveRiverLaneHeaders

    /// Le nom en tête d'une colonne, et son opacité — miroir de
    /// `RiverLaneHeader`. `alpha` est dans `]0, 1]`, la peau la multiplie par
    /// son opacité de repos.
    public struct RiverLaneHeader: Sendable, Equatable {
        public let laneIndex: Int
        public let laneId: String
        public let colorSeed: String
        public let isViewer: Bool
        public let alpha: Double
    }

    public struct ResolveRiverLaneHeadersInput: Sendable {
        public let geometry: RiverGeometry
        /// Peut être FRACTIONNAIRE — la peau le calcule depuis son
        /// défilement, avec la MÊME bande de focus que le reste de la
        /// Lentille (`FOCUS_BAND_OFFSET`/`FocalFocusCurve.electFocusRow`).
        public let focusRank: Double
        public let fadeRanksOverride: Int?

        public init(geometry: RiverGeometry, focusRank: Double, fadeRanksOverride: Int? = nil) {
            self.geometry = geometry
            self.focusRank = focusRank
            self.fadeRanksOverride = fadeRanksOverride
        }
    }

    /// Intervalle d'occupation d'une voix dans une colonne : un segment, ou un groupe.
    private struct Occupancy {
        let laneId: String
        let laneIndex: Int
        let startRank: Int
        let endRank: Int
        let isOpen: Bool
    }

    private static func clampUnit(_ value: Double) -> Double {
        min(1, max(0, value))
    }

    /// Rampe symétrique, mesurée depuis le VIDE qui borde l'occupation : au
    /// rang de naissance il reste `1` rang de marge, donc `1/fadeRanks`
    /// d'opacité — le nom arrive déjà lisible, jamais invisible sur son
    /// propre premier message. Une occupation encore ouverte emprunte sa
    /// borne de mort à la FENÊTRE, décalée de la largeur du fondu : elle ne
    /// s'estompe donc jamais DANS la fenêtre, et s'éteint continûment
    /// au-delà du dernier rang.
    private static func headerAlpha(
        occupancy: Occupancy,
        focusRank: Double,
        fadeRanks: Int,
        lastRank: Int
    ) -> Double {
        let deathRank: Double = occupancy.isOpen ? Double(lastRank + fadeRanks) : Double(occupancy.endRank)
        let margin = min(focusRank - Double(occupancy.startRank - 1), deathRank + 1 - focusRank)

        if margin <= 0 { return 0 }
        return fadeRanks == 0 ? 1 : clampUnit(margin / Double(fadeRanks))
    }

    /// Occupations en mode sérialisé : les GROUPES de bulles consécutives
    /// d'un même auteur, tels que `isFirstInGroup` les découpe déjà.
    ///
    /// Un avis système n'occupe rien : nommer une colonne au rang d'une
    /// annonce ferait parler quelqu'un qui vient seulement d'entrer,
    /// exactement comme nommer une branche morte mentirait sur une présence.
    private static func serializedOccupancies(_ geometry: RiverGeometry) -> [Occupancy] {
        var groups: [Occupancy] = []
        for bubble in geometry.bubbles where !bubble.isSystem {
            if bubble.isFirstInGroup || groups.isEmpty {
                groups.append(Occupancy(laneId: bubble.laneId, laneIndex: 0, startRank: bubble.rank, endRank: bubble.rank, isOpen: false))
            } else {
                let last = groups[groups.count - 1]
                groups[groups.count - 1] = Occupancy(
                    laneId: last.laneId, laneIndex: last.laneIndex,
                    startRank: last.startRank, endRank: bubble.rank, isOpen: last.isOpen
                )
            }
        }
        return groups
    }

    private static func laneOccupancies(_ geometry: RiverGeometry) -> [Occupancy] {
        geometry.lanes.flatMap { lane in
            lane.spans.map { span in
                Occupancy(laneId: lane.laneId, laneIndex: lane.laneIndex, startRank: span.startRank, endRank: span.endRank, isOpen: span.isOpen)
            }
        }
    }

    /// Une colonne ne porte pas un nom fixe : elle porte celui de la voix qui
    /// l'occupe À LA HAUTEUR OÙ L'ON LIT. Deux occupations qui se TOUCHENT se
    /// croisent en fondu (relais, aucun silence à rendre) ; séparées par du
    /// VIDE, la colonne ne nomme personne sur les rangs du vide (nommer une
    /// branche morte mentirait sur une présence). Les entrées d'opacité
    /// nulle ne sont pas servies.
    public static func resolveRiverLaneHeaders(_ input: ResolveRiverLaneHeadersInput) -> [RiverLaneHeader] {
        let geometry = input.geometry
        let focusRank = input.focusRank
        let fadeRanks = max(0, input.fadeRanksOverride ?? headerFadeRanks)

        var laneById: [String: RiverLane] = [:]
        for lane in geometry.lanes { laneById[lane.laneId] = lane }

        let occupancies = geometry.layout == .serialized ? serializedOccupancies(geometry) : laneOccupancies(geometry)

        let headers: [RiverLaneHeader] = occupancies.compactMap { occupancy in
            guard let lane = laneById[occupancy.laneId] else { return nil }
            let alpha = headerAlpha(occupancy: occupancy, focusRank: focusRank, fadeRanks: fadeRanks, lastRank: geometry.rankCount - 1)
            guard alpha > 0 else { return nil }
            return RiverLaneHeader(laneIndex: occupancy.laneIndex, laneId: lane.laneId, colorSeed: lane.colorSeed, isViewer: lane.isViewer, alpha: alpha)
        }

        return headers.sorted { a, b in
            if a.laneIndex != b.laneIndex { return a.laneIndex < b.laneIndex }
            if a.alpha != b.alpha { return a.alpha > b.alpha }
            return a.laneId < b.laneId
        }
    }

    // MARK: - resolveRiverStep

    public struct RiverCursor: Sendable, Equatable {
        public let laneIndex: Int
        public let rank: Int

        public init(laneIndex: Int, rank: Int) {
            self.laneIndex = laneIndex
            self.rank = rank
        }
    }

    public enum RiverStepDirection: String, Sendable, Equatable {
        case left
        case right
        case up
        case down
    }

    /// `.moved` — le curseur a bougé. `.edge` — bord de l'axe dans cette
    /// direction, le curseur ne bouge pas (la peau y colle son rebond).
    /// `.empty` — il n'y a rien à parcourir : la loi rend le curseur reçu
    /// plutôt que d'en inventer un.
    public enum RiverStepReason: String, Sendable, Equatable {
        case moved
        case edge
        case empty
    }

    public struct RiverStep: Sendable, Equatable {
        public let cursor: RiverCursor
        public let reason: RiverStepReason
    }

    public struct ResolveRiverStepInput: Sendable {
        public let geometry: RiverGeometry
        public let cursor: RiverCursor
        public let direction: RiverStepDirection

        public init(geometry: RiverGeometry, cursor: RiverCursor, direction: RiverStepDirection) {
            self.geometry = geometry
            self.cursor = cursor
            self.direction = direction
        }
    }

    private static func bubbleRanksOf(_ lane: RiverLane) -> [Int] {
        lane.spans
            .flatMap(\.nodes)
            .filter { $0.kind == .bubble }
            .map(\.rank)
            .sorted()
    }

    /// Où atterrir en changeant de couloir : sur la bulle la PLUS PROCHE
    /// parmi celles du segment vivant à cette hauteur — donc jamais hors de
    /// l'instant en cours. À égalité de distance, la plus ANCIENNE : traverser
    /// ne doit jamais faire sauter le lecteur en avant dans un temps qu'il
    /// n'a pas lu. Un segment sans bulle (branche reparue pour recevoir une
    /// réponse) garde la hauteur d'où l'on vient.
    private static func landingRank(lane: RiverLane, rank: Int) -> Int {
        let span = spanCovering(lane, rank)
        let ranks = (span?.nodes ?? []).filter { $0.kind == .bubble }.map(\.rank)
        guard let first = ranks.first else { return rank }

        return ranks.reduce(first) { best, candidate in
            abs(candidate - rank) < abs(best - rank) ? candidate : best
        }
    }

    /// Un pas sur l'un des deux axes.
    ///  - **horizontal** (`.left`/`.right`) : la branche vivante suivante
    ///    dans cette direction, les mortes enjambées, sans quitter l'instant.
    ///  - **vertical** (`.up`/`.down`) : la bulle suivante DE LA MÊME
    ///    PERSONNE, par-dessus la mort de sa branche — « Suivre Mia ».
    ///
    /// SÉRIALISÉE, la rivière EST le fil : il n'y a plus d'axe horizontal
    /// (`.edge` de part et d'autre), et l'axe vertical redevient le TEMPS —
    /// la bulle suivante, quel qu'en soit l'auteur.
    public static func resolveRiverStep(_ input: ResolveRiverStepInput) -> RiverStep {
        let geometry = input.geometry
        let cursor = input.cursor
        let direction = input.direction

        func stay(_ reason: RiverStepReason) -> RiverStep {
            RiverStep(cursor: cursor, reason: reason)
        }

        if geometry.layout == .serialized {
            if geometry.rankCount == 0 || cursor.laneIndex != 0 { return stay(.empty) }
            if direction == .left || direction == .right { return stay(.edge) }

            let nextRank = direction == .down ? cursor.rank + 1 : cursor.rank - 1
            guard nextRank >= 0 && nextRank < geometry.rankCount else { return stay(.edge) }
            return RiverStep(cursor: RiverCursor(laneIndex: 0, rank: nextRank), reason: .moved)
        }

        guard let lane = resolveRiverLaneAt(geometry, laneIndex: cursor.laneIndex, rank: cursor.rank) else {
            return stay(.empty)
        }

        if direction == .left || direction == .right {
            let living = resolveRiverLivingLanes(geometry, rank: cursor.rank)
            // `.right` prend le PREMIER couloir plus loin rencontré dans
            // l'ordre de naissance ; `.left` le DERNIER couloir plus proche
            // du lecteur — miroir exact de `reachable.reverse()[0]` côté TS
            // (l'ordre de `living` n'est PAS trié par colonne croissante dès
            // que des colonnes se partagent, cf. `resolveRiverLivingLanes`).
            let nextIndex: Int? = direction == .right
                ? living.first { $0 > cursor.laneIndex }
                : living.filter { $0 < cursor.laneIndex }.last

            guard let nextIndex, let nextLane = resolveRiverLaneAt(geometry, laneIndex: nextIndex, rank: cursor.rank) else {
                return stay(.edge)
            }

            return RiverStep(
                cursor: RiverCursor(laneIndex: nextLane.laneIndex, rank: landingRank(lane: nextLane, rank: cursor.rank)),
                reason: .moved
            )
        }

        let ranks = bubbleRanksOf(lane)
        let nextRank: Int? = direction == .down
            ? ranks.first { $0 > cursor.rank }
            : ranks.reversed().first { $0 < cursor.rank }

        guard let nextRank else { return stay(.edge) }
        return RiverStep(cursor: RiverCursor(laneIndex: cursor.laneIndex, rank: nextRank), reason: .moved)
    }
}
