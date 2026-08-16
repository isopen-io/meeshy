import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// Ancrages complémentaires de la matrice comportementale liste (contrat
/// LWS-7/LWS-8, `packages/shared/fixtures/conformance/behaviour-matrix.json`,
/// ids L01..L17) — REV-3, blocker B1.
///
/// **Pourquoi une suite séparée.** À l'armement de la garde d'ensemble
/// (`packages/shared/__tests__/vectors/behaviour-matrix.test.ts`, Porte V1),
/// un audit ligne par ligne des 17 lignes `list` contre les suites Lentille
/// existantes (`LentilleFlatRowTests`, `LentilleRowSourceGuardTests`,
/// `SectionDropTargetTests`, `StickySectionStructureTests`,
/// `BridgeFingerprintTests`, `PeekViewModelTests`…) a trouvé, pour PLUSIEURS
/// ids, soit AUCUN témoin réel (un comportement existant mais jamais
/// vérifié), soit un témoin qui prouverait le CONTRAIRE de ce que la matrice
/// exige (un TROU RÉEL — le comportement décrit n'est PAS implémenté).
/// Même discipline que `FocalRealtimeMatrixTests` (F-090/F-083ter) : un
/// témoin qui affirme l'invariant CORRECT (celui que la matrice décrit) est
/// ROUGE aujourd'hui quand le trou est réel — c'est la preuve du trou, pas
/// une erreur de rédaction. AUCUN jeton `behaviour-matrix:<id>` n'est posé
/// sans un test RÉEL en face (jamais de jeton de complaisance) : les tests
/// rouges ci-dessous sont des tests réels qui échouent pour la bonne raison,
/// documentée dans leur commentaire.
///
/// **Nommage** — aucun jeton de `FINAL_PHASE_CLASS_PATTERN`
/// (`apps/ios/meeshy.sh:1591`, qui contient notamment `Conversation`,
/// `Message`, `Presence`, `Draft`, `Sync`…) : `LentilleRowBehaviourAnchorTests`
/// n'en porte aucun, reste en phase 1 (suites isolées).
final class LentilleRowBehaviourAnchorTests: XCTestCase {

    // MARK: - Localisation des sources

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    private func source(at relativePath: String) throws -> String {
        try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private func rowSource() throws -> String {
        try source(at: "Meeshy/Features/Main/Lentille/Row/LentilleConversationRow.swift")
    }

    private func focusCardSource() throws -> String {
        try source(at: "Meeshy/Features/Main/Lentille/Mode/LentilleFocusCard.swift")
    }

    private func providersSource() throws -> String {
        try source(at: "Meeshy/Features/Main/Lentille/Core/LentilleProviders.swift")
    }

    private func listViewSource() throws -> String {
        try source(at: "Meeshy/Features/Main/Views/ConversationListView.swift")
    }

    private func normalizedCode(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    // MARK: - L01 — typing multi-membres : reduce-motion (réel) + dot de présence forcé vert (TROU RÉEL)

    /// Volet RÉEL de L01 : `LentilleTypingDots` respecte Reduce Motion — au
    /// repos à la phase HAUTE (`scaleEffect`/`opacity` à `1.0`), jamais figée
    /// à mi-animation (`0.5`/`0.4`). La sélection DÉTERMINISTE du typeur
    /// affiché (l'autre volet « sélection déterministe » de L01) est
    /// couverte par `ConversationListViewModelTests
    /// .test_typingSelection_pickIsDeterministicAndNilWhenEmpty` (logique
    /// PARTAGÉE, hors `Lentille/**` — la Lentille consomme
    /// `typingUsername` déjà résolu, elle ne réimplémente pas la sélection).
    func test_L01_typingDots_restAtTheHighPhase_underReduceMotion() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertTrue(
            code.contains("@Environment(\\.accessibilityReduceMotion) private var reduceMotion"),
            "LentilleTypingDots doit lire @Environment(\\.accessibilityReduceMotion) — L01, « TypingDotsView conservé (reduce-motion-aware) »."
        )
        XCTAssertTrue(
            code.contains(".scaleEffect(reduceMotion ? 1.0 : (isAnimating ? 1.0 : 0.5))"),
            "Sous Reduce Motion, les points doivent rester à l'échelle 1.0 (phase HAUTE), jamais figés à mi-animation (0.5) — L01."
        )
    }

    // behaviour-matrix:L01 — « … et force le dot de présence au vert. »
    /// TROU RÉEL. `LentilleConversationRow.swift` (lu intégralement pour ce
    /// témoin) ne contient AUCUNE expression qui combine `typingUsername`
    /// avec `PresenceState.online`/`.online` : le `presenceState` transmis à
    /// `LentilleRowAvatar` est TOUJOURS l'état réel du paramètre
    /// `presenceState` du rang (souvent hors ligne), jamais forcé en ligne
    /// pendant qu'un membre écrit. `ConversationListViewModel` (gestion du
    /// typing, `ViewModels/ConversationListViewModel.swift`) ne pousse
    /// aucune valeur de présence non plus — il ne connaît que
    /// `typingUsernames`/`typingUsers`. Non corrigé ici (mission REV-3/B1 :
    /// documenter, pas corriger l'app) — voir aussi
    /// `test_L10_presenceDot_isNeverShownForGroups_realGapDocumented`, même
    /// ligne de source, trou voisin.
    func test_L01_presenceDot_isNeverForcedOnline_whenTyping_realGapDocumented() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertTrue(
            code.contains("typingUsername != nil ? PresenceState.online")
                || code.contains("typingUsername != nil ? .online")
                || code.contains(".online : presenceState"),
            "TROU RÉEL (behaviour-matrix:L01) : « force le dot de présence au vert » — " +
            "LentilleConversationRow.swift ne combine JAMAIS typingUsername avec .online : " +
            "le dot de présence reste l'état réel (souvent hors ligne) pendant qu'un membre écrit."
        )
    }

    // MARK: - L03 — glyphes SF des kinds (expired/hidden/viewOnce) : TROU RÉEL

    // behaviour-matrix:L03
    /// TROU RÉEL. `ThemedConversationRow.swift` porte bien les glyphes SF
    /// `timer`/`eye.slash`/`flame` pour ces branches (lignes ~510/561/573,
    /// re-preuve faite à l'écriture de ce test) — mais
    /// `LentilleConversationRow.previewLine` (branches `.expired`/`.hidden`/
    /// `.viewOnce`) ne rend AUCUN `Image(systemName:)` : uniquement du texte
    /// italique. La matrice exige « conservent leurs glyphes SF actuels » ;
    /// le rang plat les a perdus. Non corrigé ici (documentation, mission
    /// REV-3/B1).
    func test_L03_previewKindGlyphs_areMissingFromTheFlatRow_realGapDocumented() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertTrue(
            code.contains("systemName: \"timer\"")
                || code.contains("systemName: \"eye.slash\"")
                || code.contains("systemName: \"flame\""),
            "TROU RÉEL (behaviour-matrix:L03) : « conservent leurs glyphes SF actuels " +
            "(timer, eye.slash, flame) » — LentilleConversationRow.swift ne rend AUCUN de " +
            "ces trois glyphes dans previewLine (expired/hidden/viewOnce) : les branches " +
            "italiques ont perdu leur icône par rapport à ThemedConversationRow.swift."
        )
    }

    // MARK: - L04 — pièces jointes sans texte : icône + méta + « +N », Prisme non appliqué (réel)

    // behaviour-matrix:L04
    /// Réel. `standardPreview` (branche attachements, aucun texte) rend
    /// l'icône + le libellé COURT de `AttachmentDisplay` (type figé, SDK
    /// `MeeshyUI`, jamais résolu par le Prisme — c'est `display.shortLabel`,
    /// jamais `resolvedPreviewText`), et le compteur « +N » teinté accent
    /// SEULEMENT au-delà d'une pièce jointe.
    func test_L04_attachmentOnlyBranch_rendersIconMetaPlusN_neverThroughThePrisme() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertTrue(
            code.contains("let display = AttachmentDisplay.make(for: first.mimeType)"),
            "L04 : la branche pièces jointes sans texte doit résoudre l'affichage via " +
            "AttachmentDisplay.make(for:) — icône + méta, jamais du texte libre."
        )
        XCTAssertTrue(
            code.contains("Text(display.shortLabel)"),
            "L04 : le libellé de la pièce jointe doit venir de display.shortLabel (SDK figé) " +
            "— jamais de resolvedPreviewText : « le Prisme ne s'applique toujours pas à cette branche »."
        )
        XCTAssertTrue(
            code.contains(#"if totalCount > 1 { Text("+\(totalCount - 1)") .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold)) .foregroundColor(accent) }"#),
            "L04 : le compteur « +N » doit être teinté accent et n'apparaître qu'au-delà " +
            "d'une pièce jointe."
        )
    }

    // MARK: - L05 — fallback de localisation : mappin + nom du lieu (réel)

    // behaviour-matrix:L05
    /// Réel. La branche de repli localisation (`lastMessageLocation`) rend
    /// `mappin.and.ellipse` teinté accent, suivi du nom du lieu (ou du
    /// libellé générique de repli) — identique au rang historique.
    func test_L05_locationFallbackBranch_rendersMappinAndPlaceName() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertTrue(
            code.contains(#"} else if let place = conversation.lastMessageLocation { HStack(spacing: 4) { senderLabel Image(systemName: "mappin.and.ellipse")"#),
            "L05 : le fallback de localisation doit rester `mappin.and.ellipse`, sur la branche " +
            "lastMessageLocation — identique au rang historique."
        )
        XCTAssertTrue(
            code.contains(#"Text(place.name ?? String(localized: "conversation.summary.location", defaultValue: "Position"))"#),
            "L05 : le nom du lieu (ou son repli générique) doit être affiché — jamais une " +
            "chaîne vide."
        )
    }

    // MARK: - L06 — timestamp rouge sur non-lu : TROU RÉEL (le badge, lui, EST retiré — voir LentilleFlatRowTests)

    // behaviour-matrix:L06
    /// TROU RÉEL. La matrice exige : « le timestamp rouge sur non-lu [est]
    /// supprimé […] l'heure reste TERTIAIRE ». `LentilleConversationRow
    /// .timestampColor(unreadCount:accent:)` (pure, testable sans vue)
    /// retourne pourtant encore `MeeshyColors.error` (rouge) dès qu'il y a
    /// du non-lu — comportement COPIÉ tel quel de `ThemedConversationRow`
    /// (§0), jamais retiré pour le rang plat. Le retrait du BADGE 99+
    /// (l'autre volet de L06) est, lui, bien réel — voir
    /// `LentilleFlatRowTests.test_sourceGuard_rowFiles_containNoUnreadBadgeBackground`.
    /// Non corrigé ici (documentation, mission REV-3/B1).
    func test_L06_timestampColor_stillReturnsErrorOnUnread_realGapDocumented() {
        XCTAssertNotEqual(
            LentilleConversationRow.timestampColor(unreadCount: 5, accent: .blue),
            MeeshyColors.error,
            "TROU RÉEL (behaviour-matrix:L06) : « le timestamp rouge sur non-lu [est] " +
            "supprimé […] l'heure reste tertiaire » — timestampColor(unreadCount: 5, …) " +
            "retourne encore MeeshyColors.error (rouge), pas une couleur tertiaire."
        )
    }

    // MARK: - L07 — glyphe 📌 avant le nom : TROU RÉEL (la sourdine et le drop-cible, eux, SONT réels)

    // behaviour-matrix:L07
    /// TROU RÉEL. « L'épingle ajoute un glyphe 📌 avant le nom » —
    /// `LentilleConversationRow.swift` (lu intégralement pour ce témoin) ne
    /// contient AUCUNE occurrence de « 📌 ». Seule la sourdine (🔕, voir
    /// `LentilleRowSourceGuardTests
    /// .test_mutedGlyph_gatedByUserStateIsMuted_inLentilleConversationRow`)
    /// a été ajoutée à l'audit ; le glyphe d'épingle ne l'a pas été. Le
    /// classement dans la section dédiée (le drop range bien sous le
    /// sticker épingles) est, lui, réel — voir
    /// `SectionDropTargetTests.test_dropOnSectionN_landsInSectionN_forFourTargets`.
    /// Non corrigé ici (documentation, mission REV-3/B1).
    func test_L07_pinnedGlyph_isMissingFromTheRow_realGapDocumented() throws {
        let code = try rowSource()
        XCTAssertTrue(
            code.contains("📌"),
            "TROU RÉEL (behaviour-matrix:L07) : « l'épingle ajoute un glyphe 📌 avant le nom » " +
            "— LentilleConversationRow.swift ne contient AUCUNE occurrence de 📌 ; seule la " +
            "sourdine (🔕) a été ajoutée par l'audit, pas l'épingle."
        )
    }

    // MARK: - L08 — badge de type absorbé par la focus card (TROU RÉEL) ; tags ≤ 3 pastilles (réel)

    // behaviour-matrix:L08
    /// TROU RÉEL. « Le badge de type (groupe/canal/bot + memberCount) est
    /// absorbé par la focus card » — `LentilleFocusCard.swift` (lu
    /// intégralement pour ce témoin) ne référence NI `conversation.type`
    /// NI `memberCount` : la carte de focus ne rend que l'encoche de mode
    /// (« AUTO · <décision> ») et le fond/ring accent — le type de
    /// conversation et le nombre de membres ne sont affichés NULLE PART
    /// sur la Lentille. Non corrigé ici (documentation, mission REV-3/B1).
    func test_L08_typeBadgeAndMemberCount_areAbsentFromTheFocusCard_realGapDocumented() throws {
        let code = normalizedCode(try focusCardSource())
        XCTAssertTrue(
            code.contains("memberCount") || code.contains("conversation.type"),
            "TROU RÉEL (behaviour-matrix:L08) : « le badge de type (groupe/canal/bot + " +
            "memberCount) est absorbé par la focus card » — LentilleFocusCard.swift ne " +
            "référence ni memberCount ni conversation.type : rien n'affiche le type/effectif " +
            "de la conversation sur la Lentille."
        )
    }

    /// Réel. Les tags utilisateur sont bornés à `LentilleMetrics.Tags.maxCount`
    /// (3, verrouillé par token — `LentilleMetricsTests.test_tags`) — ce
    /// témoin verrouille le CÔTÉ CONSOMMATEUR : que le rang tronque
    /// effectivement avec CE token, jamais un `.prefix(3)` littéral
    /// concurrent.
    func test_L08_tagPastilles_arePrefixedByTheMaxCountToken_neverALiteral() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertTrue(
            code.contains("ForEach(conversation.tags.prefix(LentilleMetrics.Tags.maxCount)) { tag in"),
            "L08 : les tags utilisateur doivent être tronqués via " +
            "LentilleMetrics.Tags.maxCount (3), jamais un .prefix(3) littéral concurrent."
        )
    }

    // MARK: - L09 — glyphe hasPendingSync conservé (réel, jamais testé jusqu'ici)

    // behaviour-matrix:L09
    /// Réel. Le glyphe `arrow.triangle.2.circlepath` (outbox) est conservé
    /// tel quel, teinté accent à 70 % — jamais testé par une suite Lentille
    /// jusqu'à cet audit (le champ `hasPendingSync` lui-même est testé côté
    /// `ConversationListViewModelTests`, mais son RENDU dans le rang plat ne
    /// l'était pas).
    func test_L09_hasPendingSyncGlyph_isConserved_accentSeventyPercent() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertTrue(
            code.contains(#"if conversation.userState.hasPendingSync { Image(systemName: "arrow.triangle.2.circlepath")"#),
            "L09 : le glyphe outbox doit rester gated par conversation.userState.hasPendingSync, " +
            "arrow.triangle.2.circlepath — conservé tel quel."
        )
        XCTAssertTrue(
            code.contains(".foregroundColor(accent.opacity(0.7))"),
            "L09 : le glyphe outbox doit rester teinté accent à 70 % — conservé tel quel."
        )
    }

    // MARK: - L10 — dots de présence pour les groupes (TROU RÉEL) ; propagation mood/présence (réel)

    // behaviour-matrix:L10
    /// TROU RÉEL. « … avec des dots de présence AUSSI pour les groupes
    /// (agrégat PresenceManager, "quelqu'un d'actif") » — `LentilleRowAvatar`
    /// ne transmet `presenceState` à `MeeshyAvatar` que si `isDirect` est
    /// vrai (`(isDirect && moodStatus == nil) ? presenceState : nil`) : pour
    /// TOUTE conversation de groupe, `presenceState` transmis est
    /// TOUJOURS `nil`, quel que soit l'agrégat de présence réel. Non
    /// corrigé ici (documentation, mission REV-3/B1). Voir aussi
    /// `test_L01_presenceDot_isNeverForcedOnline_whenTyping_realGapDocumented`,
    /// même ligne de source, trou voisin.
    func test_L10_presenceDot_isNeverShownForGroups_realGapDocumented() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertFalse(
            code.contains("presenceState: (isDirect && moodStatus == nil) ? presenceState : nil"),
            "TROU RÉEL (behaviour-matrix:L10) : « des dots de présence aussi pour les groupes » " +
            "— LentilleRowAvatar transmet encore presenceState: (isDirect && moodStatus == nil) " +
            "? presenceState : nil, qui vaut TOUJOURS nil pour un groupe."
        )
    }

    /// Réel, même discipline que `FocalIdentityHeader
    /// .test_F03_presenceStateIsPropagatedNotReinterpreted` (Focal) : la
    /// règle « un seul coin, mood gagne, présence sinon » vit dans
    /// `MeeshyAvatar` (§1.3, frozen) — `LentilleRowAvatar` PROPAGE
    /// `moodStatus?.moodEmoji`/`presenceState` sans réinterpréter les cas.
    func test_L10_moodAndPresence_arePropagatedNotReinterpreted_toMeeshyAvatar() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertTrue(
            code.contains("moodEmoji: moodStatus?.moodEmoji,"),
            "L10 : LentilleRowAvatar doit transmettre moodStatus?.moodEmoji tel quel à " +
            "MeeshyAvatar — la règle « un seul coin, mood gagne » vit dans MeeshyAvatar, " +
            "jamais réécrite ici."
        )
    }

    // MARK: - L11 — sélection iPad → style de focus card persistant (réel)

    // behaviour-matrix:L11
    /// Réel. La barre latérale accent (3 pt) de sélection iPad/macOS
    /// split-view est bien le style « focus card persistant » du rang
    /// sélectionné — jamais un fond de carte.
    func test_L11_selectedRow_rendersThreePointAccentSidebar_notABackground() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertTrue(
            code.contains("if isSelected { RoundedRectangle(cornerRadius: 1.5, style: .continuous) .fill(accent) .frame(width: 3)"),
            "L11 : la sélection iPad doit rester une fine barre accent de 3 pt (jamais un fond) " +
            "— le style de la focus card persistant sur le rang sélectionné."
        )
    }

    // MARK: - L13 — appel en cours (Scène) : TROU RÉEL COMPLET

    // behaviour-matrix:L13
    /// TROU RÉEL. Le type `ConversationLiveCall` (voix, `startedAt`,
    /// `joined`) existe bien — miroir Swift GELÉ du protocole
    /// `ConversationLiveCallProviding` (LWS-2bis, `LentilleProviders.swift`)
    /// — mais AUCUN fichier de `Lentille/Row/` ni `Lentille/Mode/` ne le
    /// consomme : `LentilleConversationRow.swift` ne référence ni
    /// `ConversationLiveCall`, ni `liveCall`, ni un bouton « Rejoindre », ni
    /// un point pulsant. Le type existe côté données (LWS-2bis livré) ; sa
    /// consommation par le rang (le rendu décrit par L13) n'a jamais été
    /// câblée. Non corrigé ici (documentation, mission REV-3/B1).
    func test_L13_liveCallBanner_isNotConsumedByTheRow_realGapDocumented() throws {
        XCTAssertTrue(
            try providersSource().contains("struct ConversationLiveCall"),
            "Prérequis : ConversationLiveCall doit exister (LWS-2bis, LentilleProviders.swift) " +
            "pour que ce témoin ait un sens — sinon c'est un trou plus large que L13 seul."
        )
        let rowCode = normalizedCode(try rowSource())
        XCTAssertTrue(
            rowCode.contains("ConversationLiveCall") || rowCode.contains("liveCall") || rowCode.contains("Rejoindre"),
            "TROU RÉEL (behaviour-matrix:L13) : « l'appel en cours (Scène) affiche un point " +
            "pulsant accent … un bouton Rejoindre » — LentilleConversationRow.swift ne " +
            "consomme JAMAIS ConversationLiveCall : le type de données existe (LWS-2bis), " +
            "son rendu sur le rang n'a jamais été câblé."
        )
    }

    // MARK: - L14 — timestamp ticker, hors gate Equatable (réel)

    // behaviour-matrix:L14
    /// Réel. `LentilleRowTimestamp` ticke via `TimelineView(.periodic(…))`,
    /// et `LentilleConversationRow.==` (copié de `ThemedConversationRow.==`
    /// puis étendu au pont, I-068) ne compare AUCUN champ de date direct —
    /// le ticker vit hors du portillon `.equatable()`, seul élément vivant
    /// du rang au repos. Le second volet de L14 (« sert aussi à la durée
    /// d'appel ») est BLOQUÉ par le trou L13 (aucune UI d'appel en cours à
    /// faire ticker) — non testable tant que L13 n'est pas comblé.
    func test_L14_timestampTicker_livesOutsideTheEquatableGate() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertTrue(
            code.contains("TimelineView(.periodic(from: date, by: 60)) { _ in"),
            "L14 : LentilleRowTimestamp doit ticker via TimelineView(.periodic(…, by: 60)) — " +
            "seul élément vivant du rang au repos."
        )
        XCTAssertFalse(
            code.contains("lhs.conversation.lastMessageAt == rhs.conversation.lastMessageAt"),
            "L14 : le portillon .equatable() ne doit JAMAIS comparer lastMessageAt directement " +
            "— sinon le ticker serait geléerait derrière le gate au lieu d'être son SEUL élément vivant."
        )
    }

    // MARK: - L17 — résolveur d'états vides : inchangé (réel) ; restylage plat (TROU PARTIEL)

    // behaviour-matrix:L17
    /// Réel — volet « résolveur ConversationListEmptyBranch non modifié » :
    /// les quatre cas restent exactement ceux d'avant la Lentille, aucun cas
    /// ajouté ni retiré.
    func test_L17_emptyBranchResolver_stillHasExactlyItsFourOriginalCases() throws {
        let code = normalizedCode(try listViewSource())
        XCTAssertTrue(
            code.contains("enum ConversationListEmptyBranch: Equatable { case skeleton case searchNoResults case syncError case createFirstConversation }"),
            "L17 : ConversationListEmptyBranch doit rester EXACTEMENT ces quatre cas, dans cet " +
            "ordre — le résolveur des branches vides n'a pas été modifié par la Lentille."
        )
    }

    /// TROU PARTIEL. « … avec des états vides restylés plats » — seule la
    /// branche `.skeleton` est effectivement muxée sous
    /// `LentilleFeatureFlag.isLentilleListEnabled`
    /// (`LentilleSkeletonGeometryTests
    /// .test_emptyBranchSkeletonMux_isGatedByLentilleFeatureFlag`) ; les
    /// TROIS autres branches (`.searchNoResults`, `.syncError`,
    /// `.createFirstConversation`) rendent encore l'`EmptyStateView`
    /// historique, SANS AUCUNE référence à `LentilleFeatureFlag` dans leur
    /// bloc `case` — ni restylage, ni chemin alternatif sous drapeau. Non
    /// corrigé ici (documentation, mission REV-3/B1).
    func test_L17_onlyTheSkeletonBranch_isRestyledUnderTheLentilleFlag_theOtherThreeAreNot_realGapDocumented() throws {
        let raw = try listViewSource()
        guard
            let searchCaseStart = raw.range(of: "case .searchNoResults:")?.lowerBound,
            let createCaseEnd = raw.range(of: "case .createFirstConversation:")?.lowerBound,
            let elseRange = raw.range(of: "} else {", range: createCaseEnd..<raw.endIndex)
        else {
            XCTFail("Repères de branches vides introuvables dans ConversationListView.swift — cette garde doit être re-pointée.")
            return
        }
        let threeNonSkeletonBranches = String(raw[searchCaseStart..<elseRange.lowerBound])
        XCTAssertTrue(
            threeNonSkeletonBranches.contains("LentilleFeatureFlag"),
            "TROU RÉEL (behaviour-matrix:L17, partiel) : « des états vides restylés plats » — " +
            "les branches .searchNoResults/.syncError/.createFirstConversation ne référencent " +
            "AUCUNE fois LentilleFeatureFlag : seule .skeleton est muxée sous le drapeau " +
            "(LentilleSkeletonGeometryTests), les trois autres restent l'EmptyStateView " +
            "historique sans variante Lentille."
        )
    }
}
