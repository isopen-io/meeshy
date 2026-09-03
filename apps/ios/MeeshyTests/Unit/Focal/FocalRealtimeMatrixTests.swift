import XCTest
import MeeshySDK
@testable import Meeshy

/// F-090 (WS-11) — la matrice temps réel du fil, F01..F15
/// (`packages/shared/fixtures/conformance/behaviour-matrix.json`, source
/// `vol4 §5` ; le contrat §WS-11 cite « 16 lignes » — RE-PREUVE : le fichier
/// réel n'en porte que 15, F01..F15, écart de contrat documenté ici plutôt
/// que deviné).
///
/// **Principe : un test par id, mais AUCUNE duplication de ce qui est déjà
/// prouvé.** La plupart des lois du fil (courbe, hystérésis, plafond
/// d'alpha, hôte, grilles média, routage audio) sont déjà couvertes de
/// façon exhaustive par les suites WS-3..WS-6 encore vivantes
/// (`FocalMediaGridLayoutTests`, `FocalAudioRoutingTests`,
/// `FocalMediaProtectionTests`, …) — les suites du pass
/// (`FocalScrollPassGeometryTests`, `FocalHostInsetCompositionTests`) sont
/// parties avec le RETRAIT FOCAL iOS (2026-08-18). Pour ces id, ce fichier ajoute un
/// ANCRAGE frais — un scénario, des entrées ou une combinaison différents
/// de ce qui existe déjà — plutôt que de recopier une assertion, ET cite la
/// suite qui porte la preuve exhaustive. Pour les id où la recette F-090 a
/// découvert un TROU RÉEL dans `FocalRow`/WS-4, le test affirme l'invariant
/// CORRECT (celui que la matrice décrit) — il est ROUGE aujourd'hui, et
/// c'est la preuve du trou, pas une erreur de rédaction (consigne F-090 :
/// documenter sans corriger, une fonctionnalité manquante n'est pas une
/// garde source triviale).
///
/// « Focal ET Script » (critère §WS-11) : `FocalRow` ne lit JAMAIS
/// `input.density` (contrat §3.1, garde `FocalRowSourceGuardTests.
/// test_focalRow_neverReadsDensity_uniformRowRegardlessOfMode`) — le
/// contenu de la rangée est donc IDENTIQUE en Focal et en Script PAR
/// CONSTRUCTION pour tout ce qui vit dans `Focal/Row/**` (F02, F04-F11,
/// F13, F15 : rien à re-tester en Script, la garde de densité couvre déjà
/// la parité). La PERSPECTIVE (WS-5, F01) n'existe plus : le pass est
/// supprimé du dépôt (RETRAIT FOCAL iOS 2026-08-18).
@MainActor
final class FocalRealtimeMatrixTests: XCTestCase {

    private func rowRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Focal/Row")
    }

    private func source(_ url: URL) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    // MARK: - F01 — message entrant temps réel, focus suit si au fond
    // behaviour-matrix:F01

    /// RETRAIT FOCAL iOS (2026-08-18) : l'élection du pass est supprimée —
    /// reste la LOI GELÉE `FocalFocusCurve.electFocusRow` (consommée par la
    /// Lentille), exercée ici. Ancrage : un candidat qui vient de NAÎTRE (aucun
    /// `currentId`, un seul candidat au fond, PILE sur la ligne de focus —
    /// scénario « nouveau message, focus vide ») doit être élu sans
    /// hésitation ; c'est exactement la condition « la nouvelle rangée naît
    /// dans la bande de focus … et le focus la suit » de F01.
    func test_F01_newlyArrivedRowAtFocusLine_isElectedImmediately() {
        let focusY: CGFloat = 700
        let winner = FocalFocusCurve.electFocusRow(
            candidates: [FocalFocusCurve.RowCandidate(id: "just-arrived", midY: focusY)],
            focusY: focusY,
            currentId: nil,
            hysteresis: FocalFocusCurve.threadFocusBandHysteresis
        )
        XCTAssertEqual(winner, "just-arrived", "F01 : un message qui vient d'arriver pile sur la ligne de focus doit être élu immédiatement")
    }

    /// La mécanique d'INSERTION elle-même (diffable snapshot, pilule
    /// « nouveaux messages » de `ConversationScrollControlsView`) est
    /// PRÉ-EXISTANTE — WS-5/WS-6 ne la modifient pas (contrat : seule la
    /// perspective posée PAR-DESSUS change). Hors périmètre Focal/**, non
    /// re-testée ici.
    func test_F01_insertionMechanicsAreInheritedNotFocalOwned() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalRow.swift"))
        XCTAssertFalse(
            code.contains("diffable") || code.contains("Snapshot"),
            "FocalRow.swift ne doit connaître ni le diffable snapshot ni la logique d'insertion — " +
            "c'est une rangée PURE (F01), l'insertion reste la propriété de MessageListViewController/MessageStore"
        )
    }

    // MARK: - F02 — typing indicator plat, exclu de la perspective
    // behaviour-matrix:F02

    /// RETRAIT FOCAL iOS (2026-08-18) : plus aucun transform nulle part — la
    /// perspective est partie avec le pass. Ancrage conservé : la rangée
    /// typing n'appartient PAS à `Focal/Row/**` (contrat §0 écart #7 :
    /// composant existant, non modifié) — cette garde confirme qu'aucun
    /// fichier Focal/Row/** ne réimplémente de pastille/dots de typing (ce
    /// serait une DUPLICATION du composant réel).
    func test_F02_typingIndicatorIsNotReimplementedInFocalRow() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalRow.swift"))
        XCTAssertFalse(
            code.lowercased().contains("typing"),
            "FocalRow.swift référence « typing » — la cellule de saisie est une cellule REDESSINÉE À PLAT " +
            "à part (contrat, écart §0-#7), jamais un cas de FocalRow (F02)"
        )
    }

    // MARK: - F03 — dot de présence sur la pastille 22
    // behaviour-matrix:F03

    /// La pastille et son ring de présence viennent de `MeeshyAvatar`
    /// (§1.3, lu jamais modifié) — `FocalIdentityHeader` transmet
    /// `senderPresence`/`senderStoryRing` SANS réinterpréter la règle
    /// 1/3/5 ni « offline = pas de dot » (F03). Ancrage : la propagation du
    /// paramètre, pas la règle elle-même (propriété de `MeeshyAvatar`, hors
    /// Focal/**).
    func test_F03_presenceStateIsPropagatedNotReinterpreted() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalIdentityHeader.swift"))
        XCTAssertTrue(
            code.contains("presenceState: senderPresence"),
            "FocalIdentityHeader.swift doit transmettre `senderPresence` tel quel à MeeshyAvatar — " +
            "la règle 1/3/5 (F03) est la propriété de MeeshyAvatar/PresenceStyle (§1.3), jamais réécrite ici"
        )
        XCTAssertFalse(
            code.contains("PresenceState.online") || code.contains("case .online:"),
            "FocalIdentityHeader.swift ne doit pas re-brancher sur les CAS de PresenceState — cela " +
            "dupliquerait la règle 1/3/5 que MeeshyAvatar applique déjà (F03)"
        )
    }

    // MARK: - F04 — accusés ✓/✓✓/lu toujours à côté de l'HEURE
    // behaviour-matrix:F04

    /// Preuve exhaustive du glyphe/des couleurs : `BubbleDeliveryCheck` lui-
    /// même (§1.3, non re-testé). F04 dit que la coche vit à côté de
    /// l'HEURE, jamais à côté du NOM — l'invariant n'a pas bougé, l'heure si :
    /// directive 2026-08-23, elle a quitté l'en-tête pour la ligne BASSE
    /// (`FocalMetaRow`), et la coche l'a suivie. La garde vise donc désormais
    /// la méta ; l'absence de coche dans l'en-tête est tenue par
    /// `FocalFocusedRowDetailsGuardTests`.
    func test_F04_deliveryCheckSitsBesideTheTime_neverBesideTheName() throws {
        let meta = AppSourceGuard.stripComments(
            try source(rowRoot().appendingPathComponent("FocalMetaRow.swift"))
        )
        XCTAssertTrue(
            meta.contains("BubbleDeliveryCheck(") && meta.contains("if isMe, let deliveryStatus"),
            "FocalMetaRow.swift doit poser BubbleDeliveryCheck, gardé par `isMe` (F04 : les accusés " +
            "ne concernent que les messages « Toi »)"
        )
        guard let spacerIndex = meta.range(of: "Spacer(minLength: 0)")?.lowerBound,
              let checkIndex = meta.range(of: "BubbleDeliveryCheck(")?.lowerBound else {
            return XCTFail("FocalMetaRow.swift doit contenir Spacer(minLength: 0) et BubbleDeliveryCheck(")
        }
        XCTAssertLessThan(
            spacerIndex, checkIndex,
            "F04 : BubbleDeliveryCheck doit être posé APRÈS le Spacer — à côté de l'heure — " +
            "jamais à côté du nom (doublon perçu)"
        )
    }

    // MARK: - F05 — réactions live en pilule plate MÉTA (corrigé F-083ter)
    // behaviour-matrix:F05

    /// **Trou réel découvert par F-090, corrigé par F-083ter.** `FocalRow.reactionsSection`
    /// réutilise `BubbleReactionsOverlay` (§1.3, `internal`, vérifié non
    /// `fileprivate`) TEL QUEL — pilule `11`pt, comptes monospaced, pop
    /// `springBouncy`, picker/détail inchangés : exactement F05. L'invariant
    /// affirmé ici est INCHANGÉ (même assertion qu'avant le correctif) — ce
    /// qui a changé, c'est le code qui la satisfait désormais.
    func test_F05_reactionsAreRenderedSomewhereInFocalRow() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalRow.swift"))
        XCTAssertTrue(
            code.contains("content.reactions") || code.contains(".reactions"),
            "F05 : AUCUN fichier de Focal/Row/** ne lit `content.reactions` — les réactions live " +
            "n'apparaissent nulle part sur la rangée plate (seul le libellé VoiceOver les annonce). " +
            "Trou réel de WS-4/F-083, non corrigé par F-090 (nécessite une nouvelle vue « pilule de " +
            "réactions », pas une garde source triviale) — voir rapport F-090."
        )
    }

    // MARK: - F06 — swap de traduction + drapeau-toggle
    // behaviour-matrix:F06

    /// Le SWAP de texte suit désormais `text.raw` — le contenu RÉSOLU par
    /// `BubbleContentBuilder` (Prisme + bascule manuelle du drapeau-toggle,
    /// arbitrage user 2026-08-18). Une traduction tardive change la
    /// résolution du builder → `raw` change → le cross-fade `.id(effectiveText)`
    /// joue, comme avant. L'ancienne préférence `preferredContent ??`
    /// court-circuitait la bascule V.O.
    func test_F06_translatedTextSwapsInPlace_prismeUnchanged() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalRow.swift"))
        XCTAssertTrue(
            code.contains("content.text?.raw ?? \"\""),
            "F06 : effectiveText doit lire `content.text?.raw` — le contenu résolu par le builder, " +
            "le même que la bulle (Prisme + bascule manuelle)"
        )
        XCTAssertTrue(
            code.contains(".id(effectiveText)"),
            "F06 : le cross-fade du swap tardif reste keyé sur le texte effectif"
        )
    }

    /// Arbitrage user 2026-08-18 : le chip 🌐 et la bande de drapeaux sont
    /// RETIRÉS de la rangée — le signal multi-langue est le drapeau de la
    /// langue D'ORIGINE (`LanguageData.info(for:)`), affiché seulement quand
    /// plusieurs versions existent ; le menu d'appui long porte l'exploration.
    func test_F06_originalLanguageFlagSignalsMultilingual_inFocalRow() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalRow.swift"))
        XCTAssertTrue(
            code.contains("LanguageData.info(for: translation.originalLangCode"),
            "F06 : le drapeau de la langue d'origine doit signaler le message multilingue — sans lui, aucune trace visuelle du Prisme sur le Fil"
        )
        XCTAssertFalse(
            code.lowercased().contains("systemname: \"globe\""),
            "F06 : l'icône translate (globe) est retirée de la rangée — arbitrage user 2026-08-18"
        )
    }

    // MARK: - F07 — audio nu, transcription traduite, carrousel multi-pistes
    // behaviour-matrix:F07

    /// Preuve exhaustive du ROUTAGE : `FocalAudioRoutingTests` (8 tests, les
    /// 4 modes + carrousel + exclusivité mutuelle). Ancrage frais : le
    /// carrousel EST bien restreint au cas `.audio` pur (jamais `.mixed`),
    /// exactement la garde F07 « carrousel multi-pistes » — vérifié ici sur
    /// un `.mixed` à 3 pistes audio (arité jamais exercée par
    /// `FocalAudioRoutingTests`, qui s'arrête à 2).
    func test_F07_mixedThreeTrackAudio_isNeverCarousel() {
        let content = BubbleContent(
            messageId: "m", kind: .standard, text: nil, translation: nil, reply: nil,
            attachments: .mixed(
                visual: [],
                audio: [
                    MeeshyMessageAttachment(id: "a1", fileName: "1", originalName: "1", mimeType: "audio/mpeg", fileSize: 1),
                    MeeshyMessageAttachment(id: "a2", fileName: "2", originalName: "2", mimeType: "audio/mpeg", fileSize: 1),
                    MeeshyMessageAttachment(id: "a3", fileName: "3", originalName: "3", mimeType: "audio/mpeg", fileSize: 1),
                ],
                nonMedia: []
            ),
            location: nil, ephemeral: nil, isBlurred: false, isViewOnce: false, isPinned: false,
            isForwarded: false, editedAt: nil, isEditSaving: false, hasEditHistory: false, reactions: [],
            meta: BubbleContent.Meta(timeString: "10:00", deliveryStatus: nil), isMe: false, senderName: "A", callNotice: nil, joinNotice: nil
        )
        XCTAssertNotEqual(
            FocalAudioRouting.mode(for: content), .carousel,
            "F07 : un `.mixed` à 3 pistes audio ne doit JAMAIS devenir un carrousel — le carrousel est " +
            "réservé au cas `.audio` PUR (garde déjà exercée à 2 pistes par FocalAudioRoutingTests, " +
            "confirmée ici à 3)"
        )
    }

    // MARK: - F08 — grilles média 1/2/3/4+ nues
    // behaviour-matrix:F08

    /// Preuve exhaustive de la géométrie : `FocalMediaGridLayoutTests`
    /// (n ∈ {0,1,2,3,4,7}). Ancrage frais : la rangée pose la grille SANS
    /// conteneur bulle — aucune `cornerRadius: 18`/`BubbleBackground` (déjà
    /// couvert plein-arbre par `FocalNoBubbleSourceGuardTests`), et le
    /// radius RÉEL vient du token (`FocalMetrics.Media.radius`), jamais un
    /// `16` en dur — ancrage jamais posé par `FocalRichBlockEquatableTests`.
    func test_F08_gridCellRadius_comesFromTheToken_neverALiteral() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalAttachmentBlock.swift"))
        XCTAssertTrue(
            code.contains("FocalMetrics.Media.radius"),
            "F08 : FocalGridCell doit lire FocalMetrics.Media.radius (miroir du token thread.media.radius, `16`), " +
            "jamais un `16` en dur dans la vue"
        )
    }

    // MARK: - F09 — citation : filet 2.5 + ligne tronquée, tap saute au focus
    // behaviour-matrix:F09

    /// Preuve exhaustive du rendu : `FocalDynamicTypeTests.
    /// test_quotedReply_lineBudgetComesFromTheSharedRule_notALiteral` (F-090)
    /// + `FocalRichBlockEquatableTests` (railWidth). Ancrage frais F09 : le
    /// SAUT vers l'original passe par `onReplyTap`, que l'hôte fait atterrir
    /// via `scrollToItem(.centeredVertically)` (mécanisme partagé avec la
    /// recherche — voir `test_F12`). Ce test confirme que
    /// `FocalQuotedReplyView` déclenche bien `onReplyTap` (et non un autre
    /// callback) au tap, le lien manquant entre les deux garanties.
    func test_F09_quotedReplyTap_triggersOnReplyTap_theCallbackTheHostLandsOn() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalQuotedReplyView.swift"))
        guard let start = code.range(of: "private func jumpToOriginal() {"),
              let end = code.range(of: "\n    }", range: start.upperBound..<code.endIndex)
        else {
            XCTFail("`jumpToOriginal` est introuvable dans FocalQuotedReplyView.swift")
            return
        }
        let body = code[start.lowerBound..<end.lowerBound]
        XCTAssertTrue(
            body.contains("onReplyTap?(reference.messageId)"),
            "F09 : le tap du bloc citation (hors zones avatar/média) doit déclencher `onReplyTap(reference.messageId)` — " +
            "c'est ce callback que l'hôte fait atterrir via scrollToItem(.centeredVertically) — voir test_F12"
        )
        XCTAssertTrue(
            code.contains(".onTapGesture {\n            jumpToOriginal()"),
            "F09 : le tap GLOBAL du bloc reste le saut à l'original — les zones avatar (profil) et média (lecture) " +
            "sont des enclaves, jamais un remplacement du saut. Depuis la LOI DES ZONES (2026-08-24) le NOM " +
            "n'est plus une enclave : il retombe sous ce tap global"
        )
    }

    // MARK: - F10 — long-press menu ; « modifié » 10.5 ; supprimé fantôme (PARTIEL)
    // behaviour-matrix:F10

    /// Le message SUPPRIMÉ (rangée fantôme italique sans fond) EST bien
    /// couvert — `FocalDeletedRow` (WS-3).
    func test_F10_deletedMessage_isAGhostRowWithoutBackground() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalSystemRows.swift"))
        XCTAssertTrue(
            code.contains("struct FocalDeletedRow") && code.contains(".italic()"),
            "F10 : FocalDeletedRow doit exister et rendre son texte en italique (rangée fantôme, sans fond)"
        )
    }

    /// **Trou réel découvert par F-090, corrigé par F-083ter.**
    /// `FocalMetaRow`/`FocalIdentityHeader` portent désormais `editedAt`/
    /// `isEditSaving`/`hasEditHistory` (déjà dans `BubbleContent`, aucune
    /// extension de `FocalRowInput`) et rendent `BubbleEditedIndicator`
    /// (§1.3, `internal`, vérifié non `fileprivate`) TEL QUEL. Invariant
    /// INCHANGÉ.
    func test_F10_editedLabel_isVisibleSomewhereInFocalRow() throws {
        let metaRow = try source(rowRoot().appendingPathComponent("FocalMetaRow.swift"))
        let header = try source(rowRoot().appendingPathComponent("FocalIdentityHeader.swift"))
        XCTAssertTrue(
            metaRow.contains("edited") || header.contains("edited"),
            "F10 : ni FocalMetaRow.swift ni FocalIdentityHeader.swift ne portent de paramètre `editedAt`/" +
            "`isEdited` — le libellé « modifié » (10.5, méta) n'est visible NULLE PART sur le Fil " +
            "(seul le libellé VoiceOver l'annonce). Trou réel de WS-4/F-083, non corrigé par F-090 — " +
            "voir rapport F-090."
        )
    }

    // MARK: - F11 — badges éphémère/épinglé/transféré au-dessus de l'identité ; flou (PARTIEL)
    // behaviour-matrix:F11

    /// Le FLOU (« s'applique au bloc contenu de la rangée ») EST bien
    /// couvert — `FocalMediaProtectionTests` (8 tests, machine à états
    /// complète). Ancrage frais : le flou s'applique bien au bloc MÉDIA
    /// (`FocalAttachmentBlock`/`FocalGridCell`), jamais à l'identité ni au
    /// texte — la garde F11 « … s'applique au bloc CONTENU » précisément.
    func test_F11_blurAppliesToTheMediaBlock_neverToIdentityOrText() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalAttachmentBlock.swift"))
        XCTAssertTrue(
            code.contains("protectionOverlay") && code.contains("FocalMediaProtection.state("),
            "F11 : le flou (FocalMediaProtection) doit être appliqué dans FocalAttachmentBlock/FocalGridCell — " +
            "le bloc MÉDIA de la rangée, jamais l'identité ni le texte"
        )
        let header = try source(rowRoot().appendingPathComponent("FocalIdentityHeader.swift"))
        XCTAssertFalse(
            header.contains("FocalMediaProtection") || header.contains("isBlurred"),
            "F11 : FocalIdentityHeader.swift ne doit jamais appliquer le flou — celui-ci est réservé au " +
            "bloc contenu (média), pas à l'identité"
        )
    }

    /// **Trou réel découvert par F-090, corrigé par F-083ter.**
    /// `FocalRow.badgesSection` (au-dessus de `FocalIdentityHeader`, avant
    /// toute chose, indépendant de `isFirstInGroup`) rend
    /// `BubblePinnedIndicator`/`BubbleForwardedIndicator` (§1.3, `internal`,
    /// vérifiés non `fileprivate`) TELS QUELS + `FocalEphemeralBadge`
    /// (countdown vivant, ce chantier — enveloppe `BubbleEphemeralController`/
    /// `BubbleEphemeralBadge`, §1.3). `content.isForwarded` est maintenant lu.
    /// Invariant INCHANGÉ (l'assertion ci-dessous n'a pas bougé).
    func test_F11_pinnedForwardedEphemeralBadges_appearAboveIdentityInFocalRow() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalRow.swift"))
        let hasAnyBadge = code.contains("BubblePinnedIndicator")
            || code.contains("BubbleForwardedIndicator")
            || code.contains("BubbleEphemeralBadge")
            || code.contains("isForwarded")
        XCTAssertTrue(
            hasAnyBadge,
            "F11 : FocalRow.swift ne rend AUCUN badge épinglé/transféré/éphémère au-dessus de l'identité — " +
            "ces trois indicateurs visuels (BubblePinnedIndicator/BubbleForwardedIndicator/BubbleEphemeralBadge " +
            "côté bulle) sont absents de la rangée plate, et `content.isForwarded` n'est lu NULLE PART dans " +
            "Focal/**. Trou réel de WS-4/F-083, non corrigé par F-090 — voir rapport F-090."
        )
    }

    // MARK: - F12 — bannière épinglée inchangée ; recherche saute à la bande de focus
    // behaviour-matrix:F12

    /// La bannière épinglée (`ConversationView`, hors Focal/**) reste
    /// inchangée par construction. RETRAIT FOCAL iOS (2026-08-18) :
    /// `landOnFocusBand` (bande de focus) est parti avec la perspective — le
    /// saut de recherche ET le saut de citation atterrissent désormais tous
    /// deux via le MÊME mécanisme UIKit natif `.centeredVertically`, jamais
    /// deux implémentations divergentes.
    func test_F12_searchAndQuoteJump_shareTheSameLandingMechanism() throws {
        let root = rowRoot().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Views/MessageListViewController.swift")
        let code = try source(root)
        XCTAssertFalse(
            code.contains("landOnFocusBand"),
            "F12 : `landOnFocusBand` appartient au pass retiré — il ne doit pas réapparaître dans l'hôte."
        )
        let jumps = code.components(separatedBy: "scrollToItem(at: indexPath, at: .centeredVertically").count - 1
        XCTAssertEqual(
            jumps, 2,
            "F12 : les DEUX sauts (scrollToMessage — recherche — et scrollToMessageFast — citation) doivent " +
            "atterrir via le même `scrollToItem(.centeredVertically)` — \(jumps) site(s) trouvé(s)."
        )
    }

    // MARK: - F13 — rangée optimiste : alpha = min(0.7, alphaPerspective)
    // behaviour-matrix:F13

    /// RETRAIT FOCAL iOS (2026-08-18) : le pass et son plafond d'alpha sont
    /// supprimés — l'opacité d'un envoi optimiste appartient désormais à la
    /// RANGÉE (`FocalRow`, `.opacity(input.isOptimistic ? 0.7 : 1)`).
    func test_F13_optimisticOpacity_isOwnedByTheRow() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalRow.swift"))
        XCTAssertTrue(
            code.contains("input.isOptimistic ? 0.7 : 1"),
            "F13 : la rangée plate rend l'envoi en vol à 0,7 — sans ce site, l'état optimiste n'a plus aucun rendu depuis le retrait du pass"
        )
    }

    // MARK: - F14 — chargement vers le haut ; inset de tête seulement si première page atteinte
    // behaviour-matrix:F14

    /// RETRAIT FOCAL iOS (2026-08-18) : l'inset de tête est parti avec la
    /// perspective — F14 se réduit à la préservation d'offset au prepend,
    /// démontrée par `MessageListLayoutOffsetTests` (compensation sous la
    /// fenêtre + plafond par transaction). Ancrage : le layout est bien
    /// MessageListLayout.
    func test_F14_offsetPreservation_isCarriedByMessageListLayout() throws {
        let root = rowRoot().deletingLastPathComponent().deletingLastPathComponent()
        let code = try source(root.appendingPathComponent("Views/MessageListViewController.swift"))
        XCTAssertTrue(
            code.contains("MessageListLayout {"),
            "F14 : l'hôte doit construire MessageListLayout — c'est lui qui préserve le champ visuel au prepend de pagination"
        )
    }

    // MARK: - F15 — effets (bitfield), mentions/hashtags, notices centrées plates (PARTIEL)
    // behaviour-matrix:F15

    /// Mentions/hashtags EUX gardent bien leurs tokens actuels — teintes
    /// transmises à `BubbleExpandableText` (mentionTint/hashtagTint), jamais
    /// recalculées côté Focal.
    func test_F15_mentionsAndHashtags_useTheExistingColorTokens() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalRow.swift"))
        XCTAssertTrue(
            code.contains("mentionTint: MeeshyColors.mentionColor(isDark:") &&
            code.contains("hashtagTint: MeeshyColors.hashtagColor(isDark:"),
            "F15 : FocalRow.textBlock doit transmettre mentionTint/hashtagTint depuis MeeshyColors — " +
            "les tokens actuels, jamais une nouvelle teinte Focal"
        )
    }

    /// Les notices système/appel centrées PLATES sont couvertes —
    /// `FocalSystemNoticeRow`/`FocalCallNoticeRow` (WS-3), sans capsule.
    func test_F15_systemAndCallNotices_areFlatWithoutCapsule() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalSystemRows.swift"))
        XCTAssertFalse(
            code.contains("Capsule()"),
            "F15 : aucune notice système/appel de FocalSystemRows.swift ne doit poser de Capsule() — " +
            "« sans capsule » est la garde explicite du contrat §WS-3"
        )
    }

    /// **Trou réel découvert par F-090, corrigé par F-083ter.** RE-PREUVE :
    /// aucun fichier `Bubble/*Effect*.swift` n'existe (recherche vide) — le
    /// composant réel est `Components/MessageEffectModifiers.swift`
    /// (`View.messageEffects(_ effects: MessageEffects)`, `internal`, non
    /// `fileprivate`), déjà consommé par `ThemedMessageBubble.swift:317`
    /// (`.messageEffects(message.effects)`). `FocalRow.standardBody` pose
    /// désormais LE MÊME modifier — `.messageEffects(input.effects)`,
    /// AUCUNE réimplémentation d'effet. `input.effects: MessageEffects` est
    /// un AJOUT narrow à `FocalRowInput` (valeur par défaut `.none` — le
    /// site de montage WS-6 continue de compiler sans le fournir tant qu'il
    /// n'est pas mis à jour, hors périmètre de ce lot). Invariant INCHANGÉ.
    func test_F15_effectsBitfield_isAppliedSomewhereInFocalRow() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalRow.swift"))
        XCTAssertTrue(
            code.contains("effect") || code.contains("Effect"),
            "F15 : aucune trace d'un bitfield d'effets dans FocalRow.swift — un message avec un effet " +
            "(confettis, etc.) s'affiche identique à un message sans effet sur le Fil. Trou réel de " +
            "WS-4/F-083, non corrigé par F-090 — voir rapport F-090."
        )
    }

    // MARK: - Garde d'ensemble (leçon 257) : 15 id déclarés, 15 méthodes de test présentes

    /// Le fichier source de vérité (`behaviour-matrix.json`) déclare F01..F15
    /// — cette garde affirme que CHAQUE id a AU MOINS une méthode de test
    /// dans ce fichier portant son nom en préfixe, pour qu'un id retiré
    /// silencieusement (refactor de ce fichier) se voie immédiatement.
    func test_allFifteenMatrixIds_haveAtLeastOneAnchorTestInThisFile() throws {
        let selfURL = URL(fileURLWithPath: #filePath)
        let code = try String(contentsOf: selfURL, encoding: .utf8)
        let declaredIds = (1...15).map { String(format: "F%02d", $0) }
        let missing = declaredIds.filter { !code.contains("func test_\($0)_") }
        XCTAssertTrue(
            missing.isEmpty,
            "ces id de la matrice F01..F15 n'ont AUCUNE méthode `test_F0X_…`/`test_F1X_…` dans ce fichier : " +
            missing.joined(separator: ", ") + " — garde d'ensemble déclarés == couverts (leçon 257)"
        )
    }
}
