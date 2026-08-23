import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// Ancrages complémentaires de la matrice comportementale liste (contrat
/// LWS-7/LWS-8, `packages/shared/fixtures/conformance/behaviour-matrix.json`,
/// ids L01..L17) — REV-3, blocker B1, TROUS FERMÉS par REV-3/V3ter.
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
/// témoin qui affirme l'invariant CORRECT (celui que la matrice décrit) était
/// ROUGE au moment de l'audit B1 quand le trou était réel — c'est la preuve
/// du trou, pas une erreur de rédaction. AUCUN jeton `behaviour-matrix:<id>`
/// n'est posé sans un test RÉEL en face (jamais de jeton de complaisance).
/// **REV-3/V3ter** a fermé les 8 trous identifiés par B1 (L01, L03, L06,
/// L07, L08, L10, L13, L17-partiel) — chaque témoin renommé ci-dessous
/// (le suffixe `_realGapDocumented` retiré) affirme désormais l'invariant
/// CORRECT et est VERT parce que le correctif existe, pas par
/// affaiblissement de l'assertion : chaque commentaire cite l'implémentation
/// qui le ferme.
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

    private func magnificationSource() throws -> String {
        try source(at: "Meeshy/Features/Main/Lentille/Mode/LentilleMagnification.swift")
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

    // MARK: - L01 — typing multi-membres : reduce-motion (réel) + dot de présence forcé vert (FERMÉ, V3ter)

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
    /// FERMÉ (REV-3/V3ter). `LentilleConversationRow.effectivePresenceState`
    /// combine désormais `typingUsername` avec `.online` — vol.5 §5.3
    /// (docs/design/2026-08-15-conversation-list-lentille.html, ré-prouvé à
    /// CINQ endroits distincts du document normatif : lignes 188/355/406/
    /// 456/491-492, « dot présence forcé vert (typing = preuve d'activité) »)
    /// exige exactement ce câblage — le `presenceState` transmis à
    /// `LentilleRowAvatar` est `.online` dès qu'un typeur est affiché, quel
    /// que soit l'état de présence réel. Voir aussi
    /// `test_L10_presenceDot_isShownForGroupsToo`, même ligne de source,
    /// trou voisin fermé dans le même lot.
    func test_L01_presenceDot_isForcedOnline_whenTyping() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertTrue(
            code.contains("typingUsername != nil ? PresenceState.online")
                || code.contains("typingUsername != nil ? .online")
                || code.contains(".online : presenceState"),
            "behaviour-matrix:L01 : « force le dot de présence au vert » — " +
            "LentilleConversationRow.swift doit combiner typingUsername avec .online : " +
            "le dot de présence doit être forcé en ligne pendant qu'un membre écrit."
        )
    }

    // MARK: - L03 — glyphes SF des kinds (expired/hidden/viewOnce) : FERMÉ (V3ter)

    // behaviour-matrix:L03
    /// FERMÉ (REV-3/V3ter). `ThemedConversationRow.swift` porte les glyphes
    /// SF `timer`/`eye.slash`/`flame` pour ces branches (lignes ~510/561/573,
    /// lu seulement, fichier interdit d'édition) — `LentilleConversationRow
    /// .previewLine` les reproduit désormais (branches `.expired` via
    /// `timer.badge.xmark`, `.hidden` via `eye.slash`, `.viewOnce` via
    /// `flame`, `.ephemeralActive` via `timer` dans `standardPreview`) : la
    /// matrice exige « conservent leurs glyphes SF actuels », le rang plat
    /// les a retrouvés.
    func test_L03_previewKindGlyphs_areRestoredToTheFlatRow() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertTrue(
            code.contains("systemName: \"timer\"")
                || code.contains("systemName: \"eye.slash\"")
                || code.contains("systemName: \"flame\""),
            "behaviour-matrix:L03 : « conservent leurs glyphes SF actuels " +
            "(timer, eye.slash, flame) » — LentilleConversationRow.swift doit rendre au moins " +
            "un de ces trois glyphes dans previewLine (expired/hidden/viewOnce/ephemeral) : les " +
            "branches italiques doivent porter leur icône, comme ThemedConversationRow.swift."
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

    // MARK: - L06 — timestamp rouge sur non-lu : FERMÉ, V3ter (le badge, lui, était déjà retiré — voir LentilleFlatRowTests)

    // behaviour-matrix:L06
    /// FERMÉ (REV-3/V3ter). La matrice exige : « le timestamp rouge sur
    /// non-lu [est] supprimé […] l'heure reste TERTIAIRE ».
    /// `LentilleConversationRow.timestampColor(unreadCount:accent:isDark:)`
    /// (pure, testable sans vue) retourne désormais TOUJOURS
    /// `MeeshyColors.textMuted(isDark:)` — le rouge sémantique
    /// (`MeeshyColors.error`, comportement copié de `ThemedConversationRow`
    /// §0) est retiré, quel que soit l'état de lecture. Le retrait du BADGE
    /// 99+ (l'autre volet de L06) était déjà réel — voir
    /// `LentilleFlatRowTests.test_sourceGuard_rowFiles_containNoUnreadBadgeBackground`.
    func test_L06_timestampColor_isTertiary_neverErrorOnUnread() {
        XCTAssertNotEqual(
            LentilleConversationRow.timestampColor(unreadCount: 5, accent: .blue),
            MeeshyColors.error,
            "behaviour-matrix:L06 : « le timestamp rouge sur non-lu [est] " +
            "supprimé […] l'heure reste tertiaire » — timestampColor(unreadCount: 5, …) " +
            "ne doit JAMAIS retourner MeeshyColors.error (rouge)."
        )
    }

    /// **AMENDEMENT L06 (lot 2, 2026-08-22).** Le premier volet de L06 (« le
    /// badge rouge 99+ … supprimé, remplacé par un point accent 8 px ») est
    /// RENVERSÉ par une décision produit : la pastille rouge CHIFFRÉE
    /// revient sur le rang plat, à la place exacte du glyphe outbox retiré
    /// (voir L09 ci-dessous), et c'est le point accent de 8 px qui disparaît
    /// — il portait la même donnée (`unreadCount > 0`) à quelques points de
    /// la pastille. Le SECOND volet de L06 (« le timestamp rouge sur non-lu
    /// est supprimé, l'heure reste tertiaire ») reste INTACT : c'est le
    /// témoin ci-dessus, inchangé.
    ///
    /// `behaviour-matrix.json` L06 a été amendé dans le même lot (le texte
    /// normatif porte désormais l'amendement daté) : sans cela, la matrice
    /// affirmerait le contraire de ce que la peau rend.
    func test_L06_amended_countedUnreadBadgeIsBackAndTheEightPointDotIsGone() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertTrue(
            code.contains("UnreadCountBadge(count: conversation.userState.unreadCount, isDark: isDark)"),
            "behaviour-matrix:L06 (amendé lot 2) : la pastille rouge chiffrée revient " +
            "sur le rang plat via l'atome partagé UnreadCountBadge."
        )
        let bridge = normalizedCode(try source(at: "Meeshy/Features/Main/Lentille/Row/LentilleBridgeLine.swift"))
        XCTAssertFalse(
            bridge.contains("UnreadDot"),
            "behaviour-matrix:L06 (amendé lot 2) : le point accent de 8 px est retiré du pont ✦ " +
            "— doublon strict de la pastille chiffrée."
        )
    }

    // MARK: - L07 — glyphe 📌 avant le nom : FERMÉ, V3ter (la sourdine et le drop-cible, eux, étaient déjà réels)

    // behaviour-matrix:L07
    /// FERMÉ (REV-3/V3ter). « L'épingle ajoute un glyphe 📌 avant le nom » —
    /// `LentilleConversationRow.headerLine` rend désormais « 📌 » gated par
    /// `conversation.userState.isPinned`, juste avant `Text(conversation
    /// .displayName)` — même position que la sourdine (🔕, voir
    /// `LentilleRowSourceGuardTests
    /// .test_mutedGlyph_gatedByUserStateIsMuted_inLentilleConversationRow`),
    /// même style décoratif. Le classement dans la section dédiée (le drop
    /// range bien sous le sticker épingles) était déjà réel — voir
    /// `SectionDropTargetTests.test_dropOnSectionN_landsInSectionN_forFourTargets`.
    func test_L07_pinnedGlyph_isPresentInTheRow() throws {
        let code = try rowSource()
        XCTAssertTrue(
            code.contains("📌"),
            "behaviour-matrix:L07 : « l'épingle ajoute un glyphe 📌 avant le nom » " +
            "— LentilleConversationRow.swift doit contenir 📌, gated par isPinned, comme la " +
            "sourdine (🔕)."
        )
    }

    // MARK: - L08 — badge de type absorbé par la focus card (FERMÉ, V3ter) ; tags ≤ 3 pastilles (réel)

    // behaviour-matrix:L08
    /// FERMÉ (REV-3/V3ter). « Le badge de type (groupe/canal/bot +
    /// memberCount) est absorbé par la focus card » — `LentilleFocusCard
    /// .typeBadge` (coin bas-gauche, `allowsHitTesting(false)`) référence
    /// désormais `conversation.type` (icône, `Self.typeBadgeIcon(for:)`,
    /// reproduit depuis `ThemedConversationRow.typeBadgeIcon` — fichier
    /// interdit d'édition, lu seulement) et `conversation.memberCount`
    /// (compteur, seuil `> 1`, identique au badge historique) : le type de
    /// conversation et le nombre de membres sont maintenant affichés sur la
    /// carte de focus, pas sur le rang.
    ///
    /// **2026-08-23 — le porteur a changé, pas la loi.** La focus card a été
    /// dissoute (la magnification vit dans la rangée) ; le badge de type et
    /// l'effectif vivent désormais dans `LentilleMagnifiedRow`/`LentilleMemberCountChip`
    /// (`Lentille/Mode/LentilleMagnification.swift`), montés par la rangée
    /// SEULEMENT sous magnification. Ce que L08 protège — « ni le type ni
    /// l'effectif sur le rang au REPOS » — est inchangé, et ce témoin le dit
    /// désormais dans les deux sens.
    func test_L08_typeBadgeAndMemberCount_areAbsorbedByTheMagnification() throws {
        let magnification = normalizedCode(try magnificationSource())
        XCTAssertTrue(
            magnification.contains("conversation.memberCount") && magnification.contains("conversation.type"),
            "behaviour-matrix:L08 : « le badge de type (groupe/canal/bot + memberCount) est " +
            "absorbé par la magnification » — LentilleMagnification.swift doit porter les deux."
        )
        let row = normalizedCode(try rowSource())
        XCTAssertFalse(
            row.contains("conversation.memberCount"),
            "… et le rang au REPOS ne doit toujours pas les afficher : il ne connaît que la " +
            "pastille, montée sous `if let magnification`."
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

    // MARK: - L09 — glyphe hasPendingSync : RETIRÉ par décision produit (lot 2, 2026-08-22)

    // behaviour-matrix:L09
    /// **AMENDEMENT (lot 2, 2026-08-22).** La matrice d'origine gravait « le
    /// glyphe hasPendingSync (outbox) est conservé tel quel :
    /// arrow.triangle.2.circlepath en accent à 70 % », et ce témoin le
    /// vérifiait VERT. Décision produit : le renvoi automatique par l'outbox
    /// est conservé côté mécanique, seule l'AFFORDANCE VISUELLE de la liste
    /// disparaît — sa place en queue de ligne de titre revient à la pastille
    /// chiffrée de non-lus (L06 amendé ci-dessus). Le témoin est donc
    /// INVERSÉ, jamais supprimé : ce que la matrice affirme et ce que la peau
    /// rend doivent continuer de se répondre, dans un sens comme dans
    /// l'autre.
    ///
    /// L'état outbox reste ANNONCÉ à VoiceOver (`accessibility.pending_sync`,
    /// composé par `ThemedConversationRow.conversationAccessibilityLabel`
    /// dont le rang plat dérive son libellé) : le retrait est visuel, pas
    /// informationnel.
    func test_L09_amended_pendingSyncGlyphIsRemovedFromTheRow() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertFalse(
            code.contains("arrow.triangle.2.circlepath"),
            "behaviour-matrix:L09 (amendé lot 2) : le glyphe outbox ne doit plus " +
            "être rendu par le rang plat — l'outbox continue de renvoyer, sans affordance de " +
            "liste."
        )
        XCTAssertFalse(
            code.contains("hasPendingSync"),
            "behaviour-matrix:L09 (amendé lot 2) : plus aucun rendu du rang plat ne " +
            "doit dépendre de userState.hasPendingSync."
        )
    }

    // MARK: - L10 — dots de présence pour les groupes (FERMÉ, V3ter) ; propagation mood/présence (réel)

    // behaviour-matrix:L10
    /// FERMÉ (REV-3/V3ter). « … avec des dots de présence AUSSI pour les
    /// groupes (agrégat PresenceManager, "quelqu'un d'actif") » —
    /// `LentilleRowAvatar` transmet désormais `presenceState` à
    /// `MeeshyAvatar` dès que `moodStatus == nil` (`isDirect` retiré du
    /// gate) : pour une conversation de groupe, `presenceState` transmis
    /// est l'agrégat réel (offline = aucun dot, verrouillé par
    /// `MeeshyAvatar`), plus jamais `nil` par construction. Voir aussi
    /// `test_L01_presenceDot_isForcedOnline_whenTyping`, même ligne de
    /// source, trou voisin fermé dans le même lot.
    func test_L10_presenceDot_isShownForGroupsToo() throws {
        let code = normalizedCode(try rowSource())
        XCTAssertFalse(
            code.contains("presenceState: (isDirect && moodStatus == nil) ? presenceState : nil"),
            "behaviour-matrix:L10 : « des dots de présence aussi pour les groupes » " +
            "— LentilleRowAvatar ne doit plus court-circuiter presenceState avec isDirect."
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

    // MARK: - L13 — appel en cours (Scène) : FERMÉ, V3ter (câblage d'injection amont documenté comme restant)

    // behaviour-matrix:L13
    /// FERMÉ CÔTÉ RANG (REV-3/V3ter). Le type `ConversationLiveCall` (voix,
    /// `startedAt`, `joined`) — miroir Swift GELÉ du protocole
    /// `ConversationLiveCallProviding` (LWS-2bis, `LentilleProviders.swift`)
    /// — est désormais CONSOMMÉ par `LentilleConversationRow` : un paramètre
    /// `liveCall: ConversationLiveCall? = nil` (même contrat que
    /// `moodStatus`/`draftSummary` — `nil` ⇒ rien de fabriqué) pilote un
    /// badge « ● n voix · depuis X » (`LentilleLiveCallBadge`, ticker 60 s)
    /// et un bouton « Rejoindre » (`joinLiveCallButton`) quand `!joined`.
    /// ÉCART RESTANT, documenté et assumé (garde `LentilleRowMuxSourceGuardTests
    /// .test_rowCore_onBranch_buildsLentilleConversationRow_withSameArgumentSet`
    /// verrouille le site d'appel EXACT de `ConversationListView+Rows.swift`
    /// — un argument de plus y casserait cette garde) : le CÂBLAGE amont
    /// (résoudre `ConversationLiveCallProviding` puis passer sa valeur au
    /// paramètre `liveCall` depuis `ConversationListView`) reste à faire
    /// dans un lot séparé qui rouvrira sciemment cette garde ; le rang, lui,
    /// est prêt à consommer une valeur réelle honnêtement dès qu'elle
    /// existe.
    func test_L13_liveCallBanner_isConsumedByTheRow() throws {
        XCTAssertTrue(
            try providersSource().contains("struct ConversationLiveCall"),
            "Prérequis : ConversationLiveCall doit exister (LWS-2bis, LentilleProviders.swift) " +
            "pour que ce témoin ait un sens — sinon c'est un trou plus large que L13 seul."
        )
        let rowCode = normalizedCode(try rowSource())
        XCTAssertTrue(
            rowCode.contains("ConversationLiveCall") || rowCode.contains("liveCall") || rowCode.contains("Rejoindre"),
            "behaviour-matrix:L13 : « l'appel en cours (Scène) affiche un point " +
            "pulsant accent … un bouton Rejoindre » — LentilleConversationRow.swift doit " +
            "consommer ConversationLiveCall."
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

    /// FERMÉ (REV-3/V3ter). « … avec des états vides restylés plats » —
    /// les TROIS branches restantes (`.searchNoResults`, `.syncError`,
    /// `.createFirstConversation`), en plus de `.skeleton`
    /// (`LentilleSkeletonGeometryTests
    /// .test_emptyBranchSkeletonMux_isGatedByLentilleFeatureFlag`), branchent
    /// désormais sur `LentilleFeatureFlag.isLentilleListEnabled` : restylage
    /// minimal cohérent (`EmptyStateView(compact: true)`, mêmes
    /// icône/titre/sous-titre/action, même `.padding(.top, 60)`) sous le
    /// drapeau ; drapeau OFF ⇒ construction `EmptyStateView` historique
    /// EXACTE (mêmes arguments, sans `compact:`), bit à bit identique.
    func test_L17_allFourEmptyBranches_areRestyledUnderTheLentilleFlag() throws {
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
            "behaviour-matrix:L17 : « des états vides restylés plats » — les branches " +
            ".searchNoResults/.syncError/.createFirstConversation doivent référencer " +
            "LentilleFeatureFlag (restylage sous drapeau), comme .skeleton " +
            "(LentilleSkeletonGeometryTests)."
        )
    }
}
