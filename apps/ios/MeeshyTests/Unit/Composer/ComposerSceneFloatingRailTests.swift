import XCTest
@testable import Meeshy
@testable import MeeshyUI

/// **Deux places, deux NIVEAUX** (directive porteur 2026-08-31, #4561).
///
/// > « Cette approche est meilleure, ce qui permet de manipuler tout le canvas
/// > sans problème : on exploite la place du plateau sans encombrer le canvas.
/// > […] On préserve des actions sur la ligne canonique comme la description du
/// > contenu, l'ajout de son de fond, image et vidéo de fond, mention et
/// > localisation de la publication ; et sur la rangée à gauche, ce sont les
/// > features qui apparaissent sur le canvas visuellement. »
///
/// ## Ce que ce lot répare
///
/// `ComposerRailDoor.level` classait déjà chaque porte — `.publication`,
/// `.slide`, `.object`, `.scene` — avec un `switch` exhaustif et un doc-comment
/// par cas. Deux fichiers plus loin, la répartition était un **littéral écrit à
/// la main** : `[.text, .sticker, .sound, .mention]`. Il rangeait `.mention`,
/// que l'énuméré déclare `.publication`, parmi ce qui vit sur la scène.
///
/// > Une liste écrite à la main À CÔTÉ d'une règle qui décide déjà la même chose
/// > ne se fait contredire par rien : les deux compilent, et seule celle qui est
/// > appelée compte. Le doc-comment de la règle continue d'énoncer une
/// > classification juste que le produit n'applique pas.
///
/// C'est ce que le porteur a lu comme « la sémantique n'est pas si claire » — et
/// il avait raison : la moitié raisonnée était invisible à l'écran.
///
/// ## L'axe a changé, et c'est le fond du lot
///
/// L'axe précédent était « agit SUR la scène » contre « fait ENTRER de la
/// matière ». Il classait le dessin en bas (un tracé entre dans la scène) et la
/// mention à gauche (elle agit sur ce qui est là) : deux rangements défendables
/// qui décrivent le VERBE de la porte, pas l'endroit où son résultat apparaît.
/// La main, elle, suit le résultat.
final class ComposerSceneFloatingRailTests: XCTestCase {

    private let toutes: [ComposerRailDoor] = [.description, .media, .sound, .sticker,
                                              .mention, .place, .drawing, .text]

    // MARK: - Ce qui SE VOIT sur la scène

    func test_laRangeeDeGauche_porteCeQuiApparaitSurLaScene() {
        // **Le corpus de texte est REVENU à gauche** (directive porteur
        // 2026-09-05 : « mettre sur la rangée colonne gauche toutes les
        // modifications spécifiques à la scène et non à la publication de type
        // Post »).
        //
        // #4893 l'avait rangé en bas hors Story, sur l'idée qu'il « qualifie la
        // publication ». La mesure dit le contraire : `handleRailDoor(.text)`
        // appelle `viewModel.addText()` puis ouvre l'éditeur d'objet, dans TOUS
        // les formats. Il pose un objet sur la scène ; le corps de la
        // publication a sa propre porte depuis #4890.
        XCTAssertEqual(ComposerSceneFloatingRail.sideRow(from: toutes, format: .post),
                       [.media, .sound, .sticker, .drawing, .text],
                       "sticker, son posé, média de premier plan, tracé, corpus de texte")
    }

    /// **Le corpus de texte ne bascule plus par format.** Le témoin porte sur
    /// les DEUX formats parce que c'est la bascule elle-même qui a disparu :
    /// vérifier le seul POST laisserait revenir un `format == .story ? …`
    /// silencieux.
    func test_leCorpusDeTexte_poseDansTousLesFormats() {
        // Les trois formats qui ONT une toile. Le `status` n'en a pas : la
        // porte n'y est pas OFFERTE du tout (`removedFromStatus`), et l'y
        // chercher à gauche testerait une répartition sans objet.
        for format in [ComposerFormat.post, .story, .reel] {
            XCTAssertEqual(ComposerRailDoor.text.level(for: format), .object,
                           "le corpus pose un objet en \(format) aussi — `addText()` ne " +
                           "regarde pas le format")
            XCTAssertTrue(ComposerSceneFloatingRail.sideRow(from: [.text], format: format).contains(.text),
                          "donc il vit à GAUCHE en \(format)")
        }
        XCTAssertFalse(
            ComposerRailDoor.offered(served: [.text], format: .status, allowsCapture: true).contains(.text),
            "sans toile, rien à poser — le corpus ne survit pas au status"
        )
    }

    /// **La mention et le lieu ont CHANGÉ DE CÔTÉ**, et ce n'est pas un
    /// rangement : les deux ouvrent un sélecteur de la PUBLICATION
    /// (`presentedPortal = .mention` / `.location`) et ne posent rien sur la
    /// scène. Les laisser à gauche promettait un objet qui n'arrive jamais.
    func test_laMentionEtLeLieu_viventSurLaLigneCanonique() {
        // **Hors STORY** (#4893) : en Story ces deux-là se POSENT, avec une
        // position fixée par story. Le rangement décrit ici reste celui du
        // Réel, du Post et du Mood.
        // `.description` n'est plus servie par le rail (directive porteur
        // 2026-09-05) — elle reste dans `toutes` ici parce que la fixture
        // décrit un jeu SERVI arbitraire, et que la répartition doit rester
        // juste pour toute porte qu'un hôte lui donne. Ce qui la retire est
        // `canonicalRail`, mesuré par `ComposerRailDoorTests`.
        let bas = ComposerSceneFloatingRail.lowRow(from: toutes, format: .post)
        XCTAssertEqual(bas, [.description, .mention, .place])
        XCTAssertFalse(bas.contains(.text),
                       "le corpus POSE : il a quitté la ligne canonique (2026-09-05)")
        XCTAssertFalse(ComposerSceneFloatingRail.sideRow(from: toutes, format: .post).contains(.mention))
        XCTAssertFalse(ComposerSceneFloatingRail.sideRow(from: toutes, format: .post).contains(.place))
    }

    /// **Le dessin a changé de côté dans l'AUTRE sens.** L'axe précédent le
    /// rangeait en bas parce qu'un tracé « entre » dans la scène. Il s'y VOIT,
    /// donc il est à gauche : c'est le résultat qui décide, pas le verbe.
    func test_leDessin_estAGauche_carUnTraceSeVoit() {
        for format in ComposerFormat.allComposable {
            XCTAssertTrue(ComposerSceneFloatingRail.sideRow(from: toutes, format: format).contains(.drawing), "\(format)")
            XCTAssertFalse(ComposerSceneFloatingRail.lowRow(from: toutes, format: format).contains(.drawing), "\(format)")
        }
    }

    // MARK: - La partition

    /// **Aucune porte ne se perd, et aucune n'est à deux places.** Les deux
    /// rangées sont la NÉGATION du même prédicat — c'est structurel, pas une
    /// coïncidence à vérifier : deux filtres écrits séparément auraient permis
    /// les deux fautes.
    func test_lesDeuxRangees_partagentLesPortesSansPerteNiDoublon() {
        let gauche = ComposerSceneFloatingRail.sideRow(from: toutes, format: .post)
        let bas = ComposerSceneFloatingRail.lowRow(from: toutes, format: .post)

        XCTAssertEqual(Set(gauche).union(bas), Set(toutes), "aucune porte ne se perd")
        XCTAssertTrue(Set(gauche).isDisjoint(with: Set(bas)), "aucune porte à deux places")
        XCTAssertEqual(gauche.count + bas.count, toutes.count, "ni doublon ni perte")
    }

    /// Les deux rangées se DÉRIVENT du jeu servi : une porte que l'hôte ne sert
    /// pas n'apparaît nulle part.
    func test_unePorteNonServie_nApparaitNullePart() {
        XCTAssertEqual(ComposerSceneFloatingRail.sideRow(from: [.media, .description], format: .post), [.media])
        XCTAssertEqual(ComposerSceneFloatingRail.lowRow(from: [.media, .description], format: .post), [.description])
    }

    // MARK: - Le prédicat lui-même

    /// **Le niveau répond à la question, et le `switch` est exhaustif.** Un
    /// cinquième niveau ne compilera pas tant qu'il n'aura pas dit s'il se voit
    /// — exactement la question qu'on oublie de se poser en ajoutant un bouton.
    func test_leNiveau_ditSiLeResultatSeVoit() {
        XCTAssertTrue(ComposerRailLevel.object.appearsOnCanvas)
        XCTAssertTrue(ComposerRailLevel.scene.appearsOnCanvas)
        XCTAssertFalse(ComposerRailLevel.publication.appearsOnCanvas)
        XCTAssertFalse(ComposerRailLevel.slide.appearsOnCanvas)
    }

    /// **Le fusible de la dérivation.** Si `appearsOnCanvas` rendait toujours la
    /// même valeur, l'une des deux rangées serait vide et tous les témoins de
    /// partition ci-dessus resteraient verts — une partition dont un côté est
    /// vide est toujours une partition.
    func test_lesDeuxRangees_sontNonVides() {
        XCTAssertFalse(ComposerSceneFloatingRail.sideRow(from: toutes, format: .post).isEmpty)
        XCTAssertFalse(ComposerSceneFloatingRail.lowRow(from: toutes, format: .post).isEmpty)
    }

    /// **Sans scène, la rangée de gauche disparaît d'elle-même.** La loi 8 n'a
    /// plus besoin d'être écrite ici : `ComposerRailDoor.offered` retire déjà
    /// les portes de niveau `.object` et `.scene` d'un format sans toile, et ce
    /// sont exactement celles que `appearsOnCanvas` retient.
    func test_sansScene_laRangeeDeGaucheEstVide() {
        let offertes = ComposerRailDoor.offered(served: Set(toutes),
                                                format: .status, allowsCapture: true)
        XCTAssertTrue(ComposerSceneFloatingRail.sideRow(from: offertes, format: .status).isEmpty)
        XCTAssertFalse(ComposerSceneFloatingRail.lowRow(from: offertes, format: .status).isEmpty,
                       "la ligne canonique survit — elle ne vise pas la toile")
    }

    // MARK: - Une scène posée accepte TOUJOURS un son (#4722)

    /// **LE témoin de la directive du 2026-09-01.**
    ///
    /// > « Lorsqu'on a posé une scène on puisse TOUJOURS ajouter un son sur la
    /// > scène, en son de fond de la scène ou en chip resizable sur la scène. »
    ///
    /// Il remplace son inverse — `test_laPorteSon_nEstPlusServie`, écrit la
    /// veille et juste ce jour-là. Sa raison tenait à DEUX destinations de
    /// remplacement, qu'il nommait lui-même : « le son de fond vit au socle, le
    /// son POSÉ viendra de la palette (#4579) ». Les deux ont disparu APRÈS
    /// lui — la pastille du socle est partie le lendemain, la palette n'a
    /// jamais reçu son onglet son (cinq onglets : emoji, love, time, place,
    /// library). La scène n'avait plus aucun chemin vers le son, et aucun
    /// témoin ne pouvait le dire : chaque retrait était juste, c'est leur SOMME
    /// qui a fermé la porte.
    ///
    /// > Un témoin qui épingle une ABSENCE en s'appuyant sur ce qui existe
    /// > ailleurs se périme en silence : ce qui le justifie n'est pas dans son
    /// > champ de vision, donc rien ne rougit quand ça disparaît.
    func test_laPorteSon_estServieSurLaScene() {
        XCTAssertTrue(ComposerSceneCapabilities.doors.contains(.sound),
                      "la porte du rail est le chemin vers la feuille où le placement se choisit")
    }

    /// **Et il tient sur les QUATRE formats, pas seulement sur celui qu'on
    /// mesure d'habitude.**
    ///
    /// La disponibilité demandée est « TOUJOURS ». Un jeu servi qui aurait
    /// raison sur la story et tort sur le réel rendrait le témoin ci-dessus
    /// vert tout en laissant la moitié des scènes sans chemin — et `status`,
    /// qui n'a pas de toile, doit au contraire ne PAS la porter : c'est la même
    /// règle (`appearsOnCanvas`) qui donne les deux réponses.
    ///
    /// > Le mot d'une directive qui dit « toujours » se teste sur l'ensemble
    /// > qu'il quantifie, jamais sur un représentant.
    func test_lePorteSon_estServieSurTouteScene_etSurAucunStatus() {
        for format in [ComposerFormat.story, .reel, .post] {
            let servies = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                                   format: format, allowsCapture: true)
            XCTAssertTrue(servies.contains(.sound),
                          "\(format) porte une scène — elle doit accepter un son")
        }
        let sansToile = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                                 format: .status, allowsCapture: true)
        XCTAssertFalse(sansToile.contains(.sound),
                       "un statut n'a pas de scène sur laquelle poser quoi que ce soit")
    }

    /// La porte vit à GAUCHE — la rangée de ce qui apparaît sur la toile — et
    /// non sur la ligne canonique, qui porte ce qui classe la publication.
    ///
    /// Ce n'est pas un détail de position : la directive story du même jour
    /// vide la ligne canonique pour ce format (« enlever les éléments de la
    /// rangée canonique, destinés aux posts »). Une porte son rangée là serait
    /// absente exactement du format où la scène est la publication entière.
    func test_laPorteSon_vitAGauche_avecCeQuiApparaitSurLaToile() {
        let servies = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                               format: .story, allowsCapture: true)
        XCTAssertTrue(ComposerSceneFloatingRail.sideRow(from: servies, format: .story).contains(.sound))
        XCTAssertFalse(ComposerSceneFloatingRail.lowRow(from: servies, format: .story).contains(.sound))
    }

    /// **Le fusible.** Si le jeu servi devenait vide, les deux témoins ci-dessus
    /// passeraient au vert en ne servant plus rien du tout.
    func test_lesAutresPortes_sontToujoursServies() {
        let servies = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                               format: .story, allowsCapture: true)
        // L'ordre est celui de `canonicalRail`, LU et non déduit : c'est la
        // troisième fois de la session que j'affirme une valeur déduite au lieu
        // de l'avoir lue, et la troisième fois que le témoin me rattrape.
        // **En STORY, la rangée du bas est VIDE, et c'est une DÉCISION** (#4893).
        // La directive du 2026-09-02 fait passer lieu, hashtag, mention et
        // corpus de texte à gauche « afin de fixer chaque position à chaque
        // story », et remplace le paragraphe par le corpus. Il ne reste donc
        // rien à qualifier en bas : le plateau y laisse la place aux
        // contrôleurs de l'outil ouvert, et le socle vit au meuble, plus bas.
        XCTAssertEqual(ComposerSceneFloatingRail.sideRow(from: servies, format: .story),
                       [.media, .sound, .text, .background, .drawing, .sticker,
                        .mention, .hashtag, .place],
                       "en Story TOUTES les portes se posent — `.sound` est revenue le "
                       + "2026-09-01 (#4722) et `.background` le 2026-09-02 (#4919), "
                       + "chacune à sa place de `canonicalRail`")
        XCTAssertEqual(ComposerSceneFloatingRail.lowRow(from: servies, format: .story), [],
                       "rien ne QUALIFIE une story depuis le bas : tout s'y pose.")
    }
}
