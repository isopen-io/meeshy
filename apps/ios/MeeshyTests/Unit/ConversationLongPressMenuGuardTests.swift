import XCTest
@testable import Meeshy

/// **#4004 — le menu longpress custom ferme le clavier avant de paraître.**
/// **#11208 — il s'ouvre sur la cellule elle-même, à sa place, sans défilement
/// préalable, avec une seule haptique.** Le recentrage d'un message trop bas
/// (#4004) passait par un défilement de la liste puis un délai : la loi de
/// placement de l'overlay (`MessageOverlayRevealLaw`) remonte désormais le
/// cluster, et la liste ne bouge plus sous le doigt.
///
/// Périmètre : le menu longpress CUSTOM (`MessageOverlayMenu`, < iOS 26)
/// piloté par `overlayState.showOverlayMenu`. Le menu NATIF (`.contextMenu`,
/// iOS 26+) est présenté par le système sans point d'interception AVANT
/// ouverture — hors périmètre de cette garde.
///
/// Même patron que `ConversationEditDraftGuardTests` : garde de SOURCE,
/// suite tournée sans UIKit réel (R5/R15).
final class ConversationLongPressMenuGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
        return AppSourceGuard.stripComments(
            try AppSourceGuard.text(at: root.appendingPathComponent(relativePath))
        )
    }

    private func body(of anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var result = ""
        for character in code[start.lowerBound...] {
            result.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return result }
            }
        }
        return nil
    }

    // MARK: - `presentLongPressMenu` ferme le clavier AVANT de présenter

    func test_presentLongPressMenu_dismissesKeyboardAndOptionsBeforePresenting() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let fn = body(of: "func presentLongPressMenu(", in: code) else {
            return XCTFail("`presentLongPressMenu` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("isTyping = false"),
            "`presentLongPressMenu` doit fermer le clavier (`isTyping = false`) avant de présenter le menu."
        )
        XCTAssertTrue(
            fn.contains("composerState.showOptions = false"),
            "`presentLongPressMenu` doit fermer le panneau d'options du composer s'il était ouvert."
        )
        guard let dismissRange = fn.range(of: "isTyping = false"),
              let presentRange = fn.range(of: "showOverlayMenu = true") else {
            return XCTFail("Ancres `isTyping = false` / `showOverlayMenu = true` introuvables.")
        }
        XCTAssertTrue(
            dismissRange.lowerBound < presentRange.lowerBound,
            "Le clavier doit se fermer AVANT que le menu ne se présente, jamais après."
        )
    }

    // MARK: - #11208 — le cadre de la cellule est GARDÉ, l'aperçu s'ouvre à sa place

    /// Le cadre que l'appel apporte (`cellFrameInWindow`) devient la source de
    /// l'aperçu. Il était reçu puis jeté : l'overlay lisait `frameTracker`, vide
    /// hors des bulles suivies, et retombait sur un aperçu reconstruit.
    func test_presentLongPressMenu_storesTheCellFrame_asTheOverlaySource() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let fn = body(of: "func presentLongPressMenu(", in: code) else {
            return XCTFail("`presentLongPressMenu` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("overlayState.overlaySourceFrame = "),
            "`presentLongPressMenu` doit garder le cadre reçu de `cellFrameInWindow` dans `overlaySourceFrame`."
        )
        XCTAssertFalse(
            fn.contains("frameTracker.frame(for:"),
            "`presentLongPressMenu` ne lit pas `frameTracker` : `MessageFramePreferenceKey` ne traverse la "
                + "frontière UIKit qu'en mode Rivière (seul site qui la publie réellement)."
        )
        guard let storeRange = fn.range(of: "overlayState.overlaySourceFrame = "),
              let presentRange = fn.range(of: "showOverlayMenu = true") else {
            return XCTFail("Ancres `overlaySourceFrame` / `showOverlayMenu = true` introuvables.")
        }
        XCTAssertTrue(storeRange.lowerBound < presentRange.lowerBound,
                      "Le cadre est posé AVANT la présentation : le premier rendu de l'aperçu le lit.")
    }

    func test_overlayState_declaresTheSourceFrame() throws {
        let code = try source("Features/Main/Views/ConversationOverlayState.swift")
        XCTAssertTrue(code.contains("var overlaySourceFrame: CGRect? = nil"),
                      "`ConversationOverlayState` porte le cadre source de l'aperçu, `nil` hors appui long.")
    }

    func test_overlayLayer_readsTheStoredFrameBeforeTheTracker() throws {
        let code = try source("Features/Main/Views/ConversationLayers/ConversationBodyPresentations.swift")
        XCTAssertTrue(
            code.contains("bubbleFrame: overlayState.overlaySourceFrame ?? frameTracker.frame(for: msg.id) ?? .zero"),
            "L'overlay lit d'abord le cadre gardé, puis le suivi des bulles (Rivière), puis rien."
        )
    }

    /// Plus de défilement préalable ni de présentation différée : la loi de
    /// placement de l'overlay remonte le cluster, la liste ne bouge pas sous le
    /// doigt et le menu paraît dans la même image que le geste.
    func test_presentLongPressMenu_presentsAtOnce_withoutScrollingFirst() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let fn = body(of: "func presentLongPressMenu(", in: code) else {
            return XCTFail("`presentLongPressMenu` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertFalse(fn.contains("asyncAfter"), "La présentation n'attend plus un défilement.")
        XCTAssertFalse(fn.contains("scrollToMessageTrigger"), "L'appui long ne fait plus défiler la liste.")
        XCTAssertFalse(code.contains("longPressRepositionDelay"), "Le délai de repositionnement n'a plus de raison d'être.")
    }

    // MARK: - #11208 — une seule haptique, celle du geste

    func test_openingChain_firesASingleHaptic_theGesturesOwn() throws {
        let list = try source("Features/Main/Views/BubbleSwipeContainer.swift")
        guard let gesture = body(of: "private struct ConditionalBubbleLongPress", in: list) else {
            return XCTFail("`ConditionalBubbleLongPress` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertEqual(gesture.components(separatedBy: "HapticFeedback.").count - 1, 1,
                       "Le geste porte l'unique haptique de l'ouverture.")

        let host = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let present = body(of: "func presentLongPressMenu(", in: host) else {
            return XCTFail("`presentLongPressMenu` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertFalse(present.contains("HapticFeedback."), "La présentation ne vibre pas une seconde fois.")

        let menu = try source("Features/Main/Components/MessageOverlayMenu.swift")
        guard let entrance = body(of: "private func enter()", in: menu) else {
            return XCTFail("L'entrée de l'overlay (`enter()`) introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertFalse(entrance.contains("HapticFeedback."), "L'entrée de l'overlay ne vibre pas : le geste l'a déjà fait.")
        XCTAssertTrue(menu.contains(".onAppear { enter() }"), "L'overlay entre par `enter()`, et seulement par elle.")
    }

    // MARK: - #11208 — « Réduire les animations » est lu à l'entrée

    func test_entrance_readsReduceMotion_andFadesInsteadOfSpringing() throws {
        let menu = try source("Features/Main/Components/MessageOverlayMenu.swift")
        XCTAssertTrue(menu.contains("@Environment(\\.accessibilityReduceMotion)"),
                      "L'overlay lit « Réduire les animations ».")
        guard let entrance = body(of: "private func enter()", in: menu) else {
            return XCTFail("L'entrée de l'overlay (`enter()`) introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(entrance.contains("reduceMotion"), "L'entrée choisit sa courbe selon « Réduire les animations ».")
        XCTAssertTrue(entrance.contains(".easeOut(duration: Self.reducedMotionFadeDuration)"),
                      "Sous « Réduire les animations », l'entrée est un fondu.")
    }

    // MARK: - #11208 — l'aperçu est la cellule, plus une bulle reconstruite

    func test_legacyRebuiltPreview_isGone() throws {
        let menu = try source("Features/Main/Components/MessageOverlayMenu.swift")
        for removed in ["previewTextBubble", "previewFileRow", "clearPreviewContent", "func messagePreview("] {
            XCTAssertFalse(menu.contains(removed), "`\(removed)` reconstruisait une bulle générique — il ne revient pas.")
        }
        XCTAssertTrue(menu.contains("MessageOverlayCellPreview("), "L'aperçu monte la cellule du fil.")
    }

    func test_preview_wearsTheThreadSkin() throws {
        let menu = try source("Features/Main/Components/MessageOverlayMenu.swift")
        guard let range = menu.range(of: "MessageOverlayCellPreview(") else {
            return XCTFail("`MessageOverlayCellPreview(` introuvable — la garde ne mesurerait rien.")
        }
        let mount = String(menu[range.lowerBound...].prefix(600))
        XCTAssertTrue(mount.contains(".environment(\\.bubbleSkin, previewSkin)"),
                      "La peau du fil est posée sur l'aperçu, quelle que soit sa face.")
    }

    func test_preview_isChosenByTheReadingModeLaw() throws {
        let menu = try source("Features/Main/Components/MessageOverlayMenu.swift")
        XCTAssertTrue(menu.contains("MessageOverlayPreviewTouch.resolve(message: message, readingMode: threadLanguage.readingMode)"),
                      "La face de l'aperçu se lit au mode de lecture du fil, par la loi pure (#11339 : avec sa zone tactile).")
        let law = try source("Features/Main/Components/MessageOverlayPreviewMedia.swift")
        XCTAssertTrue(law.contains("MessageOverlayPreviewKind.resolve(readingMode: readingMode)"),
                      "La loi de l'aperçu choisit sa face par la loi du mode de lecture.")
        let cell = try source("Features/Main/Components/MessageOverlayCellPreview.swift")
        XCTAssertTrue(cell.contains("FocalRow(input:"), "La face rangée plate rend la `FocalRow` du fil.")
        XCTAssertTrue(cell.contains("ThemedMessageBubble"), "La face bulle rend la `ThemedMessageBubble` du fil.")
        XCTAssertTrue(cell.contains("OverlayProtectedPreview("), "La protection reste en amont des deux faces.")
    }

    /// La rangée plate lit l'objet du révélé des heures (`FocalRevealedTime`,
    /// `@EnvironmentObject`). La cellule le reçoit de sa liste ; l'overlay vit
    /// hors de la liste et doit le poser lui-même — sans lui, l'appui long en
    /// Script ou en Focal plante à l'ouverture.
    func test_flatRowPreview_receivesTheTimestampRevealObject() throws {
        let cell = try source("Features/Main/Components/MessageOverlayCellPreview.swift")
        XCTAssertTrue(cell.contains("@StateObject private var timestampReveal = FocalTimestampRevealState()"))
        guard let row = cell.range(of: "FocalRow(input:") else {
            return XCTFail("`FocalRow(input:` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(String(cell[row.lowerBound...].prefix(200)).contains(".environmentObject(timestampReveal)"),
                      "La rangée de l'aperçu reçoit son révélé des heures.")
    }

    /// #11222 — le voile de l'appui long est le MATÉRIAU SYSTÈME, posé par UN
    /// composant (`LongPressVeil`, MeeshyUI) sur les trois surfaces : le menu
    /// d'un message, l'aperçu d'une pièce et l'aperçu d'une conversation. L'hôte
    /// ne floute plus la conversation lui-même, et aucune surface ne réécrit sa
    /// propre matière ni son propre assombrissement.
    func test_longPressVeils_passThroughTheSystemMaterial_withoutLiteralBlur() throws {
        let host = try source("Features/Main/Views/ConversationLayers/ConversationBodyPresentations.swift")
        XCTAssertFalse(host.contains(".blur(radius:"), "L'hôte du menu ne floute plus la conversation : le voile est le matériau.")
        XCTAssertFalse(host.contains("ConversationOverlayBackdrop"), "Le rayon de flou propre au fil est retiré.")

        let veils = [
            "Features/Main/Components/MessageOverlayMenu.swift",
            "Features/Main/Components/MessagePieceOverlay.swift",
            "Features/Main/Views/ConversationListView+Overlays.swift",
        ]
        for path in veils {
            let code = try source(path)
            XCTAssertTrue(code.contains("LongPressVeil(visibility:"), "\(path) pose le voile commun.")
        }

        let menu = try source(veils[0])
        let piece = try source(veils[1])
        let list = try source(veils[2])
        XCTAssertFalse(menu.contains(".blur(radius:"), "Le menu d'un message ne pose aucun flou littéral.")
        XCTAssertFalse(piece.contains(".blur(radius:"), "L'aperçu d'une pièce ne pose aucun flou littéral.")
        XCTAssertFalse(menu.contains(".opacity(isVisible ? (isDark ? 0.5 : 0.4) : 0)"), "L'assombrissement propre au menu est retiré.")
        XCTAssertFalse(piece.contains(".opacity(isVisible ? 0.62 : 0)"), "L'assombrissement propre à la pièce est retiré.")
        XCTAssertFalse(list.contains(".fill(.ultraThinMaterial)"), "L'aperçu d'une conversation ne réécrit plus la matière.")
    }

    // MARK: - #11208 — le cadre de fenêtre passe dans le repère de l'overlay

    /// Le cadre de la cellule arrive en coordonnées de FENÊTRE ; l'overlay pose
    /// l'aperçu dans le repère de son `GeometryReader`. Sur iPad, la
    /// conversation vit à droite de la colonne de gauche : lire le cadre brut
    /// décalait la bulle de toute la largeur de cette colonne. Le corps ne le
    /// lit qu'une fois, pour le convertir (la loi est éprouvée par
    /// `MessageOverlayPreviewKindTests.test_sourceFrame_*`).
    func test_overlayBody_convertsTheWindowFrame_beforeAnyGeometry() throws {
        let menu = try source("Features/Main/Components/MessageOverlayMenu.swift")
        guard let body = body(of: "var body: some View", in: menu) else {
            return XCTFail("Le corps de `MessageOverlayMenu` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            body.contains("Self.sourceFrame(windowFrame: messageBubbleFrame, containerOrigin: geometry.frame(in: .global).origin)"),
            "Le cadre de fenêtre est ramené au repère de l'overlay avant toute géométrie.")
        XCTAssertEqual(body.components(separatedBy: "messageBubbleFrame").count - 1, 1,
                       "Le cadre brut n'est lu qu'une fois : pour sa conversion.")
    }

    /// La cellule n'a aucune marge verticale (`.margins(.all, 0)`) : son cadre
    /// commence au haut de la bulle. Un retrait de 8 pt supposé y ajoutait un
    /// saut de la bulle à l'ouverture.
    func test_overlay_assumesNoRowInsetAboveTheBubble() throws {
        let menu = try source("Features/Main/Components/MessageOverlayMenu.swift")
        XCTAssertFalse(menu.contains("bubbleRowInset"), "Aucun retrait vertical supposé entre la cellule et sa bulle.")
        XCTAssertFalse(menu.contains("rowInset"), "Aucun retrait vertical supposé entre la cellule et sa bulle.")
        let rows = try source("Features/Main/Views/MessageListViewController+Rows.swift")
        XCTAssertTrue(rows.contains(".margins(.all, 0)"), "La cellule de message est configurée sans marge.")
    }

    // MARK: - #11208 — la rangée plate ne se reconstruit pas à chaque image

    /// Le corps se réévalue à chaque image du glissement ; la rangée plate (et
    /// sa `BubbleContent`, balayage des liens compris) se construit une fois
    /// par jeu d'entrées, par sa mémoire.
    func test_flatRowFace_isBuiltThroughItsMemo() throws {
        let menu = try source("Features/Main/Components/MessageOverlayMenu.swift")
        guard let face = body(of: "private func previewFace(", in: menu) else {
            return XCTFail("`previewFace` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(face.contains("flatRowMemo.row(for: flatRowKey(availableWidth: width))"),
                      "La rangée plate passe par sa mémoire.")
        XCTAssertEqual(menu.components(separatedBy: "previewRow(availableWidth:").count - 1, 2,
                       "`previewRow` n'est appelée que par la mémoire (une déclaration, un appel).")
    }

    // MARK: - Le frame voyage AVEC l'appel, résolu côté UIKit (même patron qu'`onAddReaction`)

    func test_cellFrameInWindow_isTheSourceOfTruth_forTheStandardListMode() throws {
        let code = try source("Features/Main/Views/MessageListViewController.swift")
        guard let handler = body(of: "let longPressHandler: ((String) -> Void) = { [weak self] tappedId in", in: code) else {
            return XCTFail("Le wrapper `longPressHandler` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            handler.contains("self.onLongPress?(tappedId, self.cellFrameInWindow(messageId: tappedId))"),
            "Le wrapper `longPressHandler` doit résoudre le frame via `cellFrameInWindow` et le transmettre "
                + "AVEC l'id — même patron qu'`addReactionHandler`, la seule voie fiable en mode liste standard."
        )
    }

    func test_onLongPress_propertyType_carriesTheFrame() throws {
        let code = try source("Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(
            code.contains("var onLongPress: ((String, CGRect?) -> Void)?"),
            "`MessageListViewController.onLongPress` doit porter le frame (`CGRect?`), pas seulement l'id."
        )
    }

    // MARK: - `scrollToItem` est bien CENTRÉ (pas top/bottom)

    func test_scrollToMessage_centersVertically() throws {
        let code = try source("Features/Main/Views/MessageListViewController.swift")
        guard let fn = body(of: "func beginVerifiedScroll(", in: code) else {
            return XCTFail("`beginVerifiedScroll` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("at: .centeredVertically"),
            "Le scroll déclenché par le longpress doit centrer verticalement le message — sans ce "
                + "positionnement, remonter la liste ne garantit pas que le menu tienne entièrement à l'écran."
        )
    }

    // MARK: - Le site du longpress custom appelle le point d'entrée unique

    func test_customLongPressSite_callsPresentLongPressMenu() throws {
        let host = try source("Features/Main/Views/ConversationView.swift")
        let list = try source("Features/Main/Views/ConversationView+MessageListLayer.swift")
        XCTAssertTrue(
            list.contains("actions.presentMenu(msg, cellFrame, nil)")
                && host.contains("presentMenu: { presentLongPressMenu(for: $0, cellFrame: $1, pieceId: $2) }"),
            "Le site du longpress custom (la couche de la liste) doit appeler `presentLongPressMenu(for:cellFrame:)` "
                + "de l'hôte avec le frame reçu du callback — point d'entrée unique."
        )
    }

    // MARK: - L'état désactivé à l'ouverture est mémorisé ET restitué à la fermeture

    func test_presentLongPressMenu_savesStateBeforeDismissing() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let fn = body(of: "func presentLongPressMenu(", in: code) else {
            return XCTFail("`presentLongPressMenu` introuvable — la garde ne mesurerait rien.")
        }
        guard let saveRange = fn.range(of: "restoreAfterLongPress = (isTyping: isTyping, showOptions: composerState.showOptions)"),
              let dismissRange = fn.range(of: "isTyping = false") else {
            return XCTFail("Ancres de sauvegarde/désactivation introuvables.")
        }
        XCTAssertTrue(
            saveRange.lowerBound < dismissRange.lowerBound,
            "L'état doit être SAUVEGARDÉ avant d'être désactivé — sinon on mémorise déjà `false`."
        )
    }

    func test_restoreStateAfterLongPressIfNeeded_restoresSavedStateUnlessEditing() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let fn = body(of: "func restoreStateAfterLongPressIfNeeded(", in: code) else {
            return XCTFail("`restoreStateAfterLongPressIfNeeded` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("isTyping = saved.isTyping"),
            "La restitution doit reposer `isTyping` sur la valeur sauvegardée AVANT le longpress."
        )
        XCTAssertTrue(
            fn.contains("composerState.editingMessageId != nil"),
            "La restitution doit être COURT-CIRCUITÉE si une édition vient de démarrer — sinon elle "
                + "écraserait le clavier que `beginEdit` veut ouvert."
        )
    }

    // MARK: - Retour porteur 2026-08-27 : « Sélectionner » rouvrait le clavier
    // (le composer, REMPLACÉ par `selectionToolbar`, n'a rien à restituer).

    func test_restoreStateAfterLongPressIfNeeded_skipsRestore_whenSelectionModeJustStarted() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let fn = body(of: "func restoreStateAfterLongPressIfNeeded(", in: code) else {
            return XCTFail("`restoreStateAfterLongPressIfNeeded` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("guard !overlayState.isSelectionModeActive else { return }"),
            "Taper « Sélectionner » ferme le menu (`showOverlayMenu = false`) au MÊME dismiss que "
                + "`beginSelectionMode` — sans cette garde, la restitution rouvrirait le clavier sur un "
                + "composer que `selectionToolbar` a déjà remplacé."
        )
    }

    // MARK: - Le site de fermeture appelle la restitution via `adaptiveOnChange`, jamais `onChange` brut

    func test_dismissSite_wiresRestoration_viaAdaptiveOnChange() throws {
        let code = try source("Features/Main/Views/ConversationView.swift")
        XCTAssertTrue(
            code.contains(".adaptiveOnChange(of: overlayState.showOverlayMenu)"),
            "La fermeture du menu doit être observée via `.adaptiveOnChange`, convention du dépôt "
                + "(`ConversationView.body` a déjà crashé de profondeur de pile par `.onChange` brut empilé)."
        )
        XCTAssertTrue(
            code.contains("restoreStateAfterLongPressIfNeeded()"),
            "Le site de fermeture doit appeler `restoreStateAfterLongPressIfNeeded()`."
        )
        XCTAssertFalse(
            code.contains(".onChange(of: overlayState.showOverlayMenu)"),
            "Un `.onChange` brut a remplacé `.adaptiveOnChange` — régression de la convention du dépôt."
        )
    }

    // MARK: - #11339 — l'aperçu lit vocaux et vidéos, dans les trois modes

    /// Le masque de l'aperçu ne se perce qu'aux BOUTONS de lecture que les
    /// lecteurs du SDK déclarent (`MediaPlayControlAnchorKey`), jamais au
    /// lecteur entier : citation, pied et drapeaux, forme d'onde et surface de
    /// la vidéo restent sous le masque. Le vocal part par le ViewModel de l'hôte.
    func test_preview_playbackHoles_areThePlayButtonsOnly_andPlayThroughTheViewModel() throws {
        let router = try source("Features/Main/Views/Bubble/AudioBubbleRouter.swift")
        XCTAssertFalse(router.contains("PlaybackZone"), "Le lecteur entier n'est pas une zone de lecture.")
        let video = try source("Features/Main/Views/VideoAvailabilityResolver.swift")
        XCTAssertFalse(video.contains("PlaybackZone"), "La surface de la vidéo n'est pas une zone de lecture.")

        let menu = try source("Features/Main/Components/MessageOverlayMenu.swift")
        XCTAssertTrue(menu.contains(".overlayPreferenceValue(MediaPlayControlAnchorKey.self)"), "Le masque lit les boutons de lecture.")
        XCTAssertTrue(menu.contains("interactive: touch.offersPlayback"), "Le contenu ne se touche que s'il porte un bouton lisible.")
        XCTAssertTrue(menu.contains("bubble.onPlayAudio = { playFromPreview($0) }"), "La bulle de l'aperçu lit le vocal.")
        XCTAssertTrue(menu.contains("onPlayAudio: { playFromPreview($0) }"), "La rangée plate de l'aperçu lit le vocal.")
        XCTAssertTrue(menu.contains(".onDisappear { stopPreviewPlayback() }"), "La fermeture arrête la lecture lancée.")
        XCTAssertFalse(menu.contains("ConversationAudioCoordinator.shared.play("),
                       "L'overlay ne recompose aucune entrée de file : le ViewModel la construit, comme dans le fil.")

        let host = try source("Features/Main/Views/ConversationView+OverlayMenu.swift")
        XCTAssertTrue(host.contains("viewModel.playAudio(attachmentId: attachmentId, continuesQueue: false)"),
                      "L'hôte rend le vocal de l'aperçu au ViewModel, sans file à la suite.")

        let cell = try source("Features/Main/Components/MessageOverlayCellPreview.swift")
        XCTAssertTrue(cell.contains("FocalRow(input: input, actions: rowActions)"))
        XCTAssertTrue(cell.contains("actions.onPlayAudio = onPlayAudio"))
        XCTAssertTrue(cell.contains(".allowsHitTesting(interactive)"))
    }
}
