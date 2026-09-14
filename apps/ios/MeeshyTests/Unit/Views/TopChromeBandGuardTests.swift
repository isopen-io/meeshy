import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// La bande status-bar du chrome haut a UN SEUL propriétaire (#6579).
///
/// Demande porteur 2026-09-14 : « colorie tout le haut de l'application de la
/// couleur de la barre qui affiche le lecteur ou l'appel en cours, de sorte que
/// tout le haut jusqu'à la barre système soit de la même couleur ».
///
/// Le défaut mesuré n'est PAS « la barre n'est pas indigo » — elle l'est déjà,
/// dans les deux cas. Il est que la peinture de la bande était une propriété de
/// CHAQUE barre : `FloatingCallPillView` la posait (`.ignoresSafeArea(.container,
/// edges: .top)` sur son dégradé), `MiniAudioPlayerBar` ne la posait pas du tout.
/// Quand aucun appel n'est actif, le mini-lecteur est le PREMIER élément du
/// `VStack` de compression : la bande restait peinte par `RootThemedBackground`.
///
/// Un témoin qui interrogerait la COULEUR de la barre serait donc vert
/// aujourd'hui, pour un motif étranger au défaut. Celui-ci interroge la
/// PROPRIÉTÉ : un site unique peint la bande, aucune barre ne la peint plus.
@MainActor
final class TopChromeBandGuardTests: XCTestCase {

    // MARK: - Lecture de source

    private func iosRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
    }

    private func source(_ relative: String) throws -> String {
        try String(contentsOf: iosRoot().appendingPathComponent(relative), encoding: .utf8)
    }

    /// Les lignes de CODE, commentaires retirés : la documentation de ces
    /// fichiers CITE `ignoresSafeArea` pour expliquer qui possède la bande —
    /// une garde qui lirait la source brute se validerait sur sa propre prose.
    private func code(_ relative: String) throws -> String {
        try source(relative)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                return trimmed.hasPrefix("//") ? "" : String(line)
            }
            .joined(separator: "\n")
    }

    private func count(_ needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    private let pillPath = "Meeshy/Features/Main/Views/FloatingCallPillView.swift"
    private let miniBarPath = "Meeshy/Features/Main/Components/MiniAudioPlayerBar.swift"
    private let tintPath = "Meeshy/Features/Main/Components/TopChromeTint.swift"
    private let layerPath = "Meeshy/Features/Main/Views/RootLayers/CallPresentationLayer.swift"
    private let rootViewPath = "Meeshy/Features/Main/Views/RootView.swift"

    // MARK: - Le témoin discriminant

    /// LE témoin de ce lot. Rouge aujourd'hui parce que la pilule d'appel peint
    /// sa propre bande et que rien ne la peint pour le mini-lecteur.
    func test_laBandeAUnSeulProprietaire() throws {
        XCTAssertEqual(
            count("ignoresSafeArea", in: try code(pillPath)), 0,
            "`FloatingCallPillView` ne peut plus posséder la bande status-bar : " +
            "une barre qui peint son propre débord rend la peinture PROPRIÉTÉ " +
            "de chaque barre, donc présente chez l'une et absente chez l'autre. " +
            "C'est exactement le défaut que le porteur photographie."
        )
        XCTAssertEqual(
            count("ignoresSafeArea", in: try code(miniBarPath)), 0,
            "`MiniAudioPlayerBar` ne doit pas non plus la peindre : la symétrie " +
            "par duplication laisserait DEUX propriétaires, donc deux dérives."
        )

        let tint = try code(tintPath)
        XCTAssertEqual(
            count("ignoresSafeArea", in: tint), 1,
            "`TopChromeTint.swift` doit déclarer EXACTEMENT une bande — le site " +
            "unique qui peint le haut, quelle que soit la barre active."
        )
        XCTAssertTrue(
            tint.contains("DeviceLayout.safeAreaTop"),
            "La hauteur de la bande vient de la FENÊTRE : `GeometryProxy." +
            "safeAreaInsets` rend 0 dans un sous-arbre qui ignore la safe area."
        )
        XCTAssertTrue(
            tint.contains(".allowsHitTesting(false)"),
            "La bande ne doit intercepter AUCUN geste — c'est le défaut retiré " +
            "la veille avec `ThreadChromeFade` (#6537)."
        )
    }

    /// Corollaire du même défaut (#6537, commit `0d21b8feb3`) : une bande qui
    /// déborde la safe area ou accepte un geste EST ce voile sous un autre nom.
    func test_laBandeEstBorneeALaSafeAreaEtNeGagneAucunGeste() throws {
        let tint = try code(tintPath)
        XCTAssertTrue(
            tint.contains("height: DeviceLayout.safeAreaTop"),
            "La bande se borne à la hauteur de l'encart haut, jamais à une " +
            "hauteur libre : au-delà, elle recouvre le contenu de l'app."
        )
        XCTAssertFalse(
            tint.contains("maxHeight: .infinity"),
            "Une bande extensible reprendrait toute la fenêtre."
        )
        XCTAssertFalse(
            tint.contains(".contentShape(") || tint.contains("Gesture") || tint.contains("onTapGesture"),
            "La bande peint et RIEN d'autre : aucun geste, aucune forme de " +
            "contact — sinon elle intercepte les appuis du chrome qu'elle habille."
        )
        XCTAssertFalse(
            tint.contains(".overlay"),
            "La bande se pose en `.background`, jamais en `.overlay` : posée " +
            "par-dessus, elle couvrirait la pilule et le mini-lecteur eux-mêmes."
        )
    }

    /// La bande est montée sur le conteneur UNIQUE des deux barres, donc par
    /// les DEUX racines (iPhone et iPad) sans duplication.
    func test_laBandeEstMonteeSurLeConteneurDesDeuxBarres() throws {
        let layer = try code(layerPath)
        XCTAssertTrue(
            layer.contains("TopChromeBand("),
            "`CallPresentationLayer` — le `VStack` qui empile pilule et " +
            "mini-lecteur, monté par RootViewLayers ET iPadRootViewLayers — " +
            "est le seul point de montage possible d'une bande partagée."
        )
        XCTAssertTrue(
            layer.contains(".background(alignment: .top)"),
            "En `.background(alignment: .top)` : la bande se glisse derrière le " +
            "sommet du VStack et remonte jusqu'au bord, sans rien recouvrir."
        )
    }

    /// L'extraction est la CONDITION du correctif, pas un à-côté : `RootView
    /// .swift` est hors budget (plafond dur 1200), donc y ajouter une ligne est
    /// interdit.
    func test_leChromeHautVitHorsDeRootView_quiEstHorsBudget() throws {
        let rootView = try source(rootViewPath)
        XCTAssertFalse(
            rootView.contains("struct CallPresentationLayer"),
            "`CallPresentationLayer` doit vivre dans son propre fichier : " +
            "`RootView.swift` dépasse le plafond dur de 1200 lignes."
        )
        XCTAssertTrue(
            try code(layerPath).contains("struct CallPresentationLayer"),
            "…et ce fichier est `RootLayers/CallPresentationLayer.swift`."
        )
    }

    // MARK: - La résolution de teinte

    private func audioContext() -> ActiveAudioContext {
        ActiveAudioContext(
            attachmentId: "att-1",
            messageId: "msg-1",
            conversationId: "conv-1",
            conversationName: "Équipe",
            conversationArtworkURL: nil,
            senderName: "Alice",
            senderAvatarURL: nil,
            durationMs: 12_000
        )
    }

    /// Aucune barre active ⇒ AUCUNE bande. Sans ce cas, la bande teinterait le
    /// haut de l'app en permanence.
    func test_resolve_sansAucuneBarreActive_neRendAucuneBande() {
        XCTAssertNil(TopChromeTint.resolve(callIsActive: false, audio: nil))
    }

    /// L'appel PRIME sur l'écoute — l'ordre que le `VStack` tient déjà
    /// visuellement (la pilule au-dessus du mini-lecteur).
    func test_resolve_lAppelPrimeSurLEcoute() {
        XCTAssertEqual(TopChromeTint.resolve(callIsActive: true, audio: nil), .call)
        XCTAssertEqual(TopChromeTint.resolve(callIsActive: false, audio: audioContext()), .audio)
        XCTAssertEqual(
            TopChromeTint.resolve(callIsActive: true, audio: audioContext()), .call,
            "Un appel actif PENDANT une lecture audio garde la teinte d'appel : " +
            "la pilule occupe le haut du VStack, donc la bande la prolonge."
        )
    }

    /// La bande porte les arrêts CALIBRÉS WCAG de la bannière d'appel, pour les
    /// deux barres. Un accent de conversation (palette de 20 couleurs mélangée)
    /// n'a aucune suite de contraste : le livrer serait une régression d'accès.
    func test_laBandePorteLesArretsCalibresDeLaBanniere() {
        XCTAssertEqual(TopChromeTint.call.top, CallBannerContrast.bannerTop)
        XCTAssertEqual(TopChromeTint.call.bottom, CallBannerContrast.bannerBottom)
        XCTAssertEqual(
            TopChromeTint.audio.top, MiniAudioPlayerBarStyle.background,
            "La bande d'écoute doit être EXACTEMENT l'aplat du mini-lecteur : " +
            "toute autre valeur dessine une couture au-dessus de la barre."
        )
        XCTAssertEqual(TopChromeTint.audio.top, CallBannerContrast.bannerTop)
        XCTAssertEqual(TopChromeTint.audio.bottom, CallBannerContrast.bannerBottom)
    }

    /// La couleur de la BANDE est l'arrêt HAUT : c'est lui qui touche la barre
    /// système, et c'est lui qui a été calibré contre le blanc (6.3:1).
    func test_laCouleurDeBandeEstLArretHaut_etLEncreVientDeLaLuminance() {
        XCTAssertEqual(TopChromeTint.call.bandColor, TopChromeTint.call.top)
        XCTAssertEqual(
            TopChromeTint.call.foreground, TopChromeTint.call.bandColor.readableInk,
            "L'encre se RÉSOUT par la luminance (`readableInk`, le point unique " +
            "du dépôt), jamais posée à la main."
        )
        XCTAssertEqual(
            TopChromeTint.audio.foreground, MiniAudioPlayerBarStyle.primaryForeground,
            "…et elle doit retomber sur le blanc que le mini-lecteur prouve déjà."
        )
    }
}
