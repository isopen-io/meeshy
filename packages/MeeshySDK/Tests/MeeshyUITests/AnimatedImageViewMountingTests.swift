import XCTest
import ImageIO
import UniformTypeIdentifiers
import SwiftUI
import UIKit
@testable import MeeshyUI

/// **La vue joue-t-elle VRAIMENT ?** (#4925)
///
/// Le décodeur avait ses témoins, la vue avait les siens, et pourtant aucun
/// sticker n'animait : personne ne montait la vue. Ce fichier éprouve le
/// maillon que l'absence de consommateur avait laissé invisible — non pas
/// « `AnimatedImageView` existe » mais « montée, elle porte les N images à
/// l'`UIImageView` qui sait les jouer ».
///
/// Une garde de SOURCE dirait que la ligne existe ; elle ne dirait pas qu'elle
/// produit une vue animée. C'est la différence entre lire le code et l'exécuter.
final class AnimatedImageViewMountingTests: XCTestCase {

    private func pixel(_ gray: CGFloat) -> CGImage {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8))
        return renderer.image { context in
            UIColor(white: gray, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }.cgImage!
    }

    private func decodedAnimation() throws -> AnimatedImageDecoder.Decoded {
        let data = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(
            data as CFMutableData, UTType.gif.identifier as CFString, 3, nil
        ))
        for index in 0..<3 {
            CGImageDestinationAddImage(destination, pixel(CGFloat(index) / 2), [
                kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFUnclampedDelayTime: 0.1]
            ] as CFDictionary)
        }
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return try XCTUnwrap(AnimatedImageDecoder.decode(data as Data))
    }

    /// Descend la hiérarchie plutôt que de supposer une profondeur :
    /// `UIHostingController` en change d'une version d'iOS à l'autre, et une
    /// garde qui compte les niveaux tomberait sur la suivante.
    private func firstImageView(in view: UIView) -> UIImageView? {
        if let imageView = view as? UIImageView { return imageView }
        for subview in view.subviews {
            if let found = firstImageView(in: subview) { return found }
        }
        return nil
    }

    /// `sending` — et ce n'est pas une formalité : une vue SwiftUI n'est pas
    /// `Sendable`, et la passer à `UIHostingController` (isolé au MainActor)
    /// depuis une méthode générique traverse une frontière d'isolation que
    /// Swift 6 refuse. Le mot-clé dit ce qui est vrai ici — l'appelant cède sa
    /// vue et ne la garde pas.
    @MainActor
    private func mount<V: View>(_ rootView: sending V) throws -> UIImageView {
        // **Une FENÊTRE, pas seulement un `layoutIfNeeded`.** SwiftUI
        // n'instancie le `UIViewRepresentable` d'un `UIHostingController` que
        // lorsque celui-ci appartient à une hiérarchie affichée : hors fenêtre,
        // la vue existe en description et jamais en `UIView`. Le premier jet de
        // ce témoin échouait sur « aucune UIImageView montée » — un rouge juste,
        // qui décrivait l'instrument plutôt que le produit.
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 120, height: 120))
        let controller = UIHostingController(rootView: rootView)
        window.rootViewController = controller
        window.isHidden = false
        window.layoutIfNeeded()
        retainedWindows.append(window)
        return try XCTUnwrap(firstImageView(in: window),
                             "aucune UIImageView montée — la vue ne joue rien")
    }

    /// Les fenêtres montées vivent jusqu'à la fin du test : une fenêtre libérée
    /// emporte sa hiérarchie, et l'`UIImageView` rendue deviendrait un objet
    /// orphelin dont les assertions ne diraient plus rien du produit.
    ///
    /// Aucun `tearDown` ne les range : XCTest crée une INSTANCE par test, donc
    /// le tableau meurt avec elle. Un `override func tearDown()` annoté
    /// `@MainActor` ne compile d'ailleurs pas — la méthode héritée est
    /// `nonisolated`, et une isolation ajoutée à un override est refusée.
    private var retainedWindows: [UIWindow] = []

    /// **Le témoin central du lot.** `Image(uiImage:)` afficherait la première
    /// image sans que rien ne rougisse ; seule une `UIImageView` porteuse de
    /// `.images` anime.
    @MainActor
    func test_montee_lUIImageViewPorteLesImagesDuCycle() throws {
        let decoded = try decodedAnimation()
        let imageView = try mount(AnimatedImageView(decoded: decoded))

        let images = try XCTUnwrap(imageView.image?.images,
                                   "l'image montée doit porter le TABLEAU des images, pas une seule")
        XCTAssertGreaterThan(images.count, 1)
        XCTAssertGreaterThan(try XCTUnwrap(imageView.image?.duration), 0)
    }

    /// **Le mouvement réduit fige, il ne masque pas** : le lecteur garde le
    /// contenu, il perd le mouvement. Une image sans `.images` est exactement
    /// ce qu'un GIF non joué montre — sa première image.
    ///
    /// La préférence éprouvée est celle de MEESHY (#4288), pas
    /// `accessibilityReduceMotion` : cette dernière n'est pas inscriptible
    /// (`KeyPath`, jamais `WritableKeyPath`), donc aucun test ne peut la
    /// poser. La vue lit `systemReduce || userForced` — le témoin passe par la
    /// branche que le produit expose à l'utilisateur, ce qui est aussi la plus
    /// utile à garder.
    @MainActor
    func test_mouvementReduit_figeSurLaPremiereImage() throws {
        let decoded = try decodedAnimation()
        let imageView = try mount(
            AnimatedImageView(decoded: decoded)
                .environment(\.meeshyForceReduceMotion, true)
        )

        XCTAssertNotNil(imageView.image, "figer ne veut pas dire retirer l'image")
        XCTAssertNil(imageView.image?.images,
                     "sous mouvement réduit, l'image ne doit porter aucun cycle")
    }
}
