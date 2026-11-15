import Foundation

/// Sectionnement et tri des conversations — La Lentille.
///
/// Miroir Swift EXACT (contrat LWS-5) de
/// `packages/shared/utils/conversation-sections.ts` — `resolveConversationSections`
/// et `sortConversations`. Cette loi est GELÉE par S1 (workshop
/// `tasks/lentille-workshop-execution.md`) : ce fichier s'ALIGNE sur le TS,
/// il ne le réinterprète jamais. Toute divergence de comportement entre ce
/// fichier et la loi TS est un bug de CE fichier.
///
/// `resolveSections` partitionne une liste de conversations en sections
/// ORDONNÉES : `pinned` → `live` → catégories utilisateur (dans l'ordre
/// déclaré) → `today` → `yesterday` → `thisWeek` → `older`. Aucune section
/// vide n'est émise, et chaque conversation apparaît dans EXACTEMENT une
/// section — précédence : épinglée > live > catégorie > temporel.
///
/// `sortConversations` est l'ordre total qui alimente chaque section :
/// épinglées → live → catégorie (`orderInCategory`) → `lastMessageAt` desc
/// (repli `updatedAt`) → `id` (départage déterministe, jamais `hashValue`,
/// jamais de graine).
///
/// Loi pure, sans I/O ni dépendance de plateforme : le « maintenant » du
/// lecteur (`now`) et son fuseau (`timeZone`) sont TOUJOURS injectés par
/// l'appelant (ViewModel), jamais lus depuis `Date()` ou
/// `TimeZone.current` à l'intérieur de cette loi.
///
/// Vérifiée par vecteurs inter-plateformes (mêmes fixtures que les suites
/// Jest) — `SectionResolverVectorTests`,
/// `packages/shared/fixtures/reading-modes/{sections,sort}.vectors.json`.
///
/// `nonisolated` sur le type ET chaque type imbriqué : la cible app compile
/// sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` (project.yml), le bundle
/// `MeeshyTests` sous `nonisolated` — un type utilitaire pur non annoté
/// serait main-actor-isolé côté app et donc illisible depuis les tests
/// nonisolated sans `await` (leçon Swift 6 du jour).
nonisolated public enum LentilleSectionResolver {

    // MARK: - Types d'entrée

    /// Marqueur d'appel en direct — PRÉSENCE uniquement, jamais son contenu.
    /// Mirroir structurel de `ConversationLiveCall | null | undefined` côté
    /// TS : la loi ne lit jamais `voices`/`startedAt`/`joined`, seulement la
    /// nullité du champ `liveCall` sur `SectionableConversation`. Posé par la
    /// peau (ViewModel) AVANT d'appeler cette loi, exactement comme côté TS
    /// (E13) — aucune plateforme ne porte encore de vrai modèle d'appel en
    /// direct sur sa conversation aujourd'hui.
    public struct SectionableLiveCall: Sendable, Equatable {
        public init() {}
    }

    /// Projection STRUCTURELLE minimale d'une conversation — uniquement les
    /// champs dont cette loi a besoin, jamais le modèle `Conversation`
    /// complet de l'app. `lastMessage.createdAt` N'EXISTE PAS ICI : garde
    /// structurelle E11, comme en TS — seule `lastMessageAt` (repli
    /// `updatedAt`) fait foi, un champ absent du type est une garde plus
    /// forte qu'une règle documentée en commentaire.
    public struct SectionableConversation: Sendable, Equatable {
        public let id: String
        public let isPinned: Bool
        public let categoryId: String?
        public let orderInCategory: Double?
        public let lastMessageAt: Date?
        public let updatedAt: Date
        public let liveCall: SectionableLiveCall?

        public init(
            id: String,
            isPinned: Bool,
            categoryId: String? = nil,
            orderInCategory: Double? = nil,
            lastMessageAt: Date? = nil,
            updatedAt: Date,
            liveCall: SectionableLiveCall? = nil
        ) {
            self.id = id
            self.isPinned = isPinned
            self.categoryId = categoryId
            self.orderInCategory = orderInCategory
            self.lastMessageAt = lastMessageAt
            self.updatedAt = updatedAt
            self.liveCall = liveCall
        }
    }

    /// Catégorie utilisateur déclarée. Le tableau `categories` reçu par
    /// `resolveSections` DOIT déjà être ordonné dans l'ordre déclaré par
    /// l'utilisateur : cette loi ne trie jamais les catégories entre elles,
    /// elle respecte l'ordre du tableau reçu.
    public struct SectionableCategory: Sendable, Equatable {
        public let id: String

        public init(id: String) {
            self.id = id
        }
    }

    // MARK: - Types de sortie

    public enum TemporalSectionKind: String, Sendable, Equatable, CaseIterable {
        case today
        case yesterday
        case thisWeek
        case older

        /// Ordre de rendu des sections temporelles — PAS `CaseIterable`'s
        /// ordre de déclaration par accident : ré-explicité pour rester
        /// indépendant d'un futur réordonnancement des cas de l'enum.
        static let renderOrder: [TemporalSectionKind] = [.today, .yesterday, .thisWeek, .older]
    }

    public enum ConversationSection: Sendable, Equatable {
        case pinned(conversations: [SectionableConversation])
        case live(conversations: [SectionableConversation])
        case category(categoryId: String, conversations: [SectionableConversation])
        case temporal(kind: TemporalSectionKind, conversations: [SectionableConversation])
    }

    // MARK: - Ordre total (sortConversations)

    private static func hasCategory(_ conversation: SectionableConversation) -> Bool {
        guard let categoryId = conversation.categoryId else { return false }
        return !categoryId.isEmpty
    }

    /// `lastMessageAt`, repli `updatedAt` — JAMAIS `lastMessage.createdAt`
    /// (garde E11).
    private static func effectiveTimestamp(_ conversation: SectionableConversation) -> Date {
        conversation.lastMessageAt ?? conversation.updatedAt
    }

    /// Comparaison ORDINALE de chaîne — pas de `hashValue`, pas de graine.
    /// Les identifiants comparés dans ce module sont des chaînes ASCII
    /// (ObjectId MongoDB hexadécimal côté production, littéraux de test) :
    /// l'ordre `Comparable` de `String` (Unicode canonique) coïncide avec la
    /// comparaison ordinale UTF-16 utilisée côté TS pour ce jeu de caractères.
    private static func compareCategoryId(_ a: SectionableConversation, _ b: SectionableConversation) -> Int {
        let aId = a.categoryId ?? ""
        let bId = b.categoryId ?? ""
        if aId == bId { return 0 }
        return aId < bId ? -1 : 1
    }

    private static let orderInCategoryFallback = Double.infinity

    private static func compareOrderInCategory(_ a: SectionableConversation, _ b: SectionableConversation) -> Int {
        let aOrder = a.orderInCategory ?? orderInCategoryFallback
        let bOrder = b.orderInCategory ?? orderInCategoryFallback
        // Comparaison par égalité/ordre plutôt qu'une soustraction :
        // `.infinity - .infinity` vaut `NaN`, une valeur invalide qui rendrait
        // l'ordre de deux conversations sans `orderInCategory` non déterministe.
        if aOrder == bOrder { return 0 }
        return aOrder < bOrder ? -1 : 1
    }

    /// `lastMessageAt` desc, repli `updatedAt` — JAMAIS `lastMessage.createdAt`
    /// (E11).
    private static func compareTimestamp(_ a: SectionableConversation, _ b: SectionableConversation) -> Int {
        let aTime = effectiveTimestamp(a)
        let bTime = effectiveTimestamp(b)
        if aTime == bTime { return 0 }
        return aTime > bTime ? -1 : 1
    }

    private static func compareId(_ a: SectionableConversation, _ b: SectionableConversation) -> Int {
        if a.id == b.id { return 0 }
        return a.id < b.id ? -1 : 1
    }

    /// Ordre total : épinglées → live → catégorie (`orderInCategory`) →
    /// `lastMessageAt` desc (repli `updatedAt`) → `id`. Retourne -1/0/1 —
    /// mêmes précédences que le comparateur `Array.prototype.sort` de la loi
    /// TS, converties en un total ordre stable Swift.
    private static func compareConversations(_ a: SectionableConversation, _ b: SectionableConversation) -> Int {
        if a.isPinned != b.isPinned { return a.isPinned ? -1 : 1 }

        let aLive = a.liveCall != nil
        let bLive = b.liveCall != nil
        if aLive != bLive { return aLive ? -1 : 1 }

        let aCategory = hasCategory(a)
        let bCategory = hasCategory(b)
        if aCategory != bCategory { return aCategory ? -1 : 1 }
        if aCategory && bCategory {
            let categoryCompare = compareCategoryId(a, b)
            if categoryCompare != 0 { return categoryCompare }
            let orderCompare = compareOrderInCategory(a, b)
            if orderCompare != 0 { return orderCompare }
        }

        let timestampCompare = compareTimestamp(a, b)
        if timestampCompare != 0 { return timestampCompare }

        return compareId(a, b)
    }

    /// Ordre total : épinglées → live → catégorie (`orderInCategory`) →
    /// `lastMessageAt` desc (repli `updatedAt`) → `id` (départage final
    /// déterministe). Appliquée telle quelle à l'intérieur de chaque section
    /// par `resolveSections` : comme chaque section est homogène sur les
    /// trois premiers critères, le comparateur dégénère naturellement au
    /// critère pertinent — une seule loi, ni dupliquée ni spécialisée par
    /// section.
    public static func sortConversations(
        _ conversations: [SectionableConversation]
    ) -> [SectionableConversation] {
        conversations.sorted { compareConversations($0, $1) < 0 }
    }

    // MARK: - Bornes calendaires (calendrier du lecteur, jamais UTC)

    private struct CalendarDate: Equatable {
        let year: Int
        let month: Int
        let day: Int
    }

    /// Calendrier grégorien FORCÉ + fuseau injecté — JAMAIS `Calendar.current`
    /// (dont l'identifiant dépend du réglage utilisateur Réglages > Langue et
    /// Région > Calendrier — bouddhiste, hébraïque, islamique, etc. peuvent y
    /// être sélectionnés) et JAMAIS `TimeZone.current`/composantes UTC. Même
    /// raison que le `calendar: 'gregory'` forcé côté TS
    /// (`Intl.DateTimeFormat`, voir le commentaire de
    /// `ResolveConversationSectionsParams.locale` dans la loi partagée) :
    /// laisser un calendrier non grégorien piloter le triplet année/mois/jour
    /// ferait dériver silencieusement le classement today/yesterday/…
    private static func gregorianCalendar(timeZone: TimeZone) -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }

    /// Propriété CALCULÉE, jamais un `static let` stocké — un `Calendar`
    /// grégorien ancré UTC ne varie jamais entre deux appels, mais le
    /// recalculer évite toute question de statique partagée entre appels
    /// concurrents (leçon Swift 6 du jour : pas d'état stocké partagé pour un
    /// type utilitaire pur).
    private static var utcCalendar: Calendar {
        gregorianCalendar(timeZone: TimeZone(identifier: "UTC") ?? .init(secondsFromGMT: 0)!)
    }

    /// Projette `date` sur le mur de `timeZone` (calendrier grégorien forcé)
    /// et lit le triplet année/mois/jour AFFICHÉ à ce lecteur — jamais
    /// `Calendar.current.dateComponents` (dérive de calendrier possible) ni
    /// des composantes UTC (figeraient tout le monde sur UTC quel que soit
    /// `timeZone`).
    private static func localCalendarDate(_ date: Date, timeZone: TimeZone) -> CalendarDate {
        let components = gregorianCalendar(timeZone: timeZone).dateComponents([.year, .month, .day], from: date)
        return CalendarDate(year: components.year ?? 0, month: components.month ?? 0, day: components.day ?? 0)
    }

    /// Jours entiers écoulés depuis epoch pour un triplet année/mois/jour,
    /// réinterprété à MINUIT UTC — miroir de `Date.UTC(...)/MS_PER_DAY` côté
    /// TS : un axe purement numérique, sans fuseau ni DST, uniquement pour
    /// compter des jours entiers.
    private static func daysSinceEpoch(_ date: CalendarDate) -> Int {
        var components = DateComponents()
        components.year = date.year
        components.month = date.month
        components.day = date.day
        guard let midnightUTC = utcCalendar.date(from: components) else { return 0 }
        return Int((midnightUTC.timeIntervalSince1970 / 86_400).rounded())
    }

    /// Écart en JOURS CALENDAIRES entre deux triplets année/mois/jour —
    /// jamais une soustraction d'instants epoch bruts, qui se ferait piéger
    /// par les transitions d'heure d'été/hiver du fuseau du lecteur (un jour
    /// de 23 h ou 25 h resterait à 1 jour d'écart calendaire, pas 0,96 ou
    /// 1,04 — vecteur `dst-paris-short-day`).
    private static func daysBetween(from: CalendarDate, to: CalendarDate) -> Int {
        daysSinceEpoch(from) - daysSinceEpoch(to)
    }

    private static let yesterdayDays = 1
    private static let thisWeekMaxDays = 6

    /// Borne temporelle d'une conversation, dans le calendrier DU LECTEUR.
    /// Une conversation dont l'horodatage effectif tombe après `now`
    /// (horloge en légère avance côté client, par exemple) est traitée comme
    /// `.today` plutôt que rejetée dans un jour négatif qui n'existe dans
    /// aucune section.
    private static func resolveTemporalSection(
        _ conversation: SectionableConversation,
        now: Date,
        timeZone: TimeZone
    ) -> TemporalSectionKind {
        let nowDate = localCalendarDate(now, timeZone: timeZone)
        let conversationDate = localCalendarDate(effectiveTimestamp(conversation), timeZone: timeZone)
        let diffDays = max(0, daysBetween(from: nowDate, to: conversationDate))

        if diffDays == 0 { return .today }
        if diffDays == yesterdayDays { return .yesterday }
        if diffDays <= thisWeekMaxDays { return .thisWeek }
        return .older
    }

    // MARK: - Partition (resolveSections)

    private enum SectionTarget: Equatable {
        case pinned
        case live
        case category(categoryId: String)
        case temporal(kind: TemporalSectionKind)
    }

    /// Précédence de partition : épinglée PRIME sur live, live PRIME sur
    /// catégorie, catégorie PRIME sur temporel. Une conversation épinglée ET
    /// en direct atterrit dans `.pinned`, jamais `.live` — chaque
    /// conversation ne peut être classée que par la PREMIÈRE règle qui
    /// s'applique.
    ///
    /// Une conversation dont `categoryId` ne correspond à AUCUNE catégorie
    /// déclarée (catégorie supprimée depuis, ou jamais synchronisée) est
    /// traitée comme non catégorisée et retombe sur le temporel — jamais une
    /// section fantôme pour un id inconnu.
    private static func classify(
        _ conversation: SectionableConversation,
        declaredCategoryIds: Set<String>,
        now: Date,
        timeZone: TimeZone
    ) -> SectionTarget {
        if conversation.isPinned { return .pinned }
        if conversation.liveCall != nil { return .live }

        if let categoryId = conversation.categoryId, declaredCategoryIds.contains(categoryId) {
            return .category(categoryId: categoryId)
        }

        return .temporal(kind: resolveTemporalSection(conversation, now: now, timeZone: timeZone))
    }

    private struct SectionPartition {
        var pinned: [SectionableConversation] = []
        var live: [SectionableConversation] = []
        var byCategory: [String: [SectionableConversation]] = [:]
        var temporal: [TemporalSectionKind: [SectionableConversation]] = [:]
    }

    private static func partitionConversations(
        _ conversations: [SectionableConversation],
        declaredCategoryIds: Set<String>,
        now: Date,
        timeZone: TimeZone
    ) -> SectionPartition {
        var partition = SectionPartition()
        for conversation in conversations {
            switch classify(conversation, declaredCategoryIds: declaredCategoryIds, now: now, timeZone: timeZone) {
            case .pinned:
                partition.pinned.append(conversation)
            case .live:
                partition.live.append(conversation)
            case .category(let categoryId):
                partition.byCategory[categoryId, default: []].append(conversation)
            case .temporal(let kind):
                partition.temporal[kind, default: []].append(conversation)
            }
        }
        return partition
    }

    /// Sections ORDONNÉES : `.pinned` → `.live` → catégories utilisateur
    /// (dans l'ordre déclaré par `categories`) → `.today` → `.yesterday` →
    /// `.thisWeek` → `.older`. Aucune section vide n'est émise. Chaque
    /// conversation de `conversations` apparaît dans EXACTEMENT une section —
    /// l'union des sections rendues reconstitue `conversations` sans perte ni
    /// doublon (partition, critère LWS-1).
    ///
    /// `timeZone` est TOUJOURS injecté par l'appelant (jamais
    /// `TimeZone.current` lu ici) — même contrat que la loi TS, dont le
    /// paramètre `locale` est délibérément inutilisé par les bornes
    /// calendaires (réservé RESSOURCE FUTURE, libellés localisés côté peau) ;
    /// ce miroir Swift n'a donc pas de paramètre `locale` du tout, faute
    /// d'usage.
    public static func resolveSections(
        conversations: [SectionableConversation],
        categories: [SectionableCategory],
        now: Date,
        timeZone: TimeZone
    ) -> [ConversationSection] {
        let declaredCategoryIds = Set(categories.map(\.id))
        let partition = partitionConversations(
            conversations,
            declaredCategoryIds: declaredCategoryIds,
            now: now,
            timeZone: timeZone
        )

        var sections: [ConversationSection] = []

        if !partition.pinned.isEmpty {
            sections.append(.pinned(conversations: sortConversations(partition.pinned)))
        }

        if !partition.live.isEmpty {
            sections.append(.live(conversations: sortConversations(partition.live)))
        }

        for category in categories {
            guard let bucket = partition.byCategory[category.id], !bucket.isEmpty else { continue }
            sections.append(.category(categoryId: category.id, conversations: sortConversations(bucket)))
        }

        for kind in TemporalSectionKind.renderOrder {
            guard let bucket = partition.temporal[kind], !bucket.isEmpty else { continue }
            sections.append(.temporal(kind: kind, conversations: sortConversations(bucket)))
        }

        return sections
    }
}
