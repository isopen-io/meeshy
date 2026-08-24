// apps/ios/MeeshyTests/Unit/Focal/FocalMatrixWiringGuardTests.swift

import XCTest
@testable import Meeshy

/// Gardes de CÂBLAGE des correctifs de matrice §5 (audit 2026-08-18) — le
/// patron « mount guard » du dépôt (leçon 257) : chaque correctif de la
/// passe « Focal Grandeur Nature » a un témoin qui rougit si son montage
/// disparaît. RETRAIT FOCAL iOS (2026-08-18) : les suites de lois du pass
/// (`FocalSpecCurveTests`, `FocalScrollPassGeometryTests`) sont parties avec
/// lui ; ici restent épinglés les branchements Script/temps réel que
/// l'audit a trouvés morts ou absents :
/// effets jamais fournis, flou ignoré, retry sans consommateur, chip 🌐
/// inerte, présence figée, reconfigure ciblé non différé, pose
/// d'atterrissage jamais déclenchée, badge non-lus comptant ses propres
/// envois, fantômes élus.
@MainActor
final class FocalMatrixWiringGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Unit/Focal
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func stripped(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try source(relativePath))
    }

    private var hostPath: String { "Meeshy/Features/Main/Views/MessageListViewController.swift" }
    private var rowPath: String { "Meeshy/Features/Main/Focal/Row/FocalRow.swift" }

    // MARK: - Effets (matrice « Effets, mentions, appels »)

    func test_host_feedsMessageEffectsToTheRowInput() throws {
        XCTAssertTrue(
            try stripped(hostPath).contains("effects: message.effects"),
            "l'hôte doit fournir `effects: message.effects` à FocalRowInput — resté au défaut .none, aucune rangée Focal ne joue le moindre effet (feature morte, audit 2026-08-18)"
        )
    }

    // MARK: - Flou de confidentialité (matrice « Éphémère / flou / vue unique »)

    func test_focalRow_mountsTheProtectedContentWrapper() throws {
        let code = try stripped(rowPath)
        XCTAssertTrue(
            code.contains("FocalProtectedContent("),
            "FocalRow doit envelopper son bloc contenu dans FocalProtectedContent — sans lui, un message protégé (isBlurred) s'affiche EN CLAIR en Focal (régression de confidentialité)"
        )
        XCTAssertTrue(
            code.contains("if content.isBlurred {"),
            "le montage du wrapper est piloté par content.isBlurred (branche conditionnelle : un message ordinaire ne paie ni le @StateObject ni le modificateur) — la valeur du modèle, jamais un défaut"
        )
    }

    // MARK: - Bande retry (matrice « Envoi optimiste / échec »)

    func test_focalRow_rendersTheFailedRetryBar() throws {
        let code = try stripped(rowPath)
        XCTAssertTrue(
            code.contains("BubbleFailedRetryBar(onRetry:"),
            "FocalRow doit monter BubbleFailedRetryBar pour un envoi échoué — onRetry était câblé par l'hôte mais AUCUNE vue Focal ne le consommait (message échoué sans issue)"
        )
        XCTAssertTrue(
            code.contains("content.meta.deliveryStatus == .failed"),
            "la bande retry est gatée sur l'état .failed du message sortant — même règle que la bulle (isFailedOutgoing)"
        )
    }

    // MARK: - Drapeau langue d'origine (arbitrage user 2026-08-18)

    func test_originalLanguageFlag_isAVersionToggle_gatedOnMultipleVersions() throws {
        let code = try stripped(rowPath)
        guard let flagStart = code.range(of: "private var originalLanguageFlag") else {
            return XCTFail("originalLanguageFlag introuvable dans FocalRow — le seul indicateur multi-langue de la rangée")
        }
        let window = String(code[flagStart.lowerBound...].prefix(2000))
        XCTAssertTrue(
            window.contains("if let translation = content.translation"),
            "le drapeau n'apparaît QUE quand plusieurs versions existent (content.translation non-nil) — jamais sur un message monolingue"
        )
        XCTAssertTrue(
            window.contains("onSetActiveDisplayLanguage?(content.messageId, translation.originalLangCode)"),
            "tap sur le drapeau d'origine = AFFICHER l'original (arbitrage user 2026-08-18 : le drapeau est un toggle de version)"
        )
        XCTAssertTrue(
            window.contains("onSetActiveDisplayLanguage?(content.messageId, nil)"),
            "tap sur le drapeau de la langue du profil = REVENIR à la traduction (résolution Prisme) — sans ce retour, la V.O. serait un cul-de-sac"
        )
        XCTAssertTrue(
            window.contains("preferredLangCode") || code.contains("profileLang"),
            "l'état « original affiché » montre le drapeau de la langue CONFIGURÉE sur le profil (preferredLangCode), jamais un globe"
        )
        XCTAssertFalse(
            code.contains("translationChip") || code.contains("systemName: \"globe\""),
            "l'icône translate (chip 🌐) reste RETIRÉE de la rangée — le toggle est un DRAPEAU"
        )
    }

    /// Arbitrage user 2026-08-18 (bis) : le drapeau vit EN BAS de la rangée,
    /// juste avant les réactions — commun aux messages texte et aux
    /// attachements audio porteurs de traductions — et plus jamais dans le
    /// fil du texte.
    ///
    /// RECALIBRAGE 2026-08-21 (« Focal revient en passe MINIMALE », commit
    /// `45356f760`) : la RÈGLE n'a pas bougé, la SONDE si. La rangée monte
    /// désormais le (+) de réaction rapide sur le dernier message reçu, via le
    /// prédicat partagé `BubbleReactionsOverlay.isMounted(...)` hissé en tête de
    /// `flagAndReactionsRow`. Ce call-site NE REND RIEN mais porte le nom du
    /// type : chercher `BubbleReactionsOverlay` nu faisait pointer la sonde sur
    /// la DÉCISION de montage (avant le drapeau) au lieu du SITE DE RENDU
    /// (après), et rougir pour une consolidation qui respectait l'arbitrage.
    /// On ancre donc sur l'initialiseur `BubbleReactionsOverlay(` — que
    /// `.isMounted(` ne peut pas matcher.
    func test_versionFlag_sharesTheReactionsLine_flagFirst_notInsideTheTextBlock() throws {
        let code = try stripped(rowPath)
        guard let rowStart = code.range(of: "private var flagAndReactionsRow") else {
            return XCTFail("`flagAndReactionsRow` introuvable — drapeau + réactions vivent sur LA MÊME ligne, en bas de la rangée")
        }
        let rowBody = String(code[rowStart.lowerBound...].prefix(1400))
        // Le drapeau UNIQUE est devenu une BANDE (3 au plus hors magnificence,
        // directive 2026-08-24) : le jeton rendu est `plainLanguageFlags`.
        // L'invariant, lui, ne bouge pas — les drapeaux viennent EN PREMIER,
        // sur la même HStack que les réactions.
        guard let flagPos = rowBody.range(of: "plainLanguageFlags("),
              let reactionsPos = rowBody.range(of: "BubbleReactionsOverlay(")
        else { return XCTFail("drapeaux ou réactions RENDUS absents de flagAndReactionsRow (le prédicat `.isMounted(` ne compte pas — il ne rend rien)") }
        XCTAssertTrue(
            flagPos.lowerBound < reactionsPos.lowerBound,
            "le drapeau vient EN PREMIER, avant les réactions, sur la même ligne (HStack) — user 2026-08-18"
        )
        XCTAssertTrue(
            rowBody.contains("HStack"),
            "drapeau et réactions partagent une HStack — jamais deux lignes empilées"
        )
        guard let textBlockStart = code.range(of: "private var textBlock"),
              let textBlockEnd = code.range(of: "private var readMorePayload")
        else { return XCTFail("bornes du textBlock introuvables") }
        let textBlockBody = code[textBlockStart.lowerBound..<textBlockEnd.lowerBound]
        XCTAssertFalse(
            textBlockBody.contains("originalLanguageFlag"),
            "le drapeau ne vit PLUS dans le fil du texte — il est descendu sur la ligne des réactions"
        )
    }

    /// SECONDE SURFACE du même arbitrage (consolidation des chips du focus,
    /// 2026-08-21/22) : en focus, `flagAndReactionsRow` s'efface
    /// (`.opacity(input.isFocused ? 0 : 1)`) et c'est `focusStrip` — la ligne
    /// BASSE de la carte — qui porte drapeaux et réactions. Sans ce témoin, la
    /// consolidation pouvait inverser l'ordre sur la surface RÉELLEMENT visible
    /// en focus sans rien faire rougir : le danger gardé depuis le 18/08 aurait
    /// changé de vue en silence.
    func test_focusStrip_keepsTheFlagsBeforeTheReactions_onTheCardBottomLine() throws {
        let code = try stripped(rowPath)
        XCTAssertTrue(
            code.contains(".opacity(input.isFocused ? 0 : 1)"),
            "en focus, la ligne drapeau+réactions s'efface au profit de `focusStrip` — sans cet effacement les deux surfaces se superposent"
        )
        guard let stripStart = code.range(of: "private var focusStrip") else {
            return XCTFail("`focusStrip` introuvable — la ligne basse de la carte du message en focus")
        }
        let stripBody = String(code[stripStart.lowerBound...].prefix(2600))
        guard let flagsPos = stripBody.range(of: "focusFlagCodes"),
              let reactionsPos = stripBody.range(of: "focusReactionChip")
        else { return XCTFail("drapeaux ou réactions absents de focusStrip") }
        XCTAssertTrue(
            flagsPos.lowerBound < reactionsPos.lowerBound,
            "sur la ligne de la carte aussi : les drapeaux AVANT les réactions (arbitrage user 2026-08-18, reporté sur la carte de focus)"
        )
        XCTAssertTrue(
            stripBody.contains("HStack"),
            "drapeaux et réactions partagent une HStack — jamais deux lignes empilées"
        )
    }

    /// Sans ce réalignement, le toggle changeait `activeLangCode` sans jamais
    /// changer le texte : la rangée préférait `preferredContent` (la
    /// traduction) à `text.raw` (le contenu RÉSOLU par le builder, bascule
    /// manuelle comprise).
    func test_effectiveText_followsTheBuilderResolution_notThePreferredTranslation() throws {
        let code = try stripped(rowPath)
        guard let start = code.range(of: "private var effectiveText") else {
            return XCTFail("effectiveText introuvable dans FocalRow")
        }
        let window = String(code[start.lowerBound...].prefix(300))
        XCTAssertTrue(
            window.contains("content.text?.raw"),
            "effectiveText doit lire text.raw — le contenu résolu par BubbleContentBuilder (Prisme + bascule manuelle), le même que la bulle"
        )
        XCTAssertFalse(
            window.contains("preferredContent ??"),
            "préférer preferredContent court-circuite la bascule V.O. — c'est le défaut qui rendait le toggle inopérant en rangée plate"
        )
    }

    // MARK: - Le drapeau pilote AUSSI la piste audio (user 2026-08-18)

    /// « Lorsqu'on switch de drapeau d'audio, il faut aussi switcher l'audio »
    /// — le fil complet drapeau → piste : FocalRow alimente FocalAudioBlock
    /// avec la bascule de la rangée, le bloc la forwarde au widget, l'hôte
    /// alimente la bulle historique, et le VM joue la piste EFFECTIVE (même
    /// loi `AudioTrackLanguageResolver` que la vue). Chaque maillon coupé =
    /// audio dans une langue, karaoké dans une autre.
    func test_flagToggle_drivesTheAudioTrack_endToEnd() throws {
        let row = try stripped(rowPath)
        XCTAssertTrue(
            row.contains("activeAudioLanguage: input.activeDisplayLangCode"),
            "FocalRow doit alimenter FocalAudioBlock avec la bascule de la rangée — sans ce fil, le drapeau change le texte mais jamais la piste"
        )
        let block = try stripped("Meeshy/Features/Main/Focal/Row/FocalAudioBlock.swift")
        XCTAssertTrue(
            block.contains("activeAudioLanguageOverride: activeAudioLanguage"),
            "FocalAudioBlock doit forwarder la bascule au widget (AudioMediaView.activeAudioLanguageOverride)"
        )
        XCTAssertTrue(
            block.contains("activeAudioLanguage: activeAudioLanguage"),
            "le carrousel audio doit recevoir la même bascule — plus jamais un nil en dur"
        )
        let host = try stripped(hostPath)
        XCTAssertTrue(
            host.contains("activeAudioLanguage: languageSelection?.activeDisplayLangCode"),
            "l'hôte doit alimenter ThemedMessageBubble.activeAudioLanguage — canal resté mort depuis sa pose (audit 2026-08-18)"
        )
        let vmCode = try stripped("Meeshy/Features/Main/ViewModels/ConversationViewModel.swift")
        XCTAssertTrue(
            vmCode.contains("fileUrl: effectiveAudioTrackUrl(for: attachment, message: message)"),
            "playAudio doit jouer la piste EFFECTIVE (résolveur partagé) — pas attachment.fileUrl en dur"
        )
        let mediaView = try stripped("Meeshy/Features/Main/Views/ConversationMediaViews.swift")
        XCTAssertTrue(
            mediaView.contains("AudioTrackLanguageResolver.resolve("),
            "AudioMediaView doit résoudre la langue de piste par la MÊME loi que le VM (AudioTrackLanguageResolver) — deux lois divergent toujours"
        )
        let sdkPlayer = try stripped("../../packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift")
        XCTAssertTrue(
            sdkPlayer.contains("if !usesExternalPlayer { player.stop() }"),
            "switchToLanguage ne stoppe QUE le player POSSÉDÉ — en moteur EXTERNE (conversation), le coordinateur vient de faire suivre la piste (syncActiveTrack/playVariant) ; un stop inconditionnel tuait la lecture qu'on venait de basculer"
        )
        XCTAssertTrue(
            vmCode.contains("audioCoordinator.syncActiveTrack("),
            "la bascule du drapeau route par syncActiveTrack — playVariant direct ne couvrait pas la PAUSE (reprise dans l'ancienne langue sous un karaoké basculé)"
        )
        XCTAssertTrue(
            vmCode.contains("trackUrlResolver:"),
            "la FILE d'auto-avance (audioQueueTail) doit enfiler la piste EFFECTIVE — sans le résolveur, le 2e vocal sortait en V.O. sous un karaoké traduit"
        )
    }

    // MARK: - Le scroll VOULU traverse le verrou de scène (user 2026-08-18)

    func test_scrollToBottom_declaresItselfIntentional_toTheSceneLock() throws {
        let code = try stripped(hostPath)
        guard let start = code.range(of: "func scrollToBottom(animated: Bool = true) {") else {
            return XCTFail("scrollToBottom introuvable dans l'hôte")
        }
        let body = String(code[start.lowerBound...].prefix(600))
        XCTAssertTrue(
            body.contains("isIntentionalProgrammaticScroll = true"),
            "scrollToBottom doit se déclarer INTENTIONNEL — sans ce drapeau, le verrou de scène annule chaque frame de l'animation et le bouton « aller au dernier message » ne fait rien"
        )
    }

    // MARK: - Présence vivante (matrice « Présence »)

    func test_host_observesThePresenceRefreshSignal() throws {
        XCTAssertTrue(
            try stripped(hostPath).contains("refreshSignal.$presenceVersion"),
            "l'hôte doit observer PresenceManager.refreshSignal — sans ce sink, la pastille de présence d'une rangée reste FIGÉE à l'état de sa dernière configuration"
        )
    }

    // MARK: - Reconfigure ciblé différé pendant le geste (§4.7ter, volet ciblé)

    func test_targetedReconfigure_isDeferredDuringGesture() throws {
        let code = try stripped(hostPath)
        guard let start = code.range(of: "private func reconfigureMessages(serverIds: Set<String>) {") else {
            return XCTFail("reconfigureMessages introuvable")
        }
        let body = String(code[start.lowerBound...].prefix(1200))
        XCTAssertTrue(
            body.contains("deferredTargetedReconfigureIds"),
            "reconfigureMessages doit différer pendant un geste en rangée plate — une traduction tardive qui re-mesure une cellule visible fait sauter le champ visuel (audit 2026-08-18)"
        )
    }

    // MARK: - Badge non-lus (matrice « Message entrant temps réel »)

    func test_unreadBadge_neverCountsOwnMessages() throws {
        XCTAssertTrue(
            try stripped(hostPath).contains("newestIsOwnMessage"),
            "le badge non-lus ne doit jamais compter un message dont l'utilisateur est l'auteur — un envoi optimiste depuis l'historique incrémentait la pilule (audit 2026-08-18)"
        )
    }

    // MARK: - Typing plat (matrice « Typing indicator »)

    func test_typingIndicator_hasAFlatVariantKeyedOnReadingMode() throws {
        let code = try stripped(hostPath)
        XCTAssertTrue(
            code.contains("isFlat: typingFlat"),
            "la cellule typing doit passer la tenue plate en Focal/Script (pastille 22 + points accent, sans capsule — matrice §5)"
        )
        XCTAssertTrue(
            code.contains("let typingFlat = self.readingMode != .bubbles"),
            "la tenue plate du typing est décidée par readingMode — la capsule reste le rendu bulles"
        )
    }

}
