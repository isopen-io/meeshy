import XCTest
import UIKit
@testable import MeeshyUI
import MeeshySDK

/// **#4074 — « Modifier » est une décision par OBJET, jamais par canvas.**
///
/// `hasEditor` se lisait `onItemDoubleTapped != nil` : une question de CANVAS
/// (« l'hôte a-t-il câblé un éditeur ? ») posée à la place d'une question par
/// objet (« CET objet a-t-il un éditeur ? »). L'atelier câble le rappel puis
/// fait `case .sticker, .location: break` — le menu offrait donc « Modifier »
/// sur un sticker, et le toucher ne produisait rien.
///
/// > Le menu avait la `kind` sous la main — `contextMenu(for:kind:)` la reçoit.
/// > Ce qui manquait n'était pas une donnée, c'était de la CONSULTER.
///
/// ## La divergence que ce lot referme
///
/// Les actions VoiceOver appliquaient DÉJÀ la restriction, en local :
/// `if offered.contains(.edit), kind == .text || kind == .media`. Le menu
/// visuel, non. Les deux surfaces d'un même geste ne disaient donc pas la même
/// chose — pendant que le doc-comment de l'accessibilité affirmait appliquer
/// « la MÊME règle que le menu long-press ».
///
/// **Une règle déclarée partagée et écrite deux fois diverge sans que rien ne
/// le voie** : chaque copie reste cohérente avec elle-même.
@MainActor
final class StoryCanvasEditorPerKindTests: XCTestCase {

    private func makeCanvas(editable: Set<StoryCanvasUIView.CanvasItemKind>,
                            wired: Bool = true) -> StoryCanvasUIView {
        let slide = StorySlide(
            id: "s",
            effects: StoryEffects(
                stickerObjects: [StorySticker(id: "st1", emoji: "🎬", x: 0.5, y: 0.3)],
                textObjects: [StoryTextObject(id: "t1", text: "un")],
                locationObjects: [StoryLocationObject(
                    id: "loc1",
                    place: SharedPlace(latitude: 48.85, longitude: 2.35, name: "Paris"))],
                mediaObjects: [StoryMediaObject(id: "m1", postMediaId: "pm1",
                                                kind: .image, aspectRatio: 1)]),
            duration: 6,
            order: 0)
        let vue = StoryCanvasUIView(slide: slide, mode: .edit)
        vue.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        if wired { vue.onItemDoubleTapped = { _, _ in } }
        vue.editableKinds = editable
        return vue
    }

    // MARK: - La règle par kind

    /// Le cœur du lot : le rappel est câblé, et un STICKER n'a pourtant pas
    /// d'éditeur — parce que l'hôte ne le range pas dans `editableKinds`.
    func test_unStickerNEstPasEditable_memeQuandLHoteACableUnRappel() {
        let vue = makeCanvas(editable: [.text, .media])
        XCTAssertTrue(vue.hasEditor(for: .text))
        XCTAssertTrue(vue.hasEditor(for: .media))
        XCTAssertFalse(vue.hasEditor(for: .sticker),
                       "L'atelier fait `case .sticker: break` — offrir « Modifier » y était inerte.")
        XCTAssertFalse(vue.hasEditor(for: .location))
    }

    /// La scène incrustée du composer n'édite que le TEXTE tant qu'aucun
    /// éditeur média n'y est monté (#4082). Elle le DIT, plutôt que d'offrir
    /// une action qu'elle ignore.
    func test_unHoteQuiNEditeQueLeTexte_neServtPasLEditionDUnMedia() {
        let vue = makeCanvas(editable: [.text])
        XCTAssertTrue(vue.hasEditor(for: .text))
        XCTAssertFalse(vue.hasEditor(for: .media))
    }

    /// La loi d'origine est intacte : sans rappel, aucun kind n'a d'éditeur.
    /// C'est elle qui tenait la scène incrustée à deux actions sur quatre.
    func test_sansRappel_aucunKindNAUnEditeur() {
        let vue = makeCanvas(editable: [.text, .media], wired: false)
        for kind in StoryCanvasUIView.CanvasItemKind.allCases {
            XCTAssertFalse(vue.hasEditor(for: kind))
        }
    }

    // MARK: - Les deux surfaces du même geste ne peuvent plus diverger

    /// Pour CHAQUE kind, le menu visuel et les actions VoiceOver rendent le
    /// même verdict sur « Modifier ». C'est le témoin qui serait tombé sur
    /// l'état d'avant : le menu offrait l'action sur un sticker, VoiceOver non.
    func test_leMenuVisuelEtVoiceOver_saccordentSurChaqueKind() {
        let vue = makeCanvas(editable: [.text, .media])
        for kind in StoryCanvasUIView.CanvasItemKind.allCases {
            let id = identifiant(pour: kind)
            let menuOffreModifier = vue.contextMenu(for: id, kind: kind)
                .children
                .contains { ($0 as? UIAction)?.title == StoryCanvasContextAction.edit.title }
            let voiceOverOffreModifier = vue.makeCustomActions(forId: id, kind: kind)
                .contains { $0.name == StoryCanvasContextAction.edit.title }
            XCTAssertEqual(menuOffreModifier, voiceOverOffreModifier,
                           "Deux surfaces d'un même geste ont divergé sur \(kind) : "
                             + "l'œil et l'oreille doivent offrir les mêmes actions.")
        }
    }

    private func identifiant(pour kind: StoryCanvasUIView.CanvasItemKind) -> String {
        switch kind {
        case .text: return "t1"
        case .media: return "m1"
        case .sticker: return "st1"
        case .location: return "loc1"
        case .audio: return "au1"
        }
    }
}
