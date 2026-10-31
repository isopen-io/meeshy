import Foundation

/// **Une entrée du menu ⋯ de la scène** (#13839).
///
/// Au repos, la scène porte Texte, Média, Sticker, Son, Dessin, Fond, Mention,
/// Lieu (#14050) et ⋯. Le reste de ce que portaient le rail gauche, la colonne
/// droite, la barre haute et le menu de débordement vit ici — rien n'a
/// disparu, tout a déménagé. L'export et l'effacement restent décidés par
/// `ComposerOverflowPolicy`, que ce menu LIT au lieu de la recopier.
nonisolated enum ComposerMoreMenuEntry: String, CaseIterable, Equatable, Sendable {
    case addSlide
    case transitions
    case visualEffect
    case backgroundFraming
    case animation
    case slideDuration
    case legend
    case hashtags
    case preview
    case pickBackground
    case removeBackground
    case saveToPhotos
    case share
    case clearAll

    var isDestructive: Bool { self == .clearAll }

    init(_ overflow: ComposerOverflowEntry) {
        switch overflow {
        case .preview: self = .preview
        case .pickBackground: self = .pickBackground
        case .removeBackground: self = .removeBackground
        case .saveToPhotos: self = .saveToPhotos
        case .share: self = .share
        case .clearAll: self = .clearAll
        }
    }

    /// La porte que l'entrée ouvre, quand elle en ouvre une : la même que le
    /// rail ouvrait, par le même `handleRailDoor`.
    var door: ComposerRailDoor? {
        self == .hashtags ? .hashtag : nil
    }
}

/// **Ce que ⋯ sert, et dans quel ordre** — l'ordre de la spec iOS § 4 : ce qui
/// structure la scène, puis ce qui qualifie la publication, puis l'export, et
/// l'unique entrée destructrice en dernier. Une entrée n'est servie que si
/// elle a un effet (loi 4).
nonisolated enum ComposerMoreMenuPolicy {

    struct Context: Equatable, Sendable {
        var addsSlides: Bool
        var backgroundMedia: ComposerSceneEffects.Background?
        var offeredDoors: [ComposerRailDoor]
        var overflow: [ComposerOverflowEntry]
    }

    static func entries(_ context: Context) -> [ComposerMoreMenuEntry] {
        let doors = Set(context.offeredDoors)
        let scene: [ComposerMoreMenuEntry] = (context.addsSlides ? [.addSlide] : [])
            + background(context.backgroundMedia) + [.animation, .slideDuration, .legend]
        let publication = [ComposerMoreMenuEntry.hashtags]
            .filter { entree in entree.door.map(doors.contains) ?? false }
        let export = context.overflow.map(ComposerMoreMenuEntry.init)
        return scene + publication + export
    }

    /// « Fond » est une entrée directe du rail (#14050) ; avec un média de
    /// fond, ses effets et son cadrage restent ici.
    private static func background(_ media: ComposerSceneEffects.Background?) -> [ComposerMoreMenuEntry] {
        guard let media else { return [] }
        let effets = ComposerSceneEffects.served(background: media).map { effet -> ComposerMoreMenuEntry in
            effet == .opening ? .transitions : .visualEffect
        }
        return effets + [.backgroundFraming]
    }

    static let slideDurationChoices: [TimeInterval] = [5, 10, 15, 30, 60]

    /// **Ce que « Durée » sert, et ce qu'il coche** : la coche dit la durée
    /// RÉELLE de la diapo, arrondie à la seconde. Une durée hors des choix
    /// (le contenu, la frise, un brouillon) paraît à son rang plutôt que de
    /// cocher son voisin.
    static func durationMenu(current: TimeInterval) -> (choices: [TimeInterval], selected: TimeInterval?) {
        guard current.isFinite, current > 0 else { return (slideDurationChoices, nil) }
        let courante = max(1, current.rounded())
        let choix = slideDurationChoices.contains(courante)
            ? slideDurationChoices
            : (slideDurationChoices + [courante]).sorted()
        return (choix, courante)
    }
}

/// Les mots de ⋯. Les entrées qui existaient déjà gardent leur clé ; celles
/// que le relevé de #13839 trouvait floues (« Enregistrer » sans dire où,
/// « Transférer » sans dire vers où) prennent une clé à elles.
nonisolated enum ComposerMoreMenuCopy {

    static func label(_ entry: ComposerMoreMenuEntry) -> String {
        if let door = entry.door { return ComposerRailCopy.label(door) }
        switch entry {
        case .addSlide:
            return String(localized: "composer.more.addSlide", defaultValue: "Ajouter une diapo", bundle: .main)
        case .transitions:
            return String(localized: "composer.more.transitions", defaultValue: "Transitions", bundle: .main)
        case .visualEffect:
            return String(localized: "composer.more.visualEffect", defaultValue: "Effet visuel", bundle: .main)
        case .backgroundFraming:
            return String(localized: "composer.more.backgroundFraming",
                          defaultValue: "Cadrage du fond", bundle: .main)
        case .animation:
            return String(localized: "composer.more.animation", defaultValue: "Animation", bundle: .main)
        case .slideDuration:
            return String(localized: "composer.more.slideDuration", defaultValue: "Durée", bundle: .main)
        case .legend:
            return String(localized: "composer.more.legend", defaultValue: "Légende", bundle: .main)
        case .removeBackground:
            return String(localized: "composer.more.removeBackground",
                          defaultValue: "Retirer le fond de la scène", bundle: .main)
        case .saveToPhotos:
            return String(localized: "composer.more.saveToPhotos",
                          defaultValue: "Enregistrer dans Photos", bundle: .main)
        case .share:
            return String(localized: "composer.more.share", defaultValue: "Partager hors de Meeshy", bundle: .main)
        case .pickBackground:
            return String(localized: "composer.more.pickBackground", defaultValue: "Choisir un fond", bundle: .main)
        case .preview, .clearAll:
            return ComposerOverflowCopy.label(entry == .preview ? .preview : .clearAll)
        case .hashtags:
            return ""
        }
    }

    static func icon(_ entry: ComposerMoreMenuEntry) -> String {
        if let door = entry.door { return door.symbolName }
        switch entry {
        case .addSlide: return "plus.rectangle.on.rectangle"
        case .transitions: return ComposerSceneEffect.opening.symbol
        case .visualEffect: return ComposerSceneEffect.visual.symbol
        case .backgroundFraming: return "crop"
        case .animation: return "film.stack"
        case .slideDuration: return "timer"
        case .legend: return "text.bubble"
        case .preview: return ComposerOverflowCopy.icon(.preview)
        case .pickBackground: return ComposerOverflowCopy.icon(.pickBackground)
        case .removeBackground: return ComposerOverflowCopy.icon(.removeBackground)
        case .saveToPhotos: return ComposerOverflowCopy.icon(.saveToPhotos)
        case .share: return ComposerOverflowCopy.icon(.share)
        case .clearAll: return ComposerOverflowCopy.icon(.clearAll)
        case .hashtags: return ""
        }
    }

    static var animationOn: String {
        String(localized: "composer.more.animation.on", defaultValue: "Animer la scène", bundle: .main)
    }

    static var animationTimeline: String {
        String(localized: "composer.more.animation.timeline", defaultValue: "Ouvrir la frise", bundle: .main)
    }

    static var animationOff: String {
        String(localized: "composer.more.animation.off", defaultValue: "Arrêter l'animation", bundle: .main)
    }

    static func seconds(_ value: TimeInterval) -> String {
        Duration.seconds(value).formatted(.units(allowed: [.seconds], width: .abbreviated))
    }

    static var clearAllConfirm: String {
        String(localized: "composer.more.clearAll.confirm",
               defaultValue: "Tout effacer de la scène ?", bundle: .main)
    }
}
