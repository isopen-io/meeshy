import Foundation

/// Retrait de commentaires PARTAGÉ des gardes de source app-side — port fidèle
/// de `ComposerSourceGuard.stripComments` (SDK, machine à états).
///
/// Les gardes du bundle app portaient chacune leur stripper local, et les plus
/// faibles laissaient passer exactement ce que les leçons
/// `feedback_source_guard_tests_must_strip_comments` et
/// `feedback_read_code_not_comments_for_source_guards` proscrivent :
/// - couper au premier `//` SANS conscience des littéraux tronquait une ligne
///   contenant `"https://…"` — le code inspecté disparaissait de la garde ;
/// - ne filtrer que les lignes COMMENÇANT par `//` laissait un commentaire de
///   fin de ligne citer le symbole cherché et satisfaire l'assertion seul ;
/// - aucun ne fermait un bloc `/* … */` multi-ligne.
///
/// La machine à états traite les quatre modes (code, littéral de chaîne avec
/// échappements, commentaire de ligne, commentaire de bloc) — un seul
/// comportement pour toutes les gardes, aligné sur la référence SDK.
enum AppSourceGuard {

    static func stripComments(_ source: String) -> String {
        enum Mode { case code, string, lineComment, blockComment }
        var mode: Mode = .code
        var result = ""
        var escaped = false
        var pending: Character?   // barre oblique en attente de son second caractère

        for character in source {
            switch mode {
            case .code:
                if let slash = pending {
                    pending = nil
                    if character == "/" { mode = .lineComment; continue }
                    if character == "*" { mode = .blockComment; continue }
                    result.append(slash)
                }
                if character == "/" { pending = "/"; continue }
                if character == "\"" { mode = .string }
                result.append(character)
            case .string:
                result.append(character)
                if escaped { escaped = false; continue }
                if character == "\\" { escaped = true; continue }
                if character == "\"" { mode = .code }
            case .lineComment:
                if character == "\n" { mode = .code; result.append(character) }
            case .blockComment:
                if let star = pending, star == "*", character == "/" {
                    pending = nil
                    mode = .code
                    continue
                }
                pending = character == "*" ? "*" : nil
                if character == "\n" { result.append(character) }
            }
        }
        if let slash = pending, mode == .code { result.append(slash) }
        return result
    }

    /// Variante en LIGNES, pour les gardes qui raisonnent ligne à ligne
    /// (remontée de constructeur, comptages locaux).
    static func strippedLines(_ source: String) -> [String] {
        stripComments(source).components(separatedBy: "\n")
    }

    // MARK: - L'UNITÉ de source d'un type découpé (#4102)

    /// La racine `apps/ios`, lue depuis CE fichier — jamais depuis l'appelant :
    /// une garde qui déménage d'un répertoire ne doit pas déplacer la racine
    /// avec elle.
    private static var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Helpers
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
    }

    /// **Un type découpé garde UNE adresse.**
    ///
    /// `Type.swift` scindé en `Type+Rôle.swift` reste une seule source aux yeux
    /// des gardes. Sans cela, chaque découpage éteint en SILENCE toutes les
    /// gardes négatives du type : elles passent au vert en lisant la moitié qui
    /// ne contient pas l'interdit. C'est le mode de panne exact contre lequel
    /// chaque suite pose déjà un `test_…ReadANonEmptySource` — celui-là attrape
    /// un chemin FAUX, aucun n'attrapait un chemin devenu PARTIEL.
    ///
    /// Le balayage est un GLOB, jamais une liste : une liste de parties se
    /// périme au premier fichier ajouté, et se périme en silence puisque le
    /// résultat reste non vide. `alsoIncluding` ne sert qu'aux compagnons qui ne
    /// portent PAS le nom du type — les règles pures sorties du fichier, qui
    /// n'ont aucune raison de s'appeler `Type+…`.
    static func unitURLs(_ relativeToAppRoot: String,
                         alsoIncluding compagnons: [String] = []) -> [URL] {
        let principal = appRoot.appendingPathComponent(relativeToAppRoot)
        let dossier = principal.deletingLastPathComponent()
        let base = principal.deletingPathExtension().lastPathComponent
        let voisins = (try? FileManager.default.contentsOfDirectory(
            at: dossier, includingPropertiesForKeys: nil)) ?? []
        let parties = voisins
            .filter { $0.pathExtension == "swift"
                && $0.deletingPathExtension().lastPathComponent.hasPrefix(base + "+") }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        return [principal] + parties + compagnons.map(appRoot.appendingPathComponent)
    }

    static func unit(_ relativeToAppRoot: String,
                     alsoIncluding compagnons: [String] = []) throws -> String {
        try unitURLs(relativeToAppRoot, alsoIncluding: compagnons)
            .map { try String(contentsOf: $0, encoding: .utf8) }
            .joined(separator: "\n")
    }

    /// L'unité du meuble du composer : le type, ses trois extensions, et les
    /// règles pures qui en sont sorties au #4102.
    static let composerHostPath = "Meeshy/Features/Main/Composer/MeeshyComposerHost.swift"
    static let composerHostCompanions = [
        "Meeshy/Features/Main/Composer/ComposerHostRules.swift",
        // Sortie de `ComposerHostRules` quand l'inspecteur a cessé de ne
        // connaître que le texte (#4073). Elle reste DANS l'unité du meuble :
        // une règle qui déménage sans emmener son adresse éteint en silence
        // toutes les gardes négatives qui la balayaient.
        "Meeshy/Features/Main/Composer/ComposerObjectChips.swift",
        // **Le relevé du rail (#4994), entré dans l'unité au #5007.** Il vivait
        // hors d'elle, et `test_lesBalises_neSontDeriveesQuUneFois` — qui
        // interdit une seconde dérivation des hashtags — ne le balayait donc
        // pas : le doublon y était INVISIBLE parce que le fichier était neuf,
        // pas parce qu'il était subtil.
        //
        // > Une règle qui naît hors de l'unité de son hôte naît hors de toutes
        // > les gardes qui protègent cet hôte. C'est le miroir de « une règle
        // > qui déménage sans emmener son adresse les éteint en silence » :
        // > même angle mort, à la création plutôt qu'au déplacement.
        "Meeshy/Features/Main/Composer/ComposerRailDoorBadge.swift",
    ]

    static func composerHostURLs() -> [URL] {
        unitURLs(composerHostPath, alsoIncluding: composerHostCompanions)
    }

    static func composerHostSource() throws -> String {
        try unit(composerHostPath, alsoIncluding: composerHostCompanions)
    }

    /// L'unité de l'écran CONVERSATION : la vue, ses extensions, et l'état du
    /// composer sorti du fichier le 2026-09-02 (`ConversationComposerState`,
    /// #4823 — extraire d'abord, ajouter ensuite). Il ne porte pas le nom du
    /// type hôte, donc le glob `ConversationView+*.swift` ne le voit pas ; sans
    /// cette adresse, la garde du brouillon d'édition lisait une unité qui ne
    /// contenait plus son ancre (leçon 347).
    static let conversationViewPath = "Meeshy/Features/Main/Views/ConversationView.swift"
    static let conversationViewCompanions = [
        "Meeshy/Features/Main/Views/ConversationComposerState.swift"
    ]

    static func conversationViewSource() throws -> String {
        try unit(conversationViewPath, alsoIncluding: conversationViewCompanions)
    }

    /// L'unité de la surface DOCUMENT : la vue, plus les deux fichiers de règles
    /// pures qui en sont sortis au #4103 (`ComposerSurfaceRules`,
    /// `ComposerDocumentRules`). Même raison que pour le meuble : sans l'unité,
    /// toute garde négative dont l'interdit a suivi les règles passerait au vert
    /// en lisant la moitié qui ne le contient plus.
    static let composerSurfacePath = "Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift"
    static let composerSurfaceCompanions = [
        "Meeshy/Features/Main/Composer/ComposerSurfaceRules.swift",
        "Meeshy/Features/Main/Composer/ComposerDocumentRules.swift",
        // **La géométrie de la rangée, extraite le 2026-08-31** — même raison
        // que les deux ci-dessous : le nom ne porte pas celui du type hôte,
        // donc le glob ne la voit pas.
        "Meeshy/Features/Main/Composer/ComposerDocumentToolRow.swift",
        // **Les deux types extraits le 2026-08-30**, quand le fichier a franchi
        // le plafond de 1 100 lignes. Ils ne portent PAS le nom du type, donc le
        // glob `ComposerDocumentSurface+*.swift` ne les voit pas — c'est
        // exactement ce à quoi `alsoIncluding` sert.
        //
        // Sans eux, une dizaine de gardes qui ancrent sur `composerHost`,
        // `publishMood`, `publishDocument` ou la vignette perdraient leur objet
        // en silence. Un découpage n'est pas fini quand le fichier passe sous le
        // budget : il l'est quand les gardes qui le nommaient pointent l'unité
        // (leçon 347).
        "Meeshy/Features/Main/Composer/DocumentComposerDoor.swift",
        "Meeshy/Features/Main/Composer/ComposerMediaThumbnail.swift"
    ]

    static func composerSurfaceURLs() -> [URL] {
        unitURLs(composerSurfacePath, alsoIncluding: composerSurfaceCompanions)
    }

    static func composerSurfaceSource() throws -> String {
        try unit(composerSurfacePath, alsoIncluding: composerSurfaceCompanions)
    }

    /// L'unité de `StoryViewModel` (#4425) : le fichier historique, ses
    /// extensions `StoryViewModel+*.swift` (attrapées par le glob de
    /// `unitURLs`), et `StoryViewModelRules`, le compagnon de règles pures
    /// sorti du même découpage. Ce dernier doit être nommé explicitement en
    /// `alsoIncluding` — même raison que `ComposerHostRules` et les deux
    /// compagnons de `composerSurfaceCompanions` avant lui : il ne porte PAS
    /// le préfixe `StoryViewModel+…`, donc le glob ne l'attrape pas, et sans
    /// lui toute garde négative dont l'interdit a suivi les règles pures
    /// passerait au vert en lisant la moitié qui ne les contient plus.
    static let storyViewModelPath = "Meeshy/Features/Main/ViewModels/StoryViewModel.swift"
    static let storyViewModelCompanions = ["Meeshy/Features/Main/ViewModels/StoryViewModelRules.swift"]

    static func storyViewModelURLs() -> [URL] {
        unitURLs(storyViewModelPath, alsoIncluding: storyViewModelCompanions)
    }

    static func storyViewModelSource() throws -> String {
        try unit(storyViewModelPath, alsoIncluding: storyViewModelCompanions)
    }
}
