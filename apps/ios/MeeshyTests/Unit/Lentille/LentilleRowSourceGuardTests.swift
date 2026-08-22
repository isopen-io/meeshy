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

    // MARK: - Le chrome du badge de non-lus n'est jamais RECOPIÉ dans le rang
    //
    // **Contrat AMENDÉ le 2026-08-22 (lot 2, décision produit).** La règle
    // d'origine (§LWS-7) était « aucun badge chiffré nulle part — le chiffre
    // vit dans le pont ✦ » : ce fichier l'appliquait en interdisant le
    // symbole `unreadBadgeBackground` dans `Lentille/Row/`. La décision
    // produit du lot 2 RÉTABLIT la pastille rouge chiffrée sur le rang plat,
    // identique à celle de la peau historique — la garde ne peut donc plus
    // signifier « aucun badge ».
    //
    // Elle est CONSERVÉE avec un sens NOUVEAU et toujours réel : le rang ne
    // doit pas RECOPIER le chrome du badge (couleur, capsule, ombre,
    // paddings). Il consomme l'atome de présentation partagé
    // (`UnreadCountBadge`, `MeeshyUI/Primitives/`), seul domicile de
    // `MeeshyColors.unreadBadgeBackground(isDark:)` + `NotificationBadge
    // .displayed(_:)` pour les rangs de liste. Un `unreadBadgeBackground`
    // qui réapparaîtrait ici signalerait une SECONDE écriture du même badge
    // — exactement ce que l'extraction de l'atome vient de supprimer.
    //
    // Le témoin POSITIF (le rang consomme bien l'atome) vit plus bas,
    // `test_unreadBadge_isTheSharedAtom_gatedByTheUnreadCount` : sans lui,
    // cette garde-ci resterait verte sur un rang qui n'affiche RIEN.

    func test_noUnreadBadgeBackground_inAnyRowFile_theChromeLivesInTheSharedAtom() throws {
        for source in try rowSources() {
            let count = occurrences(of: "unreadBadgeBackground", in: normalizedCode(source.code))
            XCTAssertEqual(
                count, 0,
                "\(source.name) contient \(count) occurrence(s) de « unreadBadgeBackground » — " +
                "le chrome de la pastille de non-lus vit dans l'atome partagé UnreadCountBadge " +
                "(MeeshyUI/Primitives/UnreadCountBadge.swift), jamais recopié dans une peau " +
                "(lot 2, 2026-08-22)."
            )
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

    // MARK: - Lot 2 (2026-08-22) — bulle d'aperçu, effectif, pastille chiffrée,
    // retrait du glyphe outbox.

    /// **Le point accent de 8 px est RETIRÉ (lot 2).** L'ancien témoin
    /// (`test_bridgeLine_unreadDot_usesMetric_notALiteral`) verrouillait le
    /// CÔTÉ CONSOMMATEUR du token `LentilleMetrics.UnreadDot` : que
    /// `LentilleBridgeLine` dimensionne son point de tête avec ce token
    /// plutôt qu'un `8` recopié. Le lot 2 rétablit la pastille rouge
    /// CHIFFRÉE sur le rang ; le point de 8 px devient alors le DOUBLON
    /// strict de cette pastille (même donnée, `unreadCount > 0`, deux
    /// signaux à 4 pt l'un de l'autre). C'est le RENDU qui est supprimé —
    /// le TOKEN, lui, survit, et c'est délibéré : la peau web le consomme
    /// toujours (`apps/web/components/conversations/lentille/LentilleRow.tsx`
    /// dimensionne son point avec `--lentille-list-unread-dot-size`), donc le
    /// retirer de `lentille-tokens.json` y ferait un point de 0×0 en silence.
    /// `LentilleMetrics.UnreadDot`, `LentilleMetricsTests.test_unreadDot_size`
    /// et la table de la garde de consommation restent en place pour cette
    /// seule raison, chacun portant la note qui l'explique ; à solder quand le
    /// lot 2 web fera le même arbitrage.
    ///
    /// Le témoin est INVERSÉ, pas supprimé : plus aucun fichier de
    /// `Lentille/Row/` ne doit CONSOMMER `UnreadDot`.
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

    /// **La bulle d'aperçu entoure le MUX, jamais une branche.** C'est la
    /// seule forme qui couvre les HUIT chemins de `line2` sans qu'aucun
    /// puisse être oublié : `LentilleConversationRow.line2` est le point de
    /// passage OBLIGÉ de `typing`/`draft`/`bridge` et des cinq
    /// sous-branches d'aperçu (`expired`/`hidden`/`viewOnce`/
    /// `ephemeralActive`/`standard`). Envelopper chaque branche
    /// individuellement aurait été la version fragile — un oubli dans une
    /// branche rare (vue unique, message expiré) reste invisible sans
    /// snapshot.
    func test_previewBubble_wrapsTheLine2Mux_soNoBranchCanEscapeIt() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertTrue(
            code.contains("LentillePreviewBubble("),
            "LentilleConversationRow.swift doit construire la bulle d'aperçu (LentillePreviewBubble) — lot 2."
        )
        XCTAssertEqual(
            occurrences(of: "{ line2 }", in: code), 1,
            "La bulle doit envelopper le MUX `line2` EXACTEMENT une fois : c'est ce qui " +
            "garantit la couverture des huit branches d'aperçu sans en énumérer aucune."
        )
        XCTAssertFalse(
            code.contains("headerLine line2"),
            "La ligne 2 ne doit plus être posée NUE sous la ligne de titre — elle passe " +
            "désormais par LentillePreviewBubble."
        )
    }

    /// Les huit chemins, nommés un par un — pour que l'échec DÉSIGNE la
    /// branche perdue plutôt qu'un « la structure a changé » global. Chacun
    /// doit vivre à l'intérieur du mux (`line2`) ou d'une fonction que le
    /// mux appelle (`previewLine`/`standardPreview`), donc à l'intérieur de
    /// la bulle par construction.
    func test_allEightPreviewBranches_liveInsideTheBubbleWrappedMux() throws {
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
                "mux `line2` — elle échapperait donc à la bulle d'aperçu, et son heure " +
                "disparaîtrait sans qu'aucun autre témoin ne rougisse (risque n°1 du lot 2)."
            )
        }
    }

    /// **L'heure quitte la ligne de titre et entre dans la bulle.** Deux
    /// moitiés indissociables : si l'ancien emplacement survivait, l'heure
    /// serait rendue DEUX fois.
    func test_timestamp_leftTheTitleLine_andLivesAtTheBubblesBottomRight() throws {
        let code = normalizedCode(try rowSource())
        guard let headerStart = code.range(of: "private var headerLine: some View {"),
              let headerEnd = code.range(of: "private var tagPastilles: some View {", range: headerStart.upperBound..<code.endIndex)
        else {
            XCTFail("les bornes de headerLine sont introuvables — la garde doit être re-pointée")
            return
        }
        let header = String(code[headerStart.lowerBound..<headerEnd.lowerBound])

        XCTAssertFalse(
            header.contains("LentilleRowTimestamp"),
            "headerLine rend encore l'horodatage — l'heure appartient désormais à la bulle " +
            "d'aperçu (bas à droite), comme l'heure d'une bulle de messagerie."
        )
        XCTAssertFalse(
            header.contains(#"Text("·")"#),
            "headerLine garde le point médian qui séparait le nom de l'heure — sans heure à " +
            "séparer, il ne sépare plus rien."
        )
        XCTAssertTrue(
            code.contains("struct LentillePreviewBubble"),
            "La bulle d'aperçu doit être déclarée dans LentilleConversationRow.swift."
        )
        guard let bubbleStart = code.range(of: "struct LentillePreviewBubble") else { return }
        XCTAssertTrue(
            String(code[bubbleStart.lowerBound...]).contains("LentilleRowTimestamp(date: date)"),
            "LentillePreviewBubble doit rendre l'horodatage (LentilleRowTimestamp) — c'est le " +
            "nouveau domicile de l'heure."
        )
    }

    /// **Le glyphe outbox ⟳ est retiré du rang** (décision produit lot 2 :
    /// le renvoi automatique par l'outbox est conservé, seule l'affordance
    /// visuelle de la liste disparaît, remplacée par la pastille chiffrée).
    /// Voir `LentilleRowBehaviourAnchorTests.test_L09_…` pour l'amendement de
    /// la matrice comportementale.
    func test_pendingSyncGlyph_isRemovedFromTheFlatRow() throws {
        let code = normalizedCode(try rowSource())
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

    /// **La pastille chiffrée vient de l'atome partagé**, jamais d'un second
    /// assemblage local (pendant POSITIF de
    /// `test_noUnreadBadgeBackground_inAnyRowFile_theChromeLivesInTheSharedAtom`).
    /// Le portillon `count > 0` vit DANS l'atome — un seul endroit décide si
    /// la pastille existe.
    func test_unreadBadge_isTheSharedAtom_gatedByTheUnreadCount() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertTrue(
            code.contains("UnreadCountBadge(count: conversation.userState.unreadCount, isDark: isDark)"),
            "LentilleConversationRow.swift doit consommer l'atome partagé " +
            "UnreadCountBadge(count:isDark:) alimenté par conversation.userState.unreadCount — " +
            "jamais un second assemblage de Text + Capsule + unreadBadgeBackground."
        )
    }

    /// **L'effectif se pose en bas à droite du cadre, et JAMAIS sur un
    /// `.direct`.** Le libellé vient de `MembersCountLabel` (règle plurielle
    /// du catalogue + suffixe « + » du plafond) — jamais une concaténation
    /// locale « nombre + + », le défaut que 234i a précisément supprimé.
    func test_memberCountLine_isTrailing_absentForDirect_andReusesTheSharedLabel() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertTrue(
            code.contains("guard conversation.type != .direct else { return nil }"),
            "L'effectif doit être décidé par UN seul portillon `conversation.type != .direct` — " +
            "une conversation directe n'affiche AUCUN effectif (contrat lot 2), et le libellé " +
            "VoiceOver doit se taire exactement quand l'œil ne voit rien."
        )
        XCTAssertTrue(
            code.contains("MembersCountLabel.text(conversation.memberCount, capped: conversation.memberCountCapped)"),
            "L'effectif doit passer par MembersCountLabel.text(_:capped:) — la règle plurielle " +
            "vit dans le catalogue et le « + » du plafond dans ce type, jamais réécrits ici."
        )
        XCTAssertEqual(
            occurrences(of: "MembersCountLabel.text(", in: code), 1,
            "UN seul site de composition de l'effectif : la ligne visible et le libellé " +
            "VoiceOver doivent lire la MÊME chaîne (sinon l'oreille et l'œil divergent au " +
            "premier changement de règle plurielle)."
        )
        XCTAssertTrue(
            code.contains(".frame(maxWidth: .infinity, alignment: .trailing)"),
            "La ligne d'effectif doit être alignée à DROITE dans le cadre du rang (contrat lot 2)."
        )
        XCTAssertFalse(
            code.contains("memberCountDisplay"),
            "Le rang ne doit pas retomber sur memberCountDisplay (chiffres nus « 199+ ») — la " +
            "liste affiche un libellé ACCORDÉ (« 199+ membres »), pas un compteur nu."
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
