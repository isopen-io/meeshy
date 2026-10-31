import Foundation

/// **L'arbre UNIQUE des niveaux d'édition** (#13974, grammaire d'édition § 1).
///
/// Il vit dans `packages/shared/design/composer-edit-tree.json`, que l'app
/// Android décode aussi : identifiants, ordre, clé du mot, mot français de
/// référence, glyphes SF Symbol et Material, ce que l'entrée ouvre, et sa
/// condition d'offre. iOS en compile la valeur (`shared`) ; un témoin décode le
/// fichier et exige la même, champ pour champ. Un mot, un ordre ou un glyphe
/// changé d'un seul côté rougit — c'est la seule façon de tenir « mêmes mots,
/// même ordre » entre les deux plateformes dans la durée.
nonisolated struct ComposerEditTree: Codable, Equatable, Sendable {

    /// Ce qu'une entrée OUVRE : un rail posé par-dessus, une feuille basse, ou
    /// un geste immédiat.
    enum Opening: String, Codable, Equatable, Sendable {
        case level
        case sheet
        case action
    }

    /// La condition sous laquelle une entrée est offerte — absente plutôt
    /// qu'inerte (loi 4).
    enum Offer: String, Codable, Equatable, Sendable {
        case always
        case unlocked
        case removable
        case editable
        case duplicable
        case cameraTakesPhotos
    }

    struct Entry: Codable, Equatable, Sendable {
        let id: String
        let labelKey: String
        let label: String
        let sfSymbol: String
        let material: String
        let opens: Opening
        let destructive: Bool
        let confirms: Bool
        let offer: Offer
        let choices: [Entry]
    }

    struct Level: Codable, Equatable, Sendable {
        let id: String
        let titleKey: String
        let title: String
        let entries: [Entry]
    }

    /// Les identifiants des niveaux que le fichier déclare.
    enum LevelID: String, Sendable {
        case selection
        case backgroundMedia = "background.media"
    }

    let version: Int
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

    private static func entry(_ id: String, key: String, label: String, sf: String, material: String,
                              opens: Opening, destructive: Bool = false, confirms: Bool = false,
                              offer: Offer, choices: [Entry] = []) -> Entry {
        Entry(id: id, labelKey: key, label: label, sfSymbol: sf, material: material, opens: opens,
              destructive: destructive, confirms: confirms, offer: offer, choices: choices)
    }

    static let shared = ComposerEditTree(version: 1, levels: [
        Level(id: "selection", titleKey: "composer.selection.bar", title: "Actions de l'élément", entries: [
            entry("modify", key: "composer.selection.modify", label: "Modifier", sf: "pencil", material: "Edit",
                  opens: .level, offer: .editable),
            entry("duplicate", key: "composer.selection.duplicate", label: "Dupliquer", sf: "plus.square.on.square",
                  material: "ContentCopy", opens: .action, offer: .duplicable),
            entry("time", key: "composer.selection.time", label: "Temps", sf: "clock", material: "Schedule",
                  opens: .level, offer: .unlocked),
            entry("remove", key: "composer.selection.remove", label: "Retirer", sf: "trash", material: "Delete",
                  opens: .action, destructive: true, offer: .removable),
        ]),
        Level(id: "background.media", titleKey: "composer.rail.title.background", title: "Fond", entries: [
            entry("modify", key: "composer.selection.modify", label: "Modifier", sf: "pencil", material: "Edit",
                  opens: .level, offer: .unlocked),
            entry("replace", key: "composer.edit.replace", label: "Remplacer", sf: "arrow.triangle.2.circlepath",
                  material: "SwapHoriz", opens: .sheet, offer: .unlocked, choices: [
                    entry("photoLibrary", key: "composer.edit.source.library", label: "Photothèque",
                          sf: "photo.on.rectangle", material: "PhotoLibrary", opens: .action, offer: .always),
                    entry("camera", key: "composer.rail.media.takePhoto", label: "Prendre une photo", sf: "camera",
                          material: "PhotoCamera", opens: .action, offer: .cameraTakesPhotos),
                    entry("files", key: "composer.edit.source.files", label: "Fichiers", sf: "folder",
                          material: "Folder", opens: .action, offer: .always),
                  ]),
            entry("putOnScene", key: "composer.edit.putOnScene", label: "Mettre sur la scène",
                  sf: "square.3.layers.3d.top.filled", material: "FlipToFront", opens: .action, offer: .unlocked),
            entry("remove", key: "composer.selection.remove", label: "Retirer", sf: "trash", material: "Delete",
                  opens: .action, destructive: true, confirms: true, offer: .removable),
        ]),
    ])
}

// MARK: - Le niveau N0 « Fond »

/// **Une entrée du niveau « Fond »** d'un fond image ou vidéo : Modifier ·
/// Remplacer · Mettre sur la scène · Retirer. Ni Dupliquer — il deviendrait un
/// second fond —, ni Temps : le fond dure toute la diapo.
nonisolated enum ComposerBackgroundEditAction: String, CaseIterable, Equatable, Sendable {
    case modify
    case replace
    case putOnScene
    case remove
}

/// **Une source de « Remplacer »**, dans la feuille basse.
nonisolated enum ComposerBackgroundSource: String, CaseIterable, Equatable, Sendable {
    case photoLibrary
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
/// changé dans le fichier partagé se lit à l'écran.
nonisolated enum ComposerBackgroundEdit {

    static func entry(_ action: ComposerBackgroundEditAction,
                      tree: ComposerEditTree = .shared) -> ComposerEditTree.Entry? {
        tree.entry(action.rawValue, in: .backgroundMedia)
    }

    static func served(isLocked: Bool, removable: Bool,
                       tree: ComposerEditTree = .shared) -> [ComposerBackgroundEditAction] {
        (tree.level(.backgroundMedia)?.entries ?? []).compactMap { entree in
            guard let action = ComposerBackgroundEditAction(rawValue: entree.id),
                  admits(entree.offer, isLocked: isLocked, removable: removable, cameraTakesPhotos: false) else {
                return nil
            }
            return action
        }
    }

    static func sources(cameraTakesPhotos: Bool, tree: ComposerEditTree = .shared) -> [ComposerBackgroundSource] {
        (entry(.replace, tree: tree)?.choices ?? []).compactMap { choix in
            guard let source = ComposerBackgroundSource(rawValue: choix.id),
                  admits(choix.offer, isLocked: false, removable: true, cameraTakesPhotos: cameraTakesPhotos) else {
                return nil
            }
            return source
        }
    }

    static func source(_ source: ComposerBackgroundSource,
                       tree: ComposerEditTree = .shared) -> ComposerEditTree.Entry? {
        entry(.replace, tree: tree)?.choices.first { $0.id == source.rawValue }
    }

    /// Retirer le fond se CONFIRME : l'arbre le dit.
    static func confirms(_ action: ComposerBackgroundEditAction, tree: ComposerEditTree = .shared) -> Bool {
        entry(action, tree: tree)?.confirms == true
    }

    static func isDestructive(_ action: ComposerBackgroundEditAction) -> Bool {
        entry(action)?.destructive == true
    }

    private static func admits(_ offer: ComposerEditTree.Offer, isLocked: Bool, removable: Bool,
                               cameraTakesPhotos: Bool) -> Bool {
        switch offer {
        case .always:                       return true
        case .unlocked, .editable, .duplicable: return !isLocked
        case .removable:                    return removable
        case .cameraTakesPhotos:            return cameraTakesPhotos
        }
    }
}

// MARK: - Les mots, lus dans l'arbre

/// Le mot d'une entrée vient de SA clé de catalogue, celle que l'arbre partagé
/// déclare : aucune chaîne n'est recopiée ici.
@MainActor
enum ComposerEditTreeCopy {

    static func label(_ entry: ComposerEditTree.Entry) -> String {
        String(localized: String.LocalizationValue(entry.labelKey), bundle: .main)
    }

    static func title(_ level: ComposerEditTree.Level) -> String {
        String(localized: String.LocalizationValue(level.titleKey), bundle: .main)
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
