import SwiftUI
import UIKit

/// **Le rognage d'un son — bande défilante, curseur au centre, poignées
/// larges** (#4657).
///
/// ## Le repère, en une phrase
///
/// La bande DÉFILE sous un curseur FIXE, posé au centre. C'est ce qui rend le
/// rognage précis sans demander un geste fin : on amène l'instant sous le trait,
/// au lieu de viser un trait avec le doigt. Le pincement change combien de temps
/// tient dans la largeur — donc la précision — et rien d'autre.
///
/// ## Ce que la disposition garantit
///
/// Le bouton de lecture et la bande sont les deux membres d'un `HStack` : le
/// bouton prend sa taille, la bande prend **le reste**, mesuré. Rien n'est posé
/// en largeur fixe, rien ne peut donc déborder du viewport — la garantie est
/// structurelle, pas une valeur bien choisie.
///
/// Tout ce qui se dessine est clippé à la bande. Une poignée qui sort du champ
/// visible est **ramenée sur le bord** plutôt que perdue : elle reste
/// attrapable, et sa position hors-champ se lit à sa flèche.
///
/// ## Ce qui est calculé UNE fois
///
/// Le spectre. `AudioWaveform` rend des buckets RMS absolus avec cache mémoire
/// et disque ; on en demande le palier le plus fin **une seule fois**, et
/// chaque niveau de zoom s'en déduit par sous-échantillonnage. Redemander une
/// analyse à chaque image de pincement serait la seule façon de rendre ce
/// composant lent.
public struct MeeshyAudioTrimmer: View {

    private let url: URL
    private let totalDuration: TimeInterval
    @Binding private var range: ClosedRange<TimeInterval>
    private let tint: Color

    /// Résolution du spectre, demandée UNE fois. C'est le palier le plus fin de
    /// `AudioWaveform` : tous les zooms s'en déduisent.
    private static let resolution = 2048
    private static let stripHeight: CGFloat = 72
    /// Largeur d'une poignée. « Large » est une exigence de la directive et une
    /// exigence d'accessibilité : sous 24 pt, la cible devient plus fine que la
    /// pulpe d'un doigt.
    private static let handleWidth: CGFloat = 26

    @StateObject private var player = AudioTrimPreviewPlayer()
    @State private var samples: [Float] = []
    @State private var zoom: CGFloat = 1
    @State private var offset: CGFloat = 0
    @State private var stripWidth: CGFloat = 1
    @State private var draggedHandle: Handle?
    @State private var offsetAuDebutDuGeste: CGFloat?
    @State private var zoomAuDebutDuPincement: CGFloat?
    @State private var chargementFait = false

    private enum Handle { case start, end }

    /// **La durée se DIT, elle ne se lit pas.** « 0:12 » est une horloge pour
    /// l'œil ; VoiceOver y annonce « zéro deux-points douze ». Les poignées
    /// portent donc une valeur parlée, pas la chaîne montrée.
    ///
    /// Écrite ici plutôt qu'importée : `LocalizedNumber` vit dans l'APP, et le
    /// SDK ne remonte jamais vers elle — une dépendance inverse rendrait ce
    /// composant inutilisable hors de Meeshy, ce qui est exactement ce qu'un
    /// atome ne doit pas être.
    nonisolated static func spokenDuration(_ seconds: TimeInterval, locale: Locale = .current) -> String {
        let total = max(0, Int(seconds.rounded()))
        var composants = DateComponents()
        composants.minute = total / 60
        composants.second = total % 60
        let formateur = DateComponentsFormatter()
        formateur.allowedUnits = [.minute, .second]
        formateur.unitsStyle = .spellOut
        formateur.calendar = Calendar(identifier: .gregorian)
        formateur.calendar?.locale = locale
        return formateur.string(from: composants) ?? "\(total)"
    }

    public init(
        url: URL,
        duration: TimeInterval,
        range: Binding<ClosedRange<TimeInterval>>,
        tint: Color = MeeshyColors.indigo500
    ) {
        self.url = url
        self.totalDuration = duration
        self._range = range
        self.tint = tint
    }

    private var geometry: AudioTrimGeometry {
        AudioTrimGeometry(duration: totalDuration, width: stripWidth, zoom: zoom)
    }

    public var body: some View {
        HStack(spacing: 12) {
            playButton
            strip
        }
        .frame(height: Self.stripHeight)
        .task(id: url) { await charger() }
        .onDisappear { player.stop() }
    }

    // MARK: - Le bouton

    private var playButton: some View {
        Button {
            if player.isPlaying {
                player.pause()
            } else {
                player.play(from: range.lowerBound, to: range.upperBound)
            }
            HapticFeedback.light()
        } label: {
            Image(systemName: player.isPlaying ? "stop.fill" : "play.fill")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(Circle().fill(tint))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(player.isPlaying
            ? String(localized: "audio.trim.stop", defaultValue: "Arrêter", bundle: .module)
            : String(localized: "audio.trim.play", defaultValue: "Écouter la sélection", bundle: .module))
    }

    // MARK: - La bande

    private var strip: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 14)
                    .fill(tint.opacity(0.10))

                Canvas { context, size in
                    dessiner(context: context, size: size)
                }

                centreCursor
                handle(.start)
                handle(.end)
            }
            .contentShape(RoundedRectangle(cornerRadius: 14))
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .gesture(scrollGesture)
            .simultaneousGesture(pinchGesture)
            .onAppear { stripWidth = proxy.size.width }
            .onChange(of: proxy.size.width) { largeur in stripWidth = largeur }
            .onChange(of: player.playhead) { tete in
                guard player.isPlaying, draggedHandle == nil else { return }
                offset = geometry.offsetCentering(tete)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "audio.trim.strip",
                                   defaultValue: "Bande de rognage", bundle: .module))
    }

    /// Le curseur de précision — fixe, au centre, toujours à l'aplomb de
    /// l'instant que la lecture atteint.
    private var centreCursor: some View {
        Rectangle()
            .fill(Color.white.opacity(0.9))
            .frame(width: 2)
            .frame(maxHeight: .infinity)
            .offset(x: stripWidth / 2 - 1)
            .shadow(color: .black.opacity(0.35), radius: 2)
            .allowsHitTesting(false)
    }

    private func handle(_ which: Handle) -> some View {
        let instant = which == .start ? range.lowerBound : range.upperBound
        let brut = geometry.x(for: instant, offset: offset)
        // Ramenée sur le bord plutôt que perdue : une poignée hors champ reste
        // attrapable, et c'est ce qui évite qu'un zoom serré fasse disparaître
        // la borne qu'on cherche justement à régler.
        let horsChamp = brut < 0 || brut > stripWidth
        let x = min(max(brut, Self.handleWidth / 2), max(Self.handleWidth / 2, stripWidth - Self.handleWidth / 2))

        return RoundedRectangle(cornerRadius: 7)
            .fill(tint)
            .overlay(
                Image(systemName: horsChamp
                      ? (brut < 0 ? "chevron.left" : "chevron.right")
                      : "line.3.horizontal")
                    .font(.system(size: 11, weight: .bold))
                    .rotationEffect(.degrees(horsChamp ? 0 : 90))
                    .foregroundStyle(.white)
            )
            .frame(width: Self.handleWidth)
            .frame(maxHeight: .infinity)
            .position(x: x, y: Self.stripHeight / 2)
            .gesture(handleGesture(which))
            .accessibilityLabel(which == .start
                ? String(localized: "audio.trim.handle.start", defaultValue: "Début de la sélection", bundle: .module)
                : String(localized: "audio.trim.handle.end", defaultValue: "Fin de la sélection", bundle: .module))
            .accessibilityValue(Self.spokenDuration(instant))
    }

    // MARK: - Le dessin

    private func dessiner(context: GraphicsContext, size: CGSize) {
        guard !samples.isEmpty, size.width > 0 else { return }
        let geo = geometry
        let largeurBarre: CGFloat = 3
        let pas: CGFloat = largeurBarre + 1
        let milieu = size.height / 2

        var x: CGFloat = 0
        while x < size.width {
            let instant = geo.time(atX: x, offset: offset)
            let index = min(samples.count - 1, max(0, Int(instant / geo.duration * Double(samples.count))))
            let hauteur = CGFloat(AudioWaveform.displayHeight(rms: samples[index])) * (size.height - 10)
            let dansLaSelection = instant >= range.lowerBound && instant <= range.upperBound
            let rect = CGRect(x: x, y: milieu - hauteur / 2, width: largeurBarre, height: max(2, hauteur))
            context.fill(
                Path(roundedRect: rect, cornerRadius: largeurBarre / 2),
                with: .color(dansLaSelection ? tint : tint.opacity(0.22))
            )
            x += pas
        }
    }

    // MARK: - Les gestes

    /// Le défilement au doigt. `offsetAuDebutDuGeste` est indispensable : sans
    /// lui, `translation` s'ajoute à un offset qu'on vient soi-même de modifier,
    /// et la bande s'emballe.
    private var scrollGesture: some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { valeur in
                let base = offsetAuDebutDuGeste ?? offset
                if offsetAuDebutDuGeste == nil {
                    offsetAuDebutDuGeste = offset
                    player.pause()
                }
                offset = geometry.clampedOffset(base - valeur.translation.width)
                player.seek(to: geometry.time(atX: stripWidth / 2, offset: offset))
            }
            .onEnded { _ in offsetAuDebutDuGeste = nil }
    }

    private var pinchGesture: some Gesture {
        MagnificationGesture()
            .onChanged { echelle in
                let base = zoomAuDebutDuPincement ?? zoom
                if zoomAuDebutDuPincement == nil { zoomAuDebutDuPincement = zoom }
                let (neuve, nouvelOffset) = geometry.zoomed(to: base * echelle, offset: offset)
                zoom = neuve.zoom
                offset = nouvelOffset
            }
            .onEnded { _ in zoomAuDebutDuPincement = nil }
    }

    /// Déplacer une poignée ARRÊTE la lecture ; la relâcher la reprend **depuis
    /// le début** du segment — c'est la seule reprise qui a du sens quand on
    /// vient de déplacer une borne.
    private func handleGesture(_ which: Handle) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { valeur in
                if draggedHandle == nil {
                    draggedHandle = which
                    player.pause()
                }
                let instant = geometry.time(atX: valeur.location.x, offset: offset)
                switch which {
                case .start:
                    range = geometry.movedStart(to: instant, end: range.upperBound)...range.upperBound
                case .end:
                    range = range.lowerBound...geometry.movedEnd(to: instant, start: range.lowerBound)
                }
            }
            .onEnded { _ in
                draggedHandle = nil
                player.play(from: range.lowerBound, to: range.upperBound)
                HapticFeedback.light()
            }
    }

    // MARK: - Le chargement

    /// Spectre demandé UNE fois, puis lecture automatique — c'est ce que la
    /// directive appelle « la lecture est automatique après le chargement ».
    private func charger() async {
        chargementFait = false
        let releve = await AudioWaveform.samples(url: url, count: Self.resolution)
        samples = releve
        let duree = player.load(url: url) ?? totalDuration
        range = AudioTrimGeometry(duration: duree, width: stripWidth, zoom: 1).clampedRange(range)
        offset = 0
        chargementFait = true
        player.play(from: range.lowerBound, to: range.upperBound)
    }
}
