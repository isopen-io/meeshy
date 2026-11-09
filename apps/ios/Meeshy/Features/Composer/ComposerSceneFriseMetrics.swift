import SwiftUI
import MeeshySDK
import MeeshyUI

nonisolated enum ComposerSceneFriseMetrics {
    struct Window: Equatable {
        let start: Float
        let end: Float
    }

    /// Ce que le doigt tient : la barre entière, ou l'une de ses poignées.
    enum Grip: Equatable { case move, start, end }

    /// La cible d'une poignée, en largeur.
    static let handleHit: CGFloat = 24

    /// Le pas d'un déplacement VoiceOver (« Plus tôt » / « Plus tard »).
    static let accessibilityStep: Float = 0.5

    /// **La fenêtre après un glissement de `delta` secondes.** Déplacer garde
    /// la durée et reste dans la slide ; une poignée ne franchit jamais
    /// l'autre (`ClipWindowResolver.minimumDuration` les sépare) ni les bords.
    static func dragged(_ fenetre: Window, grip: Grip, by delta: Float, duration: Float) -> Window {
        let total = max(duration, 0)
        let pas = delta.isFinite ? delta : 0
        let plancher = ClipWindowResolver.minimumDuration
        switch grip {
        case .move:
            let longueur = fenetre.end - fenetre.start
            let debut = max(0, min(fenetre.start + pas, total - longueur))
            return Window(start: debut, end: debut + longueur)
        case .start:
            return Window(start: max(0, min(fenetre.start + pas, fenetre.end - plancher)), end: fenetre.end)
        case .end:
            return Window(start: fenetre.start, end: min(total, max(fenetre.end + pas, fenetre.start + plancher)))
        }
    }

    /// Un glissé aimanté : la fenêtre, et si le bord qui bouge est accroché.
    struct Drag: Equatable {
        let window: Window
        /// L'instant où le bord qui bouge s'est accroché ; `nil`, libre.
        let snappedTime: Float?
        var isSnapped: Bool { snappedTime != nil }
    }

    /// **Le glissé AIMANTÉ** (#14210, miroir de `FriseBarDrag.resolve`
    /// Android) : le bord qui bouge — début, fin, ou le plus proche des deux
    /// pour la barre entière — s'accroche au candidat le plus proche dans la
    /// tolérance, puis la fenêtre est bornée comme un glissé libre.
    static func dragged(_ fenetre: Window, grip: Grip, by delta: Float, duration: Float,
                        snapping candidats: [SnapCandidate], tolerance: Float) -> Drag {
        let pas = delta.isFinite ? delta : 0
        let aimant = SnapEngine(toleranceSeconds: tolerance)
        let corrige: Float?
        let parLaFin: Bool
        switch grip {
        case .start:
            corrige = ecart(aimant.snap(rawTime: fenetre.start + pas, candidates: candidats), depuis: fenetre.start + pas)
            parLaFin = false
        case .end:
            corrige = ecart(aimant.snap(rawTime: fenetre.end + pas, candidates: candidats), depuis: fenetre.end + pas)
            parLaFin = true
        case .move:
            let tete = ecart(aimant.snap(rawTime: fenetre.start + pas, candidates: candidats), depuis: fenetre.start + pas)
            let queue = ecart(aimant.snap(rawTime: fenetre.end + pas, candidates: candidats), depuis: fenetre.end + pas)
            corrige = [tete, queue].compactMap { $0 }.min { abs($0) < abs($1) }
            parLaFin = corrige != nil && corrige != tete
        }
        let resultat = dragged(fenetre, grip: grip, by: pas + (corrige ?? 0), duration: duration)
        return Drag(window: resultat,
                    snappedTime: corrige == nil ? nil : (parLaFin ? resultat.end : resultat.start))
    }

    /// **« aimanté · 9,0 s »** : l'instant de l'accroche, au dixième, dans la
    /// langue de l'interface.
    static func snapLabel(_ secondes: Float, locale: Locale = .current) -> String {
        let valeur = Double(secondes.isFinite ? secondes : 0)
            .formatted(.number.precision(.fractionLength(1)).locale(locale))
        return ComposerTimeCopy.snapped("\(valeur) s")
    }

    private static func ecart(_ resultat: SnapResult, depuis brut: Float) -> Float? {
        resultat.matched == nil ? nil : resultat.snappedTime - brut
    }

    /// Les points d'accroche d'une piste : la tête, les bords de la slide, les
    /// bords des AUTRES pistes — jamais les siens.
    static func snapCandidates(tracks: [SceneFriseTrack], excluding id: String,
                               playhead: Float, duration: Float) -> [SnapCandidate] {
        let voisins = tracks.filter { $0.id != id }.flatMap {
            [SnapCandidate(kind: .clipStart, time: $0.start), SnapCandidate(kind: .clipEnd, time: $0.end)]
        }
        return [SnapCandidate(kind: .slideStart, time: 0),
                SnapCandidate(kind: .slideEnd, time: duration),
                SnapCandidate(kind: .playhead, time: playhead)] + voisins
    }

    /// Huit points de doigt à l'échelle RENDUE, plafonnés à un quart de
    /// seconde — la tolérance de l'atelier (`TimelineGeometry`) et d'Android.
    static func snapTolerance(duration: Float, width: CGFloat) -> Float {
        guard duration > 0, width > 0 else { return 0 }
        let echelle = width / (TimelineGeometry.basePixelsPerSecond * CGFloat(duration))
        return TimelineGeometry(zoomScale: echelle).dragSnapToleranceSeconds
    }

    /// **Une piste se coupe à la tête** si la tête tombe à l'intérieur, à
    /// plus d'une durée plancher de chaque bord. Texte, image, vidéo et son se
    /// coupent — la seconde moitié d'une vidéo ou d'un son reprend sa source
    /// au point de coupe (#14224) ; un sticker ou un lieu ne se coupe pas.
    static func canSplit(_ piste: SceneFriseTrack, at secondes: Float) -> Bool {
        guard [.text, .image, .video, .audio].contains(piste.kind), secondes.isFinite else { return false }
        let plancher = ClipWindowResolver.minimumDuration
        return secondes > piste.start + plancher && secondes < piste.end - plancher
    }

    /// Ce qu'une barre dessine en elle (#14214).
    /// #17110 : aucune barre ne montre sa seule couleur — le texte, le
    /// sticker et le lieu s'y écrivent, l'image y pose sa vignette.
    enum BarContent: Equatable { case filmstrip, waveform, picture, caption }

    static func barContent(kind: SceneFriseTrack.Kind) -> BarContent {
        switch kind {
        case .video: return .filmstrip
        case .audio: return .waveform
        case .image: return .picture
        case .text, .sticker, .place: return .caption
        }
    }

    /// **Le couloir d'icône** de chaque famille (planche S8).
    static func familySymbol(kind: SceneFriseTrack.Kind) -> String {
        switch kind {
        case .text: return "textformat"
        case .sticker: return "face.smiling"
        case .image: return "photo"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .place: return "mappin.and.ellipse"
        }
    }

    /// **La couleur de chaque famille**, prise au design system (`MeeshyColors`).
    static func familyColor(kind: SceneFriseTrack.Kind) -> Color {
        switch kind {
        case .text: return MeeshyColors.brandPrimary
        case .sticker: return MeeshyColors.amber500
        case .image: return MeeshyColors.info
        case .video: return MeeshyColors.purple500
        case .audio: return MeeshyColors.success
        case .place: return MeeshyColors.orange500
        }
    }

    /// Des pistes plus hautes : le contenu s'y lit, le pouce s'y pose.
    static let trackHeight: CGFloat = 40

    /// Six vignettes et soixante-quatre échantillons : assez pour reconnaître
    /// le plan et la voix dans une barre de frise, peu pour la mémoire.
    static let filmstripFrames = 6
    static let waveformSamples = 64

    /// **Retirer depuis la frise** : un texte, une image, une vidéo ou un son
    /// (la commande de la timeline) ; un sticker ou un lieu se retirent depuis
    /// la scène (#4840).
    /// **Dupliquer depuis la frise** : tout objet que la scène duplique — un
    /// lieu reste unique (#14215).
    static func canDuplicate(_ piste: SceneFriseTrack) -> Bool {
        piste.kind != .place
    }

    /// Les échantillons de la seule fenêtre `window` d'une source de
    /// `sourceDuration` secondes (#14268), au moins un ; durée ou fenêtre
    /// inconnue ⇒ l'onde entière.
    static func samples(_ tous: [Float], window: ClosedRange<Double>?, sourceDuration: Double?) -> [Float] {
        guard !tous.isEmpty, let window, let total = sourceDuration, total > 0, total.isFinite else { return tous }
        let premier = min(Int((window.lowerBound / total * Double(tous.count)).rounded()), tous.count - 1)
        let dernier = min(max(Int((window.upperBound / total * Double(tous.count)).rounded()), premier + 1), tous.count)
        return Array(tous[max(0, premier)..<dernier])
    }

    static func canRemove(_ piste: SceneFriseTrack) -> Bool {
        [.text, .image, .video, .audio].contains(piste.kind)
    }

    /// La colonne des NOMS de piste — 72 pt de la maquette (64 de texte + 8
    /// d'écart) ; la règle et la tête s'alignent sur elle.
    static let labelLane: CGFloat = 72

    static func fraction(_ seconds: Float, of total: Float) -> Float {
        guard total > 0, seconds.isFinite else { return 0 }
        return max(0, min(1, seconds / total))
    }

    /// « 1.2 s / 6 s » — la maquette écrit la seconde courante au dixième, la
    /// durée entière quand elle l'est.
    static func timeLabel(current: Float, total: Float) -> String {
        "\(String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), Double(current))) s / \(seconds(total)) s"
    }

    static func windowLabel(_ piste: SceneFriseTrack) -> String {
        "\(seconds(piste.start)) s – \(seconds(piste.end)) s"
    }

    private static func seconds(_ value: Float) -> String {
        let arrondi = (Double(value) * 10).rounded() / 10
        return arrondi == arrondi.rounded()
            ? String(Int(arrondi))
            : String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), arrondi)
    }
}
