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

    func test_creditText_withFullMetadata_joinsTitleAndHandle_withoutDuration() {
        XCTAssertEqual(
            BackgroundSoundBadge.creditText(title: "Nuits d'été", username: "sam", releasedAt: nil),
            "Nuits d'été · @sam",
            "#9677 : « ♫ titre · @auteur » — la note est un glyphe, la durée n'est plus dite."
        )
    }

    func test_creditText_withNoMetadata_isTheDashAfterTheNote() {
        XCTAssertEqual(
            BackgroundSoundBadge.creditText(title: nil, username: nil, releasedAt: nil),
            BackgroundSoundBadge.unknownCreditText,
            "Cache froid (aucune métadonnée résolue) ⇒ « ♫ — » — jamais un repli " +
            "vers la note+onde (B3.4, « si et seulement si »)."
        )
    }

    func test_creditText_stripsLeadingAtFromUsername() {
        XCTAssertEqual(
            BackgroundSoundBadge.creditText(title: nil, username: "@sam", releasedAt: nil),
            "@sam"
        )
    }

    func test_creditText_withTitleOnly_omitsDanglingSeparators() {
        XCTAssertEqual(
            BackgroundSoundBadge.creditText(title: "Nuits d'été", username: nil, releasedAt: nil),
            "Nuits d'été"
        )
    }

    /// Sans titre, la date du son tient sa place : « @auteur · date ».
    func test_creditText_withoutTitle_saysTheAuthorThenTheSoundDate() {
        let utc = TimeZone(identifier: "UTC")!
        let fr = Locale(identifier: "fr_FR")
        let released = Date(timeIntervalSince1970: 1_773_316_800)
        XCTAssertEqual(
            BackgroundSoundBadge.creditText(title: nil, username: "sam", releasedAt: released,
                                            locale: fr, timeZone: utc),
            "@sam · " + AudioChipDisplay.creditDate(released, locale: fr, timeZone: utc)
        )
    }

    /// VoiceOver dit la nature de la piste, puis son crédit ; « — » ne se lit pas.
    func test_creditAccessibilityLabel_namesTheTrackThenItsCredit() {
        XCTAssertTrue(BackgroundSoundBadge.creditAccessibilityLabel("Nuits d'été · @sam")
            .hasSuffix(" · Nuits d'été · @sam"))
        XCTAssertFalse(BackgroundSoundBadge.creditAccessibilityLabel(BackgroundSoundBadge.unknownCreditText)
            .contains("—"))
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
            "produire le crédit « titre · @pseudo » — pas EmptyView."
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

// MARK: - Une annonce par surface, une ligne, une source (#9677)

/// **Le son de fond défile « ♫ titre · @auteur » sur UNE ligne, une seule fois
/// par surface, et une story republiée annonce le son qu'elle JOUE.**
///
/// Constats d'origine : le réel « son emprunté seul » disait son crédit DEUX fois
/// (une pastille statique au-dessus de la rangée, le défilant dedans), dans deux
/// formats ; le badge tenait 124 pt fixes ; la carte d'une story republiée sans
/// effets propres se taisait pendant que son embed jouait le son de la source.
@MainActor
final class BackgroundSoundSingleCreditTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: path)
    }

    private func borrowedEffects() -> StoryEffects {
        var effects = StoryEffects()
        effects.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "bg", isBackground: true, name: "Nuits blanches",
                                   soundId: "6a97198de19ad1985081d6a6", soundAuthorUsername: "lume")
        ]
        return effects
    }

    // MARK: Une source pour la story republiée

    func test_aRepublishedStoryWithoutItsOwnEffects_announcesTheSourceSound() {
        var post = FeedPost(author: "A", type: "POST", content: "")
        post.repost = RepostContent(author: "B", content: "", type: "STORY", storyEffects: borrowedEffects())
        XCTAssertEqual(
            BackgroundSoundBadge.announcement(for: post),
            .credit(title: "Nuits blanches", username: "lume", duration: nil),
            "La carte doit annoncer le son que l'embed joue — celui de la source.")
        XCTAssertEqual(
            BackgroundSoundBadge.announcement(for: post),
            BackgroundSoundBadge.announcement(for: StoryItem(feedPost: post).storyEffects),
            "Carte et détail lisent le MÊME repli.")
    }

    func test_aPostWithItsOwnSound_keepsAnnouncingIt() {
        var post = FeedPost(author: "A", type: "POST", content: "")
        post.storyEffects = borrowedEffects()
        XCTAssertEqual(BackgroundSoundBadge.announcement(for: post),
                       .credit(title: "Nuits blanches", username: "lume", duration: nil))
    }

    func test_theCard_resolvesThroughThePostFallback() throws {
        let card = try source("Meeshy/Features/Main/Views/FeedPostCard.swift")
        XCTAssertTrue(card.contains("BackgroundSoundBadge.announcement(for: post)"))
        XCTAssertFalse(card.contains("BackgroundSoundBadge.announcement(for: post.storyEffects)"),
                       "lire post.storyEffects seul tait le son d'une story republiée")
    }

    // MARK: Une seule annonce sur le réel

    func test_theReel_saysItsCreditOnce() throws {
        let host = try source("Meeshy/Features/Main/Views/ReelsPlayerView.swift")
        XCTAssertFalse(host.contains("borrowedSoundBadge("),
                       "la pastille statique doublait le crédit défilant de la rangée auteur")
        let info = try source("Meeshy/Features/Main/Views/ReelPageView+Info.swift")
        XCTAssertEqual(info.components(separatedBy: "BackgroundSoundBadge(").count - 1, 1,
                       "un seul crédit monté sur le réel")
    }

    func test_theReelCredit_wearsTheOverMediaAccent_andThePseudoKeepsItsLine() throws {
        let info = try source("Meeshy/Features/Main/Views/ReelPageView+Info.swift")
        XCTAssertTrue(info.contains("accentHex: BackgroundSoundBadge.overMediaAccentHex"),
                      "le crédit est posé sur le MÉDIA : l'accent du réel n'y est pas garanti lisible")
        XCTAssertFalse(info.contains("accentHex: accentColor"))
        let pseudo = try XCTUnwrap(info.range(of: "Text(\"@\\(username)\")"))
        let suite = String(info[pseudo.upperBound...].prefix(300))
        XCTAssertTrue(suite.contains(".lineLimit(1)"), "le @pseudo ne se replie jamais")
    }

    // MARK: Une ligne, largeur flexible

    func test_theBadge_hasNoFixedWidth_andYieldsToItsNeighbours() throws {
        let badge = try source("Meeshy/Features/Main/Components/BackgroundSoundBadge.swift")
        XCTAssertFalse(badge.contains(".frame(width: 124)"),
                       "une largeur fixe tronque un crédit court et déborde à 320 pt")
        XCTAssertTrue(badge.contains(".layoutPriority(-1)"),
                      "le crédit cède la place au nom et au @pseudo")
        XCTAssertTrue(badge.contains("AudioChipMarquee("), "le crédit défile quand il dépasse")
    }

    /// **Le crédit du réel a sa ligne** (recette 2026-10-08 : ≈ 40 pt à 402,
    /// « ♫ ɪbeth »). Le bloc d'infos du lecteur = l'écran moins les deux
    /// gouttières, le rail d'actions et leur espacement ; la ligne du crédit
    /// n'y partage sa largeur qu'avec le bouton muet. Il doit garder au moins
    /// 60 % du bloc, à 402 comme à 320 pt.
    func test_theReelCredit_getsMostOfTheInfoBlock_at402And320() {
        for screen: CGFloat in [402, 320] {
            let block = screen - 2 * MeeshySpacing.lg
                - FullscreenChromeMetrics.floatingCellWidth - MeeshySpacing.md
            let credit = SoundCreditLine<EmptyView, EmptyView>.creditWidth(
                blockWidth: block, trailingWidth: MeeshyControlSize.tapTarget, spacing: MeeshySpacing.xs)
            XCTAssertGreaterThanOrEqual(credit, block * 0.6,
                "à \(Int(screen)) pt le crédit n'a que \(Int(credit)) pt sur \(Int(block))")
        }
    }

    /// Et la vue tient cette règle : le crédit n'est PAS sur la ligne du
    /// @pseudo et des compteurs — il est sur la sienne, sous elle.
    func test_theCreditLine_putsTheBadgeOnItsOwnRow() throws {
        let src = try source("Meeshy/Features/Main/Components/BackgroundSoundBadge.swift")
        let ligne = try XCTUnwrap(src.range(of: "struct SoundCreditLine"))
        let corps = String(src[ligne.lowerBound...])
        let pseudo = try XCTUnwrap(corps.range(of: "leading\n"))
        let badge = try XCTUnwrap(corps.range(of: "badge.equatable()"))
        XCTAssertTrue(pseudo.lowerBound < badge.lowerBound)
        let entre = String(corps[pseudo.upperBound..<badge.lowerBound])
        XCTAssertTrue(entre.contains("HStack"),
                      "le badge doit ouvrir une SECONDE rangée, pas suivre le @pseudo sur la même")
    }

    /// La carte d'un réel dans le FIL annonce son son, comme la carte de post.
    func test_theReelFeedCard_announcesItsBackgroundSound() throws {
        let card = try source("Meeshy/Features/Main/Views/ReelFeedCard.swift")
        XCTAssertTrue(card.contains("BackgroundSoundBadge("),
                      "recette : un réel à son de bibliothèque s'affichait dans le fil sans « ♫ … »")
        XCTAssertTrue(card.contains("BackgroundSoundBadge.announcement(for:"))
        XCTAssertTrue(card.contains("accentHex: BackgroundSoundBadge.overMediaAccentHex"),
                      "la carte du réel pose son crédit sur le média")
    }
}
