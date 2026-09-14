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
        XCTAssertTrue(
            tint.contains(".background(alignment: .top)"),
            "En `.background(alignment: .top)` : la bande se glisse derrière le " +
            "sommet du VStack et remonte jusqu'au bord, sans rien recouvrir."
        )
        XCTAssertFalse(
            tint.contains(".overlay"),
            "La bande se pose en `.background`, jamais en `.overlay` : posée " +
            "par-dessus, elle couvrirait la pilule et le mini-lecteur eux-mêmes."
        )
    }

    /// La bande est montée sur le conteneur UNIQUE des deux barres — et ce
    /// conteneur est monté par les DEUX racines. Un correctif posé dans une
    /// seule racine aurait manqué l'iPad en silence.
    func test_laBandeEstMonteeSurLeConteneurQueLesDeuxRacinesPartagent() throws {
        XCTAssertTrue(
            try code(layerPath).contains("TopChromeBand("),
            "`CallPresentationLayer` — le `VStack` qui empile pilule et " +
            "mini-lecteur — est le seul point de montage possible d'une bande " +
            "partagée par les deux barres."
        )
        for racine in ["Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift",
                       "Meeshy/Features/Main/Views/RootLayers/iPadRootViewLayers.swift"] {
            XCTAssertTrue(
                try code(racine).contains("CallPresentationLayer("),
                "\(racine) doit monter `CallPresentationLayer` — c'est ce qui " +
                "porte la bande jusqu'à cette racine."
            )
        }
    }

    /// La bande ne se peint que si la BARRE est là. `callState.isActive` ne le
    /// dit pas : la pilule se masque aussi en plein écran et pendant le PiP
    /// système — une bande calée dessus serait un ruban indigo posé sur rien.
    func test_laBandeSuitLaVisibiliteDeLaPilule_pasLEtatDeLAppel() {
        XCTAssertTrue(FloatingCallPillView.isShowingPill(
            displayMode: .pip, callState: .connected, isSystemPiPActive: false))
        XCTAssertFalse(FloatingCallPillView.isShowingPill(
            displayMode: .fullScreen, callState: .connected, isSystemPiPActive: false))
        XCTAssertFalse(FloatingCallPillView.isShowingPill(
            displayMode: .pip, callState: .connected, isSystemPiPActive: true))
        XCTAssertFalse(FloatingCallPillView.isShowingPill(
            displayMode: .pip, callState: .idle, isSystemPiPActive: false))
    }

    /// …et la bande d'écoute suit ce que la BARRE AFFICHE, pas ce que le
    /// coordinateur joue : le mini-lecteur se masque dans la conversation qui
    /// joue. Sans cette remontée, un ruban indigo surplomberait cette
    /// conversation, sans barre en dessous.
    func test_leMiniLecteurRemonteCeQuIlAFFICHE_pasCeQueLeCoordinateurJoue() throws {
        let bar = try code(miniBarPath)
        XCTAssertTrue(
            bar.contains("adaptiveOnChange(of: displayedContext)"),
            "La remontée doit observer `displayedContext` (masquage + fenêtre " +
            "de grâce comprises), jamais `coordinator.activeContext`."
        )
        XCTAssertTrue(
            try code(layerPath).contains("onDisplayedContextChange:"),
            "…et l'hôte doit la brancher plutôt que d'observer lui-même un " +
            "coordinateur qui publie `progress` à ~20 Hz."
        )
    }

    /// Aucune couture entre la bande et la barre : les 6 pt de respiration du
    /// mini-lecteur étaient posés APRÈS son `.background`, donc NON teintés —
    /// une ligne claire de 6 pt exactement là où la bande rejoint la barre.
    func test_lesSixPointsDeRespirationSontPeintsParLeBandeau() throws {
        let bar = try code(miniBarPath)
        let padding = try XCTUnwrap(
            bar.range(of: ".padding(.top, 6)"),
            "Le mini-lecteur garde sa respiration de 6 pt."
        )
        let background = try XCTUnwrap(
            bar.range(of: ".background(MiniAudioPlayerBarStyle.background)"),
            "…et son aplat de marque."
        )
        XCTAssertTrue(
            padding.lowerBound < background.lowerBound,
            "La respiration doit être ABSORBÉE par l'aplat : posée après lui, " +
            "elle laisse 6 pt non teintés entre la bande du haut et la barre."
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

    /// Une bande, et une seule, par barre active.
    func test_resolve_neRendUneBandeQueQuandUneBarreEstActive() {
        XCTAssertEqual(TopChromeTint.resolve(callIsActive: true, audio: nil), .call)
        XCTAssertEqual(TopChromeTint.resolve(callIsActive: false, audio: audioContext()), .audio)
        XCTAssertNotNil(
            TopChromeTint.resolve(callIsActive: true, audio: audioContext()),
            "Un appel PENDANT une lecture audio garde une bande : la pilule " +
            "occupe le haut du VStack, donc la bande la prolonge."
        )
    }

    /// La précédence de l'appel sur l'écoute n'est PAS observable dans la teinte
    /// résolue : les deux barres portent les mêmes arrêts. Ce témoin l'ACTE — si
    /// une teinte distincte apparaît un jour, il tombe et oblige à écrire le vrai
    /// témoin de rang (sans quoi un `resolve` inversé resterait vert).
    ///
    /// Ce qui est observable AUJOURD'HUI, et qui est donc le vrai témoin de
    /// l'ordre, c'est la pile : la pilule est posée AVANT le mini-lecteur dans
    /// le `VStack`, donc c'est elle qui touche le haut.
    func test_lesDeuxBarresPartagentLaMemeTeinte_doncLOrdreSeLitDansLaPile() throws {
        XCTAssertEqual(
            TopChromeTint.call, TopChromeTint.audio,
            "Tant que les deux teintes sont identiques, aucune assertion sur la " +
            "VALEUR rendue ne peut prouver la précédence."
        )
        let layer = try code(layerPath)
        let pill = try XCTUnwrap(layer.range(of: "FloatingCallPillView(callManager:"))
        let mini = try XCTUnwrap(layer.range(of: "MiniAudioPlayerBar("))
        XCTAssertTrue(
            pill.lowerBound < mini.lowerBound,
            "L'appel prime sur l'écoute : la pilule est le premier élément du " +
            "VStack, donc la barre que la bande prolonge quand les deux jouent."
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
    func test_laCouleurDeBandeEstLArretHaut_etLEncreTientLeContrasteWCAG() {
        XCTAssertEqual(TopChromeTint.call.bandColor, TopChromeTint.call.top)
        XCTAssertGreaterThanOrEqual(
            CallBannerContrast.contrastRatio(
                TopChromeTint.call.foreground, TopChromeTint.call.bandColor
            ), 4.5,
            "L'encre de la bande doit tenir 4.5:1 (WCAG 1.4.3) contre l'aplat " +
            "qu'elle surmonte. Elle se RÉSOUT par la luminance (`readableInk`), " +
            "jamais posée à la main — une encre posée à l'œil passe ce seuil " +
            "par chance, pas par construction."
        )
        XCTAssertEqual(
            TopChromeTint.audio.foreground, MiniAudioPlayerBarStyle.primaryForeground,
            "…et elle doit retomber sur le blanc que le mini-lecteur prouve déjà."
        )
    }
}
