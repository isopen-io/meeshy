import XCTest
@testable import Meeshy

/// #4062 — le rail *leading* porte les PORTES, celles qui font ENTRER de la
/// matière (planche rév. 27 § P4, loi 12).
///
/// ## Pourquoi une énumération de plus, alors que `ComposerDocumentTool` existe
///
/// Parce que les deux répondent à des questions différentes, et les confondre
/// aurait produit une rangée qui ment. `ComposerDocumentTool` parle le
/// vocabulaire du **document** — photo, caméra, fichier sont TROIS façons
/// d'attacher un fichier à un texte, et `emoji` insère dans le texte. Le rail
/// parle le vocabulaire de la **scène** — « média » est UNE porte quelle que
/// soit la source, « sticker » pose un objet, et « description » ne pose rien
/// du tout.
///
/// Ce que le rail réemploie, ce sont les EFFETS et les chemins d'ingestion
/// existants ; ce qu'il n'emprunte pas, c'est un découpage écrit pour un autre
/// écran.
///
/// ## Le fait que ces témoins gravent
///
/// **Les portes n'agissent pas toutes sur le même niveau du modèle**, et c'est
/// la seule chose qu'un lecteur pressé confondra :
///
/// | porte | niveau |
/// |---|---|
/// | média · son · sticker · lieu | crée un `MeeshyObject` |
/// | description | vise la `MeeshySlide` |
/// | **mention** | vise la **`MeeshyPublication`** |
///
/// La troisième ligne a été MESURÉE, pas supposée : le kind `mention` est
/// déclaré au contrat et produit par personne, et l'outil livré ouvre une
/// feuille de MODE (`INLINE` / `NOTE` / `SILENT`) dont le résultat voyage en
/// `CreatePostRequest.mentions` — une liste de la publication, jamais un objet
/// de la scène.
final class ComposerRailDoorTests: XCTestCase {

    // MARK: - Les niveaux du modèle

    func test_quatrePortes_creentUnObjetDeScene() {
        for porte in [ComposerRailDoor.media, .sound, .sticker, .place] {
            XCTAssertEqual(porte.level, .object, "\(porte.rawValue)")
        }
    }

    func test_laDescription_viseLaSlide_etNeCreeAucunObjet() {
        XCTAssertEqual(ComposerRailDoor.description.level, .slide)
    }

    /// **Le point que ce lot a mesuré plutôt que supposé.** L'issue annonçait
    /// une porte qui poserait un `MeeshyObject` de kind `mention` — ce qui
    /// aurait été un contrôle SANS EFFET, ce kind n'ayant aucun producteur et
    /// étant jeté à la relecture. La porte livrée vise la publication.
    func test_laMention_viseLaPublication_pasUnObjetDeScene() {
        XCTAssertEqual(ComposerRailDoor.mention.level, .publication,
                       "Une mention voyage en `CreatePostRequest.mentions`, jamais comme objet de scène.")
    }

    /// Aucune porte ne doit rester sans niveau : le `switch` est exhaustif au
    /// compilateur, ce témoin garde qu'aucune n'a été rangée par défaut.
    func test_chaquePorte_declareSonNiveau() {
        for porte in ComposerRailDoor.allCases {
            XCTAssertTrue([.publication, .slide, .object].contains(porte.level), porte.rawValue)
        }
    }

    // MARK: - L'ordre, qui est un contrat de mémoire musculaire

    func test_lOrdreDuRail_estCeluiDeLaPlanche() {
        XCTAssertEqual(ComposerRailDoor.canonicalRail,
                       [.description, .media, .sound, .sticker, .mention, .place])
    }

    func test_leRailCanonique_neManqueAucunePorte() {
        XCTAssertEqual(Set(ComposerRailDoor.canonicalRail),
                       Set(ComposerRailDoor.allCases),
                       "Une porte déclarée hors du rail canonique ne serait jamais peinte.")
    }

    // MARK: - Loi 4 : une porte non servie est ABSENTE

    func test_unePorteQueLHoteNeSertPas_estAbsente() {
        let offertes = ComposerRailDoor.offered(
            served: [.description, .media], format: .story, allowsCapture: true)
        XCTAssertEqual(offertes, [.description, .media])
    }

    func test_lOrdreSurvit_auxPortesRetirees() {
        let offertes = ComposerRailDoor.offered(
            served: [.place, .description, .sound], format: .story, allowsCapture: true)
        XCTAssertEqual(offertes, [.description, .sound, .place],
                       "L'ordre du rail ne se recompose pas au gré de ce qui reste.")
    }

    // MARK: - Le mood n'a pas de scène

    /// Un mood est une carte unique SANS scène (`ComposerProfile` : ni slides ni
    /// timeline). Les portes de niveau OBJET n'y ont donc rien à poser — elles
    /// sont absentes, pas grisées.
    func test_enMood_aucunePorteDObjet_nEstOfferte() {
        let offertes = ComposerRailDoor.offered(
            served: Set(ComposerRailDoor.allCases), format: .status, allowsCapture: true)
        XCTAssertFalse(offertes.contains { $0.level == .object },
                       "Un mood n'a pas de scène : rien à y poser.")
        XCTAssertEqual(offertes, [.description, .mention],
                       "…et les deux portes qui ne visent pas la scène restent.")
    }

    func test_dansLesTroisFormatsAScene_lesPortesDObjet_sontOffertes() {
        for format in [ComposerFormat.story, .post, .reel] {
            let offertes = ComposerRailDoor.offered(
                served: Set(ComposerRailDoor.allCases), format: format, allowsCapture: true)
            XCTAssertEqual(offertes, ComposerRailDoor.canonicalRail, "\(format)")
        }
    }

    // MARK: - La capture ne gouverne PAS la porte média

    /// **Distinction mesurée sur le code existant.** `allowsCapture` retire la
    /// CAMÉRA (`ComposerDocumentToolPolicy.visibleTools`), pas l'accès aux
    /// médias : la photothèque et l'importateur restent ouverts à un repost ou
    /// à une édition. Le rail n'ayant qu'UNE porte « média » pour les trois
    /// sources, la gater sur `allowsCapture` retirerait la bibliothèque avec la
    /// caméra — un contenu que l'auteur peut légitimement ajouter.
    func test_sansCapture_laPorteMedia_resteOfferte() {
        let offertes = ComposerRailDoor.offered(
            served: Set(ComposerRailDoor.allCases), format: .post, allowsCapture: false)
        XCTAssertTrue(offertes.contains(.media),
                      "Refuser la caméra ne referme pas la photothèque.")
    }

    // MARK: - Iconographie

    func test_chaquePorte_aSonGlyphe_etAucunNEstPartage() {
        let glyphes = ComposerRailDoor.allCases.map(\.symbolName)
        XCTAssertFalse(glyphes.contains(where: \.isEmpty))
        XCTAssertEqual(Set(glyphes).count, glyphes.count,
                       "Deux portes qui partagent un glyphe sont deux verbes qu'on ne distingue pas (loi 7).")
    }
}

/// La VUE du rail — trois faits qu'un rendu ne prouverait pas plus vite, et que
/// seule la source oppose (#4062).
final class ComposerLeadingRailSourceGuardTests: XCTestCase {

    private func railSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerLeadingRail.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Le fusible.** Sans lui, les gardes qui suivent seraient vertes par
    /// omission le jour où le fichier bouge.
    func test_laSourceDuRail_estLisibleEtNonVide() throws {
        let source = try railSource()
        XCTAssertGreaterThan(source.count, 800)
        XCTAssertTrue(source.contains("struct ComposerLeadingRail"))
    }

    /// **Le rail ne nomme JAMAIS un côté.** En arabe les deux s'échangent : un
    /// `.leading` codé en `.left` mettrait les portes du côté des contrôleurs.
    /// Cette garde rougit sur le retour du vocabulaire absolu.
    func test_leRail_neNommeAucunCoteAbsolu() throws {
        let source = compact(try railSource())
        for interdit in [".left)", ".right)", "alignment:.left", "alignment:.right",
                         "edge:.left", "edge:.right"] {
            XCTAssertFalse(source.contains(interdit),
                           "`\(interdit)` : un côté ABSOLU se retourne en RTL.")
        }
    }

    /// **Ancré en BAS.** Un `Spacer` en TÊTE du `VStack` pousse les portes vers
    /// le bas ; le retirer les recentrerait et remettrait les portes hautes
    /// hors de portée du pouce sur le côté LOIN de la main.
    func test_lesPortes_sontPousseesVersLeBas() throws {
        let source = compact(try railSource())
        XCTAssertTrue(source.contains("Spacer(minLength:0)ForEach(doors"),
                      "Le ressort doit PRÉCÉDER les portes : c'est lui qui les ancre en bas.")
    }

    /// **La vue ne décide de rien.** Elle reçoit `doors` déjà filtrées ; si elle
    /// se mettait à filtrer, une seconde loi 4 naîtrait et les deux
    /// divergeraient.
    func test_laVue_neRefiltrePasLesPortes() throws {
        let source = compact(try railSource())
        XCTAssertFalse(source.contains("ComposerRailDoor.offered("),
                       "Le filtrage appartient à la règle, jamais à la vue.")
    }

    /// La cible touchable vaut la largeur du rail — 44 pt —, indépendamment de
    /// la taille du glyphe.
    func test_laCibleTouchable_vientDeLaRegleDeGeometrie() throws {
        let source = compact(try railSource())
        XCTAssertTrue(source.contains("width:ComposerRailGeometry.railWidth,height:ComposerRailGeometry.railWidth"),
                      "La cible se lit de la règle, jamais d'un littéral.")
        XCTAssertTrue(source.contains(".contentShape(Rectangle())"),
                      "Sans forme de contenu, la zone touchable retombe sur le dessin du glyphe.")
    }

    /// VoiceOver entend le VERBE, pas le glyphe (loi 7).
    func test_chaquePorte_aUnLibelleVoiceOver() {
        for door in ComposerRailDoor.allCases {
            XCTAssertFalse(ComposerRailCopy.label(door).isEmpty, door.rawValue)
        }
        XCTAssertEqual(Set(ComposerRailDoor.allCases.map(ComposerRailCopy.label)).count,
                       ComposerRailDoor.allCases.count,
                       "Deux portes qui s'annoncent pareil sont indiscernables à VoiceOver.")
    }
}

/// **Ce que le MEUBLE sert réellement sur la scène** (#4092 · #4074).
///
/// `ComposerRailDoor.offered` et `ComposerTrailingRailPolicy.actions` sont
/// justes et testées depuis #4062/#4063 — elles filtrent ce qu'on leur donne.
/// Ce qu'aucune suite n'interrogeait, c'est **ce qu'on leur donne** : les deux
/// `Set` vécurent en littéraux dans le corps de `sceneSurface`, où rien ne peut
/// les lire. Résultat mesuré le 2026-08-30 : la porte `sticker` et l'empilement
/// étaient absents de l'écran, chacun pour un motif écrit en commentaire — et
/// les deux motifs étaient faux (la primitive existait, seul son `internal` la
/// retenait).
///
/// D'où la forme de cette suite : elle interroge la CAPACITÉ, pas le filtre.
final class ComposerSceneCapabilitiesTests: XCTestCase {

    /// **Le fusible.** Deux ensembles vides passeraient toutes les gardes
    /// positives qui suivent sans qu'aucune ne rougisse.
    func test_lesDeuxEnsembles_sontNonVides() {
        XCTAssertGreaterThanOrEqual(ComposerSceneCapabilities.doors.count, 5)
        XCTAssertGreaterThanOrEqual(ComposerSceneCapabilities.controllers.count, 3)
    }

    /// **La porte sticker est SERVIE.** Elle était déclarée au rail canonique et
    /// absente de l'ensemble servi : peinte nulle part, et son `case` du
    /// `switch` documenté « injoignable ». Le chemin existait pourtant en
    /// entier — `StickerPickerView` (publique) → `addSticker(emoji:)`.
    func test_laPorteSticker_estServie() {
        XCTAssertTrue(ComposerSceneCapabilities.doors.contains(.sticker),
                      "Sans elle, poser un sticker sur la scène est impossible depuis le composer unifié.")
    }

    /// Le rail rend bien la porte une fois le format appliqué — la capacité ne
    /// vaut que si elle traverse la règle qui la consomme.
    func test_laPorteSticker_atteintLeRail_surUnFormatAScene() {
        let portes = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                              format: .story,
                                              allowsCapture: true)
        XCTAssertTrue(portes.contains(.sticker))
    }

    /// **Et elle disparaît d'un `status`**, qui n'a pas de scène : un sticker
    /// est un objet, et un objet sans scène n'a nulle part où se poser.
    func test_laPorteSticker_disparaitDunStatus() {
        let portes = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                              format: .status,
                                              allowsCapture: true)
        XCTAssertFalse(portes.contains(.sticker))
    }

    /// **L'empilement est SERVI.** Son absence était attribuée à la
    /// `StoryCanvasUIView` ; il vit en réalité sur le MODÈLE, et y persiste son
    /// `zIndex` dans la slide — donc jusqu'au reader et à la publication.
    func test_lEmpilement_estServi() {
        XCTAssertTrue(ComposerSceneCapabilities.controllers.contains(.bringForward))
        XCTAssertTrue(ComposerSceneCapabilities.controllers.contains(.sendBackward))
    }

    /// La bande de la scène passe par la même capacité — sans quoi le littéral
    /// qu'elle portait aurait survécu à la garde négative de la suite suivante.
    func test_seuleLaPalette_estUneBandeServie() {
        XCTAssertEqual(ComposerSceneCapabilities.bands, [.palette],
                       "Une bande servie sans contenu occuperait le bas de l'écran pour rien.")
    }

    /// **Loi 4 — ce qui n'a pas de chemin reste ABSENT.** Cette garde est le
    /// contrepoids des deux précédentes : elle rougit si quelqu'un « complète »
    /// l'ensemble par ressemblance de nom, avant que l'inspecteur (#4073) et la
    /// sortie de scène (#4038) n'aient leur destination.
    func test_edition_etSortieDeScene_restentAbsentes() {
        XCTAssertFalse(ComposerSceneCapabilities.controllers.contains(.edit),
                       "L'inspecteur par kind n'est pas monté : servir `edit` ouvrirait un éditeur inexistant.")
        XCTAssertFalse(ComposerSceneCapabilities.controllers.contains(.leaveScene),
                       "Rien ne dit encore ce que l'objet DEVIENT hors de la scène (#4038).")
    }
}

/// **Le meuble LIT la règle, et route ce qu'elle sert** (#4092 · #4074).
///
/// La suite au-dessus prouve la capacité ; celle-ci prouve qu'elle atteint
/// l'écran. Sans elle, les deux ensembles pourraient être justes pendant que la
/// surface continue de servir ses anciens littéraux — la forme exacte du défaut
/// que #4120 a déjà payée une fois.
final class ComposerSceneCapabilitiesWiringGuardTests: XCTestCase {

    private func hostSource() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Le fusible.** Un chemin cassé rendrait toutes les gardes vertes.
    func test_laSourceDuMeuble_estLisibleEtNonVide() throws {
        let source = try hostSource()
        XCTAssertGreaterThan(source.count, 5_000)
        XCTAssertTrue(source.contains("ComposerSceneCapabilities"))
    }

    /// Les deux ensembles servis viennent de la RÈGLE.
    func test_lesDeuxRails_lisentLaRegle() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("served:ComposerSceneCapabilities.doors"),
                      "Le rail leading doit lire la capacité, pas un littéral.")
        XCTAssertTrue(source.contains("served:ComposerSceneCapabilities.controllers"),
                      "Le rail trailing doit lire la capacité, pas un littéral.")
    }

    /// **La garde NÉGATIVE** — et c'est elle qui tient dans le temps. Un `Set`
    /// littéral réécrit sur place laisserait les tests de capacité verts tout en
    /// servant autre chose à l'écran.
    func test_aucunEnsembleServi_neRedeviensUnLitteral() throws {
        let source = compact(try hostSource())
        XCTAssertFalse(source.contains("served:[."),
                       "Un ensemble servi écrit en littéral échappe à toute interrogation.")
    }

    /// La porte sticker OUVRE son portail — et le portail est celui du meuble,
    /// jamais d'une surface (#4120).
    func test_laPorteSticker_ouvreSonPortail() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("case.sticker:HapticFeedback.light()showsStickerPicker=true"),
                      "La porte doit poser l'état de présentation du meuble.")
        XCTAssertTrue(source.contains(".sheet(isPresented:$showsStickerPicker){stickerPickerSheet}"),
                      "Sans lecteur au-dessus de l'aiguillage, le booléen part et personne ne le lit.")
    }

    /// La feuille POSE un objet — elle n'écrit pas dans le texte, ce que fait
    /// sa voisine `emojiPickerSheet`. Confondre les deux est ce qui a tenu la
    /// porte fermée.
    func test_laFeuilleSticker_poseUnObjetParLeViewModel() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("viewModel.addSticker(emoji:emoji)"))
        XCTAssertTrue(source.contains("viewModel.addSticker(image:item.thumbnail,"))
    }

    /// L'empilement route vers le MODÈLE, jamais vers la vue UIKit.
    func test_lEmpilement_routeVersLeViewModel() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("case.bringForward:viewModel.bringForward(id:id)"))
        XCTAssertTrue(source.contains("case.sendBackward:viewModel.sendBackward(id:id)"))
    }
}

/// **La porte média ouvre les TROIS sources** (#4092 · leçon 335, seconde
/// instance sur le même écran).
///
/// `handleRailDoor(.media)` allait droit à la photothèque. Dès qu'une scène
/// existait, la CAMÉRA et l'IMPORT DE FICHIER — deux des sept entrées de la
/// rangée canonique — quittaient l'écran, sans qu'aucune règle les retire.
///
/// Le commentaire d'à côté décrivait pourtant le bon mécanisme : « le rail
/// n'ayant qu'UNE porte pour les trois sources », `allowsCapture` gouverne « le
/// SÉLECTEUR, en aval ». Le sélecteur n'existait pas — et un commentaire qui
/// décrit un mécanisme absent ne se fait contredire par rien.
final class ComposerMediaSourcePolicyTests: XCTestCase {

    /// **Le fusible.**
    func test_lesTroisSources_sontOffertesQuandLaCaptureEstPermise() {
        XCTAssertEqual(ComposerMediaSourcePolicy.offered(allowsCapture: true),
                       [.photoLibrary, .camera, .files])
    }

    /// `allowsCapture` retire la CAMÉRA — jamais la bibliothèque ni les
    /// fichiers. Reprendre un contenu déjà publié interdit de filmer, pas
    /// d'ajouter une image qu'on possède.
    func test_sansCapture_seuleLaCameraTombe() {
        let sources = ComposerMediaSourcePolicy.offered(allowsCapture: false)
        XCTAssertEqual(sources, [.photoLibrary, .files])
        XCTAssertFalse(sources.contains(.camera))
    }

    /// L'ordre est celui de la rangée canonique — la position que les doigts
    /// connaissent, pas l'ordre de déclaration d'un `enum`.
    func test_lOrdre_suitCeluiDeLaRangeeCanonique() {
        let outils = ComposerMediaSourcePolicy.offered(allowsCapture: true)
            .map(ComposerMediaSourcePolicy.namingTool)
        XCTAssertEqual(outils, [.photo, .camera, .document])
        let rang = { (t: ComposerDocumentTool) in
            ComposerDocumentTool.canonicalRow.firstIndex(of: t) ?? .max
        }
        XCTAssertEqual(outils.map(rang), outils.map(rang).sorted(),
                       "Deux ordres pour un même trio se lisent comme deux gestes.")
    }

    /// **Le libellé n'est pas réécrit.** Une seconde table dirait « Photos »
    /// d'un côté et « Photothèque » de l'autre pour un seul sélecteur, et
    /// dédoublerait sept traductions.
    func test_chaqueSource_estNommeeParLaRangeeDuDocument() {
        for source in ComposerMediaSourcePolicy.offered(allowsCapture: true) {
            let libelle = ComposerDocumentCopy.label(ComposerMediaSourcePolicy.namingTool(source))
            XCTAssertFalse(libelle.isEmpty)
        }
        XCTAssertEqual(
            Set(ComposerMediaSourcePolicy.offered(allowsCapture: true)
                .map { ComposerDocumentCopy.label(ComposerMediaSourcePolicy.namingTool($0)) }).count,
            3, "Deux sources qui s'annoncent pareil sont indiscernables.")
    }

    /// **Le titre de la feuille est le libellé de la porte.** Une clé neuve
    /// pour la même phrase, ce sont sept traductions à faire diverger.
    func test_leTitreDeLaFeuille_estLeLibelleDeLaPorte() {
        XCTAssertEqual(ComposerMediaSourcePolicy.chooserTitle,
                       ComposerRailCopy.label(.media))
        XCTAssertFalse(ComposerMediaSourcePolicy.chooserTitle.isEmpty)
    }
}

/// Le câblage de la porte média — la règle atteint l'écran.
final class ComposerMediaSourceWiringGuardTests: XCTestCase {

    private func hostSource() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    func test_laSourceDuMeuble_estLisible() throws {
        XCTAssertTrue(try hostSource().contains("ComposerMediaSourcePolicy"))
    }

    /// **La garde du défaut d'origine.** La porte média n'appelle plus l'outil
    /// PHOTO en direct : c'était le raccourci qui faisait disparaître deux
    /// sources sur trois dès qu'une scène existait.
    func test_laPorteMedia_neVaPlusDroitALaPhototheque() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("case.media:presentMediaSources()"))
        XCTAssertFalse(source.contains("case.media:handleDocumentTool(.photo)"),
                       "Ce raccourci retire la caméra et l'import de fichier sans qu'aucune règle les refuse.")
    }

    /// Le choix a son lecteur AU-DESSUS de l'aiguillage, comme tout portail du
    /// meuble (#4120) — et il lit la règle, jamais une seconde liste.
    func test_leChoixDeSource_estMonteEtLitLaRegle() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("isPresented:$showsMediaSourceChooser"))
        XCTAssertTrue(source.contains("ComposerMediaSourcePolicy.offered(allowsCapture:profile.allowsCapture)"))
    }

    /// **Une source unique se présente directement** — une feuille de choix à un
    /// seul élément demande un geste pour zéro décision.
    func test_uneSourceUnique_neDemandeAucunChoix() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("guardsources.count>1else{"),
                      "Sans ce garde-fou, un profil à source unique paie une feuille pour rien.")
    }
}

/// **La porte son ouvre l'ÉTAGÈRE autant que le micro** (#4081 · #4052 ·
/// leçon 335, troisième instance sur le même écran).
///
/// `handleRailDoor(.sound)` allait droit à `handleDocumentTool(.microphone)` :
/// le composer unifié n'avait AUCUNE occurrence de `SoundLibraryPicker` ni
/// d'`addBorrowedSound`, alors que le socle de la vue `1b` affiche déjà un
/// crédit de son de fond.
final class ComposerSoundSourcePolicyTests: XCTestCase {

    /// **Le fusible** — et l'ordre, qui n'est pas décoratif : emprunter est le
    /// geste nominal d'une scène, enregistrer le geste rare.
    func test_lesDeuxProvenances_sontOffertesDansLOrdreDeLaDoctrine() {
        XCTAssertEqual(ComposerSoundSourcePolicy.offered, [.library, .record])
    }

    /// Aucune provenance n'est laissée sans libellé — VoiceOver comme le
    /// bouton lisent le même mot.
    func test_chaqueProvenance_aUnLibelleDistinct() {
        let libelles = ComposerSoundSource.allCases.map(ComposerSoundSourcePolicy.label)
        XCTAssertFalse(libelles.contains(where: \.isEmpty))
        XCTAssertEqual(Set(libelles).count, ComposerSoundSource.allCases.count,
                       "Deux provenances qui s'annoncent pareil sont indiscernables.")
    }

    /// Le titre de la feuille est celui de la PORTE — `composer.rail.sound`
    /// dit déjà « Ajouter un son » dans les sept langues.
    func test_leTitre_estLeLibelleDeLaPorte() {
        XCTAssertEqual(ComposerSoundSourcePolicy.chooserTitle,
                       ComposerRailCopy.label(.sound))
    }

    /// **La liste est FERMÉE.** `offered` ne peut pas taire une provenance que
    /// le type déclare : le jour où une troisième arrive (importer un fichier
    /// audio, par exemple), cette garde rougit tant qu'elle n'est pas servie ou
    /// délibérément retirée.
    func test_aucuneProvenanceDeclaree_nEstOubliee() {
        XCTAssertEqual(Set(ComposerSoundSourcePolicy.offered),
                       Set(ComposerSoundSource.allCases))
    }
}

/// Le câblage de la porte son.
final class ComposerSoundSourceWiringGuardTests: XCTestCase {

    private func hostSource() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    func test_laSourceDuMeuble_estLisible() throws {
        XCTAssertTrue(try hostSource().contains("ComposerSoundSourcePolicy"))
    }

    /// **La garde du défaut d'origine.** La porte son n'enregistre plus
    /// directement : c'était le raccourci qui rendait l'étagère inatteignable.
    func test_laPorteSon_neVaPlusDroitAuMicro() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("case.sound:presentSoundSources()"))
        XCTAssertFalse(source.contains("case.sound:handleDocumentTool(.microphone)"),
                       "Ce raccourci rend l'étagère des sons inatteignable depuis le plateau.")
    }

    /// Les deux portails ont leur lecteur AU-DESSUS de l'aiguillage (#4120), et
    /// les boutons SORTENT de la règle.
    func test_lesDeuxPortails_sontMontesEtLisentLaRegle() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("isPresented:$showsSoundSourceChooser"))
        XCTAssertTrue(source.contains("isPresented:$showsSoundLibrary"))
        XCTAssertTrue(source.contains("ForEach(ComposerSoundSourcePolicy.offered,id:\\.self)"))
    }

    /// **Un son emprunté passe par le VIEWMODEL** — c'est lui, et lui seul, qui
    /// sait ce qu'un emprunt vaut (`soundId` renseigné, `postMediaId` vide :
    /// « enregistre un usage, ne capture rien »).
    func test_lEmprunt_passeParLeViewModel() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("viewModel.addBorrowedSound(sound)"))
        XCTAssertTrue(source.contains("SoundLibraryPicker("))
    }

    /// **Les deux provenances ne se confondent pas.** Emprunter pose un fond,
    /// enregistrer une note vocale qui n'en est jamais un (doctrine `2c`) :
    /// leurs deux chemins doivent rester distincts dans l'aiguillage.
    func test_lesDeuxProvenances_ontDesCheminsDistincts() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("case.library:showsSoundLibrary=true"))
        XCTAssertTrue(source.contains("case.record:handleDocumentTool(.microphone)"))
    }
}
