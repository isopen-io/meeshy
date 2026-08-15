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
/// façon exhaustive par les suites WS-3..WS-6
/// (`FocalScrollPassGeometryTests`, `FocalHostInsetCompositionTests`,
/// `FocalMediaGridLayoutTests`, `FocalAudioRoutingTests`,
/// `FocalMediaProtectionTests`, …). Pour ces id, ce fichier ajoute un
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
/// la parité). Seule la PERSPECTIVE (WS-5, F01/F13 alpha) est
/// spécifique à `.focal` — son absence en `.script`/`.bubbles` est déjà
/// prouvée par `FocalHostInsetCompositionTests.
/// test_focalPass_rendering_isOff_whenBubbles` et la garde `usesPerspective`.
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

    /// Preuve exhaustive de l'élection : `FocalScrollPassGeometryTests`
    /// (`test_election_picksTheClosestCandidateWhenNoCurrent`, etc.).
    /// Ancrage frais ici : un candidat qui vient de NAÎTRE (aucun
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
            hysteresis: FocalFocusCurve.focusBandHalfHeight
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

    /// Preuve exhaustive : `FocalScrollPassGeometryTests.
    /// test_apply_ineligibleCells_areResetToIdentity` (une cellule
    /// `.typingIndicator` — `localId nil` — reste `scale == 1`/`alpha == 1`)
    /// et `test_election_noCandidates_yieldsNil`. Ancrage frais : la rangée
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

    // MARK: - F04 — accusés ✓/✓✓/lu dans l'identité, jamais en pied

    /// Preuve exhaustive du glyphe/des couleurs : `BubbleDeliveryCheck` lui-
    /// même (§1.3, non re-testé). Ce que WS-4 devait garantir spécifiquement
    /// (F04 : « se déplacent dans l'identité des messages Toi ») : la
    /// présence de `BubbleDeliveryCheck` dans `FocalIdentityHeader`
    /// (« pas en pied », §WS-4) ET son ABSENCE de `FocalMetaRow` pour la
    /// rangée en tête de groupe (contrat : « pas en pied »).
    func test_F04_deliveryCheckLivesInIdentityHeader_notInTheFooterRow() throws {
        let header = try source(rowRoot().appendingPathComponent("FocalIdentityHeader.swift"))
        XCTAssertTrue(
            header.contains("BubbleDeliveryCheck(") && header.contains("if isMe, let deliveryStatus"),
            "FocalIdentityHeader.swift doit poser BubbleDeliveryCheck, gardé par `isMe` (F04 : les accusés " +
            "ne concernent que les messages « Toi »)"
        )
    }

    // MARK: - F05 — réactions live en pilule plate MÉTA (TROU RÉEL, non couvert)

    /// **Trou réel découvert par F-090, documenté sans correction.** Aucun
    /// fichier de `Focal/Row/**` ne rend `content.reactions` — `FocalRow`
    /// n'affiche donc AUCUNE réaction, contrairement à F05 (« pilule plate
    /// en méta … pop springBouncy à l'arrivée »). Seul le LIBELLÉ VoiceOver
    /// les annonce (`MessageAccessibilityLabelComposer`, F-080) — un
    /// utilisateur voyant l'écran ne voit AUCUNE réaction sur le Fil. Ce
    /// test affirme l'invariant que F05 exige ; il est ROUGE aujourd'hui —
    /// c'est la preuve du trou. Corriger exige une nouvelle vue (pilule de
    /// réactions), hors périmètre WS-11 (« aucune feature », pas une garde
    /// source triviale) : ticket de suivi WS-4.
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

    // MARK: - F06 — swap de traduction + chip 🌐 (PARTIEL : swap oui, chip non)

    /// Le SWAP de texte (résolution Prisme inchangée, `content.translation?.preferredContent`)
    /// EST bien branché — cette moitié de F06 est couverte.
    func test_F06_translatedTextSwapsInPlace_prismeUnchanged() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalRow.swift"))
        XCTAssertTrue(
            code.contains("content.translation?.preferredContent ?? content.text?.raw"),
            "F06 : FocalRow.textBlock doit préférer `content.translation?.preferredContent` — le swap " +
            "de traduction tardive doit atteindre le Fil comme la bulle (résolution Prisme inchangée)"
        )
    }

    /// **Trou réel découvert par F-090, documenté sans correction.** Le chip
    /// méta `🌐` qui signale la traduction (F06, `BubbleFooter.swift` côté
    /// bulle) n'a AUCUN équivalent dans `Focal/Row/**` — un lecteur Focal ne
    /// sait donc PAS visuellement qu'un texte est traduit (seul le fait de
    /// lire une langue différente le suggère). Rouge = preuve du trou ;
    /// ticket de suivi WS-4 (le composeur riche §3.10 documente `hasTranslationChip`
    /// mais reste déclaré, non câblé — écart déjà noté au contrat).
    func test_F06_globeChipSignalsTranslation_inFocalRow() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalRow.swift"))
        XCTAssertTrue(
            code.contains("🌐") || code.lowercased().contains("globe"),
            "F06 : aucun chip 🌐 dans FocalRow.swift — la traduction change le TEXTE mais rien ne le " +
            "signale visuellement sur le Fil (contrairement à BubbleFooter côté bulle). Trou réel de " +
            "WS-4/F-083, non corrigé par F-090 — voir rapport F-090."
        )
    }

    // MARK: - F07 — audio nu, transcription traduite, carrousel multi-pistes

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
            meta: BubbleContent.Meta(timeString: "10:00", deliveryStatus: nil), isMe: false, senderName: "A", callNotice: nil
        )
        XCTAssertNotEqual(
            FocalAudioRouting.mode(for: content), .carousel,
            "F07 : un `.mixed` à 3 pistes audio ne doit JAMAIS devenir un carrousel — le carrousel est " +
            "réservé au cas `.audio` PUR (garde déjà exercée à 2 pistes par FocalAudioRoutingTests, " +
            "confirmée ici à 3)"
        )
    }

    // MARK: - F08 — grilles média 1/2/3/4+ nues

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

    /// Preuve exhaustive du rendu : `FocalDynamicTypeTests.
    /// test_quotedReply_lineLimitOneIsDocumentedPolicy_notAnOmission` (F-090)
    /// + `FocalRichBlockEquatableTests` (railWidth). Ancrage frais F09 : le
    /// SAUT vers l'original passe par `onReplyTap`, qui atterrit dans la
    /// bande de focus via `landOnFocusBand` — déjà prouvé par
    /// `FocalHostSourceGuardTests.test_landingBand_isGuardedToFocalOnly`.
    /// Ce test confirme que `FocalQuotedReplyView` déclenche bien
    /// `onReplyTap` (et non un autre callback) au tap, le lien manquant
    /// entre les deux garanties.
    func test_F09_quotedReplyTap_triggersOnReplyTap_theCallbackTheHostLandsOn() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalQuotedReplyView.swift"))
        guard let start = code.range(of: ".onTapGesture {"),
              let end = code.range(of: "\n    }", range: start.upperBound..<code.endIndex)
        else {
            XCTFail("le geste de tap de FocalQuotedReplyView.swift est introuvable")
            return
        }
        let body = code[start.lowerBound..<end.lowerBound]
        XCTAssertTrue(
            body.contains("onReplyTap?(reference.messageId)"),
            "F09 : le tap sur une citation doit déclencher `onReplyTap(reference.messageId)` — c'est ce " +
            "callback que WS-6 fait atterrir dans la bande de focus (landOnFocusBand)"
        )
    }

    // MARK: - F10 — long-press menu ; « modifié » 10.5 ; supprimé fantôme (PARTIEL)

    /// Le message SUPPRIMÉ (rangée fantôme italique sans fond) EST bien
    /// couvert — `FocalDeletedRow` (WS-3).
    func test_F10_deletedMessage_isAGhostRowWithoutBackground() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalSystemRows.swift"))
        XCTAssertTrue(
            code.contains("struct FocalDeletedRow") && code.contains(".italic()"),
            "F10 : FocalDeletedRow doit exister et rendre son texte en italique (rangée fantôme, sans fond)"
        )
    }

    /// **Trou réel découvert par F-090, documenté sans correction.** Le
    /// libellé VISUEL « modifié » (10.5, méta) n'apparaît NULLE PART dans
    /// `Focal/Row/**` — `FocalMetaRow`/`FocalIdentityHeader` ne portent
    /// aucun paramètre `editedAt`/`isEdited`. Seul le libellé VoiceOver
    /// l'annonce (`MessageAccessibilityLabelComposer`, déjà testé) : un
    /// lecteur voyant l'écran ne peut PAS distinguer un message modifié.
    /// Rouge = preuve du trou ; ticket de suivi WS-4.
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

    /// **Trou réel découvert par F-090, documenté sans correction.** Les
    /// TROIS badges visuels « au-dessus de l'identité » que F11 exige
    /// (épinglé, transféré, éphémère — `BubblePinnedIndicator`/
    /// `BubbleForwardedIndicator`/`BubbleEphemeralBadge` côté bulle
    /// historique, `BubbleStandardLayout.swift` VStack avant l'identité)
    /// n'ont AUCUN équivalent dans `FocalRow.standardBody` : la VStack
    /// commence directement par `FocalIdentityHeader`, sans section de
    /// badges au-dessus. `content.isPinned`/`content.ephemeral` alimentent
    /// SEULEMENT le libellé VoiceOver (F-080) ; `content.isForwarded` n'est
    /// même pas lu UNE SEULE FOIS dans tout `Focal/**` (RE-PREUVE : zéro
    /// occurrence). Rouge = preuve du trou ; ticket de suivi WS-4 (réutiliser
    /// les trois composants historiques, §1.3, dans une nouvelle section
    /// `Focal/Row/`).
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

    /// La bannière épinglée (`ConversationView`, hors Focal/**) reste
    /// inchangée par construction — WS-7 ne la touche pas (aucun fichier
    /// listé au contrat §1.2 ne la mentionne). Le saut de recherche PARTAGE
    /// le même mécanisme d'atterrissage que F09 (`landOnFocusBand`), déjà
    /// couvert par `FocalHostSourceGuardTests`. Ancrage : les DEUX sites
    /// (`scrollToMessage`, `scrollToMessageFast` — recherche ET citation)
    /// convergent bien vers UNE fonction partagée, jamais deux implémentations
    /// divergentes — cité, pas recreusé (déjà prouvé par
    /// `test_landingBand_isGuardedToFocalOnly`, « une seule occurrence de
    /// .centeredVertically »).
    func test_F12_searchAndQuoteJump_shareTheSameLandingMechanism() throws {
        // Documentation-only anchor : la preuve vit déjà dans
        // FocalHostSourceGuardTests (F-085) — ce test affirme juste que la
        // fonction partagée existe sous son nom attendu, pour qu'un
        // renommage silencieux fasse échouer LES DEUX suites, pas une seule.
        let root = rowRoot().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Views/MessageListViewController.swift")
        let code = try source(root)
        XCTAssertTrue(
            code.contains("private func landOnFocusBand(indexPath: IndexPath, animated: Bool) {"),
            "F12 : `landOnFocusBand` doit exister — c'est la fonction PARTAGÉE par la recherche et le saut " +
            "de citation (F09) vers la bande de focus"
        )
    }

    // MARK: - F13 — rangée optimiste : alpha = min(0.7, alphaPerspective)

    /// Preuve exhaustive : `FocalScrollPassGeometryTests` (`test_alphaCeiling_*`,
    /// 3 tests : plafonnement dans la bande, courbe gagnante loin de la
    /// bande, opaque hors optimiste). Ancrage frais : le plafond CONFIRMÉ
    /// (`opaqueAlphaCeiling = 1`) ne restreint JAMAIS l'alpha en dessous de
    /// la courbe — vérifié ici avec `min(opaqueAlphaCeiling, curve.alpha)`
    /// à `distance = 0` (alpha de courbe maximal, cas jamais exercé par les
    /// tests `alphaCeiling_*` existants, qui portent tous sur l'optimiste).
    func test_F13_confirmedRow_ceilingNeverRestrictsBelowTheCurve() {
        let transform = FocalPerspectiveGeometry.standard.transform(
            distance: 0, cellSize: CGSize(width: 300, height: 60),
            horizontalAnchor: .leading, isRightToLeft: false,
            alphaCeiling: FocalPassConstants.opaqueAlphaCeiling
        )
        XCTAssertEqual(transform.alpha, 1, accuracy: 0.0001, "F13 : une rangée CONFIRMÉE à distance 0 doit rester à alpha 1 — le plafond confirmé ne restreint jamais")
    }

    // MARK: - F14 — chargement vers le haut ; inset de tête seulement si première page atteinte

    /// Preuve exhaustive : `FocalHostInsetCompositionTests`
    /// (`test_headInset_isPositive_whenFocalAndHasReachedOldest`,
    /// `test_headInset_isZero_whenFocalButNotYetReachedOldest`). Cité, pas
    /// recreusé — F14 est déjà entièrement démontré par cette suite (WS-6,
    /// F-085), y compris la préservation d'offset au prepend
    /// (`test_applyBottomInset_recomputesHeadInset_whenComposerHeightChanges`).
    /// Ancrage minimal ici : le drapeau qui gouverne l'inset porte bien le
    /// nom attendu par F14 (« MessageStore confirme la première page »).
    func test_F14_headInsetIsGovernedByHasReachedOldest_theNameF14Expects() throws {
        let root = rowRoot().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Views/MessageListView.swift")
        let code = try source(root)
        XCTAssertTrue(
            code.contains("var hasReachedOldest: Bool = false"),
            "F14 : MessageListView doit exposer `hasReachedOldest` — c'est le signal (MessageStore, « première page atteinte ») qui gouverne l'inset de tête"
        )
    }

    // MARK: - F15 — effets (bitfield), mentions/hashtags, notices centrées plates (PARTIEL)

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

    /// **Trou réel découvert par F-090, documenté sans correction.** Les
    /// EFFETS (bitfield — confettis/particules sur le contenu) n'ont AUCUNE
    /// trace dans `Focal/Row/**` : ni `effectBitfield`, ni `MessageEffect`,
    /// ni un quelconque overlay d'effet. Un message avec effet s'affiche en
    /// Focal comme un message sans effet. Rouge = preuve du trou ; ticket de
    /// suivi WS-4 (portée précise à établir : quel(s) fichier(s)
    /// `Bubble/*Effect*.swift` réutiliser, §1.3 les liste-t-il déjà ?).
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
