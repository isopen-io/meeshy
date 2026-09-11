import XCTest
import MeeshySDK
@testable import Meeshy

/// **Une pièce jointe ouverte en plein écran se réagit sur ELLE-MÊME** (#6084,
/// directive porteur 2026-09-11 : « lorsqu'on affiche une image pièce jointe en
/// plein écran, il faut pouvoir ajouter une réaction à l'attachement
/// directement »).
///
/// **La rangée se RÉVÈLE, elle ne se pose pas** (révision porteur du même jour) :
/// « les réactions sur les attachements en plein écran doivent s'activer comme
/// pour répondre ou composer, il faut mettre un bouton réagir (emoji +) qui
/// affiche la traille des emojis de réaction ». Au repos, rien ne se pose sur
/// l'image ; un bouton rejoint la rangée d'actions qui porte déjà Répondre et
/// Composer, et c'est lui qui ouvre.
///
/// Trois moitiés, gardées ensemble parce qu'aucune ne vaut seule :
///  1. la LOI — DEUX questions distinctes, deux fonctions : « cette pièce
///     offre-t-elle de réagir ? » (protection, contexte) et « la rangée est-elle
///     montée ? » (la première, PLUS l'état d'ouverture). Pures et `nonisolated`,
///     donc jouables en XCTest, contrairement à la condition qui vivait dans le
///     `body` de la tuile de grille ;
///  2. les SITES d'AFFICHAGE — que le bouton rejoigne la rangée d'actions, que la
///     rangée d'émojis n'existe qu'ouverte, au gabarit de la story, et que
///     changer de pièce la referme ;
///  3. le SITE de ROUTAGE — que l'émoji parte vers la PIÈCE (le rappel
///     par-image de la conversation) et jamais vers le message qui la porte.
///
/// Le point 3 est celui qui coûterait le plus cher à rater : une barre posée sur
/// une photo qui incrémenterait la réaction du MESSAGE aurait l'air de marcher,
/// et le compteur de la bulle bougerait — le défaut ne se verrait qu'en
/// comparant deux surfaces.
final class FullscreenAttachmentReactionTests: XCTestCase {

    // MARK: - Fabriques

    private func piece(id: String = "att-1",
                       viewOnce: Bool = false,
                       blurred: Bool = false,
                       encrypted: Bool = false) -> MessageAttachment {
        MessageAttachment(
            id: id,
            mimeType: "image/jpeg",
            isViewOnce: viewOnce,
            isBlurred: blurred,
            isEncrypted: encrypted
        )
    }

    // MARK: - 1 · La loi — question 1 : cette pièce offre-t-elle de réagir ?

    /// **Le critère 3 de l'issue.** Le plein écran ne montre QU'UNE pièce à la
    /// fois : « seule » n'y décrit pas une situation exceptionnelle mais le cas
    /// nominal. La règle de la grille (`!solo`, qui laisse la réaction
    /// message-level aux bulles à une seule image) n'a donc rien à y faire.
    func test_lePleinEcran_offreDeReagir_memeQuandLaPieceEstSeule() {
        XCTAssertTrue(
            AttachmentReactionOffer.offersReaction(
                surface: .fullscreen, attachment: piece(), hasHandler: true),
            "Une pièce seule ouverte en plein écran DOIT offrir de réagir — c'est le geste "
                + "que l'issue #6084 demande, et le plein écran n'a pas d'autre pièce à côté."
        )
    }

    /// **Le critère 4 — et il se lit au niveau de la PIÈCE.**
    ///
    /// `Message.isViewOnce` ne dit que la protection du porteur ; une pièce
    /// déclare la sienne (`isViewOnce` / `isBlurred` / `isEncrypted`). Offrir de
    /// réagir sur une vue unique inviterait à la garder à l'écran le temps de
    /// choisir un émoji — exactement ce qu'une vue unique refuse.
    ///
    /// La garde a REMONTÉ d'un cran avec la révision porteur : elle décide
    /// désormais de l'existence du BOUTON, pas seulement de la rangée.
    func test_uneProtegee_nOffreRien_surAucuneSurface() {
        for surface: AttachmentReactionOffer.Surface in [.fullscreen, .bubbleGrid(isSolo: false)] {
            XCTAssertFalse(
                AttachmentReactionOffer.offersReaction(
                    surface: surface, attachment: piece(viewOnce: true), hasHandler: true),
                "Vue unique ⇒ aucun bouton (\(surface))."
            )
            XCTAssertFalse(
                AttachmentReactionOffer.offersReaction(
                    surface: surface, attachment: piece(blurred: true), hasHandler: true),
                "Floutée ⇒ aucun bouton (\(surface))."
            )
            XCTAssertFalse(
                AttachmentReactionOffer.offersReaction(
                    surface: surface, attachment: piece(encrypted: true), hasHandler: true),
                "Chiffrée ⇒ aucun bouton (\(surface)). Le chiffrement est la troisième "
                    + "protection que `ComposableAttachment.isProtected` déclare, et la tuile "
                    + "de grille ne la lisait PAS."
            )
        }
    }

    /// **Fail-closed : un état d'ouverture RESTÉ vrai ne rouvre pas une pièce
    /// protégée.** La seconde question COMPOSE la première plutôt que de vivre à
    /// côté d'elle — c'est la seule forme où un drapeau d'interaction collé (une
    /// pièce protégée feuilletée alors que la rangée était ouverte) ne peut pas
    /// contourner la protection.
    func test_uneProtegee_neMontreAucuneRangee_memeOuverte() {
        XCTAssertFalse(
            AttachmentReactionOffer.showsPicker(
                surface: .fullscreen, attachment: piece(viewOnce: true),
                hasHandler: true, isOpen: true),
            "Un drapeau d'ouverture ne doit JAMAIS pouvoir rouvrir une pièce protégée."
        )
    }

    /// La grille garde sa règle : une bulle à UNE seule image laisse la réaction
    /// au MESSAGE (le double-tap et l'appui long y restent libres, et le simple
    /// tap n'y paie pas la fenêtre de désambiguïsation d'iOS). Ce lot ouvre le
    /// plein écran, pas la bulle.
    func test_laGrille_gardeSaRegle_uneImageSeuleResteAuMessage() {
        XCTAssertFalse(
            AttachmentReactionOffer.offersReaction(
                surface: .bubbleGrid(isSolo: true), attachment: piece(), hasHandler: true),
            "Une image SEULE dans sa bulle garde la réaction message-level."
        )
        XCTAssertTrue(
            AttachmentReactionOffer.offersReaction(
                surface: .bubbleGrid(isSolo: false), attachment: piece(), hasHandler: true),
            "En grille multi-images, la réaction par-image reste offerte — comportement "
                + "existant, que ce lot déplace sans le changer."
        )
    }

    /// **Loi 4 : un contrôle existe s'il a un EFFET.** Un hôte qui ne sait pas
    /// router l'émoji (post, story, commentaire — aucune réaction par média côté
    /// serveur) ne doit peindre ni bouton ni rangée.
    func test_sansRappel_rienNEstOffert_jamaisUnControleInerte() {
        XCTAssertFalse(
            AttachmentReactionOffer.offersReaction(
                surface: .fullscreen, attachment: piece(), hasHandler: false))
        XCTAssertFalse(
            AttachmentReactionOffer.offersReaction(
                surface: .bubbleGrid(isSolo: false), attachment: piece(), hasHandler: false))
    }

    // MARK: - 1 bis · La loi — question 2 : la rangée est-elle montée ?

    /// **Au repos, le visualiseur est NU** (révision porteur) : rien ne se pose
    /// sur l'image tant que le bouton n'a pas été touché.
    func test_auRepos_aucuneRangeeNEstMontee() {
        XCTAssertFalse(
            AttachmentReactionOffer.showsPicker(
                surface: .fullscreen, attachment: piece(), hasHandler: true, isOpen: false),
            "Rangée fermée ⇒ rien au-dessus de l'image. C'est tout l'objet de la révision."
        )
    }

    func test_uneFoisOuverte_laRangeeEstMontee() {
        XCTAssertTrue(
            AttachmentReactionOffer.showsPicker(
                surface: .fullscreen, attachment: piece(), hasHandler: true, isOpen: true))
    }

    /// La protection n'est pas réécrite ici : elle est LUE au prédicat que le
    /// menu d'appui long et la citation lisent déjà. Deux écritures des trois
    /// mêmes drapeaux sont deux règles qui ont déjà commencé à diverger.
    func test_laProtection_estCelleDuPredicatPartage() throws {
        let loi = try loiSource()
        XCTAssertTrue(
            compact(loi).contains("ComposableAttachment.isProtected("),
            "La loi doit LIRE `ComposableAttachment.isProtected` — pas recopier "
                + "`isViewOnce || isBlurred || isEncrypted`."
        )
    }

    /// La seconde question COMPOSE la première : `showsPicker` doit passer par
    /// `offersReaction` plutôt que de relire la protection une seconde fois.
    func test_lesDeuxQuestions_neSontPasDeuxLecturesDeLaProtection() throws {
        let loi = try loiSource()
        guard let seconde = corps("static func showsPicker(", dans: loi) else {
            return XCTFail("`showsPicker` introuvable — la seconde question n'existe pas.")
        }
        XCTAssertTrue(
            compact(seconde).contains("offersReaction("),
            "`showsPicker` doit composer `offersReaction`, sinon les deux questions "
                + "peuvent diverger sur la protection."
        )
    }

    // MARK: - 2 · Le site d'affichage — le bouton, puis la rangée

    /// Non-vacuité : les deux sites existent là où les gardes suivantes regardent.
    func test_lesSites_sontBienLaOuLesGardesRegardent() throws {
        let code = try gallerieSource()
        XCTAssertNotNil(
            corps("private func attachmentReactionBar(", dans: code),
            "`attachmentReactionBar` introuvable dans `ConversationMediaGalleryView` — "
                + "le plein écran n'offre aucune rangée de réaction (#6084, critère 1)."
        )
        XCTAssertNotNil(
            corps("private func mediaActionBar(", dans: code),
            "`mediaActionBar` introuvable — le bouton n'a pas de rangée d'actions à rejoindre."
        )
    }

    /// **Le bouton REJOINT la rangée d'actions existante** (révision porteur) :
    /// même rang que Répondre et Composer, jamais un ornement posé ailleurs.
    func test_leBoutonReagir_rejointLaRangeeDActions() throws {
        let code = try gallerieSource()
        guard let rangee = corps("private func mediaActionBar(", dans: code) else {
            return XCTFail("`mediaActionBar` introuvable")
        }
        let plat = compact(rangee)

        XCTAssertTrue(
            plat.contains("AttachmentReactionOffer.offersReaction(surface:.fullscreen"),
            "L'EXISTENCE du bouton est gardée par la loi — la protection remonte d'un "
                + "cran : elle décide du bouton, pas seulement de la rangée d'émojis."
        )
        XCTAssertTrue(
            plat.contains("hasHandler:onReactToMedia!=nil"),
            "Pas de rappel ⇒ pas de bouton (loi 4 : un contrôle existe s'il a un effet)."
        )
        XCTAssertTrue(
            plat.contains("reactionBarOpen.toggle()"),
            "L'appui doit BASCULER l'ouverture : un second appui referme."
        )
        XCTAssertTrue(
            plat.contains("\"face.smiling\"") && plat.contains("\"plus\""),
            "L'icône est un émoji AVEC un « + » (motif `emoji +` demandé par le porteur), "
                + "cohérente avec le « + » que la rangée porte déjà en fin de course."
        )
    }

    func test_laRangeeDuPleinEcran_estAuGabaritDeLaStory() throws {
        let code = try gallerieSource()
        guard let site = corps("private func attachmentReactionBar(", dans: code) else {
            return XCTFail("site introuvable")
        }
        let plat = compact(site)

        XCTAssertTrue(plat.contains("EmojiReactionPicker("),
                      "La rangée est la brique SDK partagée, pas une rangée réécrite.")
        XCTAssertTrue(plat.contains("scale:2"),
                      "Échelle 2 — le gabarit arrêté pour la story (#6083).")
        XCTAssertTrue(plat.contains("chrome:.none"),
                      "Sans fond ni contour : le média EST le fond, comme la scène d'une story.")
        XCTAssertTrue(plat.contains("scrollable:true"),
                      "À l'échelle 2 la rangée dépasse la largeur de l'écran : elle DÉFILE.")
        XCTAssertTrue(plat.contains("onExpandFullPicker:"),
                      "Le « + » de fin de rangée garde son rôle : ouvrir le sélecteur complet.")
    }

    /// La rangée n'existe QU'OUVERTE, et elle le demande à la loi — une
    /// conjonction réécrite sur place aurait divergé de la grille au premier
    /// ajustement de l'une des deux.
    func test_laRangee_nExistePasSansOuverture() throws {
        let code = try gallerieSource()
        guard let site = corps("private func attachmentReactionBar(", dans: code) else {
            return XCTFail("site introuvable")
        }
        let plat = compact(site)
        XCTAssertTrue(
            plat.contains("AttachmentReactionOffer.showsPicker(surface:.fullscreen"),
            "Le plein écran doit interroger la SECONDE question, sur `.fullscreen`."
        )
        XCTAssertTrue(
            plat.contains("isOpen:reactionBarOpen"),
            "L'état d'ouverture doit ENTRER dans la décision — sinon la rangée est "
                + "de nouveau permanente, ce que la révision porteur retire."
        )
    }

    /// **Changer de pièce referme la rangée** (révision porteur, point 5). Un
    /// drapeau resté ouvert ferait surgir la rangée sur un média que personne
    /// n'a demandé à commenter — et sur une pièce protégée, la loi la retiendrait
    /// mais l'intention serait déjà fausse.
    func test_changerDePage_refermeLaRangee() throws {
        let code = try gallerieSource()
        guard let relais = corps("private func handlePageChange(", dans: code) else {
            return XCTFail("`handlePageChange` introuvable")
        }
        XCTAssertTrue(
            compact(relais).contains("reactionBarOpen=false"),
            "Feuilleter doit refermer la rangée : elle appartient à la pièce qu'on "
                + "regardait, pas à l'écran."
        )
    }

    // MARK: - 2 bis · La COUCHE — rien ne passe devant la traînée

    /// **L'ORDRE DE COMPOSITION, pas la seule présence** (précision porteur
    /// 2026-09-11 : « les réactions doivent apparaître par-dessus tous les autres
    /// contrôleurs »).
    ///
    /// Ce témoin lit le `ZStack` racine et exige que `reactionLayer` soit monté
    /// APRÈS le pager ET après la couche des contrôles — dans un `ZStack`, le
    /// dernier enfant est le plus haut. C'est un test de composition sur la
    /// SOURCE : la profondeur réelle d'un arbre SwiftUI n'est pas observable
    /// depuis XCTest sans rendu, et je préfère le dire que le laisser croire.
    /// La preuve du RENDU est la capture simulateur, pas ce témoin.
    func test_laTrainee_estLaCoucheLaPlusHauteDuVisualiseur() throws {
        let code = try gallerieSource()
        guard let racine = corps("var body: some View {", dans: code) else {
            return XCTFail("`body` introuvable")
        }
        let plat = compact(racine)
        guard let pager = plat.range(of: "galleryPager"),
              let controles = plat.range(of: "overlayLayer"),
              let trainee = plat.range(of: "reactionLayer") else {
            return XCTFail("Les trois couches du ZStack racine ne se lisent pas — "
                           + "la garde d'ordre ne mesurerait rien.")
        }
        XCTAssertLessThan(controles.lowerBound, trainee.lowerBound,
                          "La traînée doit être montée APRÈS `overlayLayer` : dans un ZStack, "
                              + "le dernier enfant est le plus haut.")
        XCTAssertLessThan(pager.lowerBound, trainee.lowerBound,
                          "Et après le pager, évidemment.")
    }

    /// **Elle a QUITTÉ la pile des contrôles** — c'est la moitié du correctif que
    /// l'ordre seul ne dit pas. Tant qu'elle vivait dans le `VStack` de
    /// `controlsOverlay`, elle PARTAGEAIT la colonne avec le bloc bas, et aucun
    /// `.zIndex()` n'aurait pu l'en sortir : `zIndex` n'ordonne qu'entre frères
    /// du MÊME conteneur.
    func test_laTrainee_neVitPlusDansLaPileDesControles() throws {
        let code = try gallerieSource()
        guard let controles = corps("private var controlsOverlay: some View {", dans: code) else {
            return XCTFail("`controlsOverlay` introuvable")
        }
        XCTAssertFalse(
            compact(controles).contains("attachmentReactionBar("),
            "La traînée ne doit plus être un enfant du `VStack` des contrôles : elle y "
                + "partageait la hauteur avec le bloc bas, qui pouvait la comprimer."
        )
    }

    /// **Le rang se gagne par la COUCHE, jamais par `zIndex`.** Un `.zIndex()`
    /// posé sur la traînée serait le signe qu'on a essayé de la faire monter sans
    /// la sortir de sa pile — et il ne marcherait pas.
    func test_laTrainee_neSAppuiePasSurUnZIndex() throws {
        let code = try gallerieSource()
        guard let site = corps("private func attachmentReactionBar(", dans: code),
              let couche = corps("private var reactionLayer: some View {", dans: code) else {
            return XCTFail("sites introuvables")
        }
        XCTAssertFalse(compact(site).contains(".zIndex("),
                       "Pas de `zIndex` sur la traînée — c'est la couche qui la place.")
        XCTAssertFalse(compact(couche).contains(".zIndex("),
                       "Ni sur sa couche.")
    }

    /// **Masquer le chrome emporte la traînée.** Elle recouvre la rangée
    /// d'actions, donc le bouton n'est plus atteignable pendant qu'elle est
    /// ouverte : le tap sur le média devient sa sortie. Sans cette remise à zéro,
    /// rouvrir le chrome ferait resurgir une traînée que personne n'a redemandée.
    func test_masquerLesControles_refermeLaTrainee() throws {
        let code = try gallerieSource()
        guard let bascule = corps("private func toggleControls() {", dans: code) else {
            return XCTFail("`toggleControls` introuvable")
        }
        XCTAssertTrue(
            compact(bascule).contains("reactionBarOpen=false"),
            "Masquer le chrome doit refermer la traînée."
        )
    }

    /// **Une couche fermée ne vole aucune touche.** Quand la traînée n'est pas
    /// ouverte, le doigt doit atteindre le pager comme si cette couche n'existait
    /// pas — sinon on aurait rendu le visualiseur inerte pour ajouter un geste.
    func test_laCoucheFermee_neVolePasLeDoigt() throws {
        let code = try gallerieSource()
        guard let couche = corps("private var reactionLayer: some View {", dans: code) else {
            return XCTFail("`reactionLayer` introuvable")
        }
        XCTAssertTrue(
            compact(couche).contains(".allowsHitTesting(reactionBarOpen)"),
            "La couche ne teste les touches que lorsque la traînée est ouverte."
        )
    }

    /// La traînée flotte au-dessus de la PELLICULE, jamais dessus : la pellicule
    /// est le seul contrôle du bas qui sert à NAVIGUER, et la couvrir enfermerait
    /// le lecteur sur la pièce courante.
    func test_laTrainee_laisseLaPelliculeLibre() throws {
        let code = try gallerieSource()
        guard let marge = corps("private var reactionBarBottomInset: CGFloat {", dans: code) else {
            return XCTFail("`reactionBarBottomInset` introuvable")
        }
        XCTAssertTrue(
            compact(marge).contains("ConversationMediaFilmstrip.reservedHeight"),
            "La marge basse doit dégager la pellicule quand elle est montée."
        )
    }

    /// La grille cesse d'écrire sa propre conjonction : une seule loi, deux
    /// surfaces.
    func test_laGrille_consulteLaMemeLoi() throws {
        let code = try tuileSource()
        guard let regle = corps("private var canReactPerImage: Bool {", dans: code) else {
            return XCTFail("`canReactPerImage` introuvable")
        }
        XCTAssertTrue(
            compact(regle).contains("AttachmentReactionOffer.offersReaction(surface:.bubbleGrid(isSolo:solo)"),
            "La tuile de grille doit LIRE la loi — sinon les deux surfaces divergeront."
        )
    }

    // MARK: - 3 · Le site de routage — l'émoji vise la PIÈCE

    func test_lEmoji_partVersLaPiece_jamaisVersLeMessage() throws {
        let code = try gallerieSource()
        guard let site = corps("private func attachmentReactionBar(", dans: code) else {
            return XCTFail("site introuvable")
        }
        let plat = compact(site)
        XCTAssertTrue(
            plat.contains("onReactToMedia?(att,emoji)"),
            "L'émoji doit partir avec LA PIÈCE en main. Un rappel qui ne porterait que "
                + "l'émoji laisserait l'hôte deviner la cible — et il devinerait le message."
        )
        XCTAssertTrue(
            plat.contains("onReact:{emojiin"),
            "Le choix se fait dans `onReact`, la seule entrée que la rangée expose."
        )
    }

    /// **Un choix d'émoji RETIRE la rangée** (révision porteur, point 2). Sans
    /// cette fermeture, la rangée resterait ouverte sur une pièce déjà commentée
    /// et masquerait l'image qu'on venait regarder.
    func test_choisirUnEmoji_refermeLaRangee() throws {
        let code = try gallerieSource()
        guard let site = corps("private func attachmentReactionBar(", dans: code) else {
            return XCTFail("site introuvable")
        }
        guard let choix = corps("onReact: { emoji in", dans: site) else {
            return XCTFail("`onReact` introuvable")
        }
        XCTAssertTrue(
            compact(choix).contains("reactionBarOpen=false"),
            "Après l'émoji, la rangée se referme — elle a fait son travail."
        )
    }

    /// **Le rappel de l'hôte de conversation route vers la réaction PAR-IMAGE**
    /// (`toggleAttachmentReaction`), celle qui existe déjà dans le fil — jamais
    /// vers `toggleReaction`, qui vise le message.
    func test_lHoteDeConversation_routeVersLaReactionParImage() throws {
        let code = try hoteSource()
        guard let relais = corps("private func reactToMedia(", dans: code) else {
            return XCTFail("`reactToMedia` introuvable dans `ConversationMediaGalleryLayer` — "
                           + "le plein écran de conversation ne route rien (#6084, critère 2).")
        }
        let plat = compact(relais)
        XCTAssertTrue(
            plat.contains("viewModel.toggleAttachmentReaction(attachmentId:attachment.id"),
            "La cible est l'ID de la PIÈCE."
        )
        XCTAssertFalse(
            plat.contains("toggleReaction(messageId:"),
            "`toggleReaction` vise le MESSAGE : l'appeler ici ferait mentir la barre."
        )

        XCTAssertTrue(
            compact(code).contains("onReactToMedia:reactToMedia"),
            "Le rappel doit être PASSÉ à la galerie — une fonction que personne ne câble "
                + "ne réagit à rien."
        )
    }

    // MARK: - Helpers

    private func iosRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Main
            .deletingLastPathComponent()  // Features
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
    }

    private func loiSource() throws -> String {
        try strippedSource(at: "Meeshy/Features/Main/Views/AttachmentReactionOffer.swift")
    }

    private func gallerieSource() throws -> String {
        try strippedSource(at: "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift")
    }

    private func hoteSource() throws -> String {
        try strippedSource(at: "Meeshy/Features/Main/Views/ConversationView+MediaGallery.swift")
    }

    private func tuileSource() throws -> String {
        try strippedSource(at: "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift")
    }

    /// COMMENTAIRES RETIRÉS : une garde qui compte des occurrences dans un
    /// fichier commenté valide la documentation, pas le code.
    private func strippedSource(at relativePath: String) throws -> String {
        let url = iosRoot().appendingPathComponent(relativePath)
        return Self.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func corps(_ ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre),
              let ouvrante = code[debut.lowerBound...].firstIndex(of: "{") else { return nil }
        var profondeur = 0
        var resultat = ""
        var index = ouvrante
        while index < code.endIndex {
            let caractere = code[index]
            resultat.append(caractere)
            if caractere == "{" { profondeur += 1 }
            if caractere == "}" {
                profondeur -= 1
                if profondeur == 0 { return resultat }
            }
            index = code.index(after: index)
        }
        return nil
    }

    private func compact(_ code: String) -> String {
        code.replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "\n", with: "")
            .replacingOccurrences(of: "\t", with: "")
    }

    private static func stripComments(_ source: String) -> String {
        enum Mode { case code, string, lineComment, blockComment }
        var mode: Mode = .code
        var result = ""
        var escaped = false
        var pending: Character?

        for character in source {
            switch mode {
            case .code:
                if let slash = pending {
                    pending = nil
                    if character == "/" { mode = .lineComment; continue }
                    if character == "*" { mode = .blockComment; continue }
                    result.append(slash)
                }
                if character == "/" { pending = "/"; continue }
                if character == "\"" { mode = .string }
                result.append(character)
            case .string:
                result.append(character)
                if escaped { escaped = false; continue }
                if character == "\\" { escaped = true; continue }
                if character == "\"" { mode = .code }
            case .lineComment:
                if character == "\n" { mode = .code; result.append(character) }
            case .blockComment:
                if let star = pending, star == "*", character == "/" {
                    pending = nil
                    mode = .code
                    continue
                }
                pending = character == "*" ? "*" : nil
                if character == "\n" { result.append(character) }
            }
        }
        if let slash = pending, mode == .code { result.append(slash) }
        return result
    }
}
