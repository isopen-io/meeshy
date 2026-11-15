import XCTest
import UIKit
import CryptoKit
@testable import MeeshyUI
@testable import MeeshySDK

/// LOT-22 — **les 200 gabarits se dessinent à l'identique, famille par famille.**
///
/// L'empreinte d'un gabarit réunit son nom, sa taille mesurée, les dimensions
/// en pixels de son dessin et le SHA-256 de ses octets RGBA, pour deux jeux de
/// mesures : la vignette de palette et la scène. Elle prouve qu'un déplacement
/// de code entre fichiers ne change aucun pixel.
///
/// Les références sont enregistrées par la CI (runtime qui juge), jamais en
/// local. Le dessin est appelé par `drawer.draw`, pas par `image` : la
/// mémoïsation ne peut pas masquer un écart de câblage.
@MainActor
final class StickerTemplateCharacterizationTests: XCTestCase {

    private let géométrie = CanvasGeometry(renderSize: CGSize(width: 402, height: 715))

    private func emplacements(for famille: StickerTemplateFamily) -> [String: String] {
        switch famille {
        case .location:
            return StickerSlotFiller.placeSlots(
                for: SharedPlace(latitude: 48.86, longitude: 2.35,
                                 name: "Le Marais", address: "Paris"))
        case .time:
            return [StickerSlotFiller.timeSlot: "14:32",
                    StickerSlotFiller.hourSlot: "14",
                    StickerSlotFiller.minuteSlot: "32",
                    StickerSlotFiller.dateSlot: "1 septembre 2026"]
        case .love:
            return [StickerSlotFiller.dateSlot: "1 septembre 2026"]
        case .text:
            return [StickerSlotFiller.textSlot: "Bon anniversaire"]
        case .weather, .joy, .surprise, .mood, .greeting, .reaction, .party,
             .availability, .nature, .cheer, .answer, .food, .sport,
             .travel, .work, .music:
            return [:]
        }
    }

    private func sceneMetrics(for famille: StickerTemplateFamily) -> StickerTemplateMetrics {
        famille == .location
            ? StickerTemplateMetrics.location(geometry: géométrie, scale: 1)
            : StickerTemplateMetrics.sticker(geometry: géométrie, baseSize: 140, scale: 1)
    }

    private func hex(_ digest: SHA256.Digest, bytes: Int) -> String {
        digest.prefix(bytes).map { String(format: "%02x", $0) }.joined()
    }

    private func hex(of text: String, bytes: Int) -> String {
        hex(SHA256.hash(data: Data(text.utf8)), bytes: bytes)
    }

    private func format(_ value: CGFloat) -> String {
        String(format: "%.3f", Double(value))
    }

    private func pixelSignature(of image: UIImage?) -> String {
        guard let cg = image?.cgImage else { return "none" }
        let largeur = cg.width, hauteur = cg.height
        guard largeur > 0, hauteur > 0,
              let espace = CGColorSpace(name: CGColorSpace.sRGB) else { return "empty" }
        var octets = [UInt8](repeating: 0, count: 4 * largeur * hauteur)
        let dessiné = octets.withUnsafeMutableBytes { tampon -> Bool in
            guard let contexte = CGContext(
                data: tampon.baseAddress, width: largeur, height: hauteur,
                bitsPerComponent: 8, bytesPerRow: 4 * largeur, space: espace,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return false }
            contexte.draw(cg, in: CGRect(x: 0, y: 0, width: largeur, height: hauteur))
            return true
        }
        guard dessiné else { return "nocontext" }
        return "\(largeur)x\(hauteur)/\(hex(SHA256.hash(data: Data(octets)), bytes: 8))"
    }

    private func rendering(of dessinateur: StickerTemplateDrawer,
                           slots: [String: String],
                           metrics: StickerTemplateMetrics,
                           screenScale: CGFloat) -> String {
        let mesurée = dessinateur.measure(slots, metrics)
        let image = dessinateur.draw(slots, metrics, screenScale).0
        return "\(format(mesurée.width))x\(format(mesurée.height))/\(pixelSignature(of: image))"
    }

    private func fingerprint(of dessinateur: StickerTemplateDrawer,
                             famille: StickerTemplateFamily) -> String {
        let slots = emplacements(for: famille)
        let vignette = rendering(of: dessinateur, slots: slots,
                                 metrics: StickerTemplateMetrics.preview(side: 104),
                                 screenScale: 2)
        let scène = rendering(of: dessinateur, slots: slots,
                              metrics: sceneMetrics(for: famille), screenScale: 1)
        return "name=\(hex(of: dessinateur.name(), bytes: 4))|prev=\(vignette)|scene=\(scène)"
    }

    private func assertFamily(_ famille: StickerTemplateFamily,
                              file: StaticString = #filePath, line: UInt = #line) {
        let gabarits = StickerTemplateCatalog.templates(family: famille)
        XCTAssertFalse(gabarits.isEmpty, "\(famille) — aucun gabarit au catalogue", file: file, line: line)
        let écarts = gabarits.compactMap { gabarit -> String? in
            guard let dessinateur = StickerTemplateRenderer.drawer(for: gabarit.id) else {
                return "\"\(gabarit.id)\": \"sans dessinateur\","
            }
            let obtenue = fingerprint(of: dessinateur, famille: famille)
            let attendue = StickerTemplateCharacterizationGolden.fingerprints[gabarit.id]
            return attendue == obtenue ? nil : "\"\(gabarit.id)\": \"\(obtenue)\","
        }
        guard !écarts.isEmpty else { return }
        XCTFail("\(famille) — empreintes à enregistrer ou écart :\n" + écarts.joined(separator: "\n"),
                file: file, line: line)
    }

    func test_location_rendersExactlyAsCharacterized() { assertFamily(.location) }
    func test_time_rendersExactlyAsCharacterized() { assertFamily(.time) }
    func test_love_rendersExactlyAsCharacterized() { assertFamily(.love) }
    func test_weather_rendersExactlyAsCharacterized() { assertFamily(.weather) }
    func test_text_rendersExactlyAsCharacterized() { assertFamily(.text) }
    func test_joy_rendersExactlyAsCharacterized() { assertFamily(.joy) }
    func test_surprise_rendersExactlyAsCharacterized() { assertFamily(.surprise) }
    func test_mood_rendersExactlyAsCharacterized() { assertFamily(.mood) }
    func test_greeting_rendersExactlyAsCharacterized() { assertFamily(.greeting) }
    func test_reaction_rendersExactlyAsCharacterized() { assertFamily(.reaction) }
    func test_party_rendersExactlyAsCharacterized() { assertFamily(.party) }
    func test_availability_rendersExactlyAsCharacterized() { assertFamily(.availability) }
    func test_nature_rendersExactlyAsCharacterized() { assertFamily(.nature) }
    func test_cheer_rendersExactlyAsCharacterized() { assertFamily(.cheer) }
    func test_answer_rendersExactlyAsCharacterized() { assertFamily(.answer) }
    func test_food_rendersExactlyAsCharacterized() { assertFamily(.food) }
    func test_sport_rendersExactlyAsCharacterized() { assertFamily(.sport) }
    func test_travel_rendersExactlyAsCharacterized() { assertFamily(.travel) }
    func test_work_rendersExactlyAsCharacterized() { assertFamily(.work) }
    func test_music_rendersExactlyAsCharacterized() { assertFamily(.music) }
}
