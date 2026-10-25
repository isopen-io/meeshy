import Foundation

/// Une ère chiffrée CLOSE par une bascule datée : ses messages gardent leur
/// verdict après la désactivation (#12883). `start` inconnu ⇒ dès l'origine.
public struct EndToEndEra: Equatable, Hashable, Sendable, Codable {
    public let start: Date?
    public let end: Date

    public init(start: Date?, end: Date) {
        self.start = start
        self.end = end
    }

    /// Une ère dont la fin précède le début n'est jamais jetée : elle ne se
    /// clôt plus (revue #12846 — un serveur qui antidate une désactivation
    /// faisait disparaître l'ère chiffrée, et ses messages se relisaient clairs).
    static func failClosed(start: Date?, end: Date) -> EndToEndEra {
        guard let start, end < start else { return EndToEndEra(start: start, end: end) }
        return EndToEndEra(start: start, end: .distantFuture)
    }

    func contains(_ instant: Date) -> Bool {
        (start.map { instant >= $0 } ?? true) && instant < end
    }
}

/// **Le régime de chiffrement d'une conversation, tel que CET appareil le
/// tient** (#11380, commutable depuis #12522, daté depuis #12883).
///
/// Le chiffrement se désactive : le régime n'est plus monotone, il est DATÉ par
/// l'époque que la passerelle incrémente à chaque bascule. Deux sortes
/// d'observations, la même loi que l'envoi (`EndToEndRegimeLedger`) :
/// - DATÉES (`dated`, une époque) : l'époque la plus récente fait foi dans les
///   deux sens ; à époque égale, le bout en bout l'emporte (fail-closed). Une
///   désactivation CLÔT l'ère chiffrée qu'elle remplace : les messages de cette
///   ère gardent leur verdict, les suivants retrouvent les features serveur ;
/// - NON DATÉES (la ligne de liste, le détail) : elles n'ajoutent que le bout
///   en bout. Une passerelle compromise qui servirait `encryptionMode: null`
///   sans époque ne fait rien lire en clair ; une ligne chiffrée périmée,
///   activée avant la désactivation connue, ne rouvre pas l'ère close.
///
/// Toutes viennent encore du serveur : la bascule authentifiée par son auteur
/// relève de #12866.
///
/// **Décision explicite — activation sans date** : tout le fil se lit dans
/// l'ère chiffrée (fail-closed), bornée par la désactivation datée connue.
public struct EndToEndRegime: Equatable, Sendable {
    public let isEndToEnd: Bool
    public let enabledAt: Date?
    /// L'époque qui a daté ce régime ; `nil` pour un régime lu sans date.
    public let epoch: Int?
    /// L'instant d'une désactivation datée.
    public let disabledAt: Date?
    /// Les ères chiffrées closes, par fin croissante.
    public let closedEras: [EndToEndEra]

    public static let serverReadable = EndToEndRegime(isEndToEnd: false, enabledAt: nil)

    public init(isEndToEnd: Bool, enabledAt: Date?) {
        self.init(isEndToEnd: isEndToEnd, enabledAt: enabledAt, epoch: nil, disabledAt: nil, closedEras: [])
    }

    public init(encryptionMode: String?, enabledAt: Date?) {
        self.init(isEndToEnd: EndToEndPlaintextLaw.isEndToEndConversation(encryptionMode), enabledAt: enabledAt)
    }

    /// Le régime que le serveur SERT pour cette conversation — sans mémoire ni époque.
    public init(conversation: MeeshyConversation?) {
        self.init(encryptionMode: conversation?.encryptionMode, enabledAt: conversation?.encryptionEnabledAt)
    }

    /// Une observation DATÉE par son époque (statut, bascule, événement socket).
    /// `changedAt` est l'instant de la bascule, ou celui où l'appareil l'apprend.
    public static func dated(isEndToEnd: Bool, epoch: Int, at changedAt: Date, enabledAt: Date? = nil) -> EndToEndRegime {
        EndToEndRegime(
            isEndToEnd: isEndToEnd, enabledAt: isEndToEnd ? (enabledAt ?? changedAt) : nil, epoch: epoch,
            disabledAt: isEndToEnd ? nil : changedAt, closedEras: []
        )
    }

    private init(isEndToEnd: Bool, enabledAt: Date?, epoch: Int?, disabledAt: Date?, closedEras: [EndToEndEra]) {
        self.isEndToEnd = isEndToEnd
        self.enabledAt = isEndToEnd ? enabledAt : nil
        self.epoch = epoch
        self.disabledAt = isEndToEnd ? nil : disabledAt
        self.closedEras = Self.ordered(closedEras)
    }

    /// La conversation a-t-elle une ère chiffrée, ouverte ou close ?
    public var hasEncryptedEra: Bool { isEndToEnd || !closedEras.isEmpty }

    /// Fusionne deux observations : la plus récente époque fait foi, et une
    /// observation non datée ne fait qu'ajouter le bout en bout.
    public func merging(_ other: EndToEndRegime?) -> EndToEndRegime {
        guard let other else { return self }
        switch (epoch, other.epoch) {
        case let (mine?, theirs?): return Self.datedMerge(self, mine, other, theirs)
        case (.some, nil): return adding(undated: other)
        case (nil, .some): return other.adding(undated: self)
        case (nil, nil): return Self.undatedMerge(self, other)
        }
    }

    /// Cette observation DATÉE posée sur ce que l'appareil savait AVANT elle :
    /// un savoir daté se départage par l'époque ; un savoir non daté (retenu
    /// avant les époques, ou d'une ligne servie) est plus ancien qu'elle, et
    /// une ère chiffrée qu'il connaissait est close par elle.
    public func superseding(_ earlier: EndToEndRegime?) -> EndToEndRegime {
        guard let earlier else { return self }
        guard earlier.epoch == nil else { return merging(earlier) }
        let learned = clampingDeactivation(after: earlier)
        return learned.with(closedEras: closedEras + earlier.closedEras + earlier.closed(by: learned))
    }

    /// Un message créé à cet instant appartient-il à une ère chiffrée ? Un
    /// instant ou une activation inconnus s'y rangent (fail-closed).
    public func governs(createdAt: Date?) -> Bool {
        guard hasEncryptedEra else { return false }
        guard let createdAt else { return true }
        if closedEras.contains(where: { $0.contains(createdAt) }) { return true }
        guard isEndToEnd else { return false }
        guard let enabledAt else { return true }
        return createdAt >= enabledAt
    }

    /// **Le serveur peut-il traduire ce message ?** Non dans une ère chiffrée :
    /// il ne le lit pas, donc toute traduction qu'il en sert est une traduction
    /// qu'il a FORGÉE — texte comme piste audio. L'historique antérieur à
    /// l'activation, et ce qui suit une désactivation datée, gardent les siennes.
    /// Les traductions faites sur l'appareil ne passent pas par ici.
    public func admitsWireTranslations(forMessageCreatedAt createdAt: Date?) -> Bool {
        !governs(createdAt: createdAt)
    }

    // MARK: - Fusion

    private static func undatedMerge(_ lhs: EndToEndRegime, _ rhs: EndToEndRegime) -> EndToEndRegime {
        guard rhs.isEndToEnd else { return lhs }
        guard lhs.isEndToEnd else { return rhs }
        let dates = [lhs.enabledAt, rhs.enabledAt].compactMap { $0 }
        return EndToEndRegime(isEndToEnd: true, enabledAt: dates.min())
    }

    private static func datedMerge(_ lhs: EndToEndRegime, _ lhsEpoch: Int, _ rhs: EndToEndRegime, _ rhsEpoch: Int) -> EndToEndRegime {
        guard lhsEpoch != rhsEpoch else { return sameEpoch(lhs, rhs) }
        let (older, earlier) = lhsEpoch < rhsEpoch ? (lhs, rhs) : (rhs, lhs)
        let newer = earlier.clampingDeactivation(after: older)
        return newer.with(closedEras: older.closedEras + newer.closedEras + older.closed(by: newer))
    }

    /// Une désactivation datée AVANT ce que l'appareil savait déjà chiffré —
    /// l'activation de l'ère qu'elle clôt, la fin des ères connues — n'a pas de
    /// frontière crédible (revue #12846) : elle ne clôt rien, l'ère reste
    /// ouverte (fail-closed). La remonter à l'activation viderait l'ère, ce qui
    /// revient à l'effacer.
    private func clampingDeactivation(after older: EndToEndRegime) -> EndToEndRegime {
        guard !isEndToEnd, let disabledAt else { return self }
        let floor = ([older.enabledAt] + older.closedEras.map { Optional($0.end) }).compactMap { $0 }
            .filter { $0 != .distantFuture }.max()
        guard let floor, floor > disabledAt else { return self }
        return EndToEndRegime(isEndToEnd: false, enabledAt: nil, epoch: epoch, disabledAt: .distantFuture, closedEras: closedEras)
    }

    /// À époque égale, le bout en bout l'emporte ; deux désactivations gardent la plus tardive.
    private static func sameEpoch(_ lhs: EndToEndRegime, _ rhs: EndToEndRegime) -> EndToEndRegime {
        let eras = lhs.closedEras + rhs.closedEras
        switch (lhs.isEndToEnd, rhs.isEndToEnd) {
        case (true, false): return lhs.with(closedEras: eras)
        case (false, true): return rhs.with(closedEras: eras)
        case (true, true):
            let dates = [lhs.enabledAt, rhs.enabledAt].compactMap { $0 }
            return EndToEndRegime(isEndToEnd: true, enabledAt: dates.min(), epoch: lhs.epoch, disabledAt: nil, closedEras: eras)
        case (false, false):
            let dates = [lhs.disabledAt, rhs.disabledAt].compactMap { $0 }
            return EndToEndRegime(isEndToEnd: false, enabledAt: nil, epoch: lhs.epoch, disabledAt: dates.max(), closedEras: eras)
        }
    }

    /// L'ère chiffrée que `newer` clôt. Une fin inconnue, ou antérieure au
    /// début de l'ère, ne clôt rien : l'ère reste ouverte à jamais (fail-closed).
    private func closed(by newer: EndToEndRegime) -> [EndToEndEra] {
        guard isEndToEnd else { return [] }
        let end = (newer.isEndToEnd ? newer.enabledAt : newer.disabledAt) ?? .distantFuture
        return [EndToEndEra.failClosed(start: enabledAt, end: end)]
    }

    /// Une observation non datée posée sur ce régime daté : un clair n'y change
    /// rien. Un bout en bout activé avant la désactivation connue est une ère
    /// que celle-ci a close : il ne la rouvre pas. Sans date, ou activé après,
    /// le bout en bout reprend, au plus tôt à la désactivation (fail-closed).
    private func adding(undated: EndToEndRegime) -> EndToEndRegime {
        guard undated.isEndToEnd else { return self }
        if isEndToEnd { return enabledAt == nil ? with(enabledAt: undated.enabledAt) : self }
        let deactivation = disabledAt ?? .distantFuture
        let closedByDeactivation = closedEras + [EndToEndEra(start: undated.enabledAt, end: deactivation)]
        if let start = undated.enabledAt, start <= deactivation { return with(closedEras: closedByDeactivation) }
        let start = max(undated.enabledAt ?? deactivation, deactivation)
        return EndToEndRegime(isEndToEnd: true, enabledAt: start, epoch: epoch, disabledAt: nil, closedEras: closedByDeactivation)
    }

    private func with(closedEras: [EndToEndEra]) -> EndToEndRegime {
        EndToEndRegime(isEndToEnd: isEndToEnd, enabledAt: enabledAt, epoch: epoch, disabledAt: disabledAt, closedEras: closedEras)
    }

    private func with(enabledAt: Date?) -> EndToEndRegime {
        EndToEndRegime(isEndToEnd: isEndToEnd, enabledAt: enabledAt, epoch: epoch, disabledAt: disabledAt, closedEras: closedEras)
    }

    private static func ordered(_ eras: [EndToEndEra]) -> [EndToEndEra] {
        Array(Set(eras.map { EndToEndEra.failClosed(start: $0.start, end: $0.end) }))
            .sorted { ($0.end, $0.start ?? .distantPast) < ($1.end, $1.start ?? .distantPast) }
    }
}

// MARK: - Ce que l'appareil retient

extension EndToEndRegime: Codable {
    private enum CodingKeys: String, CodingKey { case isEndToEnd, enabledAt, epoch, disabledAt, closedEras }

    /// Un régime retenu avant les époques (`meeshy.e2ee.regime.v1`) n'a que ses deux premiers champs.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            isEndToEnd: try container.decode(Bool.self, forKey: .isEndToEnd),
            enabledAt: try container.decodeIfPresent(Date.self, forKey: .enabledAt),
            epoch: try container.decodeIfPresent(Int.self, forKey: .epoch),
            disabledAt: try container.decodeIfPresent(Date.self, forKey: .disabledAt),
            closedEras: try container.decodeIfPresent([EndToEndEra].self, forKey: .closedEras) ?? []
        )
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(isEndToEnd, forKey: .isEndToEnd)
        try container.encodeIfPresent(enabledAt, forKey: .enabledAt)
        try container.encodeIfPresent(epoch, forKey: .epoch)
        try container.encodeIfPresent(disabledAt, forKey: .disabledAt)
        if !closedEras.isEmpty { try container.encode(closedEras, forKey: .closedEras) }
    }
}
