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

    /// Corps de `StoryHeaderView`, commentaires retirés.
    ///
    /// #4084 — l'en-tête a quitté `StoryViewerView+Sidebar.swift` pour son
    /// propre fichier. Le scope reste : rien ne garantit qu'un fichier ne
    /// reçoive pas plus tard une seconde vue, et une assertion à l'échelle du
    /// fichier matcherait alors le premier glyphe venu, d'où qu'il vienne.
    private func headerBlock() throws -> String {
        let fileSource = strippingComments(
            try source("Meeshy/Features/Main/Views/StoryViewerView+Header.swift"))
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

    // MARK: - 1. L'heure qualifie l'AUTEUR, l'expiration a quitté le header

    /// **Vue `2f` — l'heure appartient à la ligne du NOM.**
    ///
    /// Elle qualifie l'AUTEUR (« Camille Roux, il y a 2 h ») ; le crédit du son,
    /// juste dessous, qualifie le CONTENU. La version précédente de cette garde
    /// exigeait l'inverse — une horloge PRÉCÉDANT l'heure, sur une ligne de méta
    /// partagée avec le crédit du son. C'est la disposition que la cible `2f`
    /// refuse, et que `FeedPostCard` (vue `1h`) avait déjà quittée : deux
    /// surfaces voisines disaient la même chose de deux façons.
    ///
    /// Le témoin porte sur la LIGNE, pas sur l'ordre : il extrait le `HStack` du
    /// nom par comptage d'accolades et exige d'y trouver le nom ET l'heure.
    /// Reposer l'heure dans une rangée à elle la ferait sortir de ce bloc et
    /// rougir — ce qu'un simple test d'ordre textuel ne saurait pas voir.
    func test_header_publicationTimeSitsOnTheNameLine() throws {
        let nameLine = try nameLineBlock()

        XCTAssertTrue(
            nameLine.contains("Text(DisplayName.truncated(group.username))"),
            "Le bloc extrait n'est pas la ligne du nom — le témoin ne mesure plus rien."
        )
        XCTAssertTrue(
            nameLine.contains("Text(story.timeAgo)"),
            "Vue `2f` : l'heure de publication doit vivre sur la ligne du NOM, qu'elle " +
            "qualifie — pas sur une rangée de méta partagée avec le crédit du son, où " +
            "la donnée la plus consultée se noie dans la moins consultée."
        )
    }

    /// **Vue `2f` — le crédit du son occupe sa propre ligne, SOUS celle du nom.**
    ///
    /// Deux attributions distinctes — qui a republié, à qui appartient la
    /// musique — se tronquaient l'une l'autre quand elles partageaient la
    /// largeur. Le témoin le dit dans les deux sens : le badge est HORS de la
    /// ligne du nom, et il vient APRÈS elle.
    func test_header_soundCreditSitsOnItsOwnLineBelowTheName() throws {
        let header = try headerBlock()
        let nameLine = try nameLineBlock()

        XCTAssertFalse(
            nameLine.contains("BackgroundSoundBadge("),
            "Le crédit du son ne doit PAS partager la ligne du nom : sur un écran " +
            "étroit, le titre du son et le handle d'origine se tronquent l'un l'autre."
        )
        guard let time = header.range(of: "Text(story.timeAgo)"),
              let badge = header.range(of: "BackgroundSoundBadge(") else {
            XCTFail("Le header doit porter l'heure ET le crédit du son")
            return
        }
        XCTAssertTrue(
            time.lowerBound < badge.lowerBound,
            "Le crédit du son se pose SOUS la ligne du nom, jamais au-dessus."
        )
    }

    /// L'horloge a quitté l'en-tête avec la vue `2f` : collée à l'auteur, « 2 h »
    /// se lit sans ambiguïté comme une date de publication, et `FeedPostCard`
    /// n'en a jamais porté. Elle ne manquait à personne — elle était déjà
    /// `accessibilityHidden(true)`.
    func test_header_hasNoClockGlyph() throws {
        let header = try headerBlock()

        XCTAssertFalse(
            header.contains(#"Image(systemName: "clock")"#),
            "Vue `2f` : plus d'horloge dans l'en-tête. La directive du 2026-07-30 qui " +
            "l'avait introduite portait sur le RETRAIT du compte à rebours « Expire " +
            "dans Xh » ; l'horloge y avait été re-affectée, jamais demandée pour " +
            "elle-même."
        )
    }

    /// La ligne du nom : le `HStack` qui ouvre le `VStack` d'identité, borné par
    /// comptage d'accolades. Un `range(of:)` sur le fichier entier dirait
    /// seulement qu'un texte EXISTE quelque part ; ici la question est sur quelle
    /// LIGNE il se trouve, et seule la structure y répond.
    private func nameLineBlock() throws -> String {
        let header = try headerBlock()
        guard let open = header.range(of: "HStack(spacing: 5) {") else {
            XCTFail("Ligne du nom introuvable dans le header")
            return ""
        }
        var depth = 0
        var index = header.index(before: open.upperBound)
        while index < header.endIndex {
            if header[index] == "{" { depth += 1 }
            if header[index] == "}" {
                depth -= 1
                if depth == 0 { return String(header[open.upperBound..<index]) }
            }
            index = header.index(after: index)
        }
        XCTFail("Fermeture de la ligne du nom introuvable")
        return ""
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
