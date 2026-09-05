import XCTest
import SwiftUI
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

/// Gardes de `BackgroundSoundBadge` (Lot E, Task E1 — « l'annonce du fond :
/// un résolveur, trois surfaces »). B3.3-5 :
///
/// - B3.5 (existence) : `.none` ⇒ rien — pas de placeholder.
/// - B3.4 (provenance) : `.original` ⇒ note PUIS onde, SI ET SEULEMENT SI
///   la piste est ORIGINALE ; `.credit` ⇒ marquee crédit, JAMAIS la
///   note+onde (mentirait sur la provenance), même à métadonnées `nil`
///   (cache froid ⇒ « ♫ — » générique).
///
/// La vue n'est pas instanciable proprement en test (même limite que
/// `StoryHeaderMetaGuardTests`/`StoryTrayWiringGuardTests` : pas de
/// ViewInspector dans ce dépôt) — les trois premières gardes lisent donc la
/// SOURCE, bornées par les `case` du switch plutôt que par une fenêtre de
/// caractères fixe (`MyStoriesSourceCorpus`, déjà comment-strippée). Le
/// texte du crédit, lui, est une fonction PURE (`creditText`) — testée
/// directement, sans détour par la vue.
final class BackgroundSoundBadgeTests: XCTestCase {

    private func source() throws -> String {
        try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Components/BackgroundSoundBadge.swift")
    }

    /// Le bloc de code entre deux marqueurs (le second exclu). `end == nil`
    /// borne jusqu'à la fin du fichier — sûr ici : `.credit` est le DERNIER
    /// cas du switch, rien après lui ne mentionne `StoryHeaderAudioWaveform`.
    private func block(from start: String, to end: String?, in text: String) -> String {
        guard let startRange = text.range(of: start) else { return "" }
        let tail = text[startRange.upperBound...]
        guard let end, let endRange = tail.range(of: end) else { return String(tail) }
        return String(tail[..<endRange.lowerBound])
    }

    // MARK: - B3.5 existence : .none ⇒ EmptyView, jamais de placeholder

    func test_noneCase_rendersEmptyView() throws {
        let text = try source()
        let noneBlock = block(from: "case .none:", to: "case .original:", in: text)
        XCTAssertFalse(noneBlock.isEmpty, "case .none: introuvable dans BackgroundSoundBadge.swift")
        XCTAssertTrue(
            noneBlock.contains("EmptyView()"),
            "B3.5 : sans piste, l'annonce ne rend RIEN — jamais de placeholder."
        )
    }

    // MARK: - B3.4 provenance : .original ⇒ note PUIS onde

    func test_originalCase_rendersMusicNoteThenWaveform() throws {
        let text = try source()
        let originalBlock = block(from: "case .original:", to: "case .credit", in: text)
        XCTAssertFalse(originalBlock.isEmpty, "case .original: introuvable dans BackgroundSoundBadge.swift")
        guard let note = originalBlock.range(of: #"Image(systemName: "music.note")"#),
              let waveform = originalBlock.range(of: "StoryHeaderAudioWaveform(") else {
            XCTFail("Une piste ORIGINALE doit afficher la note musicale ET l'onde animée (♫〰).")
            return
        }
        XCTAssertTrue(
            note.lowerBound < waveform.lowerBound,
            "L'onde vient à la suite de la note — même convention que l'ancien header du reader."
        )
    }

    // MARK: - B3.4 provenance : .credit ne dégénère JAMAIS vers la note+onde

    func test_creditCase_neverRendersWaveform() throws {
        let text = try source()
        let creditBlock = block(from: "case .credit", to: nil, in: text)
        XCTAssertFalse(creditBlock.isEmpty, "case .credit introuvable dans BackgroundSoundBadge.swift")
        XCTAssertFalse(
            creditBlock.contains("StoryHeaderAudioWaveform("),
            "Une piste de BIBLIOTHÈQUE — même sans métadonnées résolues (cache froid) — ne " +
            "doit jamais rendre la note+onde : mentirait sur la provenance (B3.4, « si et " +
            "seulement si »)."
        )
    }

    // MARK: - Texte du crédit — fonction pure, testable sans instancier la vue

    func test_creditText_withFullMetadata_joinsTitleHandleAndDuration() {
        XCTAssertEqual(
            BackgroundSoundBadge.creditText(title: "Nuits d'été", username: "sam", duration: 15),
            "Nuits d'été · @sam · 0:15"
        )
    }

    func test_creditText_withNoMetadata_isGenericCreditNote() {
        XCTAssertEqual(
            BackgroundSoundBadge.creditText(title: nil, username: nil, duration: nil),
            "♫ —",
            "Cache froid (aucune métadonnée résolue) ⇒ crédit générique — jamais un repli " +
            "vers la note+onde (B3.4, « si et seulement si »)."
        )
    }

    func test_creditText_stripsLeadingAtFromUsername() {
        XCTAssertEqual(
            BackgroundSoundBadge.creditText(title: nil, username: "@sam", duration: nil),
            "@sam"
        )
    }

    func test_creditText_withTitleOnly_omitsDanglingSeparators() {
        XCTAssertEqual(
            BackgroundSoundBadge.creditText(title: "Nuits d'été", username: nil, duration: nil),
            "Nuits d'été"
        )
    }

    // MARK: - `announcement(for:)` — comportement RÉEL du résolveur (DoD, constats 1/2/3)
    //
    // Les gardes ci-dessus ne couvrent que le TEXTE SOURCE du switch d'affichage
    // (`case .original:`, `case .credit`) — jamais la logique qui DÉCIDE dans
    // quel cas on tombe. Les tests suivants construisent de VRAIES `StoryEffects`
    // dans les formes que la production émet réellement, et appellent
    // `BackgroundSoundBadge.announcement(for:)` bout en bout.

    /// Forme dominante de production pour un son EMPRUNTÉ : exactement ce que
    /// `BorrowedSoundPost.effects(for:)` construit (`FeedView+Attachments.swift`)
    /// et `StoryComposerViewModel.addBorrowedSound` (SDK) — un `audioPlayerObjects`
    /// avec `isBackground: true` et `soundId` posé, AUCUN `backgroundAudioId` ni
    /// `canvasV3`. Le badge doit créditer, pas se taire.
    @MainActor
    func test_announcement_borrowedSoundPostForm_isCredited() {
        let sound = APISound(
            id: "sound-1",
            title: "Nuits d'été",
            fileUrl: "https://cdn.example/sound.m4a",
            durationMs: 15_000,
            waveform: [0.1, 0.2],
            uploader: APISoundUploader(id: "u1", username: "sam")
        )
        let effects = BorrowedSoundPost.effects(for: sound)
        XCTAssertEqual(
            BackgroundSoundBadge.announcement(for: effects),
            .credit(title: "Nuits d'été", username: "sam", duration: 15),
            "Un son emprunté à la bibliothèque (forme BorrowedSoundPost) doit " +
            "produire le crédit « titre · @pseudo · M:SS » — pas EmptyView."
        )
    }

    /// Piste posée en fond via l'éditeur timeline (enregistrement/import
    /// propre), sans `soundId` : c'est une piste ORIGINALE, pas empruntée.
    func test_announcement_timelineBackgroundEntryWithoutSoundId_isOriginal() {
        var effects = StoryEffects()
        effects.audioPlayerObjects = [
            StoryAudioPlayerObject(postMediaId: "media-1", placement: "background",
                                   volume: 1, waveformSamples: [], isBackground: true)
        ]
        XCTAssertEqual(BackgroundSoundBadge.announcement(for: effects), .original)
    }

    /// Legacy pur (v1, jamais de `audioPlayerObjects`) : `backgroundAudioId`
    /// reste le discriminant bibliothèque — miroir de
    /// `CanvasV3Migration.swift:323-330`/`:577` (`restoreSound`), non-régression.
    func test_announcement_legacyBackgroundAudioIdOnly_isCredited() {
        let effects = StoryEffects(backgroundAudioId: "lib-sound-9")
        XCTAssertEqual(
            BackgroundSoundBadge.announcement(for: effects),
            .credit(title: nil, username: nil, duration: nil)
        )
    }

    /// v3 déjà bridgé (`storyEffects.canvasV3?.sound`) : reste la branche
    /// PRIORITAIRE, avant toute lecture de `audioPlayerObjects`.
    func test_announcement_canvasV3Sound_takesPriorityOverLegacyFields() {
        var effects = StoryEffects()
        effects.canvasV3 = CanvasV3(
            scenes: [SceneV3(id: "s1", objects: [])],
            sound: BackgroundSoundV3(source: .library(soundId: "v3-sound"), volume: 1)
        )
        XCTAssertEqual(
            BackgroundSoundBadge.announcement(for: effects),
            .credit(title: nil, username: nil, duration: nil)
        )
    }

    /// Une note vocale SEULE (`voiceAttachmentId`, sans fond posé) n'est PAS un
    /// audio de fond — même règle produit que la source de vérité SDK
    /// `StoryAudioAvailability.hasBackgroundAudioTrack` (« NONE of which are a
    /// "background audio" in the product sense this icon represents »). Le
    /// badge doit rester silencieux, pas annoncer une piste originale
    /// inexistante.
    func test_announcement_voiceAttachmentOnly_isNoneNotOriginal() {
        let effects = StoryEffects(voiceAttachmentId: "voice-1")
        XCTAssertEqual(
            BackgroundSoundBadge.announcement(for: effects),
            .none,
            "Une note vocale seule ne doit jamais faire annoncer un « audio de " +
            "fond » (étiquette + note+onde) — ce n'en est pas un."
        )
    }

    func test_announcement_nilEffects_isNone() {
        XCTAssertEqual(BackgroundSoundBadge.announcement(for: nil), .none)
    }
}

// MARK: - La teinte servie (#4078 — vue `1h`)

/// **Le crédit du son se lit sur la carte du fil.**
///
/// Mesuré au simulateur le 2026-09-01 (`Meeshy-Reader`, mode CLAIR) : le trait
/// du texte « … · 5:09 » sortait à `(236,235,249)` sur un fond de carte à
/// `(241,239,251)` — **1,03:1**. Invisible. Son voisin de rangée, « Miroir »,
/// sortait à `(101,92,212)` : deux couleurs sur une seule ligne.
///
/// La cause n'était pas une couleur mal choisie mais une couleur **jamais
/// consultée**. `FeedPostCard.backgroundSoundAccentHex` porte depuis toujours
/// la garde AA (`theme.mode.isDark ? accent : indigo600`) — et la branche
/// `.credit` déléguait à `AudioChipMarquee`, dont le blanc EN DUR est juste
/// sur un média (viewer story, réel plein écran) et faux sur une carte thémée.
/// L'accent calculé n'atteignait que l'icône ♪ de la branche `.original`.
///
/// > Une garde calculée, passée, et consultée par UNE branche sur deux ne
/// > garde qu'une branche. Le témoin s'écrit sur celle qui la RATE.
final class BackgroundSoundBadgeServedTintTests: XCTestCase {

    func test_leCredit_sertLAccentDeLHote_commeLIcone() {
        let accent = "4F46E5"
        XCTAssertEqual(
            BackgroundSoundBadge.servedTintHex(
                for: .credit(title: "Nuits blanches", username: "lume", duration: 28),
                accentHex: accent),
            accent,
            "La branche .credit doit servir l'accent de l'hôte, pas un blanc d'atome.")
        XCTAssertEqual(
            BackgroundSoundBadge.servedTintHex(for: .original, accentHex: accent),
            accent,
            "Les deux branches servent LA MÊME attribution — donc la même teinte.")
    }

    func test_sansPiste_aucuneTeinte_carAucuneLigne() {
        XCTAssertNil(BackgroundSoundBadge.servedTintHex(for: .none, accentHex: "4F46E5"))
    }

    /// Le témoin qui nomme le DOMMAGE, pas seulement la plomberie : sur la
    /// carte claire, la teinte servie doit rester lisible. 11 pt semi-gras =
    /// petit texte au sens WCAG 1.4.3 ⇒ plancher 4.5:1.
    func test_surCarteCLAIRE_leCreditAtteintLeContrasteAA() {
        let carteClaire = Color(hex: "F8F7FF")           // theme.backgroundSecondary, clair
        let servi = BackgroundSoundBadge.servedTintHex(
            for: .credit(title: "Nuits blanches", username: "lume", duration: 28),
            accentHex: MeeshyColors.indigo600Hex)        // ce que l'hôte sert en clair
        let ratio = CallBannerContrast.contrastRatio(Color(hex: try! XCTUnwrap(servi)), carteClaire)
        XCTAssertGreaterThanOrEqual(ratio, 4.5,
            "Le crédit du son doit atteindre AA sur la carte claire — mesuré à 1,03:1 avant #4078.")
    }

    /// La DÉCISION ci-dessus ne prouve rien si la vue ne la consulte pas
    /// (leçon : une garde de source prouve qu'une ligne existe, pas qu'elle
    /// s'exécute — ici elle sert de LIEN entre la règle pure et le rendu).
    func test_laBrancheCredit_passeBienLaTeinteAuMarquee() throws {
        let src = try MyStoriesSourceCorpus.text(
            of: "Meeshy/Features/Main/Components/BackgroundSoundBadge.swift")
        let creditBranch = try XCTUnwrap(src.range(of: "case .credit"))
        let queue = String(src[creditBranch.upperBound...])
        XCTAssertTrue(queue.contains("tint:"),
            "La branche .credit doit passer `tint:` à AudioChipMarquee — sans quoi l'atome repeint en blanc.")
    }
}
