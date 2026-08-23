import Foundation

// MARK: - Nature d'une carte

/// Ce que la carte représente. Les deux onglets de « Mes stories » partagent
/// la MÊME carte : les actions sont des données, pas des sous-vues distinctes
/// (une carte par onglet aurait porté le patron de glyphe à cinq copies).
enum MyStoryCardKind: Equatable {
    case published
    case draft
}

// MARK: - Glyphes de la bande basse

/// Un glyphe de la bande sous la vignette. `Identifiable` pour être posé dans
/// un `ForEach` sans index, `CaseIterable` pour que le test de couverture
/// puisse exiger un symbole et un libellé VoiceOver sur CHACUN.
enum MyStoryGlyph: String, Equatable, Identifiable, CaseIterable {
    /// Ouvre la feuille des vues et des réactions.
    case viewsAndReactions
    /// Indicateur de réactions — informatif, il n'ouvre rien.
    case reactions
    /// Ouvre la feuille de commentaires.
    case comments
    /// Menu des options.
    case more
    /// Publie le brouillon. Brouillons uniquement.
    case publish

    var id: String { rawValue }

    var systemImage: String {
        switch self {
        case .viewsAndReactions: return "eye"
        case .reactions:         return "heart"
        case .comments:          return "bubble.left"
        case .more:              return "ellipsis"
        case .publish:           return "paperplane.fill"
        }
    }

    /// Chaque glyphe est une cible tactile : sans libellé, VoiceOver n'annonce
    /// que « bouton ».
    var accessibilityLabel: String {
        switch self {
        case .viewsAndReactions:
            return String(localized: "story.mine.glyph.views",
                          defaultValue: "Voir les vues et les réactions")
        case .reactions:
            return String(localized: "story.mine.glyph.reactions",
                          defaultValue: "Réactions")
        case .comments:
            return String(localized: "story.mine.glyph.comments",
                          defaultValue: "Voir les commentaires")
        case .more:
            return String(localized: "story.mine.glyph.more",
                          defaultValue: "Plus d'options")
        case .publish:
            return String(localized: "story.mine.glyph.publish",
                          defaultValue: "Publier ce brouillon")
        }
    }

    /// `false` pour un indicateur pur : le rendre tapable promettrait une
    /// action qui n'existe pas.
    var isInteractive: Bool { self != .reactions }
}

// MARK: - Actions du menu « … »

enum MyStoryMoreAction: String, Equatable, CaseIterable {
    case edit
    case schedule
    case delete
    case share
    case viewers
}

/// Ce que l'application sait faire aujourd'hui. « Programmer la publication »
/// n'a encore ni `scheduledAt` en base, ni échéance sur
/// `StoryPublishQueueItem`, ni identifiant de tâche de fond : l'entrée reste
/// derrière ce drapeau. Offrir une action qui ne fait rien est pire que ne pas
/// l'offrir.
struct MyStoriesCapabilities: Equatable {
    var scheduling: Bool

    static let current = MyStoriesCapabilities(scheduling: false)
}

// MARK: - Règles de présentation

// MARK: - Indicateur de sélection

/// État visuel de la pastille de sélection en mode suppression en masse.
/// `hidden` hors mode sélection : la pastille n'existe pas, pas même vide.
enum MyStorySelectionIndicator: Equatable {
    case hidden
    case unselected
    case selected
}

enum MyStoryCardPresentation {

    /// La grille de « Mes stories » a un mode sélection (`isSelecting`) mais la
    /// carte n'affichait AUCUN état : taper une carte ne changeait rien de
    /// visible. Décision pure — testée sans rendre la vue.
    static func selectionIndicator(isSelecting: Bool, isSelected: Bool) -> MyStorySelectionIndicator {
        guard isSelecting else { return .hidden }
        return isSelected ? .selected : .unselected
    }

    /// Une story périmée garde sa vignette, sous un voile gris. La bande de
    /// glyphes en dessous reste NETTE — c'est par elle qu'on consulte encore
    /// vues, réactions et commentaires d'une story éteinte.
    static func isVeiled(expiresAt: Date?, now: Date) -> Bool {
        guard let expiresAt else { return false }
        return expiresAt <= now
    }

    /// « il y a 2 jours » tant que la publication a moins d'un mois, la date
    /// exacte au-delà.
    ///
    /// Le seuil est un mois CALENDAIRE, pas trente jours : un mois dure 28 à
    /// 31 jours selon l'endroit où l'on se trouve, et l'utilisateur raisonne
    /// en mois.
    static func dateLabel(for date: Date, now: Date, locale: Locale) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = locale
        let threshold = calendar.date(byAdding: .month, value: -1, to: now) ?? now

        if date > threshold {
            let formatter = relativeFormatters[locale.identifier] ?? {
                let f = RelativeDateTimeFormatter()
                f.locale = locale
                f.unitsStyle = .full
                relativeFormatters[locale.identifier] = f
                return f
            }()
            // `localizedString(for:relativeTo:)` produit DÉJÀ « il y a … » :
            // le préfixer à la main donnait le « il y a il y a 3 jours »
            // qu'annonçait VoiceOver.
            return formatter.localizedString(for: date, relativeTo: now)
        }

        let formatter = mediumDateFormatters[locale.identifier] ?? {
            let f = DateFormatter()
            f.locale = locale
            f.dateStyle = .medium
            f.timeStyle = .none
            mediumDateFormatters[locale.identifier] = f
            return f
        }()
        return formatter.string(from: date)
    }

    private static var relativeFormatters: [String: RelativeDateTimeFormatter] = [:]
    private static var mediumDateFormatters: [String: DateFormatter] = [:]

    /// La bande basse. Une story publiée expose son engagement ; un brouillon
    /// n'a ni vue ni réaction à montrer — il a un bouton publier.
    static func glyphs(for kind: MyStoryCardKind) -> [MyStoryGlyph] {
        switch kind {
        case .published: return [.viewsAndReactions, .reactions, .comments, .more]
        case .draft:     return [.publish, .more]
        }
    }

    /// L'anneau d'export vers la photothèque remplace la vignette nue
    /// UNIQUEMENT pendant un job en vol pour CETTE carte — décision pure,
    /// testée sans rendre la vue (même famille que
    /// `StoryExportRailButtons.resolve`, l'équivalent au rail du lecteur).
    static func showsSaveProgressRing(saveProgress: Double?) -> Bool {
        saveProgress != nil
    }

    static func moreActions(for kind: MyStoryCardKind,
                            capabilities: MyStoriesCapabilities = .current) -> [MyStoryMoreAction] {
        switch kind {
        case .published:
            return [.viewers, .share, .delete]
        case .draft:
            var actions: [MyStoryMoreAction] = [.edit]
            if capabilities.scheduling { actions.append(.schedule) }
            actions.append(.delete)
            return actions
        }
    }
}
