import XCTest
import MeeshySDK
@testable import Meeshy

/// F-090 (WS-11) — VoiceOver : libellés composés, ordre de lecture, éléments
/// décoratifs cachés (contrat §WS-11, critère §7 « Accessibilité »).
///
/// **Ce que ce fichier NE reteste PAS** (« tu ne dupliques rien ») :
/// `A11yLabelComposerTests` (F-080) couvre déjà en détail
/// `MessageAccessibilityLabelComposer.compose` — sender/inconnu/moi, texte,
/// heure, édité, épinglé, éphémère, accusé de livraison, localisation,
/// réactions, citation (avec/sans extrait, réponse à soi), et l'ordre
/// sender → reply → text → images → reactions sur un cas composite (5
/// segments). `FocalRowSourceGuardTests` (F-083) couvre déjà le CÂBLAGE :
/// `FocalRow` combine ses enfants (`.accessibilityElement(children: .combine)`)
/// et délègue au composeur partagé, jamais une seconde résolution.
///
/// Ce fichier complète trois trous réels :
/// 1. segments jamais exercés par `A11yLabelComposerTests` (audio, vidéo,
///    fichier non-média — matrice F07/F08) ;
/// 2. l'ordre des segments DE FIN (heure → accusé → édité → épinglé →
///    éphémère → réactions), jamais vérifié ensemble sur un seul cas ;
/// 3. les éléments DÉCORATIFS de `Focal/Row/**` (icônes SF Symbol sans
///    valeur informative propre) sont cachés à VoiceOver — soit
///    directement (`.accessibilityHidden(true)`), soit parce qu'un ancêtre
///    absorbe tout dans un unique libellé composé
///    (`.accessibilityElement(children: .combine)` + `.accessibilityLabel`
///    explicite) — les deux formes sont légitimes, seule l'ABSENCE des deux
///    est un défaut.
@MainActor
final class FocalVoiceOverParityTests: XCTestCase {

    // MARK: - Fabrique minimale (même patron que A11yLabelComposerTests)

    private func makeContent(
        isMe: Bool = false,
        senderName: String? = "Ali",
        text: String? = nil,
        attachments: BubbleContent.Attachments = .none,
        editedAt: Date? = nil,
        isPinned: Bool = false,
        ephemeral: BubbleContent.Ephemeral? = nil,
        reactions: [MeeshyReactionSummary] = [],
        deliveryStatus: MeeshyMessage.DeliveryStatus? = nil
    ) -> BubbleContent {
        BubbleContent(
            messageId: "m1",
            kind: .standard,
            text: text.map {
                BubbleContent.Text(
                    raw: $0, isEmojiOnly: false, emojiFontSize: nil,
                    firstLinkURL: nil, embeddedVideo: nil, trackedLinks: [:], embedTrackedURL: nil
                )
            },
            translation: nil,
            reply: nil,
            attachments: attachments,
            location: nil,
            ephemeral: ephemeral,
            isBlurred: false,
            isViewOnce: false,
            isPinned: isPinned,
            forwardAttribution: nil,
            editedAt: editedAt,
            isEditSaving: false,
            hasEditHistory: false,
            reactions: reactions,
            meta: BubbleContent.Meta(timeString: "10:41", deliveryStatus: deliveryStatus),
            isMe: isMe,
            senderName: senderName,
            callNotice: nil, joinNotice: nil
        )
    }

    private func attachment(id: String, type: MeeshyMessageAttachment.AttachmentType, originalName: String = "x") -> MeeshyMessageAttachment {
        let mimeType: String
        switch type {
        case .image: mimeType = "image/jpeg"
        case .video: mimeType = "video/mp4"
        case .audio: mimeType = "audio/mpeg"
        case .location: mimeType = "application/x-location"
        case .file: mimeType = "application/octet-stream"
        }
        return MeeshyMessageAttachment(id: id, fileName: originalName, originalName: originalName, mimeType: mimeType, fileSize: 1)
    }

    // MARK: - 1. Segments jamais exercés (matrice F07 audio, F08 vidéo, fichier non-média)

    /// F07 : « AudioPlayerView … » — le libellé VoiceOver doit annoncer le
    /// compte de pistes audio, jamais silencieusement les omettre.
    func test_compose_audioAttachments_announcesCount() {
        let content = makeContent(
            text: nil,
            attachments: .audio([attachment(id: "a1", type: .audio), attachment(id: "a2", type: .audio)])
        )
        let expected = String(format: String(localized: "a11y.message.audios", bundle: .main), 2)
        XCTAssertTrue(
            MessageAccessibilityLabelComposer.compose(content).contains(expected),
            "le libellé composé doit annoncer les pièces jointes AUDIO (matrice F07) — segment manquant"
        )
    }

    /// F08 : grilles média — la branche VIDÉO du compte (jamais exercée par
    /// `A11yLabelComposerTests`, qui ne teste que la branche image).
    func test_compose_videoAttachments_announcesCount() {
        let content = makeContent(
            text: nil,
            attachments: .visualGrid([attachment(id: "v1", type: .video)])
        )
        let expected = String(format: String(localized: "a11y.message.videos", bundle: .main), 1)
        XCTAssertTrue(
            MessageAccessibilityLabelComposer.compose(content).contains(expected),
            "le libellé composé doit annoncer les pièces jointes VIDÉO (matrice F08) — segment manquant"
        )
    }

    /// Fichier non-média (PDF, etc.) — le composeur doit citer le nom de
    /// fichier, jamais un compte anonyme (contrairement à images/vidéos/audio).
    func test_compose_nonMediaFile_announcesFileName() {
        let content = makeContent(
            text: nil,
            attachments: .nonMedia([attachment(id: "f1", type: .file, originalName: "budget.pdf")])
        )
        XCTAssertTrue(
            MessageAccessibilityLabelComposer.compose(content).contains("budget.pdf"),
            "le libellé composé d'une pièce jointe non-média doit citer son nom de fichier"
        )
    }

    // MARK: - 2. Ordre des segments de FIN (heure → accusé → édité → épinglé → éphémère → réactions)

    /// Ordre gelé documenté en tête de `MessageAccessibilityLabelComposer.swift` :
    /// « … → time → delivery → edited → pinned → ephemeral → reactions ».
    /// `A11yLabelComposerTests` teste chaque segment ISOLÉMENT mais jamais
    /// leur ordre RELATIF une fois tous présents ensemble — ce test comble
    /// ce trou avec les six segments de fin réunis sur UN seul message.
    func test_compose_trailingSegments_respectTheFrozenOrder() {
        let content = makeContent(
            isMe: true,
            text: "Voilà",
            editedAt: Date(),
            isPinned: true,
            ephemeral: BubbleContent.Ephemeral(expiresAt: Date()),
            reactions: [MeeshyReactionSummary(emoji: "👍", count: 2)],
            deliveryStatus: .read
        )
        let parts = MessageAccessibilityLabelComposer.compose(content).components(separatedBy: ", ")

        let timeIndex = parts.firstIndex(of: "10:41")!
        // The catalog, not the French word: `a11y.delivery.read` was ABSENT from the
        // catalog until 270i, so `String(localized:)` returned its `defaultValue` —
        // « lu » — in every locale, and this literal matched anywhere. Localizing the
        // key made the CI simulator (English) compose « read », and the force-unwrap
        // below trapped. A test that hardcodes a source-language string passes only
        // while the string is NOT localized.
        let deliveryIndex = parts.firstIndex(of: String(localized: "a11y.delivery.read", bundle: .main))!
        let editedIndex = parts.firstIndex(of: String(localized: "a11y.message.edited", bundle: .main))!
        let pinnedIndex = parts.firstIndex(of: String(localized: "a11y.message.pinned", bundle: .main))!
        let ephemeralIndex = parts.firstIndex(of: String(localized: "a11y.message.ephemeral", bundle: .main))!
        let reactionsIndex = parts.firstIndex { $0.contains("👍") }!

        XCTAssertTrue(timeIndex < deliveryIndex, "heure doit précéder l'accusé de livraison")
        XCTAssertTrue(deliveryIndex < editedIndex, "accusé de livraison doit précéder « modifié »")
        XCTAssertTrue(editedIndex < pinnedIndex, "« modifié » doit précéder « épinglé »")
        XCTAssertTrue(pinnedIndex < ephemeralIndex, "« épinglé » doit précéder « éphémère »")
        XCTAssertTrue(ephemeralIndex < reactionsIndex, "« éphémère » doit précéder les réactions — dernier segment")
    }

    // MARK: - 3. Éléments décoratifs cachés (Focal/Row/**)

    private func rowRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Focal/Row")
    }

    /// Pour chaque `Image(systemName:` de `Focal/Row/**`, vérifie qu'une des
    /// TROIS formes légitimes apparaît dans une fenêtre raisonnable APRÈS
    /// l'icône : `.accessibilityHidden(true)` posé directement dessus, un
    /// ancêtre qui absorbe tout dans un libellé unique
    /// (`.accessibilityElement(children: .combine)`), ou un contrôle englobant
    /// qui porte son propre libellé explicite (`.accessibilityLabel(`).
    /// Fenêtre de 1100 caractères — mesurée sur le cas le plus large observé
    /// (`FocalAttachmentBlock.protectionOverlay`, 851 caractères entre
    /// l'icône et le `.accessibilityElement` englobant, source
    /// commentaires retirés), avec marge de sécurité.
    ///
    /// **Recalibré — déplacé par `20c7b738` (« la base de la carte devient la
    /// rangée d'action, et le cadre se referme autour »), l'invariant est
    /// inchangé : VoiceOver ne doit JAMAIS annoncer le nom système brut d'un
    /// SF Symbol.**
    ///
    /// Ce commit a monté `FocalFocusControlBar` (barre RETIRÉE avec le mode
    /// Focal, 2026-08-18 — l'historique reste vrai), dont deux icônes — `plus`
    /// (ouvrir le sélecteur de réactions) et `ellipsis` (le menu complet) —
    /// n'étaient ni cachées ni absorbées, et que le témoin dénonçait donc.
    /// Elles ne sont pourtant jamais annoncées « plus » ni « ellipsis » :
    /// chacune est le `label:` d'un `Button` qui porte un
    /// `.accessibilityLabel(…)` explicite et localisé
    /// (`message.reaction.open_picker`, `message.actions.more`). Un `Button`
    /// fusionne son contenu en UN élément d'accessibilité, et un
    /// `.accessibilityLabel` posé dessus REMPLACE le libellé dérivé de ce
    /// contenu — le nom du symbole ne sort pas.
    ///
    /// C'est une TROISIÈME forme légitime que l'énumération avait omise, non
    /// un trou d'accessibilité : ces deux icônes sont INTERACTIVES, là où les
    /// deux formes déjà listées visent des icônes décoratives (qu'on efface)
    /// ou des ornements de rangée (qu'on absorbe dans la phrase de la
    /// rangée). Une icône interactive ne s'efface pas — elle se NOMME, sans
    /// quoi sa cible deviendrait inatteignable au lieu d'être silencieuse.
    /// La garde reste entière : une icône qui ne présente AUCUNE des trois
    /// formes fait toujours tomber ce témoin.
    ///
    /// **Et elle se resserre au passage.** Admettre une troisième forme élargit
    /// ce qui satisfait la fenêtre ; la fenêtre est donc RÉTRÉCIE d'autant :
    /// elle s'arrête net au prochain `Image(systemName:`, si bien qu'une icône
    /// ne peut plus emprunter la mitigation de sa VOISINE. `FocalQuotedReplyView`
    /// en portait deux à treize lignes d'écart — sous l'ancienne fenêtre de
    /// 1100 caractères, le `.accessibilityHidden(true)` de la seconde couvrait
    /// la première. Elle en porte QUATRE depuis la LOI DES ZONES
    /// (2026-08-24) : le bouton play de la miniature vidéo, les deux branches
    /// du glyphe d'aperçu (tactile → nommée, décorative → effacée) et le
    /// glyphe de story. Chacune répond d'elle-même, fenêtre coupée.
    /// Vérifié sur les icônes réelles du dossier Focal, sous-dossier Row : toutes
    /// restent conformes fenêtre coupée (les deux icônes qui dépendaient de
    /// la troisième forme vivaient dans `FocalFocusControlBar`, retirée).
    func test_decorativeIcons_inFocalRow_areHiddenOrAbsorbedByACombinedLabel() throws {
        let root = rowRoot()
        let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil))
        var scannedFiles = 0
        var offenders: [String] = []

        for case let url as URL in enumerator where url.pathExtension == "swift" {
            scannedFiles += 1
            let raw = try String(contentsOf: url, encoding: .utf8)
            let code = AppSourceGuard.stripComments(raw)
            var searchStart = code.startIndex
            while let iconRange = code.range(of: "Image(systemName:", range: searchStart..<code.endIndex) {
                var windowEnd = code.index(iconRange.upperBound, offsetBy: 1100, limitedBy: code.endIndex) ?? code.endIndex
                // La fenêtre s'arrête au prochain symbole : chaque icône répond
                // d'elle-même, aucune n'hérite de la mitigation de sa voisine.
                if let nextIcon = code.range(of: "Image(systemName:", range: iconRange.upperBound..<windowEnd) {
                    windowEnd = nextIcon.lowerBound
                }
                let window = code[iconRange.upperBound..<windowEnd]
                let isHidden = window.contains(".accessibilityHidden(true)")
                let isAbsorbed = window.contains(".accessibilityElement(children: .combine)")
                // Troisième forme : l'icône est le contenu d'un contrôle qui
                // se nomme lui-même. Le libellé explicite REMPLACE celui que
                // SwiftUI dériverait du symbole (cf. `20c7b738`, doc ci-dessus).
                let isNamedByItsControl = window.contains(".accessibilityLabel(")
                if !isHidden && !isAbsorbed && !isNamedByItsControl {
                    let lineNo = code.distance(from: code.startIndex, to: iconRange.lowerBound)
                    offenders.append("\(url.lastPathComponent)@offset\(lineNo)")
                }
                searchStart = iconRange.upperBound
            }
        }

        XCTAssertGreaterThan(scannedFiles, 0, "le balayage de Focal/Row/** ne trouve aucun fichier — garde inopérante (leçon 257)")
        XCTAssertTrue(
            offenders.isEmpty,
            "ces icônes SF Symbol de Focal/Row/** ne sont ni `.accessibilityHidden(true)`, ni absorbées " +
            "par un ancêtre combiné, ni nommées par un contrôle englobant (`.accessibilityLabel`) — VoiceOver " +
            "les annoncerait par leur nom système brut (« eye slash fill », « checkmark », …) au lieu du " +
            "libellé composé : " + offenders.joined(separator: ", ")
        )
    }
}
