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
    ///
    /// **`.scene` entre au #4092**, et l'élargissement de cette liste est
    /// délibéré : le dessin n'agit ni sur la publication, ni sur une slide qui
    /// survivrait sans toile, ni sur UN objet. Un quatrième niveau ajouté sans
    /// cette raison ferait rougir ce témoin, et c'est ce qu'on lui demande.
    func test_chaquePorte_declareSonNiveau() {
        for porte in ComposerRailDoor.allCases {
            XCTAssertTrue([.publication, .slide, .object, .scene].contains(porte.level),
                          porte.rawValue)
        }
    }

    /// **Le niveau `.scene` exige une toile, exactement comme `.object`.** Ce
    /// témoin est le contrepoids du précédent : sans lui, ranger une porte en
    /// `.scene` « parce que ça sonne juste » la ferait paraître sur un `status`.
    func test_lesNiveauxQuiExigentUneToile_disparaissentDunStatus() {
        let sansScene = ComposerRailDoor.offered(served: Set(ComposerRailDoor.allCases),
                                                 format: .status, allowsCapture: true)
        for porte in sansScene {
            XCTAssertNotEqual(porte.level, .object, porte.rawValue)
            XCTAssertNotEqual(porte.level, .scene, porte.rawValue)
        }
    }

    // MARK: - L'ordre, qui est un contrat de mémoire musculaire

    /// **`drawing` s'insère entre `sound` et `sticker` (#4092)**, et la place
    /// n'est pas libre : la rangée d'outils de la vue `3b` range DESSIN avant
    /// STICKER, avant MENTION, avant LIEU. Le rail garde donc l'ordre relatif
    /// de la maquette, en y intercalant les portes qu'elle ne dessine pas.
    func test_lOrdreDuRail_estCeluiDeLaPlanche() {
        XCTAssertEqual(ComposerRailDoor.canonicalRail,
                       [.description, .media, .sound, .drawing, .sticker, .mention, .place])
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
    /// **Deux bandes servies depuis le #4092** — et la garde ne se relâche pas :
    /// elle vérifie que chacune a un CONTENU, ce qui est la seule chose qui
    /// justifiait « palette seule » quand elle était écrite. `timeline` et
    /// `textStyles` restent dehors faute d'hôte.
    func test_lesBandesServies_ontTouteUnContenu() {
        XCTAssertEqual(ComposerSceneCapabilities.bands, [.palette, .drawing])
        XCTAssertFalse(ComposerSceneCapabilities.bands.contains(.timeline),
                       "La timeline vit dans l'atelier (#4075) — la servir peindrait une bande vide.")
        XCTAssertFalse(ComposerSceneCapabilities.bands.contains(.textStyles),
                       "Les 18 styles exigent un objet `text` sélectionné, qu'aucune porte ne pose (#4401).")
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

/// **Annuler et rétablir sur le plateau** (#4402).
///
/// L'atelier a son historique depuis C9 ; le composer unifié n'en câblait
/// RIEN. Poser un sticker au mauvais endroit, avancer un objet d'un plan,
/// changer le fond : aucun de ces gestes ne se défaisait, et le manque
/// s'aggravait à chaque porte servie.
final class ComposerHistoryServiceTests: XCTestCase {

    /// **La scène sert l'historique, le document non — et ce n'est pas un
    /// oubli.** Sur le document, le dernier geste est presque toujours du
    /// texte, que le clavier annule déjà par son propre geste ; un « annuler »
    /// qui remonterait une pose de fond faite deux écrans plus tôt PROMETTRAIT
    /// d'annuler la frappe et ferait autre chose.
    func test_seuleLaScene_sertLHistorique() {
        XCTAssertTrue(ComposerHistoryService.servesHistory(on: .scene))
        XCTAssertFalse(ComposerHistoryService.servesHistory(on: .document))
        XCTAssertFalse(ComposerHistoryService.servesHistory(on: .mood))
    }

    /// Les deux libellés existent et se distinguent — VoiceOver lit le VERBE.
    func test_lesDeuxLibelles_existentEtSeDistinguent() {
        XCTAssertFalse(ComposerHistoryCopy.undo.isEmpty)
        XCTAssertFalse(ComposerHistoryCopy.redo.isEmpty)
        XCTAssertNotEqual(ComposerHistoryCopy.undo, ComposerHistoryCopy.redo)
    }
}

/// Le câblage de l'historique — la collecte, les contrôles, et la garde qui
/// les sépare.
final class ComposerHistoryWiringGuardTests: XCTestCase {

    private func hostSource() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    func test_laSourceDuMeuble_estLisible() throws {
        XCTAssertTrue(try hostSource().contains("ComposerHistoryService"))
    }

    /// **La COLLECTE vit au-dessus de l'aiguillage, pas sur la surface.** Un
    /// instantané pris seulement pendant que la scène est montée perdrait ce
    /// que le document a posé avant elle, et le premier « annuler » sauterait
    /// par-dessus les gestes que l'auteur vient de faire.
    func test_laCollecte_estMonteeAuDessusDeLAiguillage() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains(".onReceive(viewModel.historyTrigger)"))
        XCTAssertTrue(source.contains("viewModel.pushHistorySnapshot()"))
        XCTAssertTrue(source.contains("viewModel.seedHistory()"),
                      "Sans instantané d'ouverture, le plus ancien « annuler » ne ramène pas à l'écran vierge.")
    }

    /// Les CONTRÔLES, eux, passent par la règle — jamais par un test de surface
    /// réécrit sur place.
    func test_lesControles_passentParLaRegle() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("ComposerHistoryService.servesHistory(on:mountedSurface)"))
        XCTAssertTrue(source.contains("viewModel.canUndoGlobal"))
        XCTAssertTrue(source.contains("viewModel.canRedoGlobal"))
    }

    /// **Le retour de `undoGlobal()` est GARDÉ.** `false` veut dire « rien à
    /// défaire » : vibrer pour un geste sans effet est le retour trompeur que
    /// la loi 4 combat.
    func test_lesDeuxGestes_gardentLeRetourDuModele() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("guardviewModel.undoGlobal()else{return}"))
        XCTAssertTrue(source.contains("guardviewModel.redoGlobal()else{return}"))
    }
}

/// La barre haute — les deux contrôles n'existent que s'ils agissent.
final class ComposerTopBarHistoryGuardTests: XCTestCase {

    private func topBarSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerTopBar.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    func test_laSource_estLisible() throws {
        let s = try topBarSource()
        XCTAssertGreaterThan(s.count, 800)
        XCTAssertTrue(s.contains("struct ComposerTopBar"))
    }

    /// **Loi 4 — un contrôle sans effet est ABSENT, jamais grisé.** Un
    /// « annuler » grisé occupe la place et l'attention d'un contrôle pour ne
    /// rien promettre, sur une barre qui porte déjà quatre choses.
    func test_lesControles_nExistentQueSilsAgissent() throws {
        let source = compact(try topBarSource())
        XCTAssertTrue(source.contains("ifcanUndo||canRedo{"))
        XCTAssertTrue(source.contains("ifcanUndo{"))
        XCTAssertTrue(source.contains("ifcanRedo{"))
        XCTAssertFalse(source.contains(".disabled(!canUndo)"),
                       "Griser au lieu d'absenter contredit la loi 4.")
    }

    /// **Des PRIMITIVES, jamais le ViewModel.** La barre haute est une feuille
    /// de l'arbre : lui donner le composer entier la ferait se re-rendre à
    /// chaque frappe.
    func test_laBarre_neRecoitAucunViewModel() throws {
        let source = compact(try topBarSource())
        XCTAssertFalse(source.contains("@ObservedObject"))
        XCTAssertFalse(source.contains("@StateObject"))
        XCTAssertTrue(source.contains("varcanUndo:Bool=false"))
    }
}

/// **La scène se dessine** (#4092, vue `3b` — le dessin est le PREMIER outil
/// que la maquette y pose).
final class ComposerDrawingDoorTests: XCTestCase {

    /// **Un niveau de plus, et il était nécessaire.** Ranger le dessin en
    /// `.slide` l'aurait fait paraître sur un `status`, qui n'a pas de toile ;
    /// le ranger en `.object` aurait promis des contrôleurs d'empilement à
    /// quelque chose qui n'est pas un objet.
    func test_leDessin_agitSurLaSCENE() {
        XCTAssertEqual(ComposerRailDoor.drawing.level, .scene)
    }

    /// La porte est SERVIE, et elle atteint le rail sur un format à scène.
    func test_laPorteDessin_atteintLeRail() {
        let portes = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                              format: .story, allowsCapture: true)
        XCTAssertTrue(portes.contains(.drawing))
    }

    /// **Et elle disparaît d'un `status`** — c'est ce que le niveau `.scene`
    /// existe pour dire. Ce témoin tomberait si quelqu'un rangeait la porte en
    /// `.slide` « parce que les traits vivent dans la slide ».
    func test_laPorteDessin_disparaitDunStatus() {
        let portes = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                              format: .status, allowsCapture: true)
        XCTAssertFalse(portes.contains(.drawing))
    }

    /// L'ordre du rail suit celui de la maquette : le dessin précède le
    /// sticker, comme dans la rangée d'outils de la vue `3b`.
    func test_leDessin_precedeLeSticker() {
        let rail = ComposerRailDoor.canonicalRail
        guard let d = rail.firstIndex(of: .drawing),
              let s = rail.firstIndex(of: .sticker) else {
            return XCTFail("Les deux portes doivent être au rail canonique")
        }
        XCTAssertLessThan(d, s)
    }

    /// Chaque porte garde un libellé DISTINCT — VoiceOver ne peut pas nommer
    /// deux portes pareil.
    func test_leDessin_aSonPropreLibelle() {
        XCTAssertFalse(ComposerRailCopy.label(.drawing).isEmpty)
        XCTAssertEqual(Set(ComposerRailDoor.allCases.map(ComposerRailCopy.label)).count,
                       ComposerRailDoor.allCases.count)
    }

    /// La bande des réglages de pinceau est SERVIE — sans elle, entrer en mode
    /// dessin donnerait un doigt qui trace sans qu'aucun réglage soit
    /// atteignable.
    func test_laBandeDeDessin_estServie() {
        XCTAssertTrue(ComposerSceneCapabilities.bands.contains(.drawing))
        XCTAssertEqual(ComposerSceneBand.opened(.drawing,
                                                served: ComposerSceneCapabilities.bands),
                       .drawing)
    }
}

/// Le câblage du dessin — la porte, le mode, les deux montages.
final class ComposerDrawingWiringGuardTests: XCTestCase {

    private func hostSource() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func surfaceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerSceneSurface.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    func test_lesSources_sontLisibles() throws {
        XCTAssertTrue(try hostSource().contains("MeeshyDrawingSurface"))
        XCTAssertTrue(try surfaceSource().contains("struct ComposerSceneSurface"))
    }

    /// **Une porte à BASCULE — la seule du rail.** Les six autres font entrer
    /// quelque chose et se referment ; celle-ci ouvre un MODE qui dure, dont il
    /// faut pouvoir sortir par où l'on est entré.
    func test_laPorte_basculeLeMode() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("ifviewModel.isDrawingActive{viewModel.exitDrawingEditingMode()"))
        XCTAssertTrue(source.contains("viewModel.enterDrawingEditingMode()"))
    }

    /// **La bande suit le mode, elle n'est pas un état parallèle.** Deux
    /// booléens auraient permis « je dessine mais la bande est fermée » — un
    /// doigt qui trace sans réglage atteignable.
    func test_laBande_suitLeMode() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("requestedSceneBand=.drawing"))
    }

    /// **Le canvas RETIRE son calque persisté pendant le dessin**, sinon le
    /// trait s'affiche deux fois, à deux endroits (défaut 2026-05-27).
    func test_leCanvas_retireSonCalquePendantLeDessin() throws {
        let source = compact(try surfaceSource())
        XCTAssertTrue(source.contains("isDrawingOverlayActive:drawingSurface!=nil"))
    }

    /// **Et il cesse de recevoir les touches** : sans cela, le doigt qui trace
    /// déplacerait aussi l'objet sous lui — deux gestes pour un seul mouvement.
    func test_leCanvas_neRecoitPlusLesTouchesPendantLeDessin() throws {
        let source = compact(try surfaceSource())
        XCTAssertTrue(source.contains(".allowsHitTesting(drawingSurface==nil)"))
        XCTAssertTrue(source.contains(".overlay{drawingSurface}"))
    }

    /// **La surface n'est montée QUE pendant le mode** (loi 4) — une couche de
    /// capture posée en permanence volerait chaque touche de la scène.
    func test_laSurface_nExistePasHorsDuMode() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("drawingSurface:viewModel.isDrawingActive"))
    }
}
