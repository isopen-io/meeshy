import XCTest
@testable import Meeshy

/// Garde de source COMPLÈTE de `Lentille/Row/*.swift` (contrat LWS-7,
/// workshop I-068 — nom cité par le contrat §LWS-7). `LentilleFlatRowTests`
/// (I-065) embarquait déjà un témoin minimal (`unreadBadgeBackground`,
/// liste de fichiers recopiée à la main) ; cette suite le COMPLÈTE avec les
/// autres interdits du contrat et bascule sur une découverte DYNAMIQUE du
/// dossier (leçon 257 — « chercher les types/fichiers DÉCLARÉS, jamais
/// recopiés dans une liste »), à la manière de `LentilleChromeSourceGuardTests`
/// (I-064) : un fichier ajouté demain à `Lentille/Row/` entre automatiquement
/// dans le périmètre de la garde, et la suite échoue explicitement si elle
/// n'en découvre aucun.
///
/// **Alignement `scripts/check-law-literals.sh`.** `Lentille/Row/` est déjà
/// sous les `SKIN_DIRS` du script (tout `.swift` sous `Lentille/**`, hors
/// `Lentille/Core/**` — non pertinent ici puisque `Row/` n'a pas de
/// sous-dossier `Core/`) : le script grep la source BRUTE, sans retrait de
/// commentaires. Les témoins de littéraux R15 ci-dessous font de même (pas
/// d'`AppSourceGuard.stripComments`), pour rester alignés avec le mécanisme
/// que la CI applique réellement.
final class LentilleRowSourceGuardTests: XCTestCase {

    // MARK: - Localisation des sources

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    private static var rowDirectory: URL {
        iosRoot.appendingPathComponent("Meeshy/Features/Main/Lentille/Row")
    }

    /// Tout `.swift` de `Lentille/Row/`, découvert au moment du test —
    /// jamais une liste de noms recopiée à la main (leçon 257).
    private func rowSources() throws -> [(name: String, code: String)] {
        let entries = try FileManager.default.contentsOfDirectory(
            at: Self.rowDirectory,
            includingPropertiesForKeys: nil
        )
        let swiftFiles = entries
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        return try swiftFiles.map { url in
            (url.lastPathComponent, try String(contentsOf: url, encoding: .utf8))
        }
    }

    private func normalizedCode(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    /// Même patron que `LentilleChromeSourceGuardTests.comparisonOccurrences`
    /// — littéraux « mous » interdits SEULEMENT en comparaison numérique
    /// (`grep -nE "\s*(>|>=|<|<=)\s*$literal\b"`, `check-law-literals.sh`).
    private func comparisonOccurrences(of literal: String, in code: String) -> Int {
        let pattern = "[<>]=?\\s*\(NSRegularExpression.escapedPattern(for: literal))\\b"
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            XCTFail("Regex de garde invalide pour le littéral « \(literal) » — corriger le motif dans LentilleRowSourceGuardTests avant de faire confiance à ce témoin.")
            return 0
        }
        let range = NSRange(code.startIndex..., in: code)
        return regex.numberOfMatches(in: code, range: range)
    }

    // MARK: - Garde d'ensemble (leçon 257)

    func test_guardDiscoversAtLeastOneRowFile_neverSilentlyEmpty() throws {
        let sources = try rowSources()
        XCTAssertFalse(
            sources.isEmpty,
            "LentilleRowSourceGuardTests n'a chargé AUCUN fichier depuis " +
            "`\(Self.rowDirectory.path)` — vérifier que ce chemin existe encore depuis le " +
            "bundle de test (`apps/ios/Meeshy/Features/Main/Lentille/Row/`). Une garde qui " +
            "charge zéro fichier passe TOUJOURS au vert sans avoir rien vérifié (leçon 257) : " +
            "c'est le défaut le plus coûteux de cette suite, bien pire qu'un simple trou de " +
            "couverture."
        )
    }

    // MARK: - Le chiffre de non-lu — SUPERSÉDÉ le 2026-08-22 (décision produit)

    /// **Le contrat §LWS-7 (« aucun badge chiffré nulle part ») est
    /// superssédé**, et ce témoin atteste l'état NOUVEAU plutôt que de
    /// disparaître en silence. Décision produit : « mettre le chip rouge si
    /// messages non lus » sur les rangées non magnifiées.
    ///
    /// Ce que la règle d'origine protégeait — « le chiffre vit dans le pont ✦ »
    /// — reposait sur une prémisse fausse en pratique : le pont n'apparaît que
    /// si la conversation en a un (`showsBridge` exige `bridge != nil`), si
    /// bien qu'une conversation non lue SANS pont ne disait rien du tout. Le
    /// chip, lui, parle toujours.
    ///
    /// Ce que ce témoin garde encore : **la rangée de SQUELETTE et la ligne de
    /// pont n'ont pas de badge** (un placeholder ne compte rien, et le pont
    /// porte déjà son point accent), et le badge est PEINT AU ROUGE
    /// SÉMANTIQUE, jamais à l'accent de la conversation — c'est ce qui le
    /// distingue d'une décoration.
    /// Le corps d'une déclaration, de son en-tête à la prochaine de même
    /// niveau. Une garde de forme vise le BLOC, jamais le FICHIER.
    private func blockOfDeclaration(_ header: String, in code: String) -> Substring? {
        guard let start = code.range(of: header) else { return nil }
        let rest = code[start.upperBound...]
        let end = rest.range(of: "\n    private var ")?.lowerBound
            ?? rest.range(of: "\n    private func ")?.lowerBound
            ?? rest.endIndex
        return code[start.lowerBound..<end]
    }

    func test_unreadBadge_livesOnlyInTheRow_andIsAlwaysSemanticRed() throws {
        for source in try rowSources() {
            let atom = occurrences(of: "UnreadCountBadge(", in: normalizedCode(source.code))
            let localChrome = occurrences(of: "unreadBadgeBackground", in: normalizedCode(source.code))
            if source.name == "LentilleConversationRow.swift" {
                XCTAssertEqual(
                    atom, 1,
                    "La rangée doit porter UN badge de non-lus, monté depuis l'ATOME PARTAGÉ " +
                    "`UnreadCountBadge` — la matrice L06 l'exige nommément (« via l'atome " +
                    "partagé UnreadCountBadge », amendement 2026-08-22). Observé : \(atom)."
                )
                // Le chrome ne se recopie PAS ici. C'est l'invariant que
                // l'accident de fusion avait effacé : l'atome existait, testé,
                // sans un seul consommateur, pendant que la rangée repeignait à
                // la main une capsule qui divergeait déjà de lui.
                XCTAssertEqual(
                    localChrome, 0,
                    "La rangée ne peint plus le chrome elle-même (\(localChrome) occurrence(s) de " +
                    "`unreadBadgeBackground`) : il vit dans l'atome, et une copie locale " +
                    "recommencerait à diverger sans que rien ne le dise."
                )
            } else {
                XCTAssertEqual(
                    localChrome, 0,
                    "\(source.name) n'a rien à compter : un squelette est un placeholder, et le " +
                    "pont ✦ ne porte plus de point — le badge chiffré l'a superseded (L06 amendé)."
                )
                XCTAssertEqual(
                    atom, 0,
                    "\(source.name) ne monte aucun badge : un seul site compte les non-lus."
                )
            }
        }
    }

    // MARK: - Dynamic Type — tout passe par MeeshyFont.relative

    func test_noRawSystemFontSize_inAnyRowFile() throws {
        for source in try rowSources() {
            let count = occurrences(of: ".font(.system(size:", in: normalizedCode(source.code))
            XCTAssertEqual(
                count, 0,
                "\(source.name) contient \(count) occurrence(s) de « .font(.system(size: » — " +
                "toute police du rang doit passer par MeeshyFont.relative (donc suivre Dynamic " +
                "Type), jamais une taille de police fixe (contrat §LWS-7)."
            )
        }
    }

    // MARK: - Aucun `.onTapGesture` — avalé par le long press du conteneur

    /// Régression déjà documentée côté bulle (#3010 WS-4) : un
    /// `.onTapGesture` posé sur un contrôle interne au rang se fait AVALER
    /// par le long-press du conteneur (`RowPressBounceModifier` /
    /// `.contextMenu`, `ConversationListView+Rows.swift`) — tout contrôle
    /// interne doit être un `Button(.plain)` + `.contentShape(Rectangle())`.
    func test_noOnTapGesture_inAnyRowFile() throws {
        for source in try rowSources() {
            let count = occurrences(of: ".onTapGesture", in: normalizedCode(source.code))
            XCTAssertEqual(
                count, 0,
                "\(source.name) contient \(count) occurrence(s) de « .onTapGesture » — un " +
                "contrôle interne au rang doit être Button(.plain) + .contentShape(Rectangle()), " +
                "jamais .onTapGesture (avalé par le long-press du conteneur, régression " +
                "documentée #3010 WS-4, contrat §LWS-7)."
            )
        }
    }

    // MARK: - Aucun `@State` de langue — la résolution vient du SDK gelé, jamais d'un cache local

    /// Le rang ne porte AUCUN `@State` de langue (contrat §LWS-7, contrainte
    /// dure) : la résolution vient de `resolvedLastMessagePreview(preferredLanguages:)`
    /// / `LentilleBridgeLine.resolveAgentText`, jamais d'un cache local. Un
    /// `@State` NON lié à la langue (ex. `LentilleTypingDots.isAnimating`,
    /// animation pure) reste légitime — la garde n'interdit donc pas
    /// `@State` en bloc, elle interdit un `@State` dont la déclaration porte
    /// un mot-clé de langue/traduction.
    func test_noLanguageState_inAnyRowFile() throws {
        let forbiddenKeywords = ["lang", "translat", "resolvedPreview", "resolvedText", "cachedTranslation"]
        let pattern = "@State[^\\n]*"
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            XCTFail("Regex de garde invalide pour la détection des déclarations @State.")
            return
        }
        for source in try rowSources() {
            let stripped = AppSourceGuard.stripComments(source.code)
            let range = NSRange(stripped.startIndex..., in: stripped)
            let matches = regex.matches(in: stripped, range: range)
            for match in matches {
                guard let matchRange = Range(match.range, in: stripped) else { continue }
                let declaration = String(stripped[matchRange])
                let lowered = declaration.lowercased()
                for keyword in forbiddenKeywords {
                    XCTAssertFalse(
                        lowered.contains(keyword.lowercased()),
                        "\(source.name) porte un @State suspect de cacher une résolution de " +
                        "langue : « \(declaration.trimmingCharacters(in: .whitespaces)) » — la " +
                        "résolution doit TOUJOURS venir de resolvedLastMessagePreview(preferredLanguages:) " +
                        "ou LentilleBridgeLine.resolveAgentText, jamais d'un cache local (contrat §LWS-7)."
                    )
                }
            }
        }
    }

    // MARK: - Aucune carte — pas de backgroundSecondary hors focus card (LWS-8)

    /// « AUCUNE carte » (contrat §LWS-7) : ni `backgroundSecondary`, ni
    /// gradient de chaleur, ni bordure — la focus card de LWS-8
    /// (`Lentille/Perspective/`, hors périmètre de ce dossier) est la SEULE
    /// carte de l'écran. `Lentille/Row/` ne doit donc JAMAIS référencer
    /// `backgroundSecondary`.
    func test_noBackgroundSecondary_inAnyRowFile_focusCardIsTheOnlyCard() throws {
        for source in try rowSources() {
            let count = occurrences(of: "backgroundSecondary", in: normalizedCode(source.code))
            XCTAssertEqual(
                count, 0,
                "\(source.name) contient \(count) occurrence(s) de « backgroundSecondary » — " +
                "AUCUNE carte dans Lentille/Row/ (contrat §LWS-7) : la focus card de LWS-8 est " +
                "la SEULE carte de l'écran."
            )
        }
    }

    // MARK: - Littéraux de loi (R15), bruts — alignés sur check-law-literals.sh

    func test_hardLawLiterals_areAbsent_fromRowFiles() throws {
        let hardLiterals = ["900", "520", "380", "0.45", "0.82"]
        for source in try rowSources() {
            for literal in hardLiterals {
                let count = occurrences(of: literal, in: source.code)
                XCTAssertEqual(
                    count, 0,
                    "\(source.name) contient « \(literal) » (\(count) fois, commentaires " +
                    "compris) — constante de loi gelée : elle doit être LUE depuis son miroir " +
                    "Swift (`LentilleMetrics`, `packages/shared/design/lentille-tokens.json`), " +
                    "jamais recopiée dans une peau (garde R15, contrat R15)."
                )
            }
        }
    }

    /// `25` et `24` ne sont interdits qu'en COMPARAISON numérique (même
    /// nuance que `check-law-literals.sh` et `LentilleChromeSourceGuardTests`)
    /// — un zéro aveugle sur le chiffre lui-même ferait rougir du code sans
    /// rapport avec la loi (un index, une taille de police).
    func test_softLawLiterals_areNeverUsedAsNumericComparisons_inRowFiles() throws {
        let softLiterals = ["25", "24"]
        for source in try rowSources() {
            for literal in softLiterals {
                let count = comparisonOccurrences(of: literal, in: source.code)
                XCTAssertEqual(
                    count, 0,
                    "\(source.name) compare une valeur à « \(literal) » (\(count) fois) — " +
                    "seuils de loi (orchestrateur LWS-8) : à lire depuis leur miroir Swift, " +
                    "jamais à comparer en dur dans une peau (garde R15)."
                )
            }
        }
    }

    // MARK: - Témoins manquants après I-065 (leçon de la mission : re-auditer
    // avant d'ajouter) — sourdine 🔕 et point du pont, aucun des deux
    // structurellement vérifié par LentilleFlatRowTests/LentilleSkeletonRowTests.

    // behaviour-matrix:L07 — volet sourdine (🔕). Voir aussi
    // SectionDropTargetTests (volet épingle) et
    // LentilleRowBehaviourAnchorTests (volet glyphe 📌, TROU RÉEL).
    /// `behaviour-matrix.json` L07 : « la sourdine passe enfin visible (rang
    /// à 0.55 + 🔕) ». L'opacité 0.55 est déjà verrouillée par
    /// `LentilleFlatRowTests.test_rowOpacity_muted_usesMetricNotLiteral`
    /// (`LentilleConversationRow.rowOpacity`, dérivée de
    /// `LentilleMetrics.Muted.opacity`) — mais AUCUN témoin n'existait pour
    /// le second volet de L07, l'émoji 🔕 après le nom. Aucun framework
    /// d'inspection SwiftUI n'étant disponible ici (même contrainte que
    /// `LentilleSkeletonRowTests`), la garde porte sur la STRUCTURE : le 🔕
    /// est gated par `conversation.userState.isMuted`, la même donnée que
    /// `rowOpacity` lit déjà.
    func test_mutedGlyph_gatedByUserStateIsMuted_inLentilleConversationRow() throws {
        guard let source = try rowSources().first(where: { $0.name == "LentilleConversationRow.swift" }) else {
            XCTFail("LentilleConversationRow.swift introuvable parmi les fichiers découverts de Lentille/Row/")
            return
        }
        let code = normalizedCode(source.code)
        XCTAssertTrue(
            code.contains(#"if conversation.userState.isMuted { Text("🔕")"#),
            "LentilleConversationRow.swift doit afficher 🔕 immédiatement gated par " +
            "`conversation.userState.isMuted` (behaviour-matrix.json L07 : « la sourdine " +
            "passe enfin visible — rang à 0.55 + 🔕 », affordance manquante relevée à l'audit)."
        )
    }

    /// **Cette garde a été RETOURNÉE le 2026-08-23, pas supprimée.**
    ///
    /// Elle exigeait l'inverse : que `LentilleBridgeLine` dimensionne son point
    /// de non-lus avec `LentilleMetrics.UnreadDot.size` plutôt qu'un `8`
    /// recopié — vrai tant que le contrat §LWS-7 disait « ligne 2 = pont ✦ +
    /// point accent 8 ». L'amendement L06 du lot 2 (2026-08-22) a supprimé ce
    /// point, comme DOUBLON STRICT de la pastille chiffrée : les deux disaient
    /// la même donnée, `unreadCount > 0`. La garde réclamait donc le retour de
    /// ce que le produit venait de retirer, et elle vivait rouge sur `main`.
    ///
    /// Le corps ci-dessous n'est pas une réécriture de circonstance : c'est la
    /// garde que l'auteur du lot 2 avait DÉJÀ écrite (`35f28209d`), et qu'une
    /// fusion a laissée sur le carreau — elle est ici restaurée telle quelle.
    /// Elle est strictement plus forte que celle qu'elle remplace : elle balaie
    /// TOUS les fichiers de `Lentille/Row/` au lieu du seul pont.
    ///
    /// Le token `LentilleMetrics.UnreadDot` SURVIT et ne doit pas être retiré :
    /// la peau web le consomme encore (`--lentille-list-unread-dot-size`).
    /// Ce qui est interdit, c'est qu'une peau iOS le lise.
    /// **Le glyphe outbox ⟳ est retiré du rang** (décision produit lot 2,
    /// CONFIRMÉE par le porteur produit le 2026-08-23 : « NON »). Le renvoi
    /// automatique par l'outbox est conservé — seule l'affordance visuelle de
    /// la liste disparaît. Voir `LentilleRowBehaviourAnchorTests.test_L09_…`
    /// pour l'amendement de la matrice comportementale.
    ///
    /// Cette garde avait été écrite par l'auteur du lot 2 (`35f28209d`) puis
    /// PERDUE dans la fusion `c5f11826f` — l'une des sept que ce fichier a
    /// laissées sur le carreau, de 17 témoins à 10. Elle est restaurée telle
    /// quelle : une garde qui disparaît ne rougit jamais, et c'est ce silence
    /// qui a laissé le glyphe revenir sans que rien ne le signale.
    func test_pendingSyncGlyph_isRemovedFromTheFlatRow() throws {
        guard let source = try rowSources().first(where: { $0.name == "LentilleConversationRow.swift" }) else {
            XCTFail("LentilleConversationRow.swift introuvable parmi les fichiers découverts de Lentille/Row/")
            return
        }
        let code = normalizedCode(source.code)
        XCTAssertFalse(
            code.contains("arrow.triangle.2.circlepath"),
            "LentilleConversationRow.swift rend encore le glyphe de synchronisation — le lot 2 " +
            "le retire de la liste (l'outbox continue de renvoyer, sans affordance de rang)."
        )
        XCTAssertFalse(
            code.contains("hasPendingSync"),
            "LentilleConversationRow.swift lit encore userState.hasPendingSync — plus rien ne " +
            "doit en dépendre côté rendu du rang plat."
        )
    }

    func test_unreadDotToken_isGoneFromEveryRowFile_supersededByTheCountedBadge() throws {
        for source in try rowSources() {
            XCTAssertEqual(
                occurrences(of: "UnreadDot", in: normalizedCode(source.code)), 0,
                "\(source.name) consomme encore LentilleMetrics.UnreadDot — le point accent de " +
                "8 px est supprimé par le lot 2 (doublon strict de la pastille chiffrée, " +
                "même donnée unreadCount > 0). Le token survit pour la seule peau WEB : " +
                "aucune peau iOS ne doit le lire."
            )
        }
    }

    // MARK: - Directives produit du 2026-08-23 (gardes restaurées)

    // Les cinq gardes ci-dessous existaient dans 35f28209d et ont disparu du
    // fichier lors d'une fusion résolue côté périmé — sans conflit, donc sans
    // signal. Leurs invariants ont été revérifiés un par un sur le code du
    // 2026-08-24 avant restauration : tous tiennent, aucune ne rougit à la
    // greffe. Elles protègent trois directives produit qui, sans elles,
    // pouvaient être défaites sans que rien ne l'annonce.

    /// **Directive produit 2026-08-23 : « les derniers messages de
    /// conversation ne doivent pas être dans des bulles ! ».**
    ///
    /// INVERSION de `test_previewBubble_wrapsTheLine2Mux_soNoBranchCanEscapeIt`
    /// (lot 2, 2026-08-22) : la bulle d'aperçu est RETIRÉE, la ligne 2 revient
    /// nue sous la ligne de titre, et l'heure prend une bande à elle
    /// (`dateLine`). La garde n'est pas supprimée — elle est retournée : elle
    /// rougirait si la bulle revenait, sous ce nom ou sous un autre.
    ///
    /// La détection de contour est bornée au BLOC du contenu (`body`), jamais
    /// au FICHIER : `strokeBorder`/`Capsule(` y sont légitimes ailleurs
    /// (anneau d'avatar, bouton « Rejoindre »).
    func test_theLine2_isNaked_noBubbleWrapsThePreviewAnyMore() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertFalse(
            code.contains("LentillePreviewBubble"),
            "La bulle d'aperçu est retirée (directive produit 2026-08-23) : ni construction, " +
            "ni déclaration ne doivent subsister dans LentilleConversationRow.swift."
        )
        XCTAssertTrue(
            code.contains("headerLine line2 dateLine"),
            "Le contenu de la rangée empile TROIS bandes nues, dans cet ordre : ligne de titre, " +
            "ligne 2 SANS enveloppe, ligne de date seule."
        )

        guard let bodyStart = code.range(of: "var body: some View {"),
              let bodyEnd = code.range(of: ".contentShape(Rectangle())", range: bodyStart.upperBound..<code.endIndex)
        else {
            XCTFail("les bornes du corps de la rangée sont introuvables — la garde doit être re-pointée")
            return
        }
        let body = String(code[bodyStart.lowerBound..<bodyEnd.lowerBound])
        for chrome in ["RoundedRectangle(cornerRadius: LentilleMetrics.PreviewBubble", ".background(shape", "strokeBorder(stroke"] {
            XCTAssertFalse(
                body.contains(chrome),
                "Le contenu de la rangée ne peint plus aucune surface autour de l'aperçu (\(chrome))."
            )
        }
    }

    /// Les huit chemins, nommés un par un — pour que l'échec DÉSIGNE la
    /// branche perdue plutôt qu'un « la structure a changé » global. Chacun
    /// doit vivre à l'intérieur du mux (`line2`) ou d'une fonction que le
    /// mux appelle (`previewLine`/`standardPreview`) : c'est ce point de
    /// passage unique qui garantit qu'aucune branche rare ne diverge.
    func test_allEightPreviewBranches_liveInsideTheLine2Mux() throws {
        let code = normalizedCode(try rowSource())
        guard let muxStart = code.range(of: "private var line2: some View {") else {
            XCTFail("le mux `line2` est introuvable — la garde doit être re-pointée")
            return
        }
        guard let senderStart = code.range(of: "private var senderLabel: some View {", range: muxStart.upperBound..<code.endIndex) else {
            XCTFail("borne de fin (senderLabel) introuvable — la garde doit être re-pointée")
            return
        }
        let muxThroughPreview = String(code[muxStart.lowerBound..<senderStart.lowerBound])

        let branches = [
            ("typing", "case .typing:"),
            ("brouillon", "case .draft:"),
            ("pont ✦", "case .bridge:"),
            ("aperçu (racine)", "case .preview:"),
            ("expiré", "case .expired:"),
            ("masqué", "case .hidden:"),
            ("vue unique", "case .viewOnce:"),
            ("éphémère actif", "case .ephemeralActive:"),
            ("standard", "case .standard:"),
        ]
        for (label, needle) in branches {
            XCTAssertTrue(
                muxThroughPreview.contains(needle),
                "La branche « \(label) » (\(needle)) n'est plus dans la région couverte par le " +
                "mux `line2` — elle divergerait alors du rendu commun sans qu'aucun autre " +
                "témoin ne rougisse."
            )
        }
    }

    /// **Directive produit 2026-08-23 : « la date reste en bas à droite dans
    /// une ligne SEULE, AVEC ou SANS magnificence ».**
    ///
    /// INVERSION de `test_timestamp_leftTheTitleLine_andLivesAtTheBubblesBottomRight` :
    /// l'heure ne partage plus sa ligne — ni avec le nom (avant le lot 2), ni
    /// avec l'aperçu (dans la bulle du lot 2). Elle possède la troisième bande.
    /// C'est aussi la disposition que `main` a livrée (266fcb765) : viser la
    /// même forme rend la fusion possible.
    func test_theDate_ownsItsOwnLine_pushedTrailing_belowThePreview() throws {
        let code = normalizedCode(try rowSource())
        guard let headerStart = code.range(of: "private var headerLine: some View {"),
              let headerEnd = code.range(of: "private var dateLine: some View {", range: headerStart.upperBound..<code.endIndex)
        else {
            XCTFail("les bornes de headerLine sont introuvables — la garde doit être re-pointée")
            return
        }
        let header = String(code[headerStart.lowerBound..<headerEnd.lowerBound])

        XCTAssertFalse(
            header.contains("LentilleRowTimestamp"),
            "headerLine rend encore l'horodatage — l'heure appartient à sa propre bande."
        )
        XCTAssertFalse(
            header.contains(#"Text("·")"#),
            "headerLine garde le point médian qui séparait le nom de l'heure — sans heure à " +
            "séparer, il ne sépare plus rien."
        )

        guard let dateStart = code.range(of: "private var dateLine: some View {") else {
            XCTFail("`dateLine` n'existe pas : la date n'a pas de ligne à elle")
            return
        }
        let tail = String(code[dateStart.lowerBound...])
        guard let spacer = tail.range(of: "Spacer(minLength: 0)"),
              let stamp = tail.range(of: "LentilleRowTimestamp(date: conversation.lastMessageAt)")
        else {
            XCTFail("`dateLine` doit pousser l'horodatage à droite par un Spacer(minLength: 0)")
            return
        }
        XCTAssertTrue(
            spacer.lowerBound < stamp.lowerBound,
            "Le Spacer doit PRÉCÉDER l'horodatage : la date est en bas à DROITE."
        )
        XCTAssertEqual(
            occurrences(of: "LentilleRowTimestamp(", in: code), 1,
            "UN seul rendu d'horodatage dans la rangée : deux sites l'afficheraient en double."
        )
    }

    /// **Directive produit 2026-08-23 : « l'information du nombre de membre
    /// disparaît SANS magnificence ».**
    ///
    /// INVERSION de `test_memberCountLine_isTrailing_absentForDirect_andReusesTheSharedLabel`
    /// (lot 2). Le lot 2 avait posé l'effectif sur la rangée sans amender
    /// behaviour-matrix L08 (« le badge de type + memberCount est absorbé par
    /// la focus card ») : le retrait RESTAURE L08, il ne l'exceptionne pas.
    ///
    /// La garde est RE-DOMICILIÉE et non supprimée. L'ancienne portait une
    /// assertion négative (`XCTAssertFalse(code.contains("memberCountDisplay"))`)
    /// qui, l'effectif parti, passerait VACUEUSEMENT : elle est ici reportée
    /// sur TOUT `Lentille/Row/**`, où elle garde du mordant — un futur retour
    /// de l'effectif sur la rangée, sous quelque forme que ce soit, la ferait
    /// rougir.
    func test_theFlatRow_carriesNoMemberCount_theMagnificenceOwnsItAlone() throws {
        for source in try rowSources() {
            let code = normalizedCode(source.code)
            XCTAssertFalse(
                code.contains("MembersCountLabel"),
                "\(source.name) compose un effectif : sans magnificence, l'information disparaît " +
                "(directive produit 2026-08-23) — la carte de focus en est le seul domicile."
            )
            XCTAssertFalse(
                code.contains("memberCountDisplay"),
                "\(source.name) retombe sur memberCountDisplay (chiffres nus « 199+ ») — ni ce " +
                "libellé ni aucun autre effectif n'a sa place sur la rangée plate."
            )
            XCTAssertFalse(
                code.contains("memberCountLine"),
                "\(source.name) garde la bande d'effectif du lot 2."
            )
        }
    }

    /// **Trou SILENCIEUX ouvert par le lot 2, refermé ici.** Le squelette
    /// n'empilait que DEUX bandes quand la rangée réelle en empilait trois :
    /// les témoins de squelette ne vérifiaient que la hauteur, les paddings et
    /// les deux polices — jamais le NOMBRE de bandes. Le fichier promet
    /// pourtant « aucun saut n'est possible à l'hydratation ».
    ///
    /// La garde compare les deux piles par leur nombre de polices de bande.
    func test_theSkeleton_mirrorsTheThreeBandsOfTheRealRow() throws {
        let row = normalizedCode(try rowSource())
        guard let skeleton = try rowSources().first(where: { $0.name == "LentilleSkeletonRow.swift" }) else {
            XCTFail("LentilleSkeletonRow.swift introuvable")
            return
        }
        let skeletonCode = normalizedCode(skeleton.code)

        for band in ["LentilleMetrics.Name.font", "LentilleMetrics.Line2.font", "LentilleMetrics.Time.font"] {
            XCTAssertTrue(
                row.contains(band),
                "la rangée réelle doit porter la bande \(band)"
            )
            XCTAssertTrue(
                skeletonCode.contains(band),
                "le squelette n'a pas la bande \(band) : il occupera un volume différent de la " +
                "rangée réelle et l'hydratation SAUTERA."
            )
        }
        XCTAssertTrue(
            skeletonCode.contains("Spacer(minLength: 0)"),
            "la bande de date du squelette doit être poussée à droite comme celle de la rangée."
        )
    }

    // MARK: - Aiguille

    private func rowSource() throws -> String {
        guard let source = try rowSources().first(where: { $0.name == "LentilleConversationRow.swift" }) else {
            XCTFail("LentilleConversationRow.swift introuvable parmi les fichiers découverts de Lentille/Row/")
            return ""
        }
        return source.code
    }
}
