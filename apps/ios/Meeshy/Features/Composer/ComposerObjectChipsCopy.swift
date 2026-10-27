import Foundation

// MARK: - Les MOTS des jetons de l'inspecteur (#4559)
//
// La rangée de la vue `1c` composait ses libellés en français EN DUR —
// « STYLE · NÉON », « TAILLE 38 », « ALIGN · CENTRÉ », « TEXTE · PLAN FG · z 2 ».
// Dix-neuf chaînes qui n'entraient dans aucun catalogue, donc dans aucune
// mesure : le cliquet de localisation compte ce qui est DÉCLARÉ par un
// `String(localized:)`, jamais ce qui est AFFICHÉ. Une chaîne d'interface qui
// n'est pas déclarée est invisible à l'inventaire de dette exactement comme
// elle est invisible au traducteur.
//
// La moitié difficile était pourtant faite : les NOMBRES passaient déjà par
// `LocalizedNumber`, glyphe arabe compris, avec deux témoins en `ar_SA`. Ce
// sont les mots autour qui manquaient — ce qui rendait le trou plus discret,
// puisque la partie qu'on pense à vérifier était juste.
//
// ## Pourquoi des clés de PHRASE, et non des morceaux assemblés par la vue
//
// « STYLE » + « · » + le nom du style assemblés au site d'appel imposeraient
// le séparateur français aux sept langues et interdiraient à l'arabe de
// réordonner. Pire : **la phrase assemblée n'apparaît nulle part comme
// phrase**, donc aucun relecteur, aucun traducteur et aucun cliquet ne peut
// juger ce que l'utilisateur lit — elle n'existe qu'à l'exécution.
//
// Chaque libellé est donc UNE clé portant sa phrase complète, dont les
// arguments sont déjà localisés quand ils arrivent : le nom du style, le nom
// du plan, et le nombre rendu par `LocalizedNumber` (jamais `%lld` — le
// formateur pose le glyphe arabe, deux témoins `ar_SA` en dépendent).
// ## Pourquoi `nonisolated`
//
// `ComposerObjectChips` est `nonisolated` À DESSEIN : c'est ce qui rend ses
// règles éprouvables depuis une `XCTestCase` non isolée, et vingt-sept témoins
// en dépendent. Sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, tout ce qui
// touche un `Bundle` tombe isolé `@MainActor` par DÉFAUT — jamais par besoin :
// `String(localized:bundle:)` n'a aucune contrainte de fil. Sans l'annotation,
// la règle pure ne pourrait plus lire ses propres mots, et la seule sortie
// restante serait d'isoler `ComposerObjectChips` — c'est-à-dire de payer la
// localisation par la perte de la vérifiabilité.
//
// `LocalizedNumber`, déjà appelé depuis ces mêmes fonctions, est `nonisolated`
// pour la même raison. Les deux moitiés d'une règle doivent l'être ensemble,
// sinon le prochain ajout retombe dans le piège sans que rien ne l'annonce.
nonisolated enum ComposerObjectChipsCopy {

    // MARK: Les phrases

    static func style(_ name: String) -> String {
        String(format: String(localized: "composer.chip.style",
                              defaultValue: "STYLE · %@", bundle: .main), name)
    }

    static func size(_ value: String) -> String {
        String(format: String(localized: "composer.chip.size",
                              defaultValue: "TAILLE %@", bundle: .main), value)
    }

    static func align(_ name: String) -> String {
        String(format: String(localized: "composer.chip.align",
                              defaultValue: "ALIGN · %@", bundle: .main), name)
    }

    static func sound(_ value: String) -> String {
        String(format: String(localized: "composer.chip.sound",
                              defaultValue: "SON %@", bundle: .main), value)
    }

    static func rotation(_ value: String) -> String {
        String(format: String(localized: "composer.chip.rotation",
                              defaultValue: "ROTATION %@°", bundle: .main), value)
    }

    /// Le badge de l'objet sélectionné — « TEXTE · PLAN FG · z 2 ».
    ///
    /// Les trois parties arrivent DÉJÀ localisées : c'est ce qui permet à une
    /// langue de les réordonner sans que le site d'appel le sache.
    static func badge(kind: String, plane: String, zIndex: String) -> String {
        String(format: String(localized: "composer.chip.badge",
                              defaultValue: "%1$@ · %2$@ · z %3$@", bundle: .main),
               kind, plane, zIndex)
    }

    // MARK: Les vocabulaires

    /// Un style que la carte ne connaît pas garde sa forme BRUTE, capitalisée :
    /// c'est une donnée du document, pas un mot de l'interface, et lui inventer
    /// une clé ferait entrer au catalogue une chaîne que personne n'a écrite.
    static func styleName(_ raw: String) -> String {
        switch raw.lowercased() {
        case "neon": return String(localized: "composer.chip.style.neon", defaultValue: "NÉON", bundle: .main)
        case "bold": return String(localized: "composer.chip.style.bold", defaultValue: "GRAS", bundle: .main)
        case "typewriter": return String(localized: "composer.chip.style.typewriter", defaultValue: "MACHINE", bundle: .main)
        case "handwriting": return String(localized: "composer.chip.style.handwriting", defaultValue: "MANUSCRIT", bundle: .main)
        case "classic": return String(localized: "composer.chip.style.classic", defaultValue: "CLASSIQUE", bundle: .main)
        default: return raw.uppercased()
        }
    }

    static func alignName(_ raw: String) -> String {
        switch raw.lowercased() {
        case "left": return String(localized: "composer.chip.align.left", defaultValue: "GAUCHE", bundle: .main)
        case "center": return String(localized: "composer.chip.align.center", defaultValue: "CENTRÉ", bundle: .main)
        case "right": return String(localized: "composer.chip.align.right", defaultValue: "DROITE", bundle: .main)
        default: return raw.uppercased()
        }
    }

    static var kindText: String { String(localized: "composer.chip.kind.text", defaultValue: "TEXTE", bundle: .main) }
    static var kindMedia: String { String(localized: "composer.chip.kind.media", defaultValue: "MÉDIA", bundle: .main) }
    static var kindSticker: String { String(localized: "composer.chip.kind.sticker", defaultValue: "STICKER", bundle: .main) }
    /// **Les deux mots qui manquaient au catalogue** (#4559, servis le
    /// 2026-09-02). Leur absence était la RAISON écrite pour laquelle un son et
    /// un lieu sélectionnés n'avaient aucun badge — le canvas ne disait pas ce
    /// que l'auteur venait de toucher. Ils sont posés en sept langues, comme
    /// leurs trois voisins, et le cliquet de complétude les couvre désormais.
    static var kindAudio: String { String(localized: "composer.chip.kind.audio", defaultValue: "SON", bundle: .main) }
    static var kindLocation: String { String(localized: "composer.chip.kind.location", defaultValue: "LIEU", bundle: .main) }

    static var planeForeground: String { String(localized: "composer.chip.plan.foreground", defaultValue: "PLAN FG", bundle: .main) }
    static var planeBackground: String { String(localized: "composer.chip.plan.background", defaultValue: "PLAN BG", bundle: .main) }
}
