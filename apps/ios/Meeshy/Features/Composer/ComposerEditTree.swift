import Foundation

/// **L'arbre UNIQUE des niveaux d'édition** (#13973 Android, #13974 iOS,
/// grammaire d'édition § 1).
///
/// Il vit dans `packages/shared/design/composer-edit-tree.json`, que l'app
/// Android décode aussi (`:core:model` `ComposerEditTree.kt`) : niveaux et leur
/// genre (rail ou feuille), entrées dans l'ordre servi, clé du mot au catalogue
/// iOS, glyphes SF Symbol et Material, condition d'offre, ce que l'entrée ouvre.
/// iOS en compile la valeur (`shared`) ; un témoin décode le fichier et exige la
/// même, champ pour champ. Un mot, un ordre ou un glyphe changé d'un seul côté
/// rougit — mêmes mots, même ordre sur les deux plateformes.
nonisolated struct ComposerEditTree: Codable, Equatable, Sendable {

    /// Un niveau se pose dans le rail (N0) ou par-dessus, ou bien en feuille
    /// basse sans voile.
    enum Kind: String, Codable, Equatable, Sendable {
        case rail
        case sheet
    }

    /// La condition sous laquelle une entrée est offerte — absente plutôt
    /// qu'inerte (loi 4).
    enum Offer: String, Codable, Equatable, Sendable {
        case always
        case editor
        case mediaSource = "media-source"
        case camera
    }

    /// Ce qu'une entrée OUVRE : un geste immédiat, le niveau nommé par `next`,
    /// la feuille nommée par `next`, ou une confirmation avant d'agir.
    enum Opening: String, Codable, Equatable, Sendable {
        case action
        case level
        case sheet
        case confirmation
    }

    struct Entry: Codable, Equatable, Sendable {
        let id: String
        let label: String
        let sfSymbol: String
        let material: String
        let offer: Offer
        let opens: Opening
        var next: String? = nil
        var destructive: Bool? = nil
    }

    struct Level: Codable, Equatable, Sendable {
        let id: String
        let kind: Kind
        let title: String
        let entries: [Entry]
    }

    /// Les identifiants des niveaux que le fichier déclare.
    enum LevelID: String, Sendable {
        case backgroundMedia = "background.media"
        case backgroundMediaReplace = "background.media.replace"
    }

    let schemaVersion: Int
    let levels: [Level]

    func level(_ id: LevelID) -> Level? {
        levels.first { $0.id == id.rawValue }
    }

    func entry(_ id: String, in level: LevelID) -> Entry? {
        self.level(level)?.entries.first { $0.id == id }
    }
}

// MARK: - La valeur compilée, recopiée du fichier partagé

nonisolated extension ComposerEditTree {

    static let shared = ComposerEditTree(schemaVersion: 1, levels: [
        Level(id: "background.media", kind: .rail, title: "composer.rail.title.background", entries: [
            Entry(id: "edit", label: "composer.selection.modify", sfSymbol: "slider.horizontal.3",
                  material: "Edit", offer: .editor, opens: .level),
            Entry(id: "replace", label: "composer.edit.replace", sfSymbol: "arrow.triangle.2.circlepath",
                  material: "SwapHorizontal", offer: .mediaSource, opens: .sheet, next: "background.media.replace"),
            Entry(id: "put-on-scene", label: "composer.audio.promote.action", sfSymbol: "square.on.square",
                  material: "FlipToFront", offer: .always, opens: .action),
            Entry(id: "remove", label: "composer.selection.remove", sfSymbol: "trash",
                  material: "Delete", offer: .always, opens: .confirmation, destructive: true),
        ]),
        Level(id: "background.media.replace", kind: .sheet, title: "composer.edit.replace", entries: [
            Entry(id: "library", label: "composer.edit.source.library", sfSymbol: "photo.on.rectangle",
                  material: "PhotoLibrary", offer: .mediaSource, opens: .action),
            Entry(id: "camera", label: "composer.rail.media.takePhoto", sfSymbol: "camera",
                  material: "Camera", offer: .camera, opens: .action),
            Entry(id: "files", label: "composer.rail.media.fromFiles", sfSymbol: "folder",
                  material: "Folder", offer: .mediaSource, opens: .action),
        ]),
    ])
}

// MARK: - Le niveau N0 « Fond »

/// **Une entrée du niveau « Fond »** d'un fond image ou vidéo : Modifier ·
/// Remplacer · Mettre sur la scène · Retirer. Ni Dupliquer — il deviendrait un
/// second fond —, ni Temps : le fond dure toute la diapo.
nonisolated enum ComposerBackgroundEditAction: String, CaseIterable, Equatable, Sendable {
    case modify = "edit"
    case replace
    case putOnScene = "put-on-scene"
    case remove
}

/// **Une source de « Remplacer »**, dans la feuille basse.
nonisolated enum ComposerBackgroundSource: String, CaseIterable, Equatable, Sendable {
    case photoLibrary = "library"
    case camera
    case files

    var intake: ComposerMediaIntake {
        switch self {
        case .photoLibrary: return .photoLibrary
        case .camera:       return .camera
        case .files:        return .files
        }
    }
}

/// **La loi du niveau « Fond »** : ce que l'arbre déclare, dans SON ordre,
/// filtré par ce que le fond admet. Rien n'est écrit en dur ici : un ordre
/// changé dans le fichier partagé se lit à l'écran. Le verrou est la règle
/// iOS de la scène : un fond verrouillé ne s'édite pas, il ne peut que partir
/// — et seulement s'il admet le retrait.
nonisolated enum ComposerBackgroundEdit {

    static func entry(_ action: ComposerBackgroundEditAction,
                      tree: ComposerEditTree = .shared) -> ComposerEditTree.Entry? {
        tree.entry(action.rawValue, in: .backgroundMedia)
    }

    static func served(isLocked: Bool, removable: Bool,
                       tree: ComposerEditTree = .shared) -> [ComposerBackgroundEditAction] {
        (tree.level(.backgroundMedia)?.entries ?? []).compactMap { entree in
            guard let action = ComposerBackgroundEditAction(rawValue: entree.id),
                  admits(entree.offer, cameraTakesPhotos: false),
                  action == .remove ? removable : !isLocked else {
                return nil
            }
            return action
        }
    }

    static func sources(cameraTakesPhotos: Bool, tree: ComposerEditTree = .shared) -> [ComposerBackgroundSource] {
        (tree.level(.backgroundMediaReplace)?.entries ?? []).compactMap { choix in
            guard let source = ComposerBackgroundSource(rawValue: choix.id),
                  admits(choix.offer, cameraTakesPhotos: cameraTakesPhotos) else {
                return nil
            }
            return source
        }
    }

    static func source(_ source: ComposerBackgroundSource,
                       tree: ComposerEditTree = .shared) -> ComposerEditTree.Entry? {
        tree.entry(source.rawValue, in: .backgroundMediaReplace)
    }

    /// Retirer le fond se CONFIRME : l'arbre le dit.
    static func confirms(_ action: ComposerBackgroundEditAction, tree: ComposerEditTree = .shared) -> Bool {
        entry(action, tree: tree)?.opens == .confirmation
    }

    static func isDestructive(_ action: ComposerBackgroundEditAction) -> Bool {
        entry(action)?.destructive == true
    }

    /// Sur iOS, un fond porte toujours son éditeur et les sources de médias
    /// sont toujours ouvertes ; seul le viseur dépend du format.
    private static func admits(_ offer: ComposerEditTree.Offer, cameraTakesPhotos: Bool) -> Bool {
        switch offer {
        case .always, .editor, .mediaSource: return true
        case .camera:                        return cameraTakesPhotos
        }
    }
}

// MARK: - Les mots, lus dans l'arbre

/// Le mot d'une entrée vient de SA clé de catalogue, celle que l'arbre partagé
/// déclare : aucune chaîne n'est recopiée ici.
@MainActor
enum ComposerEditTreeCopy {

    static func label(_ entry: ComposerEditTree.Entry) -> String {
        String(localized: String.LocalizationValue(entry.label), bundle: .main)
    }

    static func title(_ level: ComposerEditTree.Level) -> String {
        String(localized: String.LocalizationValue(level.title), bundle: .main)
    }

    static func label(_ action: ComposerBackgroundEditAction) -> String {
        ComposerBackgroundEdit.entry(action).map(label) ?? action.rawValue
    }

    static func symbol(_ action: ComposerBackgroundEditAction) -> String {
        ComposerBackgroundEdit.entry(action)?.sfSymbol ?? "questionmark"
    }

    static func label(_ source: ComposerBackgroundSource) -> String {
        ComposerBackgroundEdit.source(source).map(label) ?? source.rawValue
    }

    static func symbol(_ source: ComposerBackgroundSource) -> String {
        ComposerBackgroundEdit.source(source)?.sfSymbol ?? "questionmark"
    }

    static var backgroundTitle: String {
        ComposerEditTree.shared.level(.backgroundMedia).map(title) ?? ""
    }

    static var removeBackgroundTitle: String {
        String(localized: "composer.edit.background.removeConfirm.title", defaultValue: "Retirer le fond ?",
               bundle: .main)
    }

    static var cancel: String {
        String(localized: "composer.slide.rail.deleteConfirm.cancel", defaultValue: "Annuler", bundle: .main)
    }
}
