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

    // MARK: - 2. Audio de fond : résolveur unique (E1)

    /// Supersède `test_backgroundAudio_rendersMusicNoteThenAnimatedWaveform`
    /// (directive user 2026-07-30, « note PUIS onde ») : depuis la Task E1
    /// du lot MeeshyComposer (« un résolveur, trois surfaces »), le header
    /// ne fabrique plus cet affichage inline — il délègue à
    /// `BackgroundSoundBadge`, qui vérifie ELLE-MÊME la convention note PUIS
    /// onde (`BackgroundSoundBadgeTests.test_originalCase_
    /// rendersMusicNoteThenWaveform`, `Components/BackgroundSoundBadge.swift`).
    /// La directive produit n'a pas changé de sens, seulement de point de
    /// vérification — cette garde-ci ne teste plus que le CÂBLAGE : le
    /// header monte la vue commune avec l'annonce résolue par le parent, et
    /// ne reconstruit plus la branche `if hasBackgroundAudio { … }` d'origine.
    func test_backgroundAudio_delegatesToBackgroundSoundBadge() throws {
        let header = try headerBlock()

        XCTAssertTrue(
            header.contains("BackgroundSoundBadge("),
            "Le header doit monter BackgroundSoundBadge — la vue commune E1 " +
            "partagée avec la carte de post et le plein écran réel."
        )
        XCTAssertTrue(
            header.contains("announcement: backgroundSoundAnnouncement"),
            "L'annonce doit être celle résolue par le parent (BackgroundAudioAnnouncement), " +
            "pas reconstruite localement dans le header."
        )
        XCTAssertFalse(
            header.contains("if hasBackgroundAudio {"),
            "L'ancienne branche ad hoc a été retirée — l'existence de la piste (B3.5) " +
            "est désormais gérée PAR BackgroundSoundBadge elle-même."
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

    // MARK: - Les personnes que la story NOMME

    /// Le défaut couvert ici est un défaut de CÂBLAGE, pas de règle.
    ///
    /// La règle existe et est testée côté SDK (`ReferenceNoteRow.noted(in:)`
    /// ne garde que `.note`, `viewerIsSilentlyReferenced` porte le marqueur
    /// personnel) ; la donnée arrivait jusqu'au client (`StoryItem.mentions`,
    /// servie par le gateway, décodée par le SDK) — mais AUCUNE vue du reader
    /// ne la lisait. Un `grep mentions` sur les quatre `StoryViewerView*`
    /// rendait zéro occurrence. Les références NOTE d'une story étaient donc
    /// invisibles, alors que les mêmes s'affichent sur un post (`FeedPostCard`
    /// et `PostDetailView`, les deux seuls points de montage de la rangée).
    ///
    /// Conséquence produit : la personne nommée recevait bien sa notification
    /// — `createPostMentionNotificationsBatch` notifie TOUS les modes —
    /// ouvrait la story, et n'y trouvait aucune trace d'avoir été nommée.
    private func canvasCode() throws -> String {
        strippingComments(
            try source("Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift"))
    }

    func test_theReaderMountsTheReferenceNoteRow_fedByTheCurrentStory() throws {
        let code = try canvasCode()
        XCTAssertTrue(
            code.contains("ReferenceNoteRow("),
            "Le reader doit monter `ReferenceNoteRow` : sans point de montage, " +
            "une story qui nomme quelqu'un en NOTE ne le montre nulle part."
        )
        XCTAssertTrue(
            code.contains("currentStory?.mentions"),
            "La rangée doit être alimentée par les références de la story " +
            "COURANTE. Montée sur une source vide, elle serait verte au " +
            "compilateur et morte à l'écran."
        )
    }

    /// La rangée vit dans le CHROME haut : elle suit `chromeVisible` comme
    /// l'en-tête et le rail. Posée hors du chrome, elle resterait affichée sur
    /// un contenu que le lecteur veut justement voir nu.
    func test_theReferenceNoteRow_livesInTheChromeThatCanBeHidden() throws {
        let code = try canvasCode()
        guard let rowRange = code.range(of: "ReferenceNoteRow(") else {
            XCTFail("ReferenceNoteRow doit être monté dans le reader")
            return
        }
        guard let headerRange = code.range(of: "StoryHeaderView(") else {
            XCTFail("StoryHeaderView introuvable — la structure du chrome a changé")
            return
        }
        guard let chromeExit = code.range(of: "chromeVisible ? 0 : -(topInset",
                                          range: headerRange.upperBound..<code.endIndex) else {
            XCTFail("La sortie du chrome (offset sur chromeVisible) est introuvable")
            return
        }
        XCTAssertTrue(
            rowRange.lowerBound > headerRange.upperBound && rowRange.upperBound < chromeExit.lowerBound,
            "La rangée « Avec … » doit être montée dans la pile du chrome haut, " +
            "après l'en-tête et avant la sortie pilotée par `chromeVisible`."
        )
    }

    /// La rangée est une liste de GENS, pas une décoration : on doit pouvoir
    /// les atteindre.
    func test_tappingANamedPersonOpensTheirProfile() throws {
        let code = try canvasCode()
        guard let rowRange = code.range(of: "ReferenceNoteRow(") else {
            XCTFail("ReferenceNoteRow doit être monté dans le reader")
            return
        }
        let end = code.index(rowRange.upperBound, offsetBy: 700, limitedBy: code.endIndex) ?? code.endIndex
        let block = String(code[rowRange.upperBound ..< end])
        XCTAssertTrue(
            block.contains("selectedProfileUser"),
            "`onTapReference` doit router vers la fiche de profil (le même " +
            "`selectedProfileUser` que l'en-tête), sinon la rangée nomme des " +
            "gens qu'on ne peut pas atteindre."
        )
    }
}
