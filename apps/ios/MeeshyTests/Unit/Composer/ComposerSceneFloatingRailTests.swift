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
        XCTAssertEqual(ComposerSceneFloatingRail.sideRow(from: toutes),
                       [.media, .sound, .sticker, .drawing, .text],
                       "texte, sticker, son posé, média de premier plan, tracé")
    }

    /// **La mention et le lieu ont CHANGÉ DE CÔTÉ**, et ce n'est pas un
    /// rangement : les deux ouvrent un sélecteur de la PUBLICATION
    /// (`presentedPortal = .mention` / `.location`) et ne posent rien sur la
    /// scène. Les laisser à gauche promettait un objet qui n'arrive jamais.
    func test_laMentionEtLeLieu_viventSurLaLigneCanonique() {
        let bas = ComposerSceneFloatingRail.lowRow(from: toutes)
        XCTAssertEqual(bas, [.description, .mention, .place])
        XCTAssertFalse(ComposerSceneFloatingRail.sideRow(from: toutes).contains(.mention))
        XCTAssertFalse(ComposerSceneFloatingRail.sideRow(from: toutes).contains(.place))
    }

    /// **Le dessin a changé de côté dans l'AUTRE sens.** L'axe précédent le
    /// rangeait en bas parce qu'un tracé « entre » dans la scène. Il s'y VOIT,
    /// donc il est à gauche : c'est le résultat qui décide, pas le verbe.
    func test_leDessin_estAGauche_carUnTraceSeVoit() {
        XCTAssertTrue(ComposerSceneFloatingRail.sideRow(from: toutes).contains(.drawing))
        XCTAssertFalse(ComposerSceneFloatingRail.lowRow(from: toutes).contains(.drawing))
    }

    // MARK: - La partition

    /// **Aucune porte ne se perd, et aucune n'est à deux places.** Les deux
    /// rangées sont la NÉGATION du même prédicat — c'est structurel, pas une
    /// coïncidence à vérifier : deux filtres écrits séparément auraient permis
    /// les deux fautes.
    func test_lesDeuxRangees_partagentLesPortesSansPerteNiDoublon() {
        let gauche = ComposerSceneFloatingRail.sideRow(from: toutes)
        let bas = ComposerSceneFloatingRail.lowRow(from: toutes)

        XCTAssertEqual(Set(gauche).union(bas), Set(toutes), "aucune porte ne se perd")
        XCTAssertTrue(Set(gauche).isDisjoint(with: Set(bas)), "aucune porte à deux places")
        XCTAssertEqual(gauche.count + bas.count, toutes.count, "ni doublon ni perte")
    }

    /// Les deux rangées se DÉRIVENT du jeu servi : une porte que l'hôte ne sert
    /// pas n'apparaît nulle part.
    func test_unePorteNonServie_nApparaitNullePart() {
        XCTAssertEqual(ComposerSceneFloatingRail.sideRow(from: [.media, .description]), [.media])
        XCTAssertEqual(ComposerSceneFloatingRail.lowRow(from: [.media, .description]), [.description])
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
        XCTAssertFalse(ComposerSceneFloatingRail.sideRow(from: toutes).isEmpty)
        XCTAssertFalse(ComposerSceneFloatingRail.lowRow(from: toutes).isEmpty)
    }

    /// **Sans scène, la rangée de gauche disparaît d'elle-même.** La loi 8 n'a
    /// plus besoin d'être écrite ici : `ComposerRailDoor.offered` retire déjà
    /// les portes de niveau `.object` et `.scene` d'un format sans toile, et ce
    /// sont exactement celles que `appearsOnCanvas` retient.
    func test_sansScene_laRangeeDeGaucheEstVide() {
        let offertes = ComposerRailDoor.offered(served: Set(toutes),
                                                format: .status, allowsCapture: true)
        XCTAssertTrue(ComposerSceneFloatingRail.sideRow(from: offertes).isEmpty)
        XCTAssertFalse(ComposerSceneFloatingRail.lowRow(from: offertes).isEmpty,
                       "la ligne canonique survit — elle ne vise pas la toile")
    }

    // MARK: - La porte SON est partie (directive porteur 2026-08-31)

    /// **Retirer la porte son ne coûte AUCUNE capacité, et c'est mesuré.**
    ///
    /// > « Retire la porte son de la rangée, car on n'aura ici qu'une
    /// > possibilité d'ajouter un son sur LE CANVAS, en tant que sticker / chip
    /// > redimensionnable, déplaçable. »
    ///
    /// `handleRailDoor(.sound)` appelait `presentSoundSources()`, dont le corps
    /// ENTIER est `presentedPortal = .sound` — la ligne exacte que la pastille
    /// du socle exécute déjà. Deux boutons, une seule feuille.
    ///
    /// > Ce n'était pas une capacité en double, c'était un BOUTON en double. La
    /// > différence décide du correctif : on retire l'un des deux sans rien
    /// > perdre, là où deux capacités auraient demandé de choisir laquelle
    /// > survit. Vérifier LAQUELLE des deux avant de retirer est ce qui sépare
    /// > une déduplication d'une régression.
    func test_laPorteSon_nEstPlusServie() {
        XCTAssertFalse(ComposerSceneCapabilities.doors.contains(.sound),
                       "le son de fond vit au socle, le son POSÉ viendra de la palette (#4579)")
        XCTAssertTrue(ComposerSceneCapabilities.doors.contains(.sticker),
                      "l'entrée qui portera la palette reste servie")
    }

    /// **Et elle ne réapparaît NULLE PART** — ni à gauche, ni sur la ligne
    /// canonique. Une porte retirée d'un jeu servi mais laissée dans une des
    /// deux rangées serait un contrôle sans chemin d'ingestion : la loi 4 dans
    /// sa forme la plus banale.
    func test_laPorteSon_neReparaitDansAucuneRangee() {
        let servies = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                               format: .story, allowsCapture: true)
        XCTAssertFalse(ComposerSceneFloatingRail.sideRow(from: servies).contains(.sound))
        XCTAssertFalse(ComposerSceneFloatingRail.lowRow(from: servies).contains(.sound))
    }

    /// **Le fusible.** Si le jeu servi devenait vide, les deux témoins ci-dessus
    /// passeraient au vert en ne servant plus rien du tout.
    func test_lesAutresPortes_sontToujoursServies() {
        let servies = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                               format: .story, allowsCapture: true)
        // L'ordre est celui de `canonicalRail`, LU et non déduit : c'est la
        // troisième fois de la session que j'affirme une valeur déduite au lieu
        // de l'avoir lue, et la troisième fois que le témoin me rattrape.
        XCTAssertEqual(ComposerSceneFloatingRail.sideRow(from: servies),
                       [.media, .text, .drawing, .sticker],
                       "quatre entrées à gauche — le compte des quatre pastilles de la planche 1b")
        XCTAssertEqual(ComposerSceneFloatingRail.lowRow(from: servies),
                       [.description, .mention, .hashtag, .place],
                       "`.hashtag` rejoint la ligne canonique (#4636) — un hashtag classe "
                       + "ce qui part, il n'apparaît pas sur la scène.")
    }
}
