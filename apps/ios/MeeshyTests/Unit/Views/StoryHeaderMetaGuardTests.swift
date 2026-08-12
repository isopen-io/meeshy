import XCTest

/// Gardes par analyse de source sur la ligne de méta du header du reader de
/// story — `StoryHeaderView` est couplée à des `@Binding` du viewer et à son
/// `@State` de long press, donc non instanciable proprement en test (même
/// limite que `StoryGroupIntroOverlayGuardTests` / `MyStoryRowSaveRingTests`,
/// qui établissent ce pattern dans ce repo).
///
/// Deux directives user du 2026-07-30 sont verrouillées ici :
///
/// 1. **L'horloge qualifie l'HEURE DE PUBLICATION, pas l'expiration.** Le
///    compte à rebours « Expire dans Xh » a quitté le header : la durée de vie
///    d'une story est une constante produit, la relire à chaque slide n'apporte
///    rien et poussait la méta sur deux niveaux de gris successifs.
///
/// 2. **L'audio de fond se lit note PUIS onde.** La note musicale dit la
///    présence de la piste, l'onde animée qui la suit dit que ça joue. L'une
///    sans l'autre retire la moitié du signal.
///
/// S'y ajoute la borne de 16 caractères sur le nom d'utilisateur, commune au
/// header et aux bulles de conversation (même directive) : le COMPORTEMENT de
/// la coupe est testé côté SDK (`DisplayNameTests`), ces deux assertions-ci
/// vérifient seulement que les deux surfaces passent bien par le helper au lieu
/// de rendre le nom brut.
final class StoryHeaderMetaGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Copié verbatim depuis `RightToLeftLayoutGuardTests.strippingComments`
    /// (même target `MeeshyTests`, méthode `private` donc inaccessible d'ici) :
    /// dupliquer l'algorithme éprouvé plutôt qu'en écrire un qui diverge.
    /// Indispensable ici : les commentaires du header CITENT « Expire dans Xh »
    /// pour documenter le retrait — une assertion négative sur le texte brut
    /// échouerait sur sa propre documentation.
    private func strippingComments(_ source: String) -> String {
        var out = ""
        var inBlock = false
        for rawLine in source.split(separator: "\n", omittingEmptySubsequences: false) {
            var line = String(rawLine)
            if inBlock {
                guard let end = line.range(of: "*/") else { continue }
                line = String(line[end.upperBound...])
                inBlock = false
            }
            while let start = line.range(of: "/*") {
                if let end = line.range(of: "*/", range: start.upperBound..<line.endIndex) {
                    line = String(line[..<start.lowerBound]) + String(line[end.upperBound...])
                } else {
                    line = String(line[..<start.lowerBound])
                    inBlock = true
                }
            }
            if let slashes = line.range(of: "//") {
                line = String(line[..<slashes.lowerBound])
            }
            out += line + "\n"
        }
        return out
    }

    /// Corps de `StoryHeaderView`, commentaires retirés. Le fichier héberge
    /// aussi le rail d'actions : sans ce scope, une assertion matcherait le
    /// premier `Image(systemName: "clock")` venu, d'où qu'il vienne.
    private func headerBlock() throws -> String {
        let fileSource = strippingComments(
            try source("Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift"))
        guard let start = fileSource.range(of: "struct StoryHeaderView: View {") else {
            XCTFail("StoryHeaderView introuvable")
            return ""
        }
        guard let end = fileSource.range(of: "\n}", range: start.upperBound..<fileSource.endIndex) else {
            XCTFail("Fermeture de StoryHeaderView introuvable")
            return ""
        }
        return String(fileSource[start.upperBound..<end.lowerBound])
    }

    // MARK: - 1. L'horloge qualifie la date de publication, l'expiration a quitté le header

    func test_header_showsClockNextToPublicationTime() throws {
        let header = try headerBlock()

        guard let clock = header.range(of: #"Image(systemName: "clock")"#),
              let publishedAt = header.range(of: "Text(story.timeAgo)") else {
            XCTFail("Le header doit rendre une horloge ET l'heure de publication")
            return
        }
        XCTAssertTrue(
            clock.lowerBound < publishedAt.lowerBound,
            "L'horloge doit PRÉCÉDER l'heure de publication : elle la qualifie. " +
            "Posée après, elle se relit comme le préfixe de ce qui suit."
        )
    }

    func test_header_hasNoExpiryCountdown() throws {
        let header = try headerBlock()

        XCTAssertFalse(
            header.contains("storyTimeRemaining"),
            "Le compte à rebours d'expiration a été retiré du header (directive user " +
            "2026-07-30) — plus aucun appel au formateur ne doit y revenir."
        )
        XCTAssertFalse(
            header.contains("expiresAt"),
            "Le header ne doit plus lire expiresAt : l'expiration reste une règle de " +
            "sélection de slide (isExpired(at:)), pas une information de chrome."
        )
    }

    // MARK: - 2. Audio de fond : note musicale PUIS onde animée

    func test_backgroundAudio_rendersMusicNoteThenAnimatedWaveform() throws {
        let header = try headerBlock()

        guard let branch = header.range(of: "if hasBackgroundAudio {") else {
            XCTFail("La branche audio de fond du header est introuvable")
            return
        }
        let audioBranch = String(header[branch.upperBound...])

        guard let note = audioBranch.range(of: #"Image(systemName: "music.note")"#),
              let waveform = audioBranch.range(of: "StoryHeaderAudioWaveform(") else {
            XCTFail(
                "Un audio de fond doit afficher la note musicale ET l'onde animée : " +
                "la note dit la présence de la piste, l'onde dit que ça joue."
            )
            return
        }
        XCTAssertTrue(
            note.lowerBound < waveform.lowerBound,
            "L'onde vient À LA SUITE de la note musicale (directive user 2026-07-30)."
        )
    }

    /// Corollaire : le signal vit à UN seul endroit. Tant que le canvas rendait
    /// lui aussi un chip note + onde pour la piste de fond, la même information
    /// s'affichait deux fois, dont une par-dessus l'image. Les chips du canvas
    /// restent réservés aux pistes FOREGROUND (`AudioForegroundReaderOverlay`).
    func test_canvas_rendersNoWaveformChipForBackgroundAudio() throws {
        let canvas = strippingComments(
            try source("Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift"))

        XCTAssertFalse(
            canvas.contains("StoryWaveformBadgeView("),
            "Le canvas ne doit plus rendre d'onde pour l'audio de fond : le header " +
            "porte ce signal depuis le 2026-07-30 (directive user)."
        )
        XCTAssertTrue(
            canvas.contains("AudioForegroundReaderOverlay("),
            "Les chips FOREGROUND, eux, restent : chaque piste a sa fenêtre de " +
            "lecture et son mute propre — rien à voir avec le fond."
        )
    }

    // MARK: - 3. Nom d'utilisateur borné à 16 caractères sur les deux surfaces

    func test_storyHeaderUsername_goesThroughDisplayNameBound() throws {
        let header = try headerBlock()
        XCTAssertTrue(
            header.contains("DisplayName.truncated(group.username)"),
            "Le nom d'auteur du header doit passer par la borne partagée : " +
            "lineLimit(1) seul laisse un pseudo long dicter la largeur et pousser " +
            "l'attribution de repost hors champ."
        )
    }

    func test_bubbleSenderName_goesThroughDisplayNameBound() throws {
        let footer = strippingComments(
            try source("Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift"))
        XCTAssertTrue(
            footer.contains("DisplayName.truncated(sender.name)"),
            "L'identity bar des bulles applique la MÊME borne que le header de story — " +
            "une seule règle produit, un seul helper."
        )
    }
}
