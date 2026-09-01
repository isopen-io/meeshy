import XCTest
@testable import Meeshy

/// **Le lecteur du son de contenu est bien MONTÉ, et dans la branche SANS
/// canvas** (directive porteur 2026-09-01, #4657).
///
/// `ComposerForegroundSound` a sa suite de règle ; celle-ci prouve le dernier
/// maillon — que la surface l'ASSEMBLE, et à l'endroit dit. Trois affirmations
/// distinctes, et la deuxième est celle qui se perdrait en silence : déplacer
/// la carte hors de `textOnlyContent` la ferait paraître AUSSI sur la scène,
/// où un son de premier plan est déjà un objet posé sur le canvas.
///
/// Même patron que `ComposerDocumentSurfaceMentionMountGuardTests` — ancrage
/// par le CORPS de la déclaration (équilibrage d'accolades), jamais par un
/// comptage global, qui ne dirait pas si l'appel est au bon endroit.
final class ComposerForegroundSoundMountGuardTests: XCTestCase {

    private func source(_ chemin: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(chemin)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func corps(_ ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre) else { return nil }
        var profondeur = 0
        var resultat = ""
        for caractere in code[debut.lowerBound...] {
            resultat.append(caractere)
            if caractere == "{" { profondeur += 1 }
            if caractere == "}" {
                profondeur -= 1
                if profondeur == 0 { return resultat }
            }
        }
        return nil
    }

    /// La carte se monte DANS la disposition texte-seul — la seule branche que
    /// `content` rend quand `showsScene` est faux. C'est cette structure, et
    /// elle seule, qui tient le « sans canvas » de la directive : une seconde
    /// garde écrite dans la règle de résolution se tairait le jour où celle-ci
    /// changerait.
    func test_laCarte_estMontéeDansLaBrancheSANSCanvas() throws {
        let surface = try source("ComposerDocumentSurface.swift")
        guard let texteSeul = corps("private var textOnlyContent: some View {", dans: surface) else {
            return XCTFail("`textOnlyContent` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            texteSeul.contains("foregroundSoundCard"),
            "`textOnlyContent` ne monte plus la carte du son de contenu : le son placé en contenu de "
                + "publication redeviendrait une vignette muette dans le rail."
        )
        guard let carte = corps("private var foregroundSoundCard: some View {", dans: surface) else {
            return XCTFail("`foregroundSoundCard` introuvable.")
        }
        XCTAssertTrue(
            carte.contains("MeeshyAudioTranscriptPlayer("),
            "La carte doit monter le lecteur du SDK, jamais une bande réécrite ici."
        )
        // **UNE carte par son** (#4672). Une seule se montait, celle du DERNIER
        // fichier ; les précédents partaient à la publication sans que rien à
        // l'écran ne dise qu'ils existaient.
        XCTAssertTrue(
            carte.contains("ForEach(foregroundSounds)"),
            "La carte doit se répéter sur TOUS les sons de contenu : un `if let` n'en montre "
                + "qu'un, et les autres partent quand même à la publication."
        )
        XCTAssertTrue(
            carte.contains("rappel(son)"),
            "…et le tap doit désigner LE son touché : un rappel sans argument ouvrirait "
                + "toujours le même, un contrôle qui a l'air de répondre et vise son voisin."
        )
    }

    /// **La branche à SCÈNE ne la monte pas.** Contre-épreuve : sans elle, la
    /// première assertion resterait verte si la carte était montée dans les
    /// DEUX branches — c'est-à-dire précisément le défaut que la directive
    /// exclut (« sans canvas »).
    func test_laBrancheÀSCÈNE_neLaMontePas() throws {
        let surface = try source("ComposerDocumentSurface.swift")
        guard let contenu = corps("private var content: some View {", dans: surface),
              let scene = contenu.range(of: "EmbeddedSceneCanvas(") else {
            return XCTFail("`content` ou sa scène introuvables.")
        }
        let brancheScene = contenu[scene.lowerBound...]
        XCTAssertFalse(
            brancheScene.contains("foregroundSoundCard"),
            "La carte ne doit pas paraître sous la scène : un son de premier plan y est déjà un objet "
                + "posé sur le canvas, et le montrer deux fois ferait deux contrôles pour un son."
        )
    }

    /// **Toucher la carte doit MENER quelque part** (loi 4). Le meuble sert la
    /// fermeture d'édition, et elle rouvre bien le portail du son — sans quoi
    /// la carte serait un contrôle inerte à l'air parfaitement vivant.
    func test_leMeuble_câbleLÉdition_versLaFeuilleDeCréationAudio() throws {
        let surfaces = try source("MeeshyComposerHost+Surfaces.swift")
        guard let document = corps("var documentSurface: some View {", dans: surfaces) else {
            return XCTFail("`documentSurface` introuvable.")
        }
        XCTAssertTrue(document.contains("foregroundSounds: foregroundSounds"),
                      "La surface ne reçoit plus les sons de contenu.")
        XCTAssertTrue(document.contains("editForegroundSound(son)"),
                      "Le tap de la carte n'est plus câblé : il ne ferait rien.")

        let son = try source("MeeshyComposerHost+Sound.swift")
        guard let edition = corps("func editForegroundSound(", dans: son) else {
            return XCTFail("`editForegroundSound` introuvable.")
        }
        // **Repointé au #4684** : l'ouverture est passée par un site UNIQUE
        // (`openSoundSheet`), qui pose le placement ET renouvelle l'identité de
        // la feuille. Épingler les deux lignes d'avant ferait rougir la garde
        // sur le correctif qu'elle devrait protéger.
        XCTAssertTrue(edition.contains("openSoundSheet(placement: .foreground)"),
                      "L'édition doit rouvrir « Création audio » par le site unique, sur la "
                      + "moitié du commutateur que le geste vient de désigner.")

        guard let feuille = corps("var composerSoundSheet: some View {", dans: son) else {
            return XCTFail("`composerSoundSheet` introuvable.")
        }
        XCTAssertTrue(
            feuille.contains("initialAudio:"),
            "La feuille doit s'ouvrir SUR le son édité — sans `initialAudio`, « modifier » rouvrirait un "
                + "enregistreur vierge et l'auteur perdrait sa prise."
        )
    }

    // MARK: - La pastille du son de FOND (#4668/#4669)

    /// **Le plancher de 44 pt a SUIVI le son.**
    ///
    /// `ComposerSocleDensityTests` le gardait sur la pastille du socle, qui a
    /// été retirée (#4669). La pastille de l'avatar en hérite en devenant
    /// bouton (#4668) : sans ce témoin, retirer l'ancre du socle aurait rendu
    /// la protection à un contrôle sans la lui redonner ailleurs — un cliquet
    /// éteint en croyant le déplacer.
    func test_laPastilleDeLAvatar_gardeUneCibleDeQuaranteQuatrePoints() throws {
        let badge = try source("ComposerAvatarSoundBadge.swift")
        XCTAssertTrue(
            badge.contains(".frame(minHeight: 44)"),
            "Devenue bouton, la pastille du son de fond doit la cible de 44 pt : sa hauteur de "
                + "lecture (28 pt) n'est pas une cible tactile."
        )
    }

    /// **Elle ne s'annonce comme bouton que si elle OUVRE quelque chose.**
    ///
    /// La loi 4 dans les deux sens : un `.isButton` posé inconditionnellement
    /// promettrait une action à VoiceOver sur un son emprunté, que
    /// `ComposerSoundColumn.opensEditor` refuse justement d'ouvrir.
    func test_laPastille_neSAnnoncePasBouton_sansAction() throws {
        let badge = try source("ComposerAvatarSoundBadge.swift")
        guard let corpsVue = corps("var body: some View {", dans: badge) else {
            return XCTFail("`body` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(corpsVue.contains("if let onTap"),
                      "La forme bouton doit être CONDITIONNÉE par la présence d'une action.")
        XCTAssertTrue(corpsVue.contains(".accessibilityAddTraits(.isButton)"),
                      "…et la branche qui ouvre doit le DIRE au lecteur d'écran.")
    }

    /// **La durée survit à la troncature** (#4676).
    ///
    /// Attribution et durée sont DEUX `Text` : le premier cède la largeur, le
    /// second ne la cède jamais. Les refondre en un seul rendrait « Feel the
    /// pulse · @jcnm · 2… », ce que la vérification simulateur a mesuré.
    func test_laDureeDeLaPastille_neSeTronqueJamais() throws {
        let badge = try source("ComposerAvatarSoundBadge.swift")
        XCTAssertTrue(badge.contains("ComposerSoundCredit.attribution(for: sound)"),
                      "le titre et l'auteur viennent de la moitié TRONQUABLE")
        XCTAssertTrue(badge.contains("ComposerSoundCredit.durationLabel(for: sound)"),
                      "…et la durée de la sienne, rendue à part")
        XCTAssertFalse(badge.contains("ComposerSoundCredit.label(for: sound)"),
                       "le libellé COMPLET dans un seul `Text` est exactement ce qui tronquait la durée")
    }

    /// **Poser un son en FOND passe par le remplacement, jamais en direct**
    /// (#4676). Un appel nu à `attachPastedAudio(role: .background)` ajouterait
    /// un second fond que personne ne regarde.
    func test_poserUnFond_passeParLeRemplacement() throws {
        let sons = try source("MeeshyComposerHost+Sound.swift")
        XCTAssertTrue(sons.contains("ComposerBackgroundSoundReplacement.supersededId("),
                      "la règle doit être APPELÉE, pas réécrite dans l'hôte")
        guard let poseur = corps("func attachBackgroundSound(url: URL) {", dans: sons) else {
            return XCTFail("`attachBackgroundSound` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(poseur.contains("retireLeSonDeFondActuel()"),
                      "le retrait précède la pose : `addAudioObject` ne remplace pas, il ajoute")
        guard let emprunt = corps("func attachBorrowedBackgroundSound(", dans: sons) else {
            return XCTFail("`attachBorrowedBackgroundSound` introuvable.")
        }
        XCTAssertTrue(emprunt.contains("retireLeSonDeFondActuel()"),
                      "…et l'emprunt aussi : sans lui, `addBorrowedSound` en fait un PREMIER PLAN")
    }

    /// **Une ouverture, une feuille NEUVE** (#4684).
    ///
    /// `.sheet(item:)` reconstruit sur changement d'ITEM ; deux ouvertures
    /// portent la même valeur `.sound`, donc SwiftUI peut réutiliser la vue et
    /// tout son `@State`. Observé une fois au simulateur : la feuille rendait la
    /// carte d'après-enregistrement au lieu de celle de réouverture, et valider
    /// déplaçait le son de fond vers le contenu, en silence.
    ///
    /// Le témoin garde les DEUX moitiés : l'identité posée sur la feuille, et le
    /// fait qu'aucun site n'ouvre le portail par un chemin qui la contournerait.
    /// La seconde est celle qui se perdrait — un cinquième site d'appel ne
    /// rougirait nulle part, le défaut ne se voyant qu'à la SECONDE ouverture.
    func test_laFeuilleAudio_estNEUVE_aChaqueOuverture() throws {
        let sons = try source("MeeshyComposerHost+Sound.swift")
        XCTAssertTrue(sons.contains(".id(soundSheetSession)"),
                      "sans identité renouvelée, SwiftUI réutilise la feuille et son état")
        guard let ouverture = corps("func openSoundSheet(placement: ComposerAudioRole?) {",
                                    dans: sons) else {
            return XCTFail("`openSoundSheet` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(ouverture.contains("soundSheetSession = UUID()"),
                      "l'ouverture doit RENOUVELER l'identité")
        XCTAssertTrue(ouverture.contains("presentedPortal = .sound"),
                      "…et présenter le portail, les deux dans le même geste")

        for nom in ["MeeshyComposerHost+Sound.swift",
                    "MeeshyComposerHost+Intake.swift",
                    "MeeshyComposerHost+Socle.swift",
                    "MeeshyComposerHost+Surfaces.swift",
                    "MeeshyComposerHost+Portals.swift"] {
            let code = try source(nom)
            // **`.sound` est le PRÉFIXE de `.soundLibrary`.** Compté nu, ce
            // fragment attribuait à la feuille audio une ouverture de
            // l'ÉTAGÈRE — un faux positif qui a fait rougir cette garde à sa
            // première exécution. Les deux portails se comptent donc, et l'un
            // se retranche de l'autre.
            let ouvertures = occurrences(of: "presentedPortal = .sound", dans: code)
                - occurrences(of: "presentedPortal = .soundLibrary", dans: code)
            let attendu = (nom == "MeeshyComposerHost+Sound.swift") ? 1 : 0
            XCTAssertEqual(ouvertures, attendu,
                           "\(nom) ouvre la feuille audio hors de `openSoundSheet` : "
                           + "l'identité ne serait pas renouvelée, et la feuille se "
                           + "re-présenterait périmée.")
        }
    }

    private func occurrences(of fragment: String, dans code: String) -> Int {
        code.components(separatedBy: fragment).count - 1
    }

    // MARK: - La pastille audio du CANVAS (#4671)

    /// **Toucher une pastille audio du canvas l'ouvre — le TAP, pas le
    /// double-tap.** Le mot de la directive est « toucher ».
    ///
    /// Avant ce lot, le geste faisait le CONTRAIRE : `itemKind(forId:)` ignorait
    /// `audioPlayerObjects`, donc `handleSingleTap` retombait sur sa branche
    /// « fond » et DÉSÉLECTIONNAIT. Pas un contrôle inerte — un contrôle qui
    /// fait l'inverse de ce qu'on attend.
    func test_toucherUnePastilleAudio_ouvreLaFeuille() throws {
        let surfaces = try source("MeeshyComposerHost+Surfaces.swift")
        guard let tap = corps("onItemTapped: { id, kind in", dans: surfaces) else {
            return XCTFail("`onItemTapped` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(tap.contains("if kind == .audio { editSceneSound(id) }"),
                      "le tap simple doit ouvrir « Création audio » sur la pastille touchée")
    }

    /// **Elle n'offre AUCUN placement, et se remplace à sa place.**
    ///
    /// Les deux moitiés du commutateur désignent le fond de la slide et la
    /// pièce jointe du post ; une pastille du canvas n'est ni l'un ni l'autre.
    /// L'offrir laisserait l'auteur DÉPLACER son objet en croyant le rogner —
    /// et, sans troisième valeur, il ne pourrait jamais le remettre.
    func test_lePlacement_nEstPasOffertAUnePastilleDuCanvas() throws {
        let sons = try source("MeeshyComposerHost+Sound.swift")
        XCTAssertTrue(sons.contains("placement: editedSceneChipId == nil ? $chosenSoundPlacement : nil"),
                      "la feuille ne doit rendre aucun choix qu'elle ne saurait honorer")
        guard let pose = corps("func applyCreatedAudio(", dans: sons) else {
            return XCTFail("`applyCreatedAudio` introuvable.")
        }
        let avantSwitch = pose.components(separatedBy: "switch chosenSoundPlacement").first ?? ""
        XCTAssertTrue(avantSwitch.contains("if let pastille = editedSceneChipId"),
                      "le remplacement en place se décide AVANT le `switch` : sinon un placement "
                      + "choisi lors d'une AUTRE ouverture ferait déménager l'objet")
    }

    /// **Un son emprunté, ou sans fichier local, ne s'ouvre pas.** Le premier
    /// pour ne pas voler son crédit, le second parce qu'il n'y aurait rien à
    /// faire écouter. Le tap reste alors une sélection — un geste qui fait
    /// moins, jamais un bouton muet.
    func test_unePastille_quOnNePeutPasEditer_neSOuvrePas() throws {
        let sons = try source("MeeshyComposerHost+Sound.swift")
        guard let edition = corps("func editSceneSound(_ id: String) {", dans: sons) else {
            return XCTFail("`editSceneSound` introuvable.")
        }
        XCTAssertTrue(edition.contains("ComposerSoundColumn.opensEditor(objet)"),
                      "la loi du crédit est APPELÉE, pas réécrite")
        XCTAssertTrue(edition.contains("viewModel.loadedAudioURLs[id] != nil"),
                      "sans fichier local, la feuille n'aurait rien à faire viser")
    }

    /// **La pastille est alimentée par la LOI, jamais par la lecture directe.**
    ///
    /// `viewModel.currentEffects.resolvedBackgroundAudio` passé tel quel à la
    /// surface était le motif d'avant #4670 : correct tant qu'aucun chemin ne
    /// posait le même fichier des deux côtés, et muet le jour où l'un le ferait.
    func test_laSurface_recoitLeSonDeLaLoi_jamaisDuViewModelEnDirect() throws {
        let surfaces = try source("MeeshyComposerHost+Surfaces.swift")
        XCTAssertTrue(surfaces.contains("backgroundSound: avatarBadgeSound"),
                      "La surface doit recevoir ce que `ComposerSoundColumn` autorise.")
        let sons = try source("MeeshyComposerHost+Sound.swift")
        XCTAssertTrue(sons.contains("ComposerSoundColumn.avatarBadge("),
                      "…et la résolution doit APPELER la loi, pas la réécrire.")
    }
}

/// **Un son placé en CONTENU n'est pas AUSSI la bande-son de la scène**
/// (directive porteur 2026-09-01, #4657).
///
/// Le commutateur de placement dit deux choses différentes — « Se joue pendant
/// la lecture, sans lecteur visible » d'un côté, « Pièce jointe du post, avec
/// son lecteur » de l'autre. `syncPostMediaIntoSlides` posait
/// `applyContentAudio` sur TOUT audio du document, si bien que le second choix
/// produisait aussi le premier : la pastille de l'avatar annonçait « Son de
/// fond, 5 secondes » au-dessus d'une carte de contenu portant le même son.
/// Mesuré au simulateur `Meeshy-iOS26`, reproductible.
///
/// Garde NÉGATIVE : elle rougit à la RÉINTRODUCTION de l'appel, pas à la
/// disparition du fichier — `test_leSiteDeSynchronisationExisteToujours` en
/// répond.
final class ComposerContentSoundIsNotSceneAudioGuardTests: XCTestCase {

    private func intake() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(
                "Meeshy/Features/Main/Composer/MeeshyComposerHost+Intake.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    func test_leSiteDeSynchronisationExisteToujours() throws {
        XCTAssertTrue(try intake().contains("func syncPostMediaIntoSlides()"),
                      "La garde ci-dessous ne mesurerait rien sans son site.")
    }

    func test_laSynchronisationNeVerseAucunAudioDansLaBandeSonDeLaScène() throws {
        XCTAssertFalse(
            try intake().contains("applyContentAudio"),
            "Un son de la liste média du document est un son de CONTENU — le placement « fond » ne "
                + "passe jamais par là (`applyCreatedAudio` et `ingestSoundFiles` vont droit à la "
                + "scène). Le reverser en bande-son fait dire à la pastille de l'avatar « Son de "
                + "fond » au-dessus de la carte de contenu qui porte le même son."
        )
    }
}
