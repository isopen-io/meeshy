import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// Ce que la revue du lot #18864 a trouvé entre les recettes et les vues des
/// atomes K26 à K55 : la moitié « forcée dans l'app » de la réduction des
/// animations ignorée, des boucles qui survivent à leur condition, une entrée de
/// jauge qui ne joue jamais, une note qui reste repliée après rotation, des ondes
/// de médaillon jamais dessinées, et une pastille qui ne rend ni sa forme ni ses
/// mots. Les lois se lisent sans rendu ; le câblage se lit dans les sources.
@Suite("Atomes du kit : cycle de vie, réduction et formes")
struct KitAtomsLifecycleTests {

    private static let atomViews = ["MeeshyButton.swift", "MeeshyBadge.swift", "MeeshyMeter.swift",
                                    "MeeshyMedallion.swift", "MeeshyNote.swift", "MeeshyKeyHint.swift",
                                    "MeeshyMotionRecipe+Animation.swift"]

    // MARK: - Réduire les animations : les deux moitiés

    @Test("chaque vue d'atome qui lit la réduction du système lit aussi celle que l'app impose")
    func reduceMotion_readsBothHalves() throws {
        for file in Self.atomViews {
            let source = try KitAtomVectors.code(file)
            let system = source.components(separatedBy: "@Environment(\\.accessibilityReduceMotion)").count - 1
            let forced = source.components(separatedBy: "@Environment(\\.meeshyForceReduceMotion)").count - 1
            #expect(system > 0, "\(file) ne lit pas la réduction")
            #expect(system == forced, "\(file) : \(system) lecture(s) système, \(forced) lecture(s) forcée(s)")
            #expect(source.contains("MeeshyMotion.shouldReduce("), "\(file) ne combine pas les deux moitiés")
        }
    }

    // MARK: - Les boucles s'arrêtent avec leur condition

    @Test("une boucle arrêtée ou réduite ne reçoit aucune animation : le changement coupe la répétition")
    func loopAnimation_stopsWithItsCondition() {
        #expect(MeeshyMotion.loopAnimation(.pulse, isRunning: true, reduce: false) != nil)
        #expect(MeeshyMotion.loopAnimation(.pulse, isRunning: false, reduce: false) == nil)
        #expect(MeeshyMotion.loopAnimation(.pulse, isRunning: true, reduce: true) == nil)
        #expect(MeeshyMotion.loopAnimation(.float, isRunning: true, reduce: false) != nil)
    }

    @Test("le point qui bat, le point vivant et la barre sans valeur suivent leur condition après l'apparition")
    func loops_followTheirConditionAfterAppearing() throws {
        let note = try KitAtomVectors.code("MeeshyNote.swift")
        #expect(note.contains("adaptiveOnChange(of: shouldBeat"),
                "une note en direct devenue périmée garderait son point battant")
        let badge = try KitAtomVectors.code("MeeshyBadge.swift")
        #expect(badge.contains("adaptiveOnChange(of: shouldPulse"))
        let meter = try KitAtomVectors.code("MeeshyMeter.swift")
        #expect(meter.contains("adaptiveOnChange(of: shouldSlide"))
        for (file, source) in [("MeeshyNote.swift", note), ("MeeshyBadge.swift", badge), ("MeeshyMeter.swift", meter)] {
            #expect(source.contains("MeeshyMotion.loopAnimation("), "\(file)")
            #expect(!source.contains("MeeshyMotion.animation(.pulse"), "\(file) relance la boucle en l'arrêtant")
        }
    }

    // MARK: - L'entrée de la jauge

    @Test("la jauge part de zéro puis montre sa valeur ; posée d'emblée sous réduction ou sans entrée")
    func meter_shownFraction() {
        typealias R = MeeshyMeterRecipe
        #expect(R.shownFraction(0.5, hasAppeared: false, animatesOnAppear: true, reduce: false) == 0)
        #expect(R.shownFraction(0.5, hasAppeared: true, animatesOnAppear: true, reduce: false) == 0.5)
        #expect(R.shownFraction(0.5, hasAppeared: false, animatesOnAppear: true, reduce: true) == 0.5)
        #expect(R.shownFraction(0.5, hasAppeared: false, animatesOnAppear: false, reduce: false) == 0.5)
        #expect(R.shownFraction(nil, hasAppeared: true, animatesOnAppear: true, reduce: false) == 0)
    }

    @Test("l'animation d'entrée suit la valeur MONTRÉE, pas la fraction qui ne change pas à l'apparition")
    func meter_entryIsKeyedOnTheShownValue() throws {
        let source = try KitAtomVectors.code("MeeshyMeter.swift")
        #expect(source.contains(".animation(entry, value: shown)"))
        #expect(!source.contains(".animation(entry, value: recipe.fillFraction)"))
    }

    // MARK: - La note mesure la place, pas son contenu

    @Test("repliée sous son action, la note occupe toute la largeur : elle se déplie quand la place revient")
    func note_wrappedMeasuresTheAvailableWidth() throws {
        let source = try KitAtomVectors.code("MeeshyNote.swift")
        let wrapped = try #require(source.range(of: "if recipe.actionWrapsBelow"))
        let inline = try #require(source.range(of: "} else {", range: wrapped.upperBound..<source.endIndex))
        #expect(source[wrapped.upperBound..<inline.lowerBound].contains("maxWidth: .infinity"))
    }

    // MARK: - Les ondes du médaillon

    @Test("une onde part du bord à 50 % et s'éteint à 2,4 fois le diamètre ; les ondes se décalent d'une part égale")
    func medallion_waves() {
        typealias R = MeeshyMedallionRecipe
        let first = R.wave(index: 0, count: 2, elapsed: 0)
        #expect(first.scale == 1)
        #expect(first.opacity == R.waveStartOpacity)
        let second = R.wave(index: 1, count: 2, elapsed: 0)
        #expect(abs(second.scale - (1 + (R.waveEndScale - 1) / 2)) < 1e-9)
        #expect(abs(second.opacity - R.waveStartOpacity / 2) < 1e-9)
        let late = R.wave(index: 0, count: 1, elapsed: R.wavePeriodSeconds * 0.999)
        #expect(late.opacity < 0.001)
        #expect(abs(late.scale - R.waveEndScale) < 0.01)
        #expect(R.wave(index: 0, count: 1, elapsed: R.wavePeriodSeconds) == R.wave(index: 0, count: 1, elapsed: 0))
    }

    @Test("le médaillon dessine ses ondes et, sous réduction, l'anneau posé")
    func medallion_drawsItsWaves() throws {
        let source = try KitAtomVectors.code("MeeshyMedallion.swift")
        #expect(source.contains("recipe.waveCount"))
        #expect(source.contains("recipe.showsStillRing"))
    }

    // MARK: - La pastille : sa forme et ses mots

    @Test("bulle : rayon 18, queue 6 au bord de début ; code court : rayon 7 ; multi-ligne : 14")
    func badge_corners() {
        let bubble = Self.badge(shape: .bubble)
        #expect(bubble.hasTail)
        #expect(bubble.cornerRadius == MeeshyBadgeRecipe.bubbleRadius)
        #expect(bubble.tailRadius == MeeshyBadgeRecipe.bubbleTail)
        #expect(Self.badge(isCode: true).cornerRadius == MeeshyBadgeRecipe.codeRadius)
        #expect(Self.badge(isMultiline: true).cornerRadius == MeeshyBadgeRecipe.multilineRadius)
        #expect(Self.badge().tailRadius == nil)
    }

    @Test("le contour de la bulle remplit le coin du bas au bord de début, reflété en arabe")
    func badge_bubbleOutline() {
        let rect = CGRect(x: 0, y: 0, width: 60, height: 22)
        let corner = CGPoint(x: 3, y: 19)
        let mirrored = CGPoint(x: 57, y: 19)
        let ltr = MeeshyBadgeOutline(cornerRadius: 18, tailRadius: 6, isRightToLeft: false).path(in: rect)
        #expect(ltr.contains(corner))
        #expect(!ltr.contains(mirrored))
        let rtl = MeeshyBadgeOutline(cornerRadius: 18, tailRadius: 6, isRightToLeft: true).path(in: rect)
        #expect(rtl.contains(mirrored))
        #expect(!rtl.contains(corner))
        let capsule = MeeshyBadgeOutline(cornerRadius: 11, tailRadius: nil, isRightToLeft: false).path(in: rect)
        #expect(!capsule.contains(corner))
    }

    @Test("le nom dit : le quota se dit « 2 sur 3 », le vrai nombre au-delà du plafond, un glyphe sans nom se tait")
    @MainActor
    func badge_spokenName() throws {
        let fr = try KitAtomVectors.lproj("fr", bundle: .module)
        let locale = Locale(identifier: "fr")
        func spoken(_ content: MeeshyBadgeContent, total: Int? = nil, label: String? = nil) -> String? {
            MeeshyBadgeWords.spokenName(content: content, total: total, label: label, bundle: fr, locale: locale)
        }
        #expect(spoken(.count(2), total: 3) == "2 sur 3")
        #expect(spoken(.count(120), total: 200) == "120 sur 200")
        #expect(spoken(.count(1204)) == "1204")
        #expect(spoken(.count(0)) == nil)
        #expect(spoken(.glyph) == nil)
        #expect(spoken(.glyph, label: "Vérifié") == "Vérifié")
        #expect(spoken(.label("Admin")) == "Admin")
        #expect(spoken(.label("Admin"), label: "Administrateur") == "Administrateur")
        #expect(spoken(.ordinal(3)) == "#3")
    }

    @Test("la pastille dessine le contour de sa recette et donne au code court sa chasse fixe")
    func badge_drawsItsRecipe() throws {
        let source = try KitAtomVectors.code("MeeshyBadge.swift")
        #expect(source.contains("MeeshyBadgeOutline("))
        #expect(source.contains(".monospaced"))
    }

    private static func badge(shape: MeeshyBadgeShape = .capsule,
                              isMultiline: Bool = false,
                              isCode: Bool = false) -> MeeshyBadgeRecipe {
        MeeshyBadgeRecipe.resolve(surface: .tonal, kind: .neutral, hasTint: false, size: .s22, shape: shape,
                                  isMultiline: isMultiline, isCurrent: false, isStale: false,
                                  isInteractive: false, isPressed: false, isCode: isCode)
    }
}
