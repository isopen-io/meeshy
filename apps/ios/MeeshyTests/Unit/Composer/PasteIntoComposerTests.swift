import XCTest
@testable import Meeshy

/// C5b — **le collage entre dans le composer**, et rien de ce qui est collé ne
/// disparaît en chemin.
///
/// `PasteDestinationTests` prouve la RÈGLE (deux axes, la surface décide du
/// budget et de la mémorisation, le type décide du produit). Cette suite-ci
/// prouve la VENTILATION : que ce que le lecteur de presse-papier rend est
/// effectivement réparti selon cette règle, et surtout qu'il l'est
/// INTÉGRALEMENT.
///
/// ## Pourquoi la loi de conservation est le test central
///
/// Le presse-papier ne dit jamais pourquoi rien ne s'est passé. Un élément qui
/// ne tombe dans aucun bac n'échoue pas, ne journalise rien, ne s'affiche pas :
/// il n'existe plus. C'est le pire comportement possible, et c'est exactement
/// ce que la directive produit du 2026-08-23 interdit — *« on doit pouvoir
/// coller des images, des documents dont les stickers, et ça doit être pris en
/// compte et propagé »*.
///
/// ## Pourquoi ses fixtures sont DÉRIVÉES et non écrites à la main
///
/// La première version de `test_everyReadIngest_landsInExactlyOneBucket`
/// annonçait rougir « si un cinquième cas apparaît ». C'était faux : la somme
/// portait sur neuf fixtures écrites à la main, donc un troisième cas de
/// `ComposerIngest` ou un cinquième pipeline de `ComposerIngestRouter`
/// compilaient sans rien casser — la garde promettait exactement la protection
/// qu'elle n'avait pas. Les fixtures descendent désormais de deux `switch`
/// EXHAUSTIFS (`family(of:)`) : une famille de plus côté production ne compile
/// plus tant qu'elle n'est pas nommée, puis tant qu'elle n'a pas d'échantillon.
///
/// ## Pourquoi aucun de ces tests ne relit le presse-papier
///
/// `ComposerDropResolver` sait déjà lire un `NSItemProvider` — et il a sa propre
/// suite. Ce que ce fichier vérifie commence APRÈS lui : la ventilation est
/// pure, elle ne touche ni le disque ni UIKit, donc elle se teste sans le
/// moindre montage.
final class PasteIntoComposerTests: XCTestCase {

    // MARK: - V3-5 — `.stickers` est atteignable en production, pas seulement en test

    /// GARDE POSITIVE. `PasteSurface.stickers` existant dans l'énum ne prouve
    /// rien : `test_theTwoSurfacesNeverConverge_forAnImage` ci-dessous le
    /// prouvait déjà par la VALEUR, sans qu'aucun site de PRODUCTION ne
    /// l'atteigne jamais. Sans un tel site, le panneau « Mes stickers » du
    /// composer n'est joignable par aucun chemin réel, et `StickerLibraryStore`
    /// (budget 64 Mo, index sidecar, éviction LRU — 126 lignes) ne reçoit
    /// jamais rien à retenir. Une garde qui vérifiait l'ABSENCE de ce site
    /// mourrait en silence en gagnant un site : c'est pourquoi elle affirme sa
    /// PRÉSENCE.
    func test_aProductionSite_reachesTheStickersSurface() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        guard let enumerateur = FileManager.default.enumerator(at: racine, includingPropertiesForKeys: nil) else {
            return XCTFail("Arborescence app introuvable à \(racine.path)")
        }
        var found = false
        for case let url as URL in enumerateur where url.pathExtension == "swift" {
            let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            if source.contains("surface: .stickers") {
                found = true
                break
            }
        }
        XCTAssertTrue(
            found,
            "Aucun site de PRODUCTION (sous apps/ios/Meeshy) ne passe `surface: .stickers` — le "
                + "panneau « Mes stickers » reste inatteignable et StickerLibraryStore ne reçoit "
                + "jamais rien à retenir."
        )
    }

    private func file(_ name: String, _ mime: String) -> ComposerIngest {
        .file(url: URL(fileURLWithPath: "/tmp/\(name)"), name: name, mime: mime)
    }

    private func names(_ files: [ComposerPastedFile]) -> [String] {
        files.map(\.name)
    }

    // MARK: - Les familles, dérivées de la production par des `switch` exhaustifs

    /// Les familles de `ComposerIngest`. `family(of:)` ci-dessous est exhaustif :
    /// un troisième cas ajouté au lecteur (une URL distante, un contact…) ne
    /// compile plus tant qu'il n'est pas nommé ici.
    private enum IngestFamily: CaseIterable { case file, text }

    private func family(of ingest: ComposerIngest) -> IngestFamily {
        switch ingest {
        case .file: return .file
        case .text: return .text
        }
    }

    /// Les familles de pipeline de `ComposerIngestRouter`. Même mécanique : un
    /// cinquième pipeline ne compile plus tant qu'il n'a pas sa famille, donc
    /// plus tant qu'il n'a pas d'échantillon dans la loi de conservation.
    private enum PipelineFamily: CaseIterable {
        case image, video, audio, file

        /// Un échantillon par famille — nom DISTINCT, pour que la garde
        /// anti-doublon de la conservation mesure vraiment quelque chose.
        var sample: (name: String, mime: String) {
            switch self {
            case .image: return ("a.png", "image/png")
            case .video: return ("c.mov", "video/quicktime")
            case .audio: return ("d.m4a", "audio/mp4")
            case .file: return ("e.pdf", "application/pdf")
            }
        }
    }

    private func family(of pipeline: ComposerIngestPipeline) -> PipelineFamily {
        switch pipeline {
        case .image: return .image
        case .video: return .video
        case .audio: return .audio
        case .file: return .file
        }
    }

    private func fixtures(for family: IngestFamily) -> [ComposerIngest] {
        switch family {
        case .file: return PipelineFamily.allCases.map { file($0.sample.name, $0.sample.mime) }
        case .text: return [.text("bonjour"), .text("https://meeshy.me")]
        }
    }

    /// Un échantillon de CHAQUE famille que le lecteur peut produire.
    private var everyFixture: [ComposerIngest] {
        IngestFamily.allCases.flatMap { fixtures(for: $0) }
    }

    private func fileNames(_ ingests: [ComposerIngest]) -> [String] {
        ingests.compactMap { ingest -> String? in
            guard case let .file(_, name, _) = ingest else { return nil }
            return name
        }
    }

    /// La garde qui rend les deux `switch` ci-dessus utiles : elle prouve que
    /// les fixtures couvrent RÉELLEMENT chaque famille de production. Sans elle,
    /// nommer une famille neuve dans `family(of:)` suffirait à recompiler sans
    /// jamais l'échantillonner.
    func test_theFixturesCoverEveryFamilyTheReaderCanProduce() {
        XCTAssertEqual(
            Set(everyFixture.map { family(of: $0) }), Set(IngestFamily.allCases),
            "Une famille de `ComposerIngest` n'a pas d'échantillon : la loi de conservation "
                + "ne la mesurerait pas."
        )

        let covered = everyFixture.compactMap { ingest -> PipelineFamily? in
            guard case let .file(_, _, mime) = ingest else { return nil }
            return family(of: ComposerIngestRouter.route(mime: mime))
        }
        XCTAssertEqual(
            Set(covered), Set(PipelineFamily.allCases),
            "Un pipeline de `ComposerIngestRouter` n'a pas d'échantillon : un collage de cette "
                + "famille pourrait être avalé sans qu'aucune assertion ne bouge."
        )
    }

    // MARK: - La loi de conservation

    /// Le test le plus important du fichier. Tout ce qui entre ressort —
    /// réparti, jamais perdu. Ajouter une famille au lecteur sans lui donner de
    /// bac fait chuter la somme, et c'est la SEULE façon dont cette omission se
    /// voit : rien d'autre ne la signalerait.
    func test_everyReadIngest_landsInExactlyOneBucket() {
        let ingests = everyFixture

        for surface in [PasteSurface.scene, .stickers] {
            let batch = PasteIntoComposer.batch(ingests: ingests, surface: surface)
            let placed = batch.scene + batch.stickers + batch.attachments
            XCTAssertEqual(
                placed.count + batch.text.count, ingests.count,
                "Surface \(surface) : un élément lu n'a atterri nulle part. Le presse-papier "
                    + "ne dit jamais pourquoi rien ne s'est passé — un bac manquant est un "
                    + "collage avalé en silence."
            )
            XCTAssertEqual(
                Set(names(placed)).count, placed.count,
                "Surface \(surface) : un élément est tombé dans DEUX bacs — il serait posé deux fois."
            )
        }
    }

    // MARK: - Axe 1 — la surface décide de la mémorisation

    /// L'assertion produit la plus lourde du lot : coller dans la scène ne
    /// nourrit JAMAIS « Mes stickers ». Sinon la bibliothèque grossit de tout ce
    /// que l'auteur a composé, sans qu'il l'ait jamais demandé.
    func test_imagePastedIntoTheScene_isSceneContent_andNeverEntersTheLibrary() {
        let batch = PasteIntoComposer.batch(ingests: [file("a.png", "image/png")], surface: .scene)

        XCTAssertEqual(names(batch.scene), ["a.png"])
        XCTAssertTrue(batch.stickers.isEmpty, "La scène n'alimente pas la bibliothèque (règle O12).")
    }

    func test_imagePastedIntoTheStickerPanel_leavesTheSceneAlone() {
        let batch = PasteIntoComposer.batch(ingests: [file("a.png", "image/png")], surface: .stickers)

        XCTAssertEqual(names(batch.stickers), ["a.png"])
        XCTAssertTrue(batch.scene.isEmpty, "Coller dans le panneau ne pose rien sur le canevas.")
    }

    /// Si les deux surfaces convergeaient, tous les tests ci-dessus resteraient
    /// verts en vérifiant une seule et même chose. Celui-ci verrouille la
    /// DIFFÉRENCE elle-même, au niveau de la ventilation.
    func test_theTwoSurfacesNeverConverge_forAnImage() {
        let image = [file("a.png", "image/png")]
        XCTAssertNotEqual(
            PasteIntoComposer.batch(ingests: image, surface: .scene).scene.isEmpty,
            PasteIntoComposer.batch(ingests: image, surface: .stickers).scene.isEmpty
        )
    }

    // MARK: - Axe 2 — le type collé décide du produit

    /// Vidéo et son ont un rendu dans le canevas : ils restent du contenu de
    /// scène, quelle que soit la surface. Une surface ne change pas la NATURE de
    /// ce qui est collé.
    func test_videoAndAudio_areSceneContent_onBothSurfaces() {
        let media = [file("c.mov", "video/quicktime"), file("d.m4a", "audio/mp4")]

        for surface in [PasteSurface.scene, .stickers] {
            let batch = PasteIntoComposer.batch(ingests: media, surface: surface)
            XCTAssertEqual(names(batch.scene), ["c.mov", "d.m4a"], "Surface \(surface)")
            XCTAssertTrue(batch.stickers.isEmpty, "Une vidéo n'est pas un sticker (surface \(surface)).")
        }
    }

    /// **Le cas que le plan d'origine avait oublié.** Le composer sert quatre
    /// formats, dont le post, qui porte des documents. Un collage limité aux
    /// images les aurait avalés.
    func test_document_becomesAnAttachment_onBothSurfaces() {
        for surface in [PasteSurface.scene, .stickers] {
            let batch = PasteIntoComposer.batch(ingests: [file("e.pdf", "application/pdf")], surface: surface)
            XCTAssertEqual(names(batch.attachments), ["e.pdf"], "Surface \(surface)")
            XCTAssertTrue(batch.scene.isEmpty)
            XCTAssertTrue(batch.stickers.isEmpty, "Un PDF collé dans le panneau Stickers reste une pièce jointe.")
        }
    }

    /// Un type inconnu — archive, MIME vide, `application/octet-stream` — tombe
    /// sur le pipeline fichier et devient donc une pièce jointe. Il ne devient
    /// PAS rien : c'est la différence entre « je ne sais pas peindre ça » et
    /// « je l'ai perdu ».
    func test_anUnknownType_becomesAnAttachment_neverNothing() {
        let batch = PasteIntoComposer.batch(
            ingests: [file("f.zip", "application/zip"),
                      file("g.bin", ""),
                      file("h.dat", "application/octet-stream")],
            surface: .scene
        )
        XCTAssertEqual(names(batch.attachments), ["f.zip", "g.bin", "h.dat"])
    }

    // MARK: - Ce que la scène ne pose pas doit quand même se voir

    /// Le texte n'est pas du média : il se colle dans l'éditeur de texte, qui
    /// porte déjà le menu système. Il est donc PORTÉ jusqu'à l'appelant, qui
    /// l'annonce — pas jeté par la ventilation.
    func test_text_isCarried_neverDropped() {
        let batch = PasteIntoComposer.batch(
            ingests: [.text("bonjour"), file("a.png", "image/png")], surface: .scene)

        XCTAssertEqual(batch.text, ["bonjour"])
        XCTAssertEqual(names(batch.scene), ["a.png"], "Le texte n'empêche pas l'image d'entrer.")
    }

    /// Les providers que le lecteur a REFUSÉS (dossier, fichier de 0 octet,
    /// provider vide) n'ont pas d'ingest — mais ils ont un nom, et ce nom doit
    /// traverser la ventilation intact jusqu'au toast.
    func test_unreadableProviders_keepTheirNamesThroughTheVentilation() {
        let batch = PasteIntoComposer.batch(
            ingests: [file("a.png", "image/png")],
            unreadable: ["Dossier", "vide.txt"],
            surface: .scene
        )
        XCTAssertEqual(batch.unreadable, ["Dossier", "vide.txt"])
    }

    // MARK: - « Pris en compte et propagé » : posé, ou annoncé — jamais avalé

    /// **La directive du 2026-08-23, écrite en loi.** Sur la scène d'une story,
    /// « propagé » a exactement deux issues : POSÉ sur le canvas, ou ANNONCÉ à
    /// l'auteur avec sa destination. Une troisième — le silence — est ce que la
    /// directive interdit, et c'est ce que produisait un bac `attachments` lu
    /// nulle part ailleurs que dans la concaténation d'un message.
    func test_everythingPasted_isEitherPosedOrAnnounced_neverSwallowed() {
        let ingests = everyFixture
        let batch = PasteIntoComposer.batch(
            ingests: ingests, unreadable: ["Dossier"], surface: .scene)

        let announced = PasteIntoComposer.exclusions(in: batch).flatMap { exclusion -> [String] in
            switch exclusion {
            case .unreadable(let names), .documentBelongsToAPost(let names): return names
            case .textBelongsToTheTextTool: return []
            }
        }

        XCTAssertEqual(
            Set(names(batch.scene)).union(announced),
            Set(fileNames(ingests) + ["Dossier"]),
            "Un fichier collé n'est ni posé sur la scène ni annoncé à l'auteur : il a disparu."
        )
    }

    /// **RETOURNÉ au #4378 : le texte n'est plus annoncé, il est POSÉ.**
    ///
    /// La garde exigeait qu'il soit annoncé — « le texte appartient à l'outil
    /// texte » — et elle avait raison sur son époque : sans annonce, coller du
    /// texte n'aurait rien fait, sans un mot. Elle protégeait la loi « posé OU
    /// annoncé, jamais avalé ».
    ///
    /// La loi ne change pas ; c'est la branche qui change. Le texte est
    /// désormais POSÉ — en description au-delà de dix mots, en objet de scène en
    /// deçà (`StoryPastePolicy`). Continuer à l'annoncer refuserait poliment une
    /// matière que la scène sait héberger, ce qui est pire qu'un rejet muet :
    /// c'est un rejet qui se croit poli.
    ///
    /// Garde NÉGATIVE désormais, et c'est ce qui la rend utile : elle rougit si
    /// quelqu'un remet l'annonce, ce qui est la façon la plus naturelle de
    /// « réparer » un collage de texte qu'on croirait perdu.
    func test_pastedText_isNoLongerAnnounced_becauseItIsNowPosed() {
        let batch = PasteIntoComposer.batch(ingests: [.text("bonjour")], surface: .scene)

        XCTAssertFalse(
            PasteIntoComposer.exclusions(in: batch).contains(.textBelongsToTheTextTool),
            "Le texte est POSÉ depuis #4378 : l'annoncer le refuserait poliment alors que la "
                + "scène sait l'héberger."
        )
        XCTAssertTrue(
            batch.text.contains("bonjour"),
            "… et il doit bien arriver dans son bac : c'est de là que `storyScene` le transporte."
        )
    }

    /// **L'exclusion est ASSUMÉE, donc elle nomme une DESTINATION.** Le cas
    /// s'appelle `documentBelongsToAPost` et non `documentRejected` : c'est la
    /// différence entre « je n'en veux pas » et « voici où le porter ». Une
    /// annonce sans issue serait un refus déguisé.
    func test_aPastedDocument_isAnnouncedWithTheSurfaceThatAcceptsIt() {
        let batch = PasteIntoComposer.batch(
            ingests: [file("e.pdf", "application/pdf"), file("f.zip", "application/zip")],
            surface: .scene
        )

        XCTAssertEqual(
            PasteIntoComposer.exclusions(in: batch),
            [.documentBelongsToAPost(["e.pdf", "f.zip"])],
            "Le document doit être annoncé AVEC son nom et sa destination — le bac "
                + "`attachments` n'a pas d'autre consommateur sur la scène d'une story."
        )
    }

    /// Rien à annoncer quand tout a été posé : une annonce systématique
    /// deviendrait un bruit que l'auteur apprendrait à ignorer, et le jour où
    /// elle porterait une vraie exclusion, il ne la lirait plus.
    func test_nothingIsAnnounced_whenTheSceneHostedEverything() {
        let batch = PasteIntoComposer.batch(
            ingests: [file("a.png", "image/png"), file("c.mov", "video/quicktime")],
            surface: .scene
        )

        XCTAssertTrue(PasteIntoComposer.exclusions(in: batch).isEmpty)
    }

    // MARK: - Une seule table, pas deux

    /// La ventilation LIT `PasteDestination` ; elle ne réécrit pas sa table.
    /// Deux tables finissent toujours par diverger, et la divergence serait
    /// invisible : chaque suite resterait verte de son côté.
    func test_theBuckets_mirrorPasteDestination_ratherThanASecondTable() {
        let samples = PipelineFamily.allCases.map(\.sample) + [(name: "g.bin", mime: "")]

        for surface in [PasteSurface.scene, .stickers] {
            for (name, mime) in samples {
                let batch = PasteIntoComposer.batch(ingests: [file(name, mime)], surface: surface)
                let expected = PasteDestination.resolve(
                    surface: surface, ingest: ComposerIngestRouter.route(mime: mime)).product
                let landed: PasteProduct? = {
                    if !batch.scene.isEmpty { return .mediaObject }
                    if !batch.stickers.isEmpty { return .sticker }
                    if !batch.attachments.isEmpty { return .attachment }
                    return nil
                }()
                XCTAssertEqual(landed, Optional(expected), "\(name) sur \(surface)")
            }
        }
    }
}
