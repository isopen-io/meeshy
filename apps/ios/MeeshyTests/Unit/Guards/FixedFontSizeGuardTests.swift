import XCTest

/// **Une doctrine tenue à la main est tenue jusqu'au jour où elle ne l'est plus.**
///
/// Le dépôt possède un helper de migration Dynamic Type documenté comme « a
/// mechanical swap » — `MeeshyFont.relative` — et une doctrine, énoncée sous
/// trois numéros d'itération (**53i**, **82i**, **86i**), qui autorise une
/// taille FIGÉE quand le glyphe est **borné par un cadre fixe** : une touche de
/// pavé 72×56, un cercle d'upload 50×50, une pastille capsule qui doit rester
/// « tight ». Dégeler ces sites-là les ferait déborder — c'est le contraire
/// d'une amélioration.
///
/// Mesuré au 264i : **36 des 37 sites de texte figés portaient leur
/// justification en commentaire, nommément.** La doctrine était donc respectée
/// site par site — et **mesurée nulle part** (#4311).
///
/// ### Le 37ᵉ, et pourquoi la relecture ne pouvait pas le voir
///
/// `ProfileUserPostsList.chip` (bandeau « Postes / Réels / Stories » du profil)
/// gelait son chiffre à 18 pt sous un libellé en `.caption2`, qui SCALE — dans
/// une tuile sans hauteur fixe. En AX5, le libellé devenait une fois et demie
/// plus gros que le nombre qu'il légende : **la hiérarchie typographique de la
/// carte s'inversait.**
///
/// Ses trente-six voisins ont tous un cadre fixe qui justifie le gel. C'est
/// exactement l'angle mort d'une règle tenue par la relecture : **un site dont
/// les voisins sont justifiés RESSEMBLE à un site justifié.**
///
/// C'est la forme de #4302 (budget de taille déclaré trois fois, mesuré nulle
/// part) et de #4292 (cliquet i18n épinglé à 1545 pour un backlog réel de 102).
///
/// ### Ce que la garde mesure — et ce qu'elle refuse de juger
///
/// Elle ne dit PAS si un gel est justifié : cela demanderait de lire un cadre
/// fixe posé trois vues plus haut. Elle borne la POPULATION, comme
/// `FileSizeBudgetGuardTests` borne la dette de taille — la liste des fichiers
/// porteurs est un **surensemble** (elle ne dépend d'aucune classification,
/// donc rien ne peut la faire rougir à tort), et les deux compteurs ne peuvent
/// que descendre.
final class FixedFontSizeGuardTests: XCTestCase {

    // MARK: - Classification

    /// Ce que décore un `.font(.system(size:))`.
    ///
    /// `other` n'est pas un échec : deux sites du dépôt sont des glyphes posés
    /// après un bloc `if/else`, dont la ligne de tête est un `}`. Les compter
    /// « ni texte ni glyphe » est le repli PRUDENT — ce qui compte est qu'ils ne
    /// soient pas comptés comme du texte, et ils ne le sont pas.
    enum Receiver: Equatable { case text, glyph, other }

    struct Site: Equatable {
        let line: Int
        let receiver: Receiver
    }

    private static let textHeads = ["Text(", "Label(", "TextField", "TextEditor", "SecureField"]

    private static func receiver(of head: String) -> Receiver {
        if textHeads.contains(where: { head.contains($0) }) { return .text }
        if head.contains("Image(") { return .glyph }
        return .other
    }

    /// Les sites figés d'une source, avec le receveur de chacun.
    ///
    /// Le masquage passe par `DeclarationBodyScanner.mask` — seul masqueur
    /// commentaires + chaînes correct du dépôt — qui **préserve les sauts de
    /// ligne**. Le balayage est donc fait LIGNE À LIGNE plutôt que par index :
    /// une doctrine écrite en commentaire au-dessus du site (le cas nominal
    /// ici) ne déplace rien, et il n'y a aucune fenêtre de caractères à deviner.
    ///
    /// Pour trouver le receveur, on remonte la chaîne de modificateurs : les
    /// lignes vides et celles qui commencent par `.` ou `)` sont des
    /// continuations ; la première qui n'en est pas une porte l'expression de
    /// tête. Quand le site et sa tête tiennent sur une seule ligne, la partie
    /// gauche de la ligne suffit.
    static func frozenSites(in source: String) -> [Site] {
        let lines = DeclarationBodyScanner.mask(source).components(separatedBy: "\n")
        guard let marker = try? NSRegularExpression(pattern: #"\.font\(\s*\.system\(\s*size:"#)
        else { return [] }

        return lines.enumerated().compactMap { index, line -> Site? in
            let ns = line as NSString
            let hit = marker.rangeOfFirstMatch(in: line, range: NSRange(location: 0, length: ns.length))
            guard hit.location != NSNotFound else { return nil }

            let sameLineHead = ns.substring(to: hit.location)
            if receiver(of: sameLineHead) != .other {
                return Site(line: index + 1, receiver: receiver(of: sameLineHead))
            }

            var above = index - 1
            while above >= 0 {
                let trimmed = lines[above].trimmingCharacters(in: .whitespaces)
                guard trimmed.isEmpty || trimmed.hasPrefix(".") || trimmed.hasPrefix(")") else { break }
                above -= 1
            }
            return Site(line: index + 1,
                        receiver: receiver(of: above >= 0 ? lines[above] : ""))
        }
    }

    // MARK: - Cliquets

    /// **Fichiers porteurs d'au moins une taille figée, mesurés au 264i.**
    ///
    /// SURENSEMBLE volontaire : tout site figé compte, quel que soit son
    /// receveur. Un écran NEUF ne peut donc pas introduire de taille figée sans
    /// rougir — il utilise `MeeshyFont.relative(…)`, ou il rejoint cette liste
    /// dans un commit qui dit pourquoi.
    ///
    /// `ProfileUserPostsList.swift` n'y est PAS : ses deux sites sont partis
    /// avec le correctif du 264i, et un nom qui sort ne revient jamais.
    private static let bearingFiles: Set<String> = [
        "Features/Auth/Onboarding/OnboardingAnimations.swift",
        "Features/Auth/Onboarding/OnboardingFlowView.swift",
        "Features/Auth/Onboarding/OnboardingStepViews.swift",
        "Features/Contacts/KeypadTab.swift",
        "Features/Main/Components/AddParticipantSheet.swift",
        "Features/Main/Components/AttachmentLoadingTile.swift",
        "Features/Main/Components/CameraView.swift",
        "Features/Main/Components/ConversationDashboardView.swift",
        "Features/Main/Components/ConversationInfoSheet.swift",
        "Features/Main/Components/ConversationLockSheet.swift",
        "Features/Main/Components/ConversationPreferencesTab.swift",
        "Features/Main/Components/EditPostSheet.swift",
        "Features/Main/Components/ForwardPickerSheet.swift",
        "Features/Main/Components/InviteFriendsSheet.swift",
        "Features/Main/Components/LocationPickerView.swift",
        "Features/Main/Components/MemberManagementSection.swift",
        "Features/Main/Components/MessageDetail/MessageEditsDetailView.swift",
        "Features/Main/Components/MessageDetail/MessageReactionsDetailView.swift",
        "Features/Main/Components/MessageDetail/MessageTranscriptionDetailView.swift",
        "Features/Main/Components/MessageDetailSentimentTab.swift",
        "Features/Main/Components/MessageEffectModifiers.swift",
        "Features/Main/Components/MessageOverlayMenu.swift",
        "Features/Main/Components/NearbyDiscoverabilityControl.swift",
        "Features/Main/Components/StatusBubbleOverlay.swift",
        // **Les parties du découpage héritent de la dette de leur type — et les
        // fichiers-tête en SORTENT.** `UniversalComposerBar.swift` et
        // `ConversationView+Composer.swift` n'ont plus une seule taille figée :
        // elles ont MIGRÉ dans les extensions ci-dessous. Le plafond de
        // population ne bouge donc pas — rien n'a disparu, tout a changé de
        // fichier. C'est le cas que la règle « les RETIRER + baisser le
        // plafond » ne distingue pas : elle suppose une disparition.
        //
        // `UniversalComposerBar` et `ConversationView` ont été découpées pour
        // rentrer dans le budget de taille ; les tailles figées qu'elles
        // portaient ont suivi dans leurs extensions. Sans ces trois noms, le
        // cliquet lit des fichiers NEUFS qui « introduisent » des tailles
        // figées — alors que rien n'a été introduit, tout a été DÉPLACÉ.
        //
        // C'est le pendant de la leçon 347 pour un cliquet : une liste qui
        // nomme des FICHIERS se périme au premier découpage.
        "Features/Main/Components/UniversalComposerBar+Send.swift",
        "Features/Main/Composer/ComposerFormatFan.swift",
        "Features/Main/Composer/ComposerMoodSurface.swift",
        "Features/Main/Composer/ComposerTopBar.swift",
        // #4102 — RELOCALISATION pure : le meuble est découpé, ses sites figés
        // ont suivi `+Surfaces` et `+Intake`. La POPULATION ne bouge pas, donc
        // ni `totalCeiling` ni `textCeiling` ne baissent — seul le NOM change.
        // Le fichier principal n'en porte plus aucun : il sort de la liste et
        // n'y revient jamais.
        "Features/Main/Composer/MeeshyComposerHost+Intake.swift",
        "Features/Main/Views/AchievementBadgeView.swift",
        "Features/Main/Views/ActiveSessionsView.swift",
        "Features/Main/Views/AffiliateView.swift",
        "Features/Main/Views/AudioFullscreenView.swift",
        "Features/Main/Views/Bubble/BubbleFailedRetryBar.swift",
        "Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift",
        "Features/Main/Views/CallEffectsOverlay.swift",
        "Features/Main/Views/CallView.swift",
        "Features/Main/Views/ChangePasswordView.swift",
        "Features/Main/Views/CommunityLinkDetailView.swift",
        "Features/Main/Views/CommunityLinksView.swift",
        "Features/Main/Views/ConversationAnimatedBackground.swift",
        "Features/Main/Views/ConversationBackgroundComponents.swift",
        "Features/Main/Views/ConversationHelperViews.swift",
        "Features/Main/Views/ConversationListView+Overlays.swift",
        "Features/Main/Views/ConversationMediaFilmstrip.swift",
        "Features/Main/Views/ConversationMediaGalleryView.swift",
        "Features/Main/Views/ConversationView+ComposerAttachments.swift",
        "Features/Main/Views/ConversationView+ComposerBanners.swift",
        "Features/Main/Views/ConversationView+MessageRow.swift",
        "Features/Main/Views/DataExportView.swift",
        "Features/Main/Views/DeleteAccountView.swift",
        "Features/Main/Views/FeedCommentsSheet.swift",
        "Features/Main/Views/FeedPostCard+Media.swift",
        "Features/Main/Views/FeedView+Attachments.swift",
        "Features/Main/Views/FeedView.swift",
        "Features/Main/Views/GlobalSearchView.swift",
        "Features/Main/Views/IncomingCallView.swift",
        "Features/Main/Views/MagicLinkView.swift",
        "Features/Main/Views/MessageListView.swift",
        "Features/Main/Views/MyStoriesView.swift",
        "Features/Main/Views/MyStoryActionBar.swift",
        "Features/Main/Views/MyStoryCard.swift",
        "Features/Main/Views/OnboardingView.swift",
        "Features/Main/Views/ParticipantProfileSheet.swift",
        "Features/Main/Views/PostDetailView.swift",
        "Features/Main/Views/ReelAudioBackdrop.swift",
        "Features/Main/Views/ReelRepostEmbedCell.swift",
        "Features/Main/Views/ReelsPlayerView.swift",
        "Features/Main/Views/ShareLinkIdentitySheet.swift",
        "Features/Main/Views/ShareLinksView.swift",
        "Features/Main/Views/SharePickerView.swift",
        "Features/Main/Views/StatusBarView.swift",
        "Features/Main/Views/StoryExportShareSheet.swift",
        "Features/Main/Views/StoryLanguageQuickBar.swift",
        "Features/Main/Views/StoryReactionFlightView.swift",
        "Features/Main/Views/StoryTrayView.swift",
        "Features/Main/Views/StoryViewerContainer.swift",
        "Features/Main/Views/StoryViewerView+Canvas.swift",
        "Features/Main/Views/StoryViewerView+Content.swift",
        "Features/Main/Views/StoryViewerView+Sidebar.swift",
        "Features/Main/Views/SupportView.swift",
        "Features/Main/Views/TrackingLinksView.swift",
        "Features/Main/Views/UserStatsView.swift",
        "Features/Main/Views/VoiceProfileManageView.swift",
        "Features/Main/Views/VoiceProfileWizardView.swift",
        "Features/Main/Views/WebRTCVideoView.swift",
        "Features/Stories/Notifications/StoryExpiredContent.swift",
        "Features/Stories/Notifications/StoryNotificationOfflineContent.swift",
    ]

    /// Sites figés dont le receveur porte du TEXTE. **Ne doit que DESCENDRE.**
    ///
    /// Épinglé à **36**, soit l'état APRÈS le correctif du 264i — le compte
    /// valait 37 juste avant, ce qui rend ce cliquet rouge sur l'état d'où il
    /// vient. Pinner sur l'avant aurait scellé le défaut dans la garde, la
    /// faute même reprochée au cliquet i18n par #4292.
    private static let textCeiling = 36

    /// Tous receveurs confondus. **Ne doit que DESCENDRE.** 247 avant le
    /// correctif du 264i, 245 après (le glyphe et le chiffre de la tuile de
    /// profil), **244 depuis #4136** : l'icône de description a quitté la rangée
    /// haute pour la rangée d'outils, et y a pris la forme canonique — donc
    /// `.title3` au lieu d'un `size: 13` figé. Son fichier n'en portait qu'un,
    /// sur une IMAGE : `textCeiling` ne bouge pas.
    /// **245 depuis le 2026-08-30.** La barre haute du composer a gagné deux
    /// contrôles — annuler et rétablir (#4402) — qui reprennent, au caractère
    /// près, la police de la croix de fermeture posée à leur gauche :
    /// `.system(size: 13, weight: .bold)`.
    ///
    /// C'est le cas que la doctrine autorise, et il faut le dire plutôt que le
    /// taire : **un CADRE FIXE qui déborderait si la taille scalait**. Les trois
    /// boutons vivent dans des cercles de `ComposerControlMetrics.visualDiameter`
    /// ; une police relative y ferait grossir le glyphe sans que le cercle
    /// suive, et le glyphe sortirait de son verre aux tailles accessibles.
    ///
    /// Le cliquet a fait exactement son travail : il n'a pas EMPÊCHÉ l'ajout,
    /// il a exigé qu'on l'assume par écrit. Un +1 silencieux serait passé
    /// inaperçu — c'est la règle 1 qui ne voit pas les fichiers déjà porteurs,
    /// et cette règle-ci qui les rattrape.
    private static let totalCeiling = 245

    // MARK: - Règle 1 — aucun écran neuf n'introduit de taille figée

    func test_aucunFichierNeufNIntroduitDeTailleFigee() throws {
        let newcomers = try sources()
            .filter { !Self.frozenSites(in: text(of: $0)).isEmpty }
            .map { relativePath($0) }
            .filter { !Self.bearingFiles.contains($0) }
            .sorted()

        XCTAssertTrue(
            newcomers.isEmpty,
            "Taille de police figée dans un fichier hors de la dette du 264i. Une taille figée "
            + "ne se justifie que par un CADRE FIXE qui déborderait si elle scalait (doctrine "
            + "53i / 82i / 86i) ; partout ailleurs, `MeeshyFont.relative(…)` est un "
            + "remplacement mécanique qui préserve poids et design :\n  "
            + newcomers.joined(separator: "\n  ")
        )
    }

    // MARK: - Règle 2 — le texte figé ne se répand pas

    func test_leTexteFigeNeSeRepandJamais() throws {
        let sites = try allSites()
        let onText = sites.filter { $0.1.receiver == .text }

        XCTAssertLessThanOrEqual(
            onText.count, Self.textCeiling,
            "plus de textes à taille figée qu'au 264i (\(Self.textCeiling)). Un TEXTE figé sous "
            + "un voisin qui scale inverse la hiérarchie de sa carte aux grandes tailles de "
            + "Dynamic Type — c'est le défaut de #4311 :\n  "
            + onText.map { "\($0.0):\($0.1.line)" }.sorted().joined(separator: "\n  ")
        )
    }

    // MARK: - Règle 3 — et la population entière ne monte pas

    func test_laPopulationFigeeNeMonteJamais() throws {
        let total = try allSites().count

        XCTAssertLessThanOrEqual(
            total, Self.totalCeiling,
            "la population des tailles figées a GROSSI (\(total) > \(Self.totalCeiling)). "
            + "C'est la règle qui mord quand un fichier DÉJÀ porteur en ajoute une : la règle 1 "
            + "ne le verrait pas, son nom étant déjà épinglé."
        )
    }

    // MARK: - Règle 4 — un fichier qui sort ne revient pas

    func test_unFichierQuiQuitteLaListeEnEstRetire() throws {
        let stillBearing = Set(
            try sources()
                .filter { !Self.frozenSites(in: text(of: $0)).isEmpty }
                .map { relativePath($0) }
        )

        let departed = Self.bearingFiles.subtracting(stillBearing).sorted()
        if !departed.isEmpty {
            // Sortir de la liste est le but ; le signaler force l'ÉLAGAGE dans le
            // même commit, sinon la liste garde des noms sans site et cesse de
            // dire la vérité — le mode de panne de `legacyOverBudget` (#4302).
            XCTFail(
                "Ces fichiers n'ont plus aucune taille figée — bravo, et les RETIRER de "
                + "`bearingFiles` + baisser `totalCeiling` (et `textCeiling` s'il y avait du "
                + "texte) dans ce même commit :\n  " + departed.joined(separator: "\n  ")
            )
        }
    }

    // MARK: - Bornes

    /// Sans elle, les trois cliquets passeraient au vert en ne regardant rien —
    /// le mode de panne payé au 256i et rejoué au 257i.
    func test_leBalayageVoitBienLeDepot() throws {
        let files = try sources()
        XCTAssertGreaterThan(files.count, 400, "racine attendue : \(appRoot.path)")

        let names = Set(files.map { relativePath($0) })
        let missing = Self.bearingFiles.subtracting(names)
        XCTAssertTrue(missing.isEmpty,
                      "noms épinglés introuvables sur disque : \(missing.sorted())")
    }

    /// **La borne qui compte le plus.** Toute la règle 2 repose sur la
    /// séparation texte / glyphe : un classifieur effondré rendrait `0` texte —
    /// et le cliquet resterait VERT en ne protégeant plus rien. Les deux
    /// populations doivent donc être NON VIDES, chacune de son côté.
    func test_laClassificationSepareBienLesDeuxPopulations() throws {
        let sites = try allSites().map { $0.1 }
        XCTAssertGreaterThan(sites.filter { $0.receiver == .glyph }.count, 150,
                             "les glyphes sont la population majoritaire (207 au 264i)")
        XCTAssertGreaterThan(sites.filter { $0.receiver == .text }.count, 20,
                             "le texte figé existe (36 au 264i) — un 0 ici signerait un classifieur mort")
    }

    /// Témoins synthétiques : la question dont la réponse est connue d'avance.
    /// Ils fixent les DEUX chemins du classifieur — tête sur la même ligne, et
    /// tête retrouvée en remontant une chaîne de modificateurs.
    func test_leClassifieurLitBienLaTeteDeChaine() {
        let sameLine = """
        Text(value).font(.system(size: 12, weight: .bold))
        """
        XCTAssertEqual(Self.frozenSites(in: sameLine).map(\.receiver), [.text])

        let chained = """
        VStack {
            Image(systemName: icon)
                .symbolRenderingMode(.hierarchical)

                .font(.system(size: 15, weight: .semibold))
            Text(label)
                .foregroundColor(.white)
                .font(.system(size: 10))
        }
        """
        XCTAssertEqual(Self.frozenSites(in: chained).map(\.receiver), [.glyph, .text])

        // Un site en commentaire n'existe pas : c'est ce que `mask` garantit, et
        // c'est ce qui autorise la doctrine à être écrite JUSTE au-dessus du site.
        let commented = """
        // .font(.system(size: 99)) — doctrine 86i
        Text(x).font(.system(size: 11))
        """
        XCTAssertEqual(Self.frozenSites(in: commented).count, 1)
    }

    // MARK: - Balayage

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy")
    }

    private func sources() throws -> [URL] {
        guard let walker = FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil)
        else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    private func text(of url: URL) -> String {
        (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }

    /// Chemin relatif à `appRoot`, calculé par COMPOSANTS plutôt que par
    /// remplacement de préfixe : l'énumérateur peut rendre `/private/var/…` là
    /// où `#filePath` dit `/var/…`, et un `replacingOccurrences` raterait alors
    /// silencieusement — laissant les 87 noms épinglés introuvables et les
    /// quatre règles rouges pour une raison qui n'a rien à voir avec elles.
    private func relativePath(_ url: URL) -> String {
        let root = appRoot.standardizedFileURL.pathComponents
        let full = url.standardizedFileURL.pathComponents
        guard full.count > root.count else { return url.lastPathComponent }
        return full.dropFirst(root.count).joined(separator: "/")
    }

    private func allSites() throws -> [(String, Site)] {
        try sources().flatMap { url in
            Self.frozenSites(in: text(of: url)).map { (relativePath(url), $0) }
        }
    }
}
