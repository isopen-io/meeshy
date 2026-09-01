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
        for porte in [ComposerRailDoor.media, .sound, .sticker, .text] {
            XCTAssertEqual(porte.level, .object, "\(porte.rawValue)")
        }
    }

    /// **Le LIEU vise la publication, et c'est MESURÉ.**
    ///
    /// Son doc-comment annonçait « une pastille de lieu POSÉE sur la scène,
    /// distincte du LIEU de la publication ». La chaîne dit l'inverse :
    /// `handleRailDoor(.place)` → `handleDocumentTool(.place)` → effet
    /// `.attachesLocation` → `presentedPortal = .location`, le sélecteur de la
    /// PUBLICATION. Aucun objet n'est posé sur la scène.
    ///
    /// > Un doc-comment qui décrit ce que la porte DEVRAIT faire ne se fait
    /// > contredire par rien : il est juste dans son intention, il occupe le bon
    /// > endroit, et le lecteur suivant s'y fie. Troisième occurrence du motif
    /// > dans cette famille de fichiers.
    ///
    /// **Le niveau se lit à ce que la porte OUVRE, pas à ce qu'on aimerait
    /// qu'elle fasse** — et il ne décide pas seul de sa présence.
    ///
    /// > La première version de ce témoin affirmait « un statut n'a pas de
    /// > toile, il a un lieu » et exigeait `.place` sur un `status`. Faux : la
    /// > planche `2k` retire le lieu du Mood, pour une raison de PROFIL. J'avais
    /// > déduit la conséquence du niveau au lieu de la lire dans la spécification
    /// > — l'erreur exacte que le lot corrigeait, commise en le corrigeant.
    /// > Voir `test_leLieu_estRetireDuMood_parChoixProduit_nonParAbsenceDeToile`.
    func test_leLieu_viseLaPublication_carCEstLeSelecteurQuIlOuvre() {
        XCTAssertEqual(ComposerRailDoor.place.level, .publication)
        XCTAssertFalse(ComposerRailDoor.place.level.appearsOnCanvas,
                       "elle ne pose rien sur la scène — elle ouvre un sélecteur")

        // Elle survit dans les trois formats à scène : son niveau ne l'expose
        // pas à la règle de la toile.
        let surUneStory = ComposerRailDoor.offered(served: [.place, .text],
                                                   format: .story, allowsCapture: true)
        XCTAssertTrue(surUneStory.contains(.place))
        XCTAssertTrue(surUneStory.contains(.text))
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
                       [.description, .media, .sound, .text, .drawing, .sticker,
                        .mention, .hashtag, .place],
                       "`.hashtag` se range JUSTE APRÈS `.mention` (#4636) : les deux "
                       + "désignent une entité que le serveur dérive du texte, et la "
                       + "position que les doigts apprennent suit cette parenté.")
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
        XCTAssertEqual(offertes, [.description, .mention, .hashtag],
                       "…et les TROIS portes qui ne visent pas la scène restent. "
                       + "`.hashtag` y est entrée le 2026-09-01 (#4636) : comme la mention, "
                       + "elle vise la publication, donc l'absence de toile ne la retire pas.")
    }

    /// **Le LIEU disparaît du Mood pour une raison qui n'est PAS l'absence de
    /// toile — et ce retrait tenait par accident.**
    ///
    /// Planche `2k` : « photo · caméra · lieu · micro — indisponibles en Mood ».
    /// Le lieu vise la publication, donc il n'a jamais eu besoin d'une scène :
    /// il est retiré parce qu'une humeur d'une heure ne dit pas d'où elle est
    /// écrite.
    ///
    /// Tant que `.place` était classée `.object` (à tort — elle ouvre le
    /// sélecteur de la publication), la règle de la toile l'écartait par EFFET
    /// DE BORD. Corriger la classification au #4561 a rendu la porte au Mood, et
    /// seul ce témoin l'a vu.
    ///
    /// > **Une règle générale qui remplace un effet de bord doit vérifier ce que
    /// > cet effet de bord PROTÉGEAIT.** Une protection non déclarée ne se
    /// > signale pas quand on la retire : elle n'était écrite nulle part.
    func test_leLieu_estRetireDuMood_parChoixProduit_nonParAbsenceDeToile() {
        let mood = ComposerRailDoor.offered(
            served: Set(ComposerRailDoor.allCases), format: .status, allowsCapture: true)
        XCTAssertFalse(mood.contains(.place), "planche 2k — lieu indisponible en Mood")

        // Le fusible qui distingue les deux raisons : le lieu N'EST PAS de
        // niveau objet, donc son retrait ne peut pas venir de la règle de la
        // toile. Sans cette moitié, remettre `.place` en `.object` rendrait le
        // témoin vert en réintroduisant exactement le défaut corrigé.
        XCTAssertEqual(ComposerRailDoor.place.level, .publication)
        XCTAssertFalse(ComposerRailDoor.place.level.appearsOnCanvas)

        // Et il SURVIT partout ailleurs : le retrait est celui d'un profil,
        // jamais celui de la porte.
        for format in [ComposerFormat.story, .post, .reel] {
            XCTAssertTrue(ComposerRailDoor.offered(served: [.place], format: format,
                                                   allowsCapture: true).contains(.place),
                          "\(format)")
        }
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

    /// **#4719 — la porte sticker ne montre plus un visage.**
    ///
    /// Elle n'ouvre pas un clavier d'emoji : elle ouvre une palette de
    /// CONSTRUCTIONS (#4579) — lieu, heure, décorations, « Mes stickers ». Un
    /// visage y annonçait le contenu d'un seul de ses cinq onglets.
    ///
    /// Le témoin porte sur la VALEUR et non sur la source : il ne peut donc pas
    /// naître mort, et il rougit aussi bien si le smiley revient que si le
    /// glyphe est remplacé par un troisième.
    func test_porteSticker_montreLaFeuilleQuiSeDecolle_etPlusLeSmiley() {
        XCTAssertEqual(ComposerRailDoor.sticker.symbolName,
                       "rectangle.portrait.on.rectangle.portrait.angled")
    }

    /// Le smiley reste là où il dit vrai : la porte EMOJI de la rangée du
    /// document, qui insère bien un emoji dans le texte. Retirer les deux
    /// d'un même geste aurait été le contresens symétrique.
    func test_lePorteEmojiDuDocument_gardeSonSmiley() {
        XCTAssertEqual(ComposerDocumentTool.emoji.symbolName, "face.smiling")
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
        // Le rail est MODAL depuis la directive du 2026-08-30 : un `switch`
        // s'intercale entre le ressort et les entrées. Ce qui reste vrai — et
        // qui est la seule chose que ce témoin doit dire — c'est que le ressort
        // PRÉCÈDE tout ce qui se peint, portes comme contrôleurs.
        // **Le ressort est CONDITIONNEL depuis #4072** : il n'a de sens que pour
        // un rail de COULOIR, vertical et pleine hauteur. Sur le rail qui FLOTTE
        // sur la scène il étirait le socle de verre sur toute la carte et faisait
        // déborder la dernière entrée — mesuré à l'écran.
        //
        // Ce que le témoin doit dire n'a pas changé : le ressort PRÉCÈDE tout ce
        // qui se peint. Sa condition s'intercale, elle ne le déplace pas.
        XCTAssertTrue(source.contains("ifaxis==.vertical,pushesToThumb{Spacer(minLength:0)}switchmode{"),
                      "Le ressort doit PRÉCÉDER les entrées : c'est lui qui les ancre en bas.")
        XCTAssertTrue(source.contains("case.doors(letdoors):ForEach(doors"))
        // **Le mode OUTIL peint ses contrôleurs, sans que la forme soit figée.**
        //
        // L'assertion littérale `case.tool(letcontrols):ForEach(controls)` est
        // tombée au #4582, quand un `ScrollView` horizontal s'est intercalé — un
        // changement légitime, et le témoin le refusait pour une raison qu'il
        // n'avait jamais eue : il vérifiait une DISPOSITION en croyant vérifier
        // un ANCRAGE.
        //
        // Ce que ce témoin doit dire est plus haut : le ressort précède tout ce
        // qui se peint. Que les contrôleurs soient peints se vérifie sans
        // épingler par quoi ils sont enveloppés.
        XCTAssertTrue(source.contains("case.tool(letcontrols):"))
        XCTAssertTrue(source.contains("ForEach(controls)"))
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
    ///
    /// **Une seule bande servie**, et la garde ne se relâche pas : elle vérifie
    /// que chacune a un CONTENU. Le dessin a eu la sienne pendant un lot, puis
    /// l'a perdue — ses réglages sont le contrôleur FLOTTANT de l'atelier, dont
    /// la forme ne tient pas dans une bande. `timeline` et `textStyles` restent
    /// dehors faute d'hôte.
    func test_lesBandesServies_ontTouteUnContenu() {
        XCTAssertEqual(ComposerSceneCapabilities.bands, [.palette])
        XCTAssertFalse(ComposerSceneCapabilities.bands.contains(.timeline),
                       "Le jeu de BASE ne sert pas la timeline : elle n'a de contenu que pour un objet rognable (#4082).")
        XCTAssertFalse(ComposerSceneCapabilities.bands.contains(.textStyles),
                       "Les 18 styles exigent un objet `text` sélectionné, qu'aucune porte ne pose (#4401).")
    }

    /// **La bande de rognage n'est servie que quand elle a de quoi se remplir**
    /// (#4082). Le témoin s'écrit sur les DEUX verdicts : n'éprouver que le cas
    /// « servie » laisserait passer une bande servie en permanence, c'est-à-dire
    /// exactement le défaut que la loi 4 refuse.
    func test_laTimeline_nEstServieQuePourUnObjetRognable() {
        XCTAssertTrue(
            ComposerSceneCapabilities.bands(canTrimSelection: true).contains(.timeline),
            "un objet à rogner sélectionné doit rendre la bande ouvrable")
        XCTAssertFalse(
            ComposerSceneCapabilities.bands(canTrimSelection: false).contains(.timeline),
            "sans objet rognable, la bande occuperait 170 pt pour ne rien montrer")
        XCTAssertTrue(
            ComposerSceneCapabilities.bands(canTrimSelection: false).contains(.palette),
            "la condition ne doit RETIRER aucune bande de base")
    }

    /// **Rogner est offert par l'OBJET, pas par le meuble.** Le meuble déclare
    /// savoir le faire (`controllers`) ; c'est la règle du SDK qui décide qu'une
    /// image et un texte n'ont pas de source à rogner.
    func test_leRognage_estServiParLeMeuble_etRefuseParUnObjetSansSource() {
        XCTAssertTrue(ComposerSceneCapabilities.controllers.contains(.trim),
                      "le meuble sait ouvrir la bande de rognage depuis #4082")

        let sansSource = StoryCanvasContextAction.offered(
            isLocked: false, isBackground: false, sharesPlaneWithAnother: false,
            hasEditor: false, canLeaveScene: false, hasTrimmableSource: false)
        XCTAssertFalse(sansSource.contains(.trim),
                       "une image n'a pas de fenêtre de source — l'action doit être ABSENTE, pas grisée")

        let avecSource = StoryCanvasContextAction.offered(
            isLocked: false, isBackground: false, sharesPlaneWithAnother: false,
            hasEditor: false, canLeaveScene: false, hasTrimmableSource: true)
        XCTAssertTrue(avecSource.contains(.trim))

        // Un objet VERROUILLÉ — le badge d'attribution d'une republication — ne
        // se rogne pas plus qu'il ne se duplique : le rognage change ce que
        // l'attribution montre.
        let verrouille = StoryCanvasContextAction.offered(
            isLocked: true, isBackground: false, sharesPlaneWithAnother: false,
            hasEditor: false, canLeaveScene: false, hasTrimmableSource: true)
        XCTAssertFalse(verrouille.contains(.trim))
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
        XCTAssertTrue(source.contains("case.sticker:HapticFeedback.light()presentedPortal=.sticker"),
                      "La porte doit poser le portail du meuble.")
        XCTAssertTrue(source.contains("case.sticker:stickerPickerSheet"),
                      "Sans cas dans le switch du portail unique, rien ne s'ouvre (#4467).")
    }

    /// La feuille POSE un objet — elle n'écrit pas dans le texte, ce que fait
    /// sa voisine `emojiPickerSheet`. Confondre les deux est ce qui a tenu la
    /// porte fermée.
    func test_laFeuilleSticker_poseUnObjetParLeViewModel() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("viewModel.addSticker(emoji:emoji,scale:StorySticker.posedScale)"),
                      "Un sticker se pose EN GRAND : à l'échelle de référence il faut l'agrandir "
                        + "avant de le placer, soit deux gestes pour un.")
        XCTAssertTrue(source.contains("viewModel.addSticker(image:item.thumbnail,"))
    }

    /// **Les trois autres constructions de la palette POSENT aussi** (#4579).
    ///
    /// Une grille de décorations qui vibre sous le doigt sans rien poser coûte
    /// plus qu'une grille absente : elle PROMET (loi 4). Le rappel n'ayant pas
    /// de défaut côté SDK, ce meuble ne compilerait pas sans eux — mais le
    /// témoin dit à QUOI ils sont branchés, ce que le compilateur ne dit pas.
    func test_laFeuilleSticker_poseAussiLesDecorations() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("viewModel.addSticker(template:gabarit,slots:emplacements)"),
                      "Une décoration d'amour ou d'heure doit devenir un sticker gabarit.")
    }

    /// **Et un LIEU décoré reste un lieu.**
    ///
    /// Lui seul porte les coordonnées et l'id de POI que la plateforme LIT
    /// (`/posts/nearby`). Le poser en `StorySticker` donnerait une décoration
    /// qui PARAÎT juste et dont la donnée géographique est partie — le défaut
    /// le plus coûteux du lot, parce qu'il ne se voit pas à l'écran.
    func test_uneDecorationDeLieu_posteUnObjetDeLieu_jamaisUnSticker() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("viewModel.addLocation(place:lieu,styleId:gabarit.id)"),
                      "Un lieu décoré doit rester un StoryLocationObject.")
        XCTAssertFalse(source.contains("addSticker(template:gabarit,slots:emplacements)placeSlots"),
                       "Aucun chemin ne doit convertir un lieu en sticker.")
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
        XCTAssertTrue(source.contains("case.media:railPosesNextMedia=true;presentMediaSources()"),
                      "La porte MARQUE l'origine avant d'ouvrir le choix — c'est ce qui garde "
                        + "sa pose sur la scène courante (directive porteur 2026-08-30).")
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

    /// **Le fusible** — et l'ordre, qui n'est pas décoratif. Il a CHANGÉ au
    /// #4483 : le porteur a demandé que la porte « ouvre directement
    /// l'enregistrement audio ». Le micro est donc la surface principale de la
    /// feuille, et les deux autres provenances des entrées offertes SOUS lui.
    /// L'ancien ordre (étagère d'abord) était juste d'un CHOIX préalable, qui
    /// n'existe plus.
    func test_lesTroisProvenances_sontOffertesDansLOrdreDeLaDoctrine() {
        XCTAssertEqual(ComposerSoundSourcePolicy.offered, [.record, .library, .files])
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

    /// **Une porte, UNE feuille (#4483).** Le choix préalable a disparu : il
    /// coûtait un geste et, surtout, ses deux branches n'atterrissaient pas au
    /// même endroit. Les deux portails restent montés au-dessus de
    /// l'aiguillage (#4120) — c'est ce que ce témoin garde vraiment.
    func test_lesDeuxPortails_sontMontesEtLisentLaRegle() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("case.sound:composerSoundSheet"))
        XCTAssertTrue(source.contains("case.soundLibrary:soundLibrarySheet"))
        XCTAssertFalse(source.contains("isPresented:$showsSoundSourceChooser"),
                       "le choix préalable coûtait un geste pour deux branches qui n'atterrissaient pas au même endroit")
    }

    /// **Un son emprunté passe par le VIEWMODEL** — c'est lui, et lui seul, qui
    /// sait ce qu'un emprunt vaut (`soundId` renseigné, `postMediaId` vide :
    /// « enregistre un usage, ne capture rien »).
    func test_lEmprunt_passeParLeViewModel() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("viewModel.addBorrowedSound(sound)"))
        XCTAssertTrue(source.contains("SoundLibraryPicker("))
    }

    /// **Le défaut que #4483 ferme : l'enregistrement atterrissait dans le
    /// DOCUMENT.**
    ///
    /// `case .record: handleDocumentTool(.microphone)` menait à
    /// `presentedPortal = .audio` → `AudioPostComposerView` →
    /// `documentLocalMedia.append(…)`. Sur une scène, enregistrer un vocal ne
    /// posait donc RIEN sur cette scène, pendant qu'emprunter y posait un objet.
    /// Une porte, deux destinations.
    ///
    /// Ce témoin garde la destination — le vrai sujet — plutôt que la
    /// distinction des chemins, qui n'était que le moyen.
    ///
    /// **Repointé au 2026-09-01.** Ce témoin épinglait
    /// `attachPastedAudio(url:url,role:chosenSoundRole)` — une chaîne que le
    /// #4657 a fait disparaître en fusionnant « Vocal » et « Ajouter un son »
    /// dans UNE vue, où l'auteur choisit désormais le PLACEMENT. Il rougissait
    /// donc en permanence sur du code juste, et ne gardait plus rien.
    ///
    /// > Un renommage n'emmène pas les témoins qui citent l'ancien nom : ils
    /// > passent au ROUGE, ce qui a l'air d'une régression, et cessent de
    /// > garder, ce qui n'a l'air de rien.
    ///
    /// La destination — le vrai sujet — se garde mieux qu'avant : elle est
    /// maintenant CONDITIONNELLE, et le témoin épingle les deux branches.
    /// **Repointé une SECONDE fois au 2026-09-01 (#4722)**, et ses deux moitiés
    /// n'avaient pas la même raison de rougir :
    ///
    /// - `case.background:attachBackgroundSound(url:url)` était périmée AVANT ce
    ///   lot — mesuré sur `HEAD`, la chaîne n'y était pas non plus. Le fond
    ///   passe par `attachBackgroundSound(url:)` appelé plus bas, hors du
    ///   `case` ;
    /// - `case.foreground:documentLocalMedia.append(` l'était aussi : le
    ///   contenu se pose par `ComposerMediaOrder.replacing` depuis le #4698,
    ///   qui remplace À SA PLACE plutôt que d'ajouter au bout.
    ///
    /// > **Un témoin de source rouge depuis un lot antérieur ne garde plus
    /// > rien, et son rouge se confond avec celui du lot en cours.** C'est ce
    /// > qui rend une CI durablement rouge coûteuse : elle transforme chaque
    /// > nouveau rouge en question de datation.
    ///
    /// Ce que ce lot change VRAIMENT : le premier plan ne pose plus une chose,
    /// il en choisit une selon la SURFACE. Les deux branches sont épinglées.
    func test_leSonEnregistre_atterritSelonSonPLACEMENT_jamaisAilleurs() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("switchchosenSoundPlacement{"),
                      "la destination du son enregistré se décide sur le PLACEMENT choisi")
        XCTAssertTrue(source.contains("attachBackgroundSound(url:url)"),
                      "placé en FOND, il rejoint la scène")
        XCTAssertTrue(source.contains("case.contentCard:documentLocalMedia=ComposerMediaOrder.replacing("),
                      "placé en CONTENU sur une surface SANS scène, il rejoint la liste média du "
                          + "document — c'est une pièce jointe du post, pas une bande-son")
        XCTAssertTrue(source.contains("case.sceneChip:"),
                      "et sur une SCÈNE, le même choix pose une puce dessus (#4722)")
        XCTAssertFalse(source.contains("case.record:handleDocumentTool(.microphone)"),
                       "ce chemin versait le vocal dans la liste média du DOCUMENT sans rien demander")
    }

    /// Le placement est OFFERT, et il descend jusqu'à l'objet créé — un
    /// sélecteur qui ne changerait rien serait un contrôle sans effet (loi 4).
    ///
    /// **Repointé au 2026-09-01**, même raison que ci-dessus : le choix vit
    /// dans `chosenSoundPlacement` depuis le #4657, et il est écrit par le
    /// commutateur de « Création audio » plutôt que par un sélecteur du meuble.
    /// L'ancienne moitié (`chosenSoundRole`) survit dans `soundRolePicker`, une
    /// vue que plus aucun écran ne monte — c'est le sujet de #4664, et un
    /// témoin qui l'épingle garde un mort.
    func test_lePlacement_estOffertEtDescendJusquALObjet() throws {
        let source = compact(try hostSource())
        // **Périmée depuis le #4671, pas depuis ce lot** : la liaison est
        // désormais conditionnelle — une pastille du canvas n'a pas de
        // placement à choisir, et la feuille reçoit alors `nil`. Mesuré sur
        // `HEAD` : la chaîne exacte n'y était pas non plus.
        XCTAssertTrue(source.contains("placement:editedSceneChipId==nil?$chosenSoundPlacement:nil"),
                      "la feuille doit recevoir le placement en LIAISON — sinon son commutateur "
                          + "n'écrirait rien")
        // **Le placement décide la DESTINATION, pas un argument passé plus
        // bas.** Il ne voyage plus comme un `role:` — il choisit la branche, et
        // chaque branche appelle le site qui sait poser ce qu'elle vise. C'est
        // plus fort que ce que ce témoin exigeait : un argument peut se perdre
        // dans une fonction qui l'ignore, une branche non prise ne s'exécute
        // pas.
        XCTAssertTrue(source.contains("case.background:attachBackgroundSound(url:destination)"),
                      "un fichier placé en FOND doit remplacer le fond de la slide")
        // **Et placé en premier plan, il demande D'ABORD où ce premier plan
        // atterrit** (#4722) : une puce sur une scène, une carte de contenu
        // sans scène. La pose inconditionnelle qu'épinglait ce témoin était
        // juste sur une scène et fausse sur un post texte, où rien ne rend un
        // objet de scène — le son y disparaissait de l'écran sans quitter la
        // publication.
        XCTAssertTrue(source.contains("case.sceneChip:viewModel.attachPastedAudio(url:destination,role:.foreground)"),
                      "…et placé en CONTENU sur une SCÈNE, devenir une puce posée dessus")
        XCTAssertTrue(source.contains("case.contentCard:documentLocalMedia.append("),
                      "…ou, sans scène, une pièce jointe du document")
    }

    /// La sélection affichée est ce que la règle ferait SANS choix — jamais un
    /// défaut arbitraire qui la contredirait, et jamais une boucle recopiée.
    func test_laSelectionAffichee_appelleLaRegleAutomatique() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("chosenSoundRole??automaticSoundRole"))
        XCTAssertTrue(source.contains("ComposerAudioPlacement.isBackground("),
                      "la règle automatique s'APPELLE, elle ne se recopie pas")
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
        XCTAssertTrue(ComposerHistoryService.servesHistory(on: .atelier))
        XCTAssertFalse(ComposerHistoryService.servesHistory(on: .document))
        XCTAssertFalse(ComposerHistoryService.servesHistory(on: .mood))
    }

    /// **LE témoin qui manquait**, et son absence a coûté un lot livré faux.
    ///
    /// Le prédicat avait trois tests, tous verts, tous écrits sur la VALEUR
    /// qu'on lui passe. Aucun ne partait de l'ÉTAT réel de l'écran — « un
    /// document qui a une scène » —, et c'est précisément là que le défaut
    /// vivait : la scène incrustée est un `ComposerSurfaceKind.document`, donc
    /// le prédicat, nourri du KIND, rendait `false` en permanence sur le seul
    /// écran qui devait l'activer.
    ///
    /// > Deux énumérations dont un cas porte le même nom décrivent deux
    /// > niveaux différents, et le compilateur ne peut pas dire laquelle on
    /// > voulait. Un test qui part de l'ÉTAT traverse la traduction ; un test
    /// > qui part de la VALEUR la présuppose.
    func test_unDocumentAvecUneScene_sertLHistorique() {
        let vue = ComposerMountedView.mounted(surface: .document, hasScene: true)
        XCTAssertEqual(vue, .scene, "La scène incrustée est un document QUI A une scène.")
        XCTAssertTrue(ComposerHistoryService.servesHistory(on: vue),
                      "C'est l'écran où poser un sticker, avancer un objet et changer le fond "
                        + "ne se défont par rien d'autre.")
    }

    /// Et le document NU ne le sert toujours pas — le contrepoids du témoin
    /// précédent, sans lequel « tout servir » le rendrait vert.
    func test_unDocumentSansScene_neSertPasLHistorique() {
        let vue = ComposerMountedView.mounted(surface: .document, hasScene: false)
        XCTAssertEqual(vue, .document)
        XCTAssertFalse(ComposerHistoryService.servesHistory(on: vue))
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
    /// **Le site d'appel lit la VUE MONTÉE, jamais le kind de surface.** C'est
    /// la garde du défaut d'origine : `mountedSurface` compilait et ne pouvait
    /// jamais rendre vrai.
    func test_lesControles_passentParLaRegle() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("ComposerHistoryService.servesHistory(on:mountedComposerView)"))
        XCTAssertFalse(source.contains("ComposerHistoryService.servesHistory(on:mountedSurface)"),
                       "Le KIND vaut `.document` sur la scène incrustée — la garde ne s'allumerait jamais.")
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

/// **Le SOCLE — les deux contrôles n'existent que s'ils agissent** (directive
/// porteur 2026-08-30).
///
/// Ils vécurent en barre haute. La vérification simulateur a nommé le défaut :
/// « le bouton « Annuler » en haut à droite pendant un outil actif agit comme
/// UNDO, pas comme fermeture ». En français le mot dit les deux, et le
/// voisinage du chrome d'outil — dont le `(x)` ferme vraiment — tranchait pour
/// le mauvais sens.
///
/// La collision se lève par la GÉOGRAPHIE, sans qu'aucun mot ne change : au
/// socle, parmi ce qui décide de l'envoi, rien autour d'eux ne se ferme.
final class ComposerTopBarHistoryGuardTests: XCTestCase {

    private func topBarSource() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    private func trailingRailSource() throws -> String {
        var racine = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { racine = racine.deletingLastPathComponent() }
        let url = racine.appendingPathComponent(
            "Meeshy/Features/Main/Composer/ComposerTrailingRail.swift")
        let brut = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(brut.contains("struct ComposerTrailingRail"),
                      "ce n'est pas le rail droit — la garde lirait à côté")
        return AppSourceGuard.stripComments(brut)
    }

    func test_lesSources_sontLisibles() throws {
        XCTAssertGreaterThan(try topBarSource().count, 800)
        XCTAssertGreaterThan(try trailingRailSource().count, 800)
    }

    /// **L'INVARIANT que cette classe protège n'a pas changé : l'historique
    /// n'est PAS en barre haute.**
    ///
    /// C'est le défaut d'origine, nommé au simulateur : « le bouton “Annuler”
    /// en haut à droite pendant un outil actif agit comme UNDO, pas comme
    /// fermeture ». En français le mot dit les deux, et le voisinage du chrome
    /// d'outil — dont le `(x)` ferme vraiment — tranchait pour le mauvais sens.
    ///
    /// La collision se lève par la GÉOGRAPHIE. Le socle l'avait levée ; le rail
    /// droit la lève aussi, et mieux : rien n'y ferme quoi que ce soit, et ce
    /// qui l'entoure agit précisément sur les objets que l'historique défait.
    func test_lHistorique_nEstPasEnBarreHaute() throws {
        let source = compact(try topBarSource())
        XCTAssertFalse(source.contains("var historyPair"),
                       "la paire a quitté le socle ET la barre haute (#4586)")
    }

    /// **Il vit au rail DROIT** (directive porteur 2026-08-31) : « à droite, ça
    /// agit sur les dimensions des objets, + undo/redo devrait y être ».
    ///
    /// Ce qu'il défait, ce sont des gestes sur les OBJETS. Au socle il
    /// voisinait avec l'audience et le bouton publier, qui décident de l'ENVOI.
    func test_lHistorique_vitAuRailDroit() throws {
        let rail = compact(try trailingRailSource())
        XCTAssertTrue(rail.contains("varonUndo:(()->Void)?"))
        XCTAssertTrue(rail.contains("varonRedo:(()->Void)?"))
        XCTAssertTrue(rail.contains("ComposerHistoryCopy.undo"))
        XCTAssertTrue(rail.contains("ComposerHistoryCopy.redo"))
    }

    /// **Loi 4 — un contrôle sans effet est ABSENT, jamais grisé.**
    ///
    /// Le contrat l'exprime par l'optionnel : `nil` ⇒ aucun bouton. C'est le
    /// même patron que `onAddSlide`, et il remplace les `if canUndoHistory`
    /// que le socle portait — la question est désormais posée UNE fois, par le
    /// meuble, au lieu d'être reposée par la vue.
    func test_lesControles_nExistentQueSilsAgissent() throws {
        let rail = compact(try trailingRailSource())
        XCTAssertTrue(rail.contains("ifletonUndo{"))
        XCTAssertTrue(rail.contains("ifletonRedo{"))
        XCTAssertFalse(rail.contains(".disabled("),
                       "griser au lieu d'absenter contredit la loi 4")

        let meuble = compact(try topBarSource())
        XCTAssertTrue(meuble.contains("onUndo:composerServesHistory&&viewModel.canUndoGlobal"),
                      "le juge de l'historique reste ComposerHistoryService")
    }

    /// **Le rail n'existe pas s'il n'a RIEN à porter.** Sans cette moitié,
    /// retirer les actions et l'historique laisserait un socle de verre vide
    /// flotter à droite de la scène.
    func test_leRail_nExistePasVide() throws {
        let rail = compact(try trailingRailSource())
        XCTAssertTrue(rail.contains("actions.isEmpty&&onAddSlide==nil&&onUndo==nil&&onRedo==nil"))
    }


    /// **Des PRIMITIVES, jamais le ViewModel.** La barre haute est une feuille
    /// de l'arbre : lui donner le composer entier la ferait se re-rendre à
    /// chaque frappe.
    /// **La barre haute ne porte plus rien de l'historique.** Ce témoin est le
    /// contrepoids du déplacement : sans lui, les deux contrôles pourraient
    /// revenir en haut sans que rien ne rougisse.
    func test_laBarreHaute_nePorteplusLHistorique() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerTopBar.swift")
        let source = compact(AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8)))
        XCTAssertFalse(source.contains("historyControls"))
        XCTAssertFalse(source.contains("canUndo"))
        XCTAssertTrue(source.contains("structComposerTopBar"),
                      "…et le fichier lu est bien celui de la barre haute.")
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
    /// La porte TEXTE agit sur un OBJET — un `StoryTextObject` du plan `fg`,
    /// déplaçable et ordonnable comme les autres.
    func test_leTexte_agitSurUnObjet() {
        XCTAssertEqual(ComposerRailDoor.text.level, .object)
    }

    /// Et elle disparaît d'un `status`, qui n'a pas de scène où poser l'objet.
    func test_laPorteTexte_disparaitDunStatus() {
        let portes = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                              format: .status, allowsCapture: true)
        XCTAssertFalse(portes.contains(.text))
        let avecScene = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                                 format: .story, allowsCapture: true)
        XCTAssertTrue(avecScene.contains(.text))
    }

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
    /// **Le dessin n'a PAS de bande — et c'est la correction d'une réécriture.**
    ///
    /// J'avais logé ses réglages dans une bande simplifiée écrite pour
    /// l'occasion : cinq pastilles, une glissière, une gomme. Elle perdait le
    /// pinceau (stylo / marqueur / gomme), le lissage, l'annulation par TRAIT
    /// et l'édition par-trait — quatre capacités de l'atelier. Le plateau monte
    /// désormais `StoryDrawingToolbar`, le VRAI contrôleur, qui FLOTTE sur la
    /// scène : sa forme (un `VStack` à ressort) s'effondrerait dans une bande.
    func test_leDessin_nAPasDeBande_ilAUnControleurFlottant() {
        // Le cas `drawing` n'existe plus dans `ComposerSceneBand` : les réglages
        // du pinceau sont un contrôleur FLOTTANT. Le témoin porte donc sur ce
        // qui reste — une seule bande servie —, la disparition du cas étant
        // tenue par le compilateur lui-même.
        XCTAssertEqual(ComposerSceneCapabilities.bands, [.palette])
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
        XCTAssertTrue(source.contains("ifviewModel.isDrawingActive{viewModel.endDrawing()"))
        XCTAssertTrue(source.contains("viewModel.beginDrawing()"))
    }

    /// **La garde du trait qui ne venait pas.** `enterDrawingEditingMode()`
    /// n'ouvre que le mode LISTE de l'atelier et laisse `activeTool` intact :
    /// la bande de réglages paraissait, la couche de capture n'était jamais
    /// montée, et le doigt traçait dans le vide.
    ///
    /// Deux drapeaux pour un seul état apparent — la bande disait « je
    /// dessine », le canvas disait « non ».
    func test_laPorte_nAppellePasLeMODE_LISTE_seul() throws {
        let source = compact(try hostSource())
        XCTAssertFalse(source.contains("viewModel.enterDrawingEditingMode()"),
                       "Le mode LISTE seul ne monte aucune couche de capture.")
    }

    /// **Les réglages suivent le mode, ils ne sont pas un état parallèle.**
    /// Deux conditions distinctes auraient permis « je dessine mais aucun
    /// réglage n'est atteignable ».
    ///
    /// Ils ont d'abord été une BANDE, ouverte par la porte. Ils sont désormais
    /// le contrôleur FLOTTANT de l'atelier, monté sur le même prédicat que la
    /// couche de capture — un seul drapeau gouverne donc les deux, et ils ne
    /// peuvent pas diverger.
    func test_lesReglages_suiventLeMode() throws {
        let source = compact(try hostSource())
        // La COUCHE DE CAPTURE reste gouvernée par le mode…
        XCTAssertTrue(source.contains("drawingSurface:viewModel.isDrawingActive"))
        // …et les RÉGLAGES sont désormais dans le rail, résolus par la même
        // question posée à `ComposerRailMode` (directive porteur 2026-08-30).
        XCTAssertTrue(source.contains("drawing:viewModel.isDrawingActive"))
        XCTAssertFalse(source.contains("requestedSceneBand=.drawing"),
                       "Le dessin n'ouvre plus de bande de réglages : le RAIL les porte.")
    }

    /// **Le canvas RETIRE son calque persisté pendant le dessin**, sinon le
    /// trait s'affiche deux fois, à deux endroits (défaut 2026-05-27).
    func test_leCanvas_retireSonCalquePendantLeDessin() throws {
        let source = compact(try surfaceSource())
        XCTAssertTrue(source.contains("isDrawingOverlayActive:drawingSurface!=nil"))
    }

    /// **Et il cesse de recevoir les touches** : sans cela, le doigt qui trace
    /// déplacerait aussi l'objet sous lui — deux gestes pour un seul mouvement.
    ///
    /// **Le verrou a DÉMÉNAGÉ dans le canvas au `42b02bc9a9`**, et cette garde
    /// est restée rouge sur `dev` jusqu'à ce qu'un run COMPLET la trouve : les
    /// runs ciblés nommaient `ComposerRailDoorTests`, la première classe du
    /// fichier, et ces témoins vivent dans la douzième. **`-only-testing:` cible
    /// une CLASSE, jamais un fichier** — un fichier de quinze classes n'en
    /// exécute qu'une.
    ///
    /// Pourquoi il a déménagé : la surface de dessin était posée sur le CADRE de
    /// mise en page, quand le canvas ajuste sa carte au ratio puis la CENTRE. Un
    /// trait tiré hors de la carte était perdu à la publication. La surface est
    /// donc entrée DANS le canvas — et le verrou avec elle, sans quoi elle
    /// tombait sous le `allowsHitTesting(false)` de la scène et plus aucun trait
    /// ne passait.
    ///
    /// La garde interroge donc les DEUX moitiés, chacune chez elle : la surface
    /// PASSE le calque, le canvas le VERROUILLE.
    func test_leCanvas_neRecoitPlusLesTouchesPendantLeDessin() throws {
        XCTAssertTrue(compact(try surfaceSource()).contains("canvasOverlay:drawingSurface"),
                      "la surface doit PASSER le calque au canvas")
        XCTAssertTrue(compact(try canvasSource()).contains(".allowsHitTesting(canvasOverlay==nil)"),
                      "et le canvas doit cesser de recevoir les touches tant qu'il le porte")
    }

    /// La source du canvas encastré, dans le SDK — lue par son chemin, comme
    /// `StoryCanvasActionTitleLocalizationTests` le fait déjà pour les titres
    /// d'actions. Un `#filePath` remonte à `apps/ios`, d'où le détour par la
    /// racine du dépôt.
    private func canvasSource() throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let url = racine.appendingPathComponent(
            "packages/MeeshySDK/Sources/MeeshyUI/Story/EmbeddedSceneCanvas.swift")
        let brut = try String(contentsOf: url, encoding: .utf8)
        XCTAssertGreaterThan(brut.count, 1000, "source vide — la garde serait verte par omission")
        return AppSourceGuard.stripComments(brut)
    }

    /// **La surface n'est montée QUE pendant le mode** (loi 4) — une couche de
    /// capture posée en permanence volerait chaque touche de la scène.
    func test_laSurface_nExistePasHorsDuMode() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("drawingSurface:viewModel.isDrawingActive"))
    }
}

/// **Les six actions de l'objet parlent la langue du lecteur** (#4431).
///
/// Vu au simulateur en locale ANGLAISE : le rail *leading* rendait « Describe »,
/// « Add media », « Add a sticker » — le catalogue de l'app faisait son travail
/// — pendant que le rail *trailing*, à quelques points de distance, répondait
/// « Dupliquer », « Mettre au premier plan », « Supprimer ».
///
/// La cause était six littéraux français rendus comme VALEUR, jamais comme
/// `defaultValue:` — donc invisibles au cliquet de localisation, qui ne balaie
/// que les seconds.
final class StoryCanvasActionTitleLocalizationTests: XCTestCase {

    private func sdkSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()   // .../apps
            .deletingLastPathComponent()   // racine du dépôt
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+ContextMenu.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Le fusible** — un chemin faux rendrait la garde négative verte par
    /// omission, ce qui est exactement le piège qu'elle existe pour éviter.
    func test_laSourceDuMenu_estLisible() throws {
        let s = try sdkSource()
        XCTAssertGreaterThan(s.count, 500)
        XCTAssertTrue(s.contains("enum StoryCanvasContextAction"))
    }

    /// Les six titres passent par le catalogue du SDK.
    func test_lesSixTitres_passentParLeCatalogue() throws {
        let source = compact(try sdkSource())
        for cle in ["story.canvas.action.edit", "story.canvas.action.duplicate",
                    "story.canvas.action.bringForward", "story.canvas.action.sendBackward",
                    "story.canvas.action.leaveScene", "story.canvas.action.delete"] {
            XCTAssertTrue(source.contains("\"\(cle)\""), cle)
        }
    }

    /// Le corps d'UNE propriété calculée — la garde négative ci-dessous doit
    /// lire `title` et rien d'autre.
    ///
    /// **Sans ce cadrage, elle serait rouge en permanence** : `systemImage`, sa
    /// voisine immédiate, rend six littéraux `case .edit: return "pencil"` qui
    /// sont des noms de symboles SF — parfaitement légitimes, et de la même
    /// FORME que l'interdit. Une garde négative posée sur un fichier entier
    /// attrape les jumelles innocentes de ce qu'elle vise.
    private func corpsDe(_ ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre) else { return nil }
        var profondeur = 0
        var corps = ""
        for c in code[debut.lowerBound...] {
            corps.append(c)
            if c == "{" { profondeur += 1 }
            if c == "}" {
                profondeur -= 1
                if profondeur == 0 { return corps }
            }
        }
        return nil
    }

    /// **La garde NÉGATIVE.** Elle rougit si un titre redevient un littéral nu —
    /// la forme exacte du défaut, et la seule que le cliquet de localisation ne
    /// voit pas.
    func test_aucunTitre_neRedevientUnLitteralNu() throws {
        guard let corps = corpsDe("public var title: String", dans: try sdkSource()) else {
            return XCTFail("`title` est introuvable — la garde doit être re-pointée.")
        }
        let source = compact(corps)
        XCTAssertTrue(source.contains("story.canvas.action.edit"),
                      "Le corps lu n'est pas celui de `title` — la garde ne mesurerait rien.")
        for interdit in ["case.edit:return\"", "case.duplicate:return\"",
                        "case.bringForward:return\"", "case.sendBackward:return\"",
                        "case.leaveScene:return\"", "case.delete:return\""] {
            XCTAssertFalse(source.contains(interdit),
                           "\(interdit) — un littéral rendu comme VALEUR échappe au cliquet.")
        }
    }

    /// **Et la voisine reste libre.** `systemImage` DOIT continuer de rendre des
    /// littéraux : ce sont des noms de symboles SF, pas des mots. Ce témoin
    /// empêche qu'on « corrige » par excès de zèle ce qui n'est pas un défaut.
    func test_lesNomsDeSymboles_restentDesLitteraux() throws {
        guard let corps = corpsDe("public var systemImage: String", dans: try sdkSource()) else {
            return XCTFail("`systemImage` est introuvable")
        }
        XCTAssertTrue(compact(corps).contains("case.edit:return\"pencil\""))
        XCTAssertFalse(compact(corps).contains("String(localized:"),
                       "Un nom de symbole SF n'est pas une chaîne à traduire.")
    }

    /// Les six titres restent DISTINCTS : deux actions qui s'annoncent pareil
    /// sont indiscernables à VoiceOver, qui les lit dans le rail.
    ///
    /// `@MainActor` parce que `title` l'est — `Bundle.module` l'exige. Le
    /// témoin lit donc le titre exactement comme la vue le lit.
    @MainActor
    func test_lesSixTitres_restentDistincts() {
        let titres = StoryCanvasContextAction.allCases.map(\.title)
        XCTAssertEqual(Set(titres).count, StoryCanvasContextAction.allCases.count)
        XCTAssertFalse(titres.contains(where: \.isEmpty))
    }
}

/// **Le texte se pose sur la scène, et l'outil de dessin est celui de
/// l'atelier** (#4401 · #4092, directive porteur 2026-08-30).
///
/// > « L'agent a testé l'outil Dessin, mais n'a pas réutilisé l'outil dessin
/// > qui existe avec les pinceaux, gomme etc. De même il n'y a pas l'outil
/// > texte pour ajouter du texte sur le canvas. »
///
/// Les deux remarques nomment la même faute : une capacité EXISTE dans
/// l'atelier, et le plateau en reçoit une version appauvrie — ou rien.
final class ComposerSceneToolsBorrowGuardTests: XCTestCase {

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
        XCTAssertTrue(try hostSource().contains("ComposerRailMode.resolve"))
        XCTAssertTrue(try surfaceSource().contains("struct ComposerSceneSurface"))
    }

    /// **Le plateau monte le VRAI contrôleur de pinceau.** Celui-ci porte le
    /// pinceau (stylo / marqueur / gomme), la couleur, l'épaisseur, le lissage
    /// et l'annulation par TRAIT — quatre capacités qu'une bande écrite pour
    /// l'occasion perdait.
    /// L'emprunt ne se prouve plus par le montage d'une barre, mais par
    /// l'ÉNUMÉRÉ que le rail parcourt : `DrawingEditTool.allCases` — le pinceau
    /// (stylo / marqueur / gomme), la couleur, l'épaisseur, le lissage. Une
    /// liste écrite à la main ici serait la réécriture que ce lot a défaite.
    func test_leDessin_monteLesOutilsDeLAtelier() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerRailMode.swift")
        let source = compact(AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8)))
        XCTAssertTrue(source.contains("DrawingEditTool.allCases.map"))
        XCTAssertTrue(source.contains("symbolName:$0.sfSymbol"),
                      "Les glyphes viennent du SDK, jamais d'une table recopiée.")
    }

    /// **La garde NÉGATIVE de la réécriture.** Elle rougit si une bande de
    /// réglages maison revient — le nom de la vue supprimée est l'interdit.
    func test_aucuneBandeDeDessinMaison_neRevient() throws {
        let source = compact(try hostSource())
        XCTAssertFalse(source.contains("MeeshyDrawingToolBand"),
                       "Une bande de réglages écrite pour le plateau perd quatre capacités "
                        + "que l'atelier possède (leçon 336).")
    }

    /// Le texte parcourt le SIEN — style, couleur, alignement, fond, cadrage,
    /// contour, langue. Et le panneau d'OPTIONS, lui, vient du SDK en entier.
    func test_leTexte_monteLesOutilsDeLAtelier() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerRailMode.swift")
        let source = compact(AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8)))
        XCTAssertTrue(source.contains("TextEditTool.allCases.map"))
        XCTAssertTrue(compact(try hostSource()).contains("MeeshyToolOptionsPanel(viewModel:viewModel)"),
                      "Les options — palette, glissière, 18 styles — viennent du SDK, pas d'une bande maison.")
    }

    /// **Poser un texte OUVRE son éditeur, dans le même geste.** Une coquille
    /// posée sans éditeur est invisible et ne se remplit jamais — un contrôle
    /// sans effet.
    func test_laPorteTexte_poseEtOuvreLEditeur() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("ifletobjet=viewModel.addText(){"))
        XCTAssertTrue(source.contains("viewModel.enterTextEditingMode(textId:objet.id)"))
    }

    /// **L'édition se fait EN LIGNE, sur la scène.** Sans ces trois relais, le
    /// canvas ne saurait pas quel texte est en cours de saisie et le texte se
    /// remplirait ailleurs qu'à sa place.
    func test_laScene_relaieLEditionEnLigne() throws {
        let source = compact(try surfaceSource())
        XCTAssertTrue(source.contains("editingTextId:editingTextId"))
        XCTAssertTrue(source.contains("onInlineTextChanged:onInlineTextChanged"))
        XCTAssertTrue(source.contains("onInlineTextEditEnded:onInlineTextEditEnded"))
    }

    /// **La couche de capture est le SEUL overlay de la scène** depuis la
    /// directive du 2026-08-30 : les contrôleurs sont au rail, leurs options
    /// sous la scène. Trois couches empilées sur une scène déjà encadrée par
    /// deux rails, c'était une de trop.
    ///
    /// **Elle n'est plus un `.overlay` de la scène depuis le `42b02bc9a9`** :
    /// elle entre dans le canvas par `canvasOverlay`, qui la borne à la CARTE
    /// ajustée plutôt qu'au cadre de mise en page. Ce que ce témoin garde n'a
    /// pas changé — une seule couche sur la scène, et pas les barres d'outils.
    func test_laCapture_estLeSeulOverlayDeLaScene() throws {
        let source = compact(try surfaceSource())
        XCTAssertTrue(source.contains("canvasOverlay:drawingSurface"))
        XCTAssertFalse(source.contains(".overlay{drawingToolbar}"),
                       "Les réglages du pinceau vivent au rail, plus par-dessus la scène.")
        XCTAssertFalse(source.contains(".overlay{textToolbar}"),
                       "Idem pour ceux du texte.")
    }

    /// **Le modèle décide du sort d'une coquille vide, pas la vue.** Fermer
    /// l'éditeur sans avoir écrit ne doit rien laisser sur la scène.
    func test_laFinDeSaisie_repasseParLeModele() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("viewModel.exitTextEditingMode()"))
    }
}

/// **Taper « @ » dans un texte de SCÈNE appelle quelqu'un** (#4475).
///
/// La bande de mention existait sur deux champs de saisie sur trois — la
/// description de la slide et le texte du document. Le troisième, l'objet texte
/// posé sur la scène, écrivait littéralement « @arto » : aucune liste, aucun
/// lien, aucune notification.
///
/// > **Une affordance qui RESSEMBLE à une mention sans en être une est pire
/// > qu'une absence** — c'est la loi 4 vue depuis le LECTEUR plutôt que depuis
/// > l'auteur. Le pseudo écrit sur la scène a l'air d'une mention pour qui la
/// > lit ; la personne nommée ne le saura jamais.
final class ComposerSceneMentionWiringGuardTests: XCTestCase {

    private func hostSource() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    func test_laSource_estLisible() throws {
        XCTAssertTrue(try hostSource().contains("sceneMentionStrip"))
    }

    /// **La frappe nourrit la requête** — et c'est tout ce qu'il a fallu.
    /// `onInlineTextChanged` remonte déjà le texte à chaque caractère ; le
    /// canvas UIKit n'a pas eu à changer d'un octet.
    func test_laFrappe_nourritLaRequete() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("sceneMentionBox.controller.handleQuery(in:texte)"))
    }

    /// **Le choix écrit dans l'OBJET, par le même site que la frappe.** Un
    /// `@State` intermédiaire aurait fait diverger ce que le canvas affiche de
    /// ce que la publication emporte.
    func test_leChoix_ecritDansLObjet() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("viewModel.updateTextContent(id:id,text:remplace)"))
    }

    /// **Trois conditions, dont la troisième s'oublie** : sans
    /// `!suggestions.isEmpty`, la bande de verre se peindrait VIDE quand aucun
    /// ami accepté ne correspond — un état nominal, pas un chargement.
    func test_laBande_neSePeintJamaisVide() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("sceneMentionBox.controller.activeQuery!=nil"))
        XCTAssertTrue(source.contains("!sceneMentionBox.controller.suggestions.isEmpty"))
        XCTAssertTrue(source.contains("viewModel.textEditingMode.activeTextId"))
    }

    /// **Les candidats viennent de la MÊME source que la bande du document.**
    /// Deux chargements auraient donné deux listes à faire diverger, et deux
    /// moments où « aucun ami » se lit différemment.
    func test_lesCandidats_viennentDeLaSourcePartagee() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("ComposerMentionFriendsSource.acceptedFriends()"))
    }
}
