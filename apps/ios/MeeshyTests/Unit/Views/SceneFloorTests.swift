import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Le SOL d'une scène — ce qui se peint AUTOUR de la carte, et il n'y en a
/// qu'un** (directive porteur du 2026-09-17, lot #6904 : « On préserve le même
/// fond que pour la story ! »).
///
/// ## Ce que le tour 3 ter avait laissé
///
/// `SceneCard` a fermé la divergence DANS la carte : même cadre, même fond, même
/// rayon sur les quatre surfaces. La recette au simulateur a trouvé UN écart
/// restant, et il était DEHORS : le lecteur de stories peignait autour de sa
/// carte une teinte sombre dérivée du ThumbHash, la galerie de post du NOIR PUR,
/// en cadré comme en immersif.
///
/// > **Une convergence mesurée DANS un composant ne dit rien de ce qui se peint
/// > à côté de lui.** La carte était la même ; les deux surfaces ne se
/// > ressemblaient toujours pas, parce que ce qu'un œil compare d'abord est la
/// > page entière.
///
/// ## Les deux moitiés de ce fichier, et pourquoi elles sont deux
///
/// - **les gardes de SOURCE** portent la seconde affirmation d'une énumération
///   (leçon 261) : *ces trois surfaces montent le sol*. Aucun pixel ne peut le
///   dire — une surface qui ne monte rien ne peint rien, et « rien » ressemble à
///   un fond noir légitime ;
/// - **les témoins de PIXELS** disent ce que le sol PEINT, dans une vraie
///   fenêtre : une matière non noire là où il y a une empreinte, le noir là où
///   il n'y en a pas, et un voile qui assombrit vraiment.
///
/// La paire est nécessaire : une garde de source verte sur un composant qui ne
/// peint rien serait une convergence de NOMS.
@MainActor
final class SceneFloorTests: XCTestCase {

    // MARK: - Les gardes de source

    /// **Les trois surfaces plein écran montent le SOL** — nommées une par une,
    /// comme `SceneShapeSourceGuardTests.test_lesSurfacesPleinEcran_montentLaCarteDeScene`
    /// nomme celles qui montent la carte. Le lecteur de stories est la surface
    /// de RÉFÉRENCE : c'est sa recette que les deux autres reçoivent.
    func test_lesTroisSurfacesPleinEcran_montentLeSolDeScene() throws {
        let surfaces = [
            "apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift",
            "apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+ScenePage.swift",
            "apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView+Scene.swift",
        ]

        var muettes: [String] = []
        for chemin in surfaces {
            // Commentaires retirés : une surface qui CITE le sol dans une note
            // ne le monte pas — c'est le trou que `consultsSceneShape` a dû
            // fermer sur `PostDetailView+RepostEmbed.swift` (#6904, tour 3).
            let code = Self.stripComments(try Self.source(chemin))
            if !code.contains("SceneFloorView(") { muettes.append(chemin) }
        }

        XCTAssertEqual(muettes, [],
                       "une surface plein écran doit monter SceneFloorView — sans lui elle peint " +
                       "du noir plat autour d'une carte que les autres habillent : \(muettes)")
    }

    /// **Le lecteur de stories ne garde AUCUNE recette privée du sol.** Il l'a
    /// portée seul jusqu'à ce tour — `storyBlurredBackdrop`, son voile, sa
    /// cascade d'empreinte ; l'extraction n'a de valeur que si la recette quitte
    /// l'hôte. Une copie laissée derrière est exactement la forme du défaut que
    /// le lot ferme : deux écritures équivalentes qui divergeront.
    ///
    /// **Le balayage retire les COMMENTAIRES**, et c'est indispensable ici : le
    /// fichier DIT ce qu'il ne fait plus — une note de retrait nomme forcément ce
    /// qu'elle retire. Une garde qui compterait le texte brut interdirait
    /// d'écrire l'histoire du lot, ce qui pousserait à taire le retrait plutôt
    /// qu'à l'expliquer.
    func test_leLecteurDeStories_naPlusDeRecettePriveeDuSol() throws {
        let code = Self.stripComments(
            try Self.source("apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift"))
        for motif in ["storyBlurredBackdrop", "blur(radius: 60)", "scaleEffect(1.18)"] {
            XCTAssertFalse(code.contains(motif),
                           "la recette du sol vit dans SceneFloorView : « \(motif) » n'a plus " +
                           "rien à faire dans le lecteur")
        }
    }

    /// **Le sol vit dans le SDK, auprès de la carte qu'il entoure.** C'est une
    /// LOI de peinture à paramètres opaques — une chaîne, un nombre —, donc un
    /// atome d'interface au sens du tableau de placement, jamais de
    /// l'orchestration d'écran.
    func test_leSol_vitDansLeSDK_aCoteDeLaCarte() {
        let dossier = Self.repoRoot
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Story/ScenePlayer")
        for fichier in ["SceneFloorView.swift", "SceneCard.swift"] {
            XCTAssertTrue(
                FileManager.default.fileExists(atPath: dossier.appendingPathComponent(fichier).path),
                "\(fichier) doit vivre auprès du moteur de scène")
        }
    }


    // MARK: - Les témoins de pixels

    /// **Le sol PEINT la matière de l'empreinte, jamais du noir.** Le défaut que
    /// la recette du tour 3 ter a mesuré au pixel était exactement celui-là : du
    /// noir pur (0, 0, 0) autour de la carte d'un post, là où la story peint une
    /// teinte dérivée de son hachage.
    ///
    /// L'empreinte est ENCODÉE depuis un aplat connu (`UIImage.toThumbHash`), et
    /// non écrite à la main : la teinte attendue est alors PRÉVISIBLE — un sol
    /// bleu ne peut pas passer pour un sol gris, et l'assertion peut dire
    /// laquelle des deux elle a lue.
    func test_leSol_peintLaMatiereDeLEmpreinte_jamaisDuNoir() throws {
        let pixels = try monter(SceneFloorView(thumbHash: Self.empreinteIndigo,
                                               veil: SceneFloorView.cardedVeil))
        defer { pixels.dismount() }

        let (x, y) = Self.pointDeSol
        let lu = pixels.rgb(x: x, y: y)

        XCTAssertFalse(pixels.pixel(x, y, matches: Self.sentinelle, tolerance: 8),
                       "fusible : le sol COUVRE le point mesuré (\(pixels.hex(x: x, y: y)))")
        XCTAssertFalse(pixels.pixel(x, y, matches: .black, tolerance: 24),
                       "le sol n'est PAS noir — c'est le défaut mesuré sur F1 au tour 3 ter " +
                       "(\(pixels.hex(x: x, y: y)))")
        XCTAssertGreaterThan(lu.b, lu.r + 24,
                             "et la matière est celle de l'EMPREINTE, pas un gris quelconque : " +
                             "l'aplat encodé est indigo (\(pixels.hex(x: x, y: y)))")
    }

    /// **Sans empreinte, le sol ne recouvre RIEN** — et ce n'est pas un repli
    /// honteux, c'est ce qui permet à trois hôtes au sol différent de partager la
    /// même recette : le lecteur de stories laisse voir le dégradé de l'auteur
    /// d'une story sans média, la galerie et le réel leur noir.
    ///
    /// C'est aussi le FUSIBLE du témoin ci-dessus : sans lui, un sol qui
    /// peindrait n'importe quoi d'opaque passerait pour un sol qui peint la bonne
    /// matière.
    func test_sansEmpreinte_leSol_laisseVoirCeQuiEstDessous() throws {
        let pixels = try monter(SceneFloorView(thumbHash: nil, veil: SceneFloorView.fullVeil))
        defer { pixels.dismount() }

        let (x, y) = Self.pointDeSol
        XCTAssertTrue(pixels.pixel(x, y, matches: Self.sentinelle, tolerance: 8),
                      "un sol sans empreinte et sans voile ne peint rien : ce qui vit dessous " +
                      "reste visible (\(pixels.hex(x: x, y: y)))")
    }

    /// **Le voile assombrit vraiment, et l'immersif ne l'a pas.** Les deux
    /// valeurs sont des CONSTANTES du sol (0,18 / 0) ; ce témoin dit qu'elles
    /// atteignent l'écran. Sans lui, un `veil` ignoré par le corps de la vue
    /// laisserait les trois hôtes croire qu'ils commandent quelque chose.
    func test_leVoileCarde_assombritLeSol_etLImmersifNon() throws {
        let (x, y) = Self.pointDeSol

        let carde = try monter(SceneFloorView(thumbHash: Self.empreinteIndigo,
                                              veil: SceneFloorView.cardedVeil))
        let sousLeVoile = carde.rgb(x: x, y: y)
        carde.dismount()

        let immersif = try monter(SceneFloorView(thumbHash: Self.empreinteIndigo,
                                                veil: SceneFloorView.fullVeil))
        let nu = immersif.rgb(x: x, y: y)
        immersif.dismount()

        XCTAssertGreaterThan(nu.r + nu.g + nu.b, sousLeVoile.r + sousLeVoile.g + sousLeVoile.b + 24,
                             "le voile cardé (\(SceneFloorView.cardedVeil)) assombrit le sol que " +
                             "l'immersif laisse nu : lu \(sousLeVoile) sous le voile, \(nu) sans")
    }

    /// **La galerie : une page SCÈNE a un sol, une page IMAGE garde son noir.**
    ///
    /// C'est la non-régression qui compte autant que le correctif. Le noir plat
    /// de la galerie reste le sol légitime d'une pièce jointe — son hors-champ
    /// est habillé par `MediaStageBackdrop`, qui cadre une IMAGE REÇUE, pas une
    /// scène. Le sol de scène ne remplace pas ce fond : il se pose par-dessus, et
    /// seulement pour une scène.
    ///
    /// Le montage est celui de la production — `Color.black` puis
    /// `GallerySceneFloor` —, et la vue montée est celle que la galerie monte,
    /// pas un double : c'est pour cela que le sol de la galerie est une vue à
    /// part plutôt que deux lignes dans le corps du fichier racine.
    func test_laGalerie_unePageScene_aUnSol_unePageImage_gardeSonNoir() throws {
        let (x, y) = Self.pointDeSol

        let scene = try monter(ZStack {
            Color.black
            GallerySceneFloor(scene: Self.pageScene(empreinte: Self.empreinteIndigo),
                              presentation: .carded)
        }.ignoresSafeArea())
        let surLaScene = scene.hex(x: x, y: y)
        let estNoirSurLaScene = scene.pixel(x, y, matches: .black, tolerance: 24)
        scene.dismount()

        let image = try monter(ZStack {
            Color.black
            GallerySceneFloor(scene: nil, presentation: .carded)
        }.ignoresSafeArea())
        let estNoirSurLImage = image.pixel(x, y, matches: .black, tolerance: 8)
        let surLImage = image.hex(x: x, y: y)
        image.dismount()

        XCTAssertFalse(estNoirSurLaScene,
                       "une page SCÈNE reçoit le sol de la story, jamais du noir plat (\(surLaScene))")
        XCTAssertTrue(estNoirSurLImage,
                      "et une page IMAGE garde le noir de la galerie — non-régression (\(surLImage))")
    }

    /// **Le réel monte le sol au voile NUL**, et son empreinte vient du même site
    /// que le fond DANS sa carte (`StoryItem.sceneBackdropHash`) : le sol autour
    /// et le fond dedans parlent du même contenu, ce qui est tout l'objet de
    /// #6797.
    ///
    /// Le porteur de la scène d'un réel est construit par `ReelSceneView.carrier`
    /// depuis le post ; ce témoin mesure sur un porteur de la même forme — un
    /// `StoryItem` dont l'empreinte vit sur ses médias.
    func test_leReel_monteLeSol_auVoileNul_avecLEmpreinteDeSonPorteur() throws {
        let porteur = StoryItem(id: "reel",
                                media: [FeedMedia(id: "m1", type: .image,
                                                  thumbHash: Self.empreinteIndigo)],
                                createdAt: Date(timeIntervalSince1970: 0))
        XCTAssertEqual(porteur.sceneBackdropHash, Self.empreinteIndigo,
                       "l'empreinte du sol d'un réel est celle de son porteur")

        let pixels = try monter(ZStack {
            Color.black
            SceneFloorView(thumbHash: porteur.sceneBackdropHash, veil: SceneFloorView.fullVeil)
        }.ignoresSafeArea())
        defer { pixels.dismount() }

        let (x, y) = Self.pointDeSol
        XCTAssertFalse(pixels.pixel(x, y, matches: .black, tolerance: 24),
                       "un réel composé n'est plus posé sur du noir pur (\(pixels.hex(x: x, y: y)))")
    }

    // MARK: - Le sol ne DICTE pas la taille de son hôte

    /// **#7037 — un sol PREND la place qu'on lui propose, il ne la DICTE
    /// jamais.**
    ///
    /// Les trois hôtes du sol le montent en FRÈRE de leur chrome, dans un
    /// `ZStack` — et un `ZStack` adopte la taille de son plus grand enfant. Le
    /// sol peignait son empreinte en `scaledToFill()` sans cadre ni rognage :
    /// une image remplie REND ses cotes agrandies, et l'hôte les adoptait. Tout
    /// ce qui s'y alignait sur un BORD partait avec.
    ///
    /// Mesuré au simulateur avant le correctif, dans une fenêtre de 402 pt :
    ///
    /// ```
    /// empreinte portrait (36 × 64) → hôte large de   437,3 → sonde gauche à x =   −3,7
    /// empreinte carrée   (64 × 64) → hôte large de   778,0 → sonde gauche à x = −174,0
    /// empreinte paysage  (64 × 36) → hôte large de 1 383,3 → sonde gauche à x = −476,7
    /// ```
    ///
    /// À l'écran, dans la galerie de post : la croix « Fermer » à x = −326,3,
    /// entièrement hors du viewport, et le menu ⋯ — donc « Enregistrer » et
    /// « Partager hors de Meeshy » — sorti par l'autre bord.
    ///
    /// **Le témoin porte sur les DEUX formes**, et c'est ce qui le rend utile :
    /// une empreinte portrait ne perd que 3,7 pt, assez pour passer une recette
    /// et pas assez pour se voir. Une mesure faite sur elle seule aurait conclu
    /// au vert.
    ///
    /// Il vit ICI, sur l'atome, plutôt que chez un hôte : les trois surfaces
    /// plein écran (lecteur de stories, galerie de post, réel) montent le même
    /// sol, et une règle vérifiée chez un seul est une règle qu'un autre finira
    /// par ne pas avoir.
    func test_leSol_neDicteJamaisLaTailleDeSonHote() throws {
        for (forme, empreinte) in [("paysage", Self.empreintePaysage),
                                   ("portrait", Self.empreintePortrait),
                                   ("carrée", Self.empreinteIndigo)] {
            let ecran = RenderedScreen(SolChezUnHote(empreinte: empreinte), size: Self.fenetre)
            defer { ecran.dismount() }

            let gauche = try XCTUnwrap(ecran.frame(labeledPrefix: SolChezUnHote.gauche),
                                       "empreinte \(forme) : la sonde de gauche n'est pas rendue")
            let droite = try XCTUnwrap(ecran.frame(labeledPrefix: SolChezUnHote.droite),
                                       "empreinte \(forme) : la sonde de droite n'est pas rendue")

            XCTAssertEqual(
                gauche.minX, SolChezUnHote.marge, accuracy: 0.5,
                "empreinte \(forme) : le sol a élargi son hôte — la sonde de gauche est à " +
                "x = \(gauche.minX) au lieu de \(SolChezUnHote.marge)")
            XCTAssertEqual(
                droite.maxX, Self.fenetre.width - SolChezUnHote.marge, accuracy: 0.5,
                "empreinte \(forme) : le sol a élargi son hôte — la sonde de droite finit à " +
                "x = \(droite.maxX) au lieu de \(Self.fenetre.width - SolChezUnHote.marge)")
        }
    }

    private static let fenetre = CGSize(width: 402, height: 874)

    /// Le montage des trois hôtes, réduit à ce qui décide : un sol et un chrome
    /// alignés sur les bords, frères dans un `ZStack`. Les sondes remplacent la
    /// croix et le menu — ce qu'on mesure est la PLACE que l'hôte leur laisse,
    /// pas ce qu'elles sont.
    private struct SolChezUnHote: View {
        static let gauche = "SondeDeBordGauche"
        static let droite = "SondeDeBordDroit"
        /// Le pas du couloir de la galerie : `MediaGalleryStage.gutter + 2`.
        static let marge: CGFloat = 14

        let empreinte: String

        var body: some View {
            ZStack {
                Color.black.ignoresSafeArea()
                SceneFloorView(thumbHash: empreinte, veil: SceneFloorView.cardedVeil)
                    .ignoresSafeArea()
                VStack(spacing: 0) {
                    HStack {
                        Color.blue.frame(width: 40, height: 40)
                            .accessibilityLabel(Self.gauche)
                        Spacer(minLength: 0)
                        Color.red.frame(width: 40, height: 40)
                            .accessibilityLabel(Self.droite)
                    }
                    .padding(.horizontal, Self.marge)
                    .frame(height: 56)
                    Spacer(minLength: 0)
                }
                .ignoresSafeArea()
            }
        }
    }

    // MARK: - Le montage des pixels

    /// Ce qu'on lit là où le sol ne peint rien. Distincte du noir, qui est
    /// précisément la valeur que ces témoins doivent pouvoir accuser.
    private static let sentinelle = Color(.sRGB, red: 1, green: 0, blue: 1, opacity: 1)

    /// **Le point de mesure : hors de toute carte, en haut à gauche.** C'est le
    /// point que la recette au simulateur lit (30, 30) — au-dessus du bord haut
    /// de la carte dans les deux plein écrans comme dans le lecteur, donc du SOL
    /// et de rien d'autre.
    private static let pointDeSol = (x: 30, y: 30)

    /// L'empreinte d'un APLAT indigo, encodée par le SDK plutôt qu'écrite à la
    /// main : la teinte attendue est alors prévisible, et les assertions peuvent
    /// dire QUELLE couleur elles ont lue.
    private static let empreinteIndigo = empreinte(CGSize(width: 64, height: 64))

    /// Les deux FORMES que #7037 sépare : c'est le rapport de l'empreinte, et lui
    /// seul, qui décidait de combien le sol élargissait son hôte.
    private static let empreintePaysage = empreinte(CGSize(width: 64, height: 36))
    private static let empreintePortrait = empreinte(CGSize(width: 36, height: 64))

    private static func empreinte(_ taille: CGSize) -> String {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let aplat = UIGraphicsImageRenderer(size: taille, format: format).image { ctx in
            UIColor(red: 0.310, green: 0.275, blue: 0.898, alpha: 1).setFill()
            ctx.cgContext.fill(CGRect(origin: .zero, size: taille))
        }
        return aplat.toThumbHash() ?? ""
    }

    private static func pageScene(empreinte: String?) -> GallerySceneItem {
        let document = CanvasV3(scenes: [SceneV3(id: "s1", objects: [])])
        return GallerySceneItem(id: "p1#0",
                                postId: "p1",
                                document: document,
                                sceneIndex: 0,
                                carrier: StoryItem(id: "p1", createdAt: Date(timeIntervalSince1970: 0)),
                                mediaId: nil,
                                aspect: SceneShape.aspect,
                                canvasAspect: SceneShape.aspect,
                                moves: false,
                                thumbHash: empreinte,
                                thumbnailURL: nil)
    }

    /// Le sol sur une SENTINELLE, plein bord — un sol se mesure là où il n'y a
    /// rien d'autre, donc sans carte au-dessus : ce que ces témoins interrogent
    /// est le hors-carte, et `SceneCardMountingTests` interroge déjà le dedans.
    private func monter(_ vue: some View) throws -> RenderedPixels {
        let pixels = try RenderedPixels(
            ZStack {
                Self.sentinelle.ignoresSafeArea()
                vue.ignoresSafeArea()
            }
        )
        pixels.settle(borne: 3) { true }
        RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        pixels.capture()
        return pixels
    }

    // MARK: - Helpers

    static let repoRoot: URL = {
        var url = URL(fileURLWithPath: #filePath)
        // MeeshyTests/Unit/Views/<fichier> → apps/ios → apps → racine
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url
    }()

    static func source(_ relative: String) throws -> String {
        try String(contentsOf: repoRoot.appendingPathComponent(relative), encoding: .utf8)
    }

    /// Retire les commentaires — ligne et bloc. Même détecteur que
    /// `SceneShapeSourceGuardTests.stripComments`, dans la cible qui le voit.
    static func stripComments(_ source: String) -> String {
        var sortie = ""
        var index = source.startIndex
        var dansLigne = false
        var dansBloc = false
        while index < source.endIndex {
            let reste = source[index...]
            if dansLigne {
                if source[index] == "\n" { dansLigne = false; sortie.append("\n") }
                index = source.index(after: index)
                continue
            }
            if dansBloc {
                if reste.hasPrefix("*/") {
                    dansBloc = false
                    index = source.index(index, offsetBy: 2)
                } else {
                    index = source.index(after: index)
                }
                continue
            }
            if reste.hasPrefix("//") { dansLigne = true; index = source.index(index, offsetBy: 2); continue }
            if reste.hasPrefix("/*") { dansBloc = true; index = source.index(index, offsetBy: 2); continue }
            sortie.append(source[index])
            index = source.index(after: index)
        }
        return sortie
    }

    /// Contrôle positif du détecteur : sans lui, un `stripComments` cassé rendrait
    /// la garde ci-dessus verte pour toujours.
    func test_leDetecteur_ignoreUnCommentaireEtVoitLeCode() {
        XCTAssertFalse(Self.stripComments("// .blur(radius: 60) vivait ici").contains("blur"))
        XCTAssertTrue(Self.stripComments("x.blur(radius: 60)").contains("blur(radius: 60)"))
        XCTAssertFalse(Self.stripComments("/* SceneFloorView( */").contains("SceneFloorView("))
    }
}
