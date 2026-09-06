import XCTest
import MeeshySDK
@testable import Meeshy

/// **Publier un Réel** (#4869, directive porteur 2026-09-06 : « il semblerait
/// qu'il ne soit pas possible de publier des réels »).
///
/// Mesuré au simulateur iPhone 16 Pro le 2026-09-06, avant ce lot : Flux →
/// « Partager quelque chose » → photothèque → vidéo de 6 s → format **Réel** →
/// **Publier**. Le composer reste ouvert, rien ne part.
///
/// ## Trois verrous, et il fallait les lever ensemble
///
/// | verrou | ce qu'il faisait |
/// |---|---|
/// | `ComposerPublishChannel.channel(.reel)` | rendait `.unsupported` ⇒ le socle refusait |
/// | `ComposerDocumentSendPlan.plan` | `guard draft.format == .post` ⇒ refus `wrongFormat` |
/// | `DocumentComposerDoor.publish` | `case .story, .reel: refuse()` |
///
/// N'en lever qu'un déplaçait le refus d'un cran sans rien publier — c'est ce
/// qui rend ce lot indivisible, et c'est pourquoi les témoins portent sur les
/// trois.
final class ComposerReelPublishTests: XCTestCase {

    private func brouillonReel(
        localMedia: [ComposerDocumentMedia],
        texte: String = ""
    ) -> ComposerDocumentDraft {
        ComposerDocumentDraft.document(
            format: .reel, forcePlainPost: false, text: texte, visibility: .public,
            visibilityUserIds: [], repostOfId: nil, localMedia: localMedia, location: nil,
            discoverabilityPrecision: nil, originalLanguage: nil, mobileTranscription: nil,
            references: [], storyEffects: nil, mediaCaptions: [:], mediaAlts: [:],
            mediaObjectIds: [:]
        )
    }

    /// **La durée est portée, parce qu'elle l'est en production.** L'intake la
    /// capte à l'ingestion (`MeeshyComposerHost+Intake`, trois sites, chacun
    /// commenté « sans quoi `ReelComposition` la classait mal »). Une fixture
    /// sans durée aurait mesuré un cas qui n'arrive pas, et fait croire que la
    /// garde de qualification refuse les vidéos.
    private func video(_ nom: String = "clip.mov", durationMs: Int? = 6_000) -> ComposerDocumentMedia {
        ComposerDocumentMediaFactory.media(
            url: FileManager.default.temporaryDirectory.appendingPathComponent(nom),
            declaredMimeType: "video/quicktime",
            durationMs: durationMs
        )
    }

    // MARK: - Le plan d'envoi

    /// Le verrou le plus discret des trois : il refusait par le FORMAT, avant
    /// même de regarder la matière — donc un réel parfaitement composé
    /// ressortait `wrongFormat`.
    func test_unReelAvecSaVideo_part() {
        let plan = ComposerDocumentSendPlan.plan(for: brouillonReel(localMedia: [video()]),
                                                 isOffline: false)
        guard case .send = plan else {
            return XCTFail("un réel qui porte sa vidéo doit partir, or le plan rend \(plan)")
        }
    }

    /// **La règle de matière ne s'assouplit PAS pour le réel.** Un brouillon
    /// sans rien reste refusé — le format ne dispense de rien, il change le
    /// `type` déclaré au serveur, pas les conditions de départ.
    func test_unReelVide_neParTPas() {
        XCTAssertEqual(
            ComposerDocumentSendPlan.plan(for: brouillonReel(localMedia: []), isOffline: false),
            .refuse(.emptyDraft)
        )
    }

    /// **Et un réel de TEXTE SEUL ne part pas non plus, pour une autre raison.**
    ///
    /// Le brouillon porte de la matière — le gate de vide est franchi — mais pas
    /// celle qu'un réel exige. Sans ce second verrou, le composer envoyait, et
    /// le serveur DÉGRADAIT le réel en post (`createPost: REEL non qualifiant
    /// dégradé en POST`) : l'auteur choisissait un format et en obtenait un
    /// autre, sans un mot.
    ///
    /// > Des deux verdicts possibles, un seul est réparable par celui qui le
    /// > subit. C'est celui-là qu'on sert.
    func test_unReelDeTexteSeul_estRefuseEnLeDisant() {
        XCTAssertEqual(
            ComposerDocumentSendPlan.plan(for: brouillonReel(localMedia: [], texte: "coucou"),
                                          isOffline: false),
            .refuse(.reelWithoutQualifyingMedia)
        )
    }

    /// **Deux images qualifient**, comme côté serveur — la règle est un MIROIR,
    /// pas une seconde écriture. Le témoin le vérifie sur le cas qui n'est ni
    /// une vidéo ni un son : celui où deux implémentations divergeraient.
    func test_deuxImages_qualifient() {
        let images = [
            ComposerDocumentMediaFactory.media(
                url: FileManager.default.temporaryDirectory.appendingPathComponent("a.jpg"),
                declaredMimeType: "image/jpeg"),
            ComposerDocumentMediaFactory.media(
                url: FileManager.default.temporaryDirectory.appendingPathComponent("b.jpg"),
                declaredMimeType: "image/jpeg")
        ]
        guard case .send = ComposerDocumentSendPlan.plan(for: brouillonReel(localMedia: images),
                                                         isOffline: false) else {
            return XCTFail("deux images qualifient comme réel — miroir de qualifiesAsReel")
        }
    }

    /// **La STORY reste refusée par ce plan, et ce n'est pas un oubli.** Elle
    /// part par le canal de la SCÈNE, qui publie une unité par slide ; l'y
    /// faire passer publierait une story vide de ses slides.
    func test_laStory_resteRefuseeParLePlanDuDocument() {
        let story = ComposerDocumentDraft.document(
            format: .story, forcePlainPost: false, text: "coucou", visibility: .public,
            visibilityUserIds: [], repostOfId: nil, localMedia: [video()], location: nil,
            discoverabilityPrecision: nil, originalLanguage: nil, mobileTranscription: nil,
            references: [], storyEffects: nil, mediaCaptions: [:], mediaAlts: [:],
            mediaObjectIds: [:]
        )
        XCTAssertEqual(ComposerDocumentSendPlan.plan(for: story, isOffline: false),
                       .refuse(.wrongFormat(.story)))
    }

    // MARK: - Le type qui part au serveur

    /// **Ce que l'éventail OFFRE, le plan l'ACCEPTE** — la même règle, appelée
    /// deux fois, jamais réécrite.
    ///
    /// `documentComposesReel` décide si le format Réel est proposé ;
    /// `ComposerDocumentSendPlan` décide s'il part. Deux écritures de cette
    /// question auraient offert un format que la publication refuse — la
    /// contradiction la plus coûteuse pour l'auteur, puisqu'elle ne se découvre
    /// qu'au moment de publier.
    func test_loffreEtLEnvoi_partagentLaMemeRegle() {
        let composition = [video()]
        let offert = ReelComposition.qualifiesAsReel(
            mimeTypes: composition.map(\.mimeType),
            durationsMs: composition.map(\.durationMs)
        )
        XCTAssertTrue(offert, "l'éventail offre le réel sur cette composition")
        guard case .send = ComposerDocumentSendPlan.plan(for: brouillonReel(localMedia: composition),
                                                         isOffline: false) else {
            return XCTFail("ce que l'éventail offre, le plan doit l'accepter")
        }
    }

    /// Ce qui distingue un réel d'un post sur le fil est le TYPE déclaré, et
    /// lui seul — le serveur le dégrade en POST s'il ne porte ni vidéo, ni son,
    /// ni deux images (`qualifiesAsReel`). Le composer n'a donc pas à
    /// re-trancher, mais il doit émettre le bon type.
    func test_leFormatReel_declareLeTypeReel() {
        XCTAssertEqual(ComposerFormat.reel.postType, .reel)
    }
}
