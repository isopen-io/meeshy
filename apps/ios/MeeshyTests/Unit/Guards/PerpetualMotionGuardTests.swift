import XCTest

/// **Une boucle sans fin se déclare consciente de Reduce Motion.**
///
/// 257i (#4286) a mesuré 68 `repeatForever` réels dans l'app : 61 gardés, **7
/// pas du tout** — et les sept étaient précisément les animations de STATUT
/// (frappe, enregistrement, sauvegarde, appel en cours). Elles avaient l'air
/// d'être de l'information plutôt que de la décoration, et on ne coupe pas une
/// information : c'est ce qui les a fait passer entre les mailles.
///
/// ### Deux règles, parce qu'une seule ne pouvait pas suffire
///
/// La règle générale raisonne par FICHIER : « ce fichier boucle, ce fichier
/// parle-t-il de mouvement ? ». Il le faut : `ConversationAnimatedBackground`
/// garde ses treize boucles par un SEUL `guard` en amont, et ses treize
/// `.animation(…, value: animate)` ne mentionnent rien localement. Une règle
/// par déclaration les condamnerait toutes les treize à tort.
///
/// Le prix de ce choix a été mesuré, pas supposé : rejouée sur `origin/main`,
/// la règle par fichier attrape **5 des 7** défauts. Les deux qu'elle manque
/// sont ceux où le fichier décide du mouvement AILLEURS —
/// `MessageListViewController` appelle `MeeshyMotion.shouldReduce` 2 500 lignes
/// au-dessus de ses points de frappe, `MeeshyApp` injecte
/// `meeshyForceReduceMotion` à la racine. Le fichier « parle de mouvement » ;
/// le site, non.
///
/// > **Un proxy par fichier rend « gardé » dès qu'une AUTRE partie du fichier
/// > décide.** Ce n'est pas une faiblesse théorique : elle s'est produite dans
/// > l'itération même qui écrit cette garde.
///
/// D'où la seconde règle, qui ÉPINGLE nommément les deux déclarations que la
/// première ne peut pas voir — par corps à accolades équilibrées
/// (`DeclarationBodyScanner`), jamais par fenêtre devinée.
final class PerpetualMotionGuardTests: XCTestCase {

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy")
    }

    /// Les façons dont un site peut prendre la décision : le lecteur unique de
    /// l'app, le modificateur du SDK, le prédicat pur, l'une des deux clés
    /// d'environnement, ou le plan d'effets de message (qui retire lui-même
    /// `pulse` et `sparkle` sous Reduce Motion).
    private static let motionVocabulary = [
        "ReduceMotion",
        "reduceMotion",
        "meeshyAnimation",
        "MeeshyMotion",
        "accessibilityReduceMotion",
        "playbackPlan"
    ]

    // MARK: - Règle 1 — le cliquet par fichier

    func test_aucuneBouclePerpetuelleDansUnFichierQuiIgnoreReduceMotion() throws {
        let offenders = try filesLooping().filter { !$0.speaksOfMotion }
        XCTAssertTrue(
            offenders.isEmpty,
            "`repeatForever` dans un fichier qui ne mentionne jamais Reduce Motion. Une boucle "
            + "sans fin doit décider : la couper, ou se poser sur une valeur qui DIT encore ce "
            + "que le mouvement disait (cf. `RestingWaveform`, #4286) :\n"
            + offenders.map { "  \($0.name) — \($0.loops) boucle(s)" }.sorted().joined(separator: "\n")
        )
    }

    // MARK: - Règle 2 — les deux sites que la règle 1 ne peut pas voir

    /// L'écran de démarrage : ses trois orbes pulsaient de 0.8 à 1.3 sans fin,
    /// et c'est le PREMIER écran de l'app. Le fichier passait pour gardé parce
    /// qu'il injecte `meeshyForceReduceMotion` à la racine — une ligne qui
    /// n'apprend rien à `SplashScreen`.
    func test_lEcranDeDemarrageDecideDuMouvement() throws {
        try assertDeclarationDecidesAboutMotion(
            marker: "struct SplashScreen",
            file: "MeeshyApp.swift",
            because: "les orbes de l'écran de démarrage bouclent sans fin"
        )
    }

    /// Les trois points « écrit… ». En tenue plate ils n'ont AUCUN libellé
    /// visible : ce qui dit « quelqu'un écrit » est leur présence, pas leur
    /// mouvement — d'où un repos à pleine taille et pleine opacité.
    func test_lIndicateurDeFrappeDecideDuMouvement() throws {
        try assertDeclarationDecidesAboutMotion(
            marker: "struct TypingIndicatorBubble",
            file: "MessageListViewController.swift",
            because: "les points de frappe bouclent sans fin, et le fichier décide du "
                   + "mouvement 2 500 lignes plus haut, pour un tout autre sujet"
        )
    }

    // MARK: - Règle 3 — un seul calcul de valeur de repos

    /// Le dépôt a DEUX formes d'onde d'enregistrement (composeur et média) ; un
    /// troisième exemplaire copierait le calcul plutôt que de l'appeler.
    func test_laHauteurDeReposAUnSiteUnique() throws {
        let producers = try swiftFiles()
            .filter { try String(contentsOf: $0, encoding: .utf8).contains("enum RestingWaveform") }
            .map { $0.lastPathComponent }
        XCTAssertEqual(producers, ["ReduceMotion.swift"],
                       "`RestingWaveform` doit rester déclaré une seule fois")
    }

    // MARK: - Bornes

    /// Si le balayage cesse de voir les boucles, la règle 1 passe au vert en ne
    /// regardant plus rien — le mode de panne exact que 256i a payé, et que
    /// cette itération a reproduit (un balayage lancé depuis un répertoire
    /// courant hérité a rendu « 0 occurrence » en ne regardant nulle part).
    func test_leBalayageVoitBienDesBoucles() throws {
        let looping = try filesLooping()
        XCTAssertGreaterThan(
            looping.count, 10,
            "le balayage ne trouve presque plus de `repeatForever` : c'est le SCANNER qui a "
            + "cessé de voir, pas le dépôt qui a cessé de boucler (racine : \(appRoot.path))"
        )
        XCTAssertTrue(
            looping.contains { $0.name == "OnboardingAnimations.swift" },
            "le fichier le plus densément bouclé du dépôt doit être vu"
        )
    }

    /// Le scanner reconnaît un site fautif et ne prend pas un site gardé pour
    /// la faute (leçon 248i).
    func test_leScannerReconnaitCeQuIlInterdit() {
        let fautif = "withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) { spin = true }"
        let garde = """
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) { spin = true }
            """
        XCTAssertTrue(fautif.contains("repeatForever"))
        XCTAssertFalse(Self.motionVocabulary.contains { fautif.contains($0) },
                       "le site fautif ne doit contenir aucun mot du vocabulaire du mouvement")
        XCTAssertTrue(Self.motionVocabulary.contains { garde.contains($0) },
                      "le site gardé doit être reconnu comme tel")
    }

    /// Le masqueur retire bien un `repeatForever` de commentaire — trois
    /// fichiers du dépôt n'ont que ça, et les compter ferait rougir la règle 1
    /// sur des fichiers qui expliquent pourquoi ils ne bouclent PAS.
    func test_leMasqueurNeCompteBienQueLeCode() {
        let source = """
            // Le rail ne pose pas de repeatForever : sa borne est ailleurs.
            let x = 1
            """
        XCTAssertFalse(DeclarationBodyScanner.mask(source).contains("repeatForever"),
                       "un `repeatForever` de commentaire ne doit pas être compté")
    }

    // MARK: - Balayage

    private struct LoopingFile {
        let name: String
        let loops: Int
        let speaksOfMotion: Bool
    }

    private func assertDeclarationDecidesAboutMotion(
        marker: String,
        file: String,
        because reason: String,
        line: UInt = #line
    ) throws {
        let url = try XCTUnwrap(
            try swiftFiles().first { $0.lastPathComponent == file },
            "fichier \(file) introuvable", line: line
        )
        let source = try String(contentsOf: url, encoding: .utf8)
        let body = try XCTUnwrap(
            DeclarationBodyScanner.body(containing: marker, in: source),
            "déclaration `\(marker)` introuvable dans \(file)", line: line
        )
        let code = DeclarationBodyScanner.mask(body)
        XCTAssertTrue(
            Self.motionVocabulary.contains { code.contains($0) },
            "`\(marker)` ne décide pas de Reduce Motion — \(reason). La règle par fichier ne "
            + "peut PAS l'attraper : \(file) parle de mouvement ailleurs.",
            line: line
        )
    }

    private func swiftFiles() throws -> [URL] {
        guard let walker = FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil)
        else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    private func filesLooping() throws -> [LoopingFile] {
        try swiftFiles().compactMap { file in
            // `DeclarationBodyScanner.mask` est le SEUL masqueur
            // commentaires+chaînes correct du dépôt (il gère l'échappement et
            // ne prend pas le `//` de `"https://…"` pour un commentaire).
            let code = DeclarationBodyScanner.mask(try String(contentsOf: file, encoding: .utf8))
            let loops = code.components(separatedBy: "repeatForever").count - 1
            guard loops > 0 else { return nil }
            return LoopingFile(
                name: file.lastPathComponent,
                loops: loops,
                speaksOfMotion: Self.motionVocabulary.contains { code.contains($0) }
            )
        }
    }
}
