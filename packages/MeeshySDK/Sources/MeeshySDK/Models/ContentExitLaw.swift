import Foundation

/// **La loi de sortie** (#9572, #9573) — directive porteur du 2026-10-07 :
/// « un contenu qui disparaît ne sort pas de Meeshy ».
///
/// Un message a une NATURE de disparition, lue sur le message ET sur chacune de
/// ses pièces jointes — la plus restrictive gagne — et cette nature rend trois
/// verdicts :
///
/// | nature | transférer | enregistrer, imager, partager, publier | capture |
/// |---|---|---|---|
/// | `ordinary` | oui | oui | libre |
/// | `timedFlame` | oui, durée ≤ source | non | annoncée |
/// | `afterReadFlame` | non | non | annoncée |
/// | `viewOnce` | non | non | bloquée |
///
/// LA CAPTURE (décision porteur 2026-10-07, #9617). `blocked` : la capture et
/// l'enregistrement d'écran rendent du NOIR, et toute tentative s'annonce à la
/// conversation. `announced` : l'image n'est pas noircie, mais la capture
/// s'annonce à toute la conversation. Les deux flammes, copie transférée
/// comprise, sont annoncées ; seule la vue unique est noire.
///
/// FERMÉ PAR DÉFAUT : un contenu DÉCLARÉ éphémère dont la durée ne se lit pas
/// (bit `ephemeral` nu, `expiresAt` sans `ephemeralDuration`) reçoit les
/// verdicts de la flamme après lecture. `expiresAt` n'est jamais une durée :
/// c'est l'heure interne de destruction (#7451).
///
/// Le FLOU et le CHIFFREMENT ne sont pas des natures : ils gardent leurs
/// propres restrictions, que l'appelant COMPOSE avec ces verdicts.
///
/// Miroir JUMEAU de `contentExitLaw` / `forwardedCopyProtection`
/// (`packages/shared/utils/content-exit-law.ts`), que la passerelle applique et
/// qui fait foi. Toute évolution touche les deux sites ; la table de
/// `ContentExitLawTests` reprend cas pour cas celle du témoin TypeScript.
/// `contentExitLawOfSource` — l'entrée d'AUTORISATION du serveur, qui ferme sur
/// une colonne non chargée — n'a pas de miroir : un client n'autorise rien.
public struct ContentExitLaw: Equatable, Sendable {

    public enum Nature: String, Equatable, Sendable, CaseIterable, Codable {
        case ordinary
        case timedFlame = "timed-flame"
        case afterReadFlame = "after-read-flame"
        case viewOnce = "view-once"
    }

    public enum ForwardRefusal: String, Equatable, Sendable {
        case viewOnce = "view-once"
        case afterRead = "after-read"
    }

    public enum ForwardVerdict: Equatable, Sendable {
        /// `maxDurationSeconds` nul ⇒ aucune borne ; sinon la copie dure AU PLUS autant.
        case allowed(maxDurationSeconds: Int?)
        case refused(ForwardRefusal)

        public var isAllowed: Bool {
            if case .allowed = self { return true }
            return false
        }

        public var maxDurationSeconds: Int? {
            if case .allowed(let seconds) = self { return seconds }
            return nil
        }
    }

    /// `free` : rien. `announced` : capture permise, annoncée. `blocked` : noire, et la tentative annoncée.
    public enum CaptureVerdict: String, Equatable, Sendable, CaseIterable {
        case free
        case announced
        case blocked

        /// Une capture de ce contenu se DÉCLARE à la passerelle (#9617).
        public var isDeclared: Bool { self != .free }
    }

    /// Ce que la loi lit d'une pièce jointe — ses propres drapeaux, indépendants du message.
    public struct Piece: Equatable, Sendable {
        public let isViewOnce: Bool?
        public let isBlurred: Bool?
        public let effectFlags: UInt32?

        public init(isViewOnce: Bool? = nil, isBlurred: Bool? = nil, effectFlags: UInt32? = nil) {
            self.isViewOnce = isViewOnce
            self.isBlurred = isBlurred
            self.effectFlags = effectFlags
        }
    }

    /// Ce que la loi lit d'un message. Tout est facultatif : un champ absent ne déclare rien.
    public struct Subject: Equatable, Sendable {
        public let isViewOnce: Bool?
        public let isBlurred: Bool?
        public let effectFlags: UInt32?
        public let ephemeralDuration: Double?
        /// Sa seule PRÉSENCE déclare un éphémère ; elle ne donne jamais la durée.
        public let expiresAt: Date?
        public let attachments: [Piece?]?

        public init(
            isViewOnce: Bool? = nil,
            isBlurred: Bool? = nil,
            effectFlags: UInt32? = nil,
            ephemeralDuration: Double? = nil,
            expiresAt: Date? = nil,
            attachments: [Piece?]? = nil
        ) {
            self.isViewOnce = isViewOnce
            self.isBlurred = isBlurred
            self.effectFlags = effectFlags
            self.ephemeralDuration = ephemeralDuration
            self.expiresAt = expiresAt
            self.attachments = attachments
        }
    }

    /// Ce qu'une requête de transfert demande pour sa copie.
    public struct CopyRequest: Equatable, Sendable {
        public let effectFlags: UInt32?
        public let isBlurred: Bool?
        public let ephemeralDuration: Double?

        public init(effectFlags: UInt32? = nil, isBlurred: Bool? = nil, ephemeralDuration: Double? = nil) {
            self.effectFlags = effectFlags
            self.isBlurred = isBlurred
            self.ephemeralDuration = ephemeralDuration
        }
    }

    /// Les colonnes de protection que porte la copie transférée.
    public struct CopyProtection: Equatable, Sendable {
        public let effectFlags: UInt32
        public let isBlurred: Bool
        public let ephemeralDuration: Int?

        public init(effectFlags: UInt32, isBlurred: Bool, ephemeralDuration: Int?) {
            self.effectFlags = effectFlags
            self.isBlurred = isBlurred
            self.ephemeralDuration = ephemeralDuration
        }

        /// La copie relue comme un sujet — ce que le transfert SUIVANT jugera.
        public var subject: Subject {
            Subject(isBlurred: isBlurred, effectFlags: effectFlags, ephemeralDuration: ephemeralDuration.map(Double.init))
        }
    }

    public let nature: Nature
    public let forward: ForwardVerdict
    /// Enregistrer, imager, partager hors de Meeshy, publier en post, réel ou story.
    public let exportable: Bool
    public let capture: CaptureVerdict

    public init(nature: Nature, forward: ForwardVerdict, exportable: Bool, capture: CaptureVerdict) {
        self.nature = nature
        self.forward = forward
        self.exportable = exportable
        self.capture = capture
    }

    public static let ordinary = ContentExitLaw(
        nature: .ordinary, forward: .allowed(maxDurationSeconds: nil), exportable: true, capture: .free
    )

    public static let afterReadFlame = ContentExitLaw(
        nature: .afterReadFlame, forward: .refused(.afterRead), exportable: false, capture: .announced
    )

    public static let viewOnce = ContentExitLaw(
        nature: .viewOnce, forward: .refused(.viewOnce), exportable: false, capture: .blocked
    )

    public static func timedFlame(seconds: Int) -> ContentExitLaw {
        ContentExitLaw(
            nature: .timedFlame, forward: .allowed(maxDurationSeconds: seconds), exportable: false, capture: .announced
        )
    }

    private static let ephemeralBits = MessageEffectFlags.ephemeral.rawValue | MessageEffectFlags.ephemeralAfterRead.rawValue

    /// Une durée en secondes ENTIÈRES strictement positives, ou rien.
    static func wholeSeconds(_ value: Double?) -> Int? {
        guard let value, value.isFinite else { return nil }
        let seconds = value.rounded(.down)
        guard seconds > 0 else { return nil }
        return seconds >= Double(Int.max) ? Int.max : Int(seconds)
    }

    private static func isBlurred(column: Bool?, flags: UInt32?) -> Bool {
        column == true || ((flags ?? 0) & MessageEffectFlags.blurred.rawValue) != 0
    }

    public static func of(_ subject: Subject?) -> ContentExitLaw {
        guard let subject else { return .ordinary }

        let pieces = (subject.attachments ?? []).compactMap { $0 }
        let flags = pieces.reduce(subject.effectFlags ?? 0) { $0 | ($1.effectFlags ?? 0) }

        let isViewOnce = subject.isViewOnce == true
            || pieces.contains { $0.isViewOnce == true }
            || (flags & MessageEffectFlags.viewOnce.rawValue) != 0
        if isViewOnce { return .viewOnce }

        if (flags & MessageEffectFlags.ephemeralAfterRead.rawValue) != 0 { return .afterReadFlame }

        let declaredEphemeral = (flags & MessageEffectFlags.ephemeral.rawValue) != 0 || subject.expiresAt != nil
        guard let duration = wholeSeconds(subject.ephemeralDuration) else {
            return declaredEphemeral ? .afterReadFlame : .ordinary
        }
        return .timedFlame(seconds: duration)
    }

    /// Les colonnes de protection de la COPIE qu'un transfert crée — `nil` quand
    /// la source ne se transfère pas.
    ///
    /// - Source flamme à durée ⇒ `min(durée demandée, durée source)` (demandée
    ///   absente ou invalide ⇒ celle de la source), bits `ephemeral |
    ///   ephemeralAfterRead` : la requête ne peut ni allonger, ni retirer.
    /// - Le FLOU de la source — message OU l'une de ses pièces — est imposé sur
    ///   toute nature ; la requête peut l'ajouter, jamais le retirer.
    /// - Source ordinaire ⇒ la requête passe telle quelle, flou mis à part.
    public static func forwardedCopyProtection(source: Subject?, requested: CopyRequest?) -> CopyProtection? {
        guard case .allowed(let maxDurationSeconds) = of(source).forward else { return nil }

        let requestedFlags = requested?.effectFlags ?? 0
        let pieces = (source?.attachments ?? []).compactMap { $0 }
        let blurred = isBlurred(column: source?.isBlurred, flags: source?.effectFlags)
            || pieces.contains { isBlurred(column: $0.isBlurred, flags: $0.effectFlags) }
            || isBlurred(column: requested?.isBlurred, flags: requested?.effectFlags)
        let blurBit = blurred ? MessageEffectFlags.blurred.rawValue : 0
        let requestedDuration = wholeSeconds(requested?.ephemeralDuration)

        guard let maxDurationSeconds else {
            return CopyProtection(effectFlags: requestedFlags | blurBit, isBlurred: blurred, ephemeralDuration: requestedDuration)
        }
        return CopyProtection(
            effectFlags: (requestedFlags & ~ephemeralBits) | ephemeralBits | blurBit,
            isBlurred: blurred,
            ephemeralDuration: min(requestedDuration ?? maxDurationSeconds, maxDurationSeconds)
        )
    }
}

// MARK: - La durée qu'un transfert peut choisir

/// Une durée offerte par la feuille de transfert d'une flamme à durée.
public struct ForwardDurationChoice: Equatable, Sendable, Identifiable {
    public let seconds: Int
    public var id: Int { seconds }

    public init(seconds: Int) {
        self.seconds = seconds
    }

    /// Libellé compact, sans mot à traduire : « 15s », « 1min 30s », « 2h ».
    public var label: String {
        if let tier = EphemeralDuration(rawValue: seconds) { return tier.label }
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        let rest = seconds % 60
        let parts = [
            hours > 0 ? "\(hours)h" : nil,
            minutes > 0 ? "\(minutes)min" : nil,
            rest > 0 ? "\(rest)s" : nil,
        ].compactMap { $0 }
        return parts.isEmpty ? "0s" : parts.joined(separator: " ")
    }
}

public extension ContentExitLaw.ForwardVerdict {

    /// Les durées que la feuille de transfert offre : seuls les paliers
    /// inférieurs ou égaux à la source ; une durée source hors palier s'affiche
    /// telle quelle, EN TÊTE. Vide quand le transfert n'est pas borné (source
    /// ordinaire) ou qu'il est refusé — aucune rangée ne se monte alors.
    var durationChoices: [ForwardDurationChoice] {
        guard case .allowed(let maxDurationSeconds?) = self else { return [] }
        let tiers = EphemeralDuration.allCases.map(\.rawValue).filter { $0 <= maxDurationSeconds }
        let head = tiers.contains(maxDurationSeconds) ? [] : [maxDurationSeconds]
        return (head + tiers).map(ForwardDurationChoice.init)
    }

    /// Le verdict d'un LOT transféré ensemble : refusé dès qu'un message l'est ;
    /// sinon borné par la PLUS LONGUE des flammes du lot — chaque message reste
    /// ramené à sa propre durée par `requestedDuration(chosen:)`.
    static func batch(_ verdicts: [ContentExitLaw.ForwardVerdict]) -> ContentExitLaw.ForwardVerdict {
        if let refused = verdicts.first(where: { !$0.isAllowed }) { return refused }
        return .allowed(maxDurationSeconds: verdicts.compactMap(\.maxDurationSeconds).max())
    }

    /// La durée présélectionnée : celle de la source.
    var defaultDurationSeconds: Int? { maxDurationSeconds }

    /// La durée qui part dans `ephemeralDuration` : le choix, ramené à la
    /// source. `nil` quand la source n'impose aucune borne — la requête ne
    /// porte alors pas le champ.
    func requestedDuration(chosen: Int?) -> Int? {
        guard case .allowed(let maxDurationSeconds?) = self else { return nil }
        guard let chosen, chosen > 0 else { return maxDurationSeconds }
        return min(chosen, maxDurationSeconds)
    }
}

// MARK: - Ce qu'une visionneuse peut laisser sortir

/// **Le portillon de sortie d'une visionneuse** (#9573) — une valeur opaque que
/// l'hôte pose et que les visionneuses lisent pour décider si elles rendent
/// leurs boutons d'enregistrement, de partage et de copie.
///
/// Le SDK ne sait rien de la raison : l'hôte la tire de la loi de sortie. FERMÉ
/// PAR DÉFAUT, à deux étages : sans portillon posé par l'hôte, rien ne sort
/// (`sealed` est la valeur de l'environnement) ; et sous `only`, un contenu
/// absent de la liste, ou sans identifiant, ne sort pas. Un hôte qui oublie
/// n'ouvre rien.
public struct ContentExitGate: Equatable, Sendable {

    private enum Rule: Equatable, Sendable {
        case open
        case sealed
        case only(Set<String>)
    }

    private let rule: Rule

    private init(rule: Rule) {
        self.rule = rule
    }

    /// Tout contenu peut sortir.
    public static let open = ContentExitGate(rule: .open)

    /// Aucun contenu ne sort.
    public static let sealed = ContentExitGate(rule: .sealed)

    /// Seuls les contenus de ces identifiants sortent.
    public static func only(_ contentIds: Set<String>) -> ContentExitGate {
        ContentExitGate(rule: .only(contentIds))
    }

    public func mayLeave(_ contentId: String? = nil) -> Bool {
        switch rule {
        case .open: return true
        case .sealed: return false
        case .only(let contentIds): return contentId.map(contentIds.contains) ?? false
        }
    }

    /// Exécute une SORTIE seulement si le portillon la laisse partir. Tout
    /// gestionnaire d'enregistrement, de partage ou de copie passe par ici : un
    /// bouton masqué ne suffit pas, le geste lui-même ne doit rien faire.
    @discardableResult
    public func perform(_ contentId: String? = nil, _ exit: () -> Void) -> Bool {
        guard mayLeave(contentId) else { return false }
        exit()
        return true
    }
}

// MARK: - Projection du message

public extension MeeshyMessageAttachment {

    /// Ce que la loi de sortie lit de cette pièce.
    var contentExitPiece: ContentExitLaw.Piece {
        ContentExitLaw.Piece(isViewOnce: isViewOnce, isBlurred: isBlurred, effectFlags: effectFlags)
    }
}

public extension MeeshyMessage {

    /// Ce que la loi de sortie lit de ce message. Une vue unique déjà ouverte
    /// par ce lecteur (`viewOnceOpenedAt`) reste une vue unique : son contenu a
    /// quitté le rendu, il ne sort pas davantage.
    var contentExitSubject: ContentExitLaw.Subject {
        ContentExitLaw.Subject(
            isViewOnce: isViewOnce || viewOnceOpenedAt != nil,
            isBlurred: isBlurred,
            effectFlags: effects.flags.rawValue,
            ephemeralDuration: effects.ephemeralDuration.map(Double.init),
            expiresAt: expiresAt,
            attachments: attachments.map(\.contentExitPiece)
        )
    }

    /// La loi de sortie de ce message — nature et verdicts.
    var contentExitLaw: ContentExitLaw { ContentExitLaw.of(contentExitSubject) }
}
