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
///
/// **CE FICHIER NE PROUVE PAS QUE LA BANDE SE PEINT — il empêche seulement un
/// lot futur de reposer un motif interdit.** Le contrôleur du lot l'a établi en
/// mettant la bande à `.opacity(0)` : elle ne rendait plus un pixel, et treize
/// témoins d'ici restaient VERTS, les chaînes cherchées étant toujours écrites.
/// La preuve que la feature MARCHE est ailleurs, et elle lit les pixels :
/// `TopChromeBandRenderTests`. Les deux fichiers répondent à deux questions
/// distinctes, et aucun ne remplace l'autre.
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
    /// **Deux formes, deux sens opposés — ne jamais les confondre.**
    /// `.ignoresSafeArea(…)` RÉCLAME l'encart ; `ignoresSafeAreaEdges: []`
    /// y RENONCE explicitement. La seconde est requise sur les deux barres,
    /// parce que le défaut de `.background(_:)` est `.all` : sans elle, chaque
    /// barre reprend la propriété de la bande en silence (#6579, mesuré au pixel
    /// — `TopChromeBandRenderTests` restait vert avec la bande neutralisée).
    func test_laBandeAUnSeulProprietaire() throws {
        for (chemin, nom) in [(pillPath, "FloatingCallPillView"), (miniBarPath, "MiniAudioPlayerBar")] {
            let source = try code(chemin)
            XCTAssertEqual(
                count("ignoresSafeArea(", in: source), 0,
                "`\(nom)` ne peut pas posséder la bande status-bar : une barre qui " +
                "peint son propre débord rend la peinture PROPRIÉTÉ de chaque barre, " +
                "donc présente chez l'une et absente chez l'autre. C'est exactement " +
                "le défaut que le porteur photographie."
            )
            XCTAssertEqual(
                count("ignoresSafeAreaEdges: []", in: source), 1,
                "…et `\(nom)` doit y RENONCER explicitement sur son fond : le défaut " +
                "de `.background(_:)` est `.all`, donc une barre adjacente à l'encart " +
                "y étend sa couleur sans que rien ne le déclare. Le laisser implicite " +
                "rouvre le défaut par omission, et sans qu'aucune ligne ne change."
            )
        }

        let tint = try code(tintPath)
        XCTAssertEqual(
            count(".overlay(alignment: .top)", in: tint), 1,
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
    }

    /// La bande se pose en `.overlay`, et le geste qui l'empêche de couvrir la
    /// barre est l'OFFSET — pas le choix de la couche.
    ///
    /// Mesuré au simulateur le 2026-09-14 (Meeshy-FullscreenCluster, appel
    /// forcé) : un `.background` ne rend RIEN, pas même un aplat rouge opaque
    /// de 200 pt. Le `content` que le modifier enveloppe contient
    /// `RootThemedBackground`, qui porte `.ignoresSafeArea()` et peint donc la
    /// fenêtre entière — tout ce qui vit DERRIÈRE lui est masqué.
    func test_laBandeSePoseEnOverlay_etNeCouvreLaBarreQueGraceALOffset() throws {
        let tint = try code(tintPath)
        XCTAssertTrue(
            tint.contains(".overlay(alignment: .top)"),
            "En `.background`, la bande passe SOUS `RootThemedBackground` " +
            "(qui ignore la safe area) et ne rend pas un pixel — mesuré."
        )
        XCTAssertTrue(
            tint.contains(".offset(y: -DeviceLayout.safeAreaTop)"),
            "…et c'est l'offset d'exactement sa propre hauteur qui la remonte " +
            "dans la bande système : sans lui, l'overlay couvrirait les " +
            "premiers points de la pilule et du mini-lecteur qu'il prolonge."
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

    // Les deux témoins de SOURCE qui vivaient ici — « la barre observe bien
    // `displayedContext` », « les 6 pt de respiration sont posés AVANT le
    // `.background` » — ont été RETIRÉS le 2026-09-15 (#6579), et rien n'a été
    // perdu : ils lisaient des chaînes que la mutation du contrôleur laissait
    // intactes. Ce qu'ils visaient se mesure maintenant, dans
    // `TopChromeBandRenderTests` :
    //   • la remontée, par l'observation de ce que la barre REMET à son hôte
    //     (`test_laBarreRemonteSonContexte_…`, `…_dansLaConversationQuiJoue`,
    //     `…_pendantLaFenetreDeGrace`) ;
    //   • la couture des 6 pt, par la lecture des pixels de part et d'autre du
    //     joint avec une barre RÉELLEMENT rendue
    //     (`test_laCoutureEstContinue_avecLaBarreDEcouteREELLEMENTRendue` — ce
    //     pixel-là est précisément dans la respiration).

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

    /// L'unique couleur du chrome haut tient le contraste WCAG du texte courant
    /// contre le blanc — le seul ratio qui reste une PROPRIÉTÉ une fois la bande
    /// et les DEUX barres ramenées à un producteur unique.
    ///
    /// Les deux témoins qui vivaient ici comparaient `TopChromeTint.call.top` à
    /// `CallBannerContrast.bannerTop` et `TopChromeTint.audio.top` à
    /// `MiniAudioPlayerBarStyle.background` : quatre constantes écrites côte à
    /// côte dans le même lot, donc une égalité qui ne pouvait pas tomber. Elles
    /// n'ont plus d'objet — `MiniAudioPlayerBarStyle.background` LIT
    /// `TopChromeTint.audio.bandColor` (#6579), et la continuité qu'elles
    /// prétendaient garder se MESURE désormais en pixels de part et d'autre du
    /// joint (`TopChromeBandRenderTests.test_laCoutureEstContinue_…`).
    func test_laCouleurDuChromeHaut_tientLeContrasteWCAGContreSonEncre() {
        XCTAssertGreaterThanOrEqual(
            CallBannerContrast.contrastRatio(.white, TopChromeTint.call.bandColor), 4.5,
            "L'encre blanche des deux barres doit tenir 4.5:1 (WCAG 1.4.3) contre " +
            "l'aplat qu'elles portent. L'aplat retenu est l'arrêt le MOINS " +
            "contrasté des deux que portait le dégradé — c'est donc lui, et lui " +
            "seul, qu'il faut mesurer."
        )
    }
}
