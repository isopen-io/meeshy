import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// =============================================================================
// **Un bouton posé sur un média se voit sur une image claire comme sur une image
// sombre** (#6693).
//
// Recette du 2026-09-15 : les surfaces qui posent leurs contrôles sur un média les
// peignaient d'un glyphe BLANC fixe, quelle que soit l'image dessous — colonne de la
// galerie (1,83:1 sur une vidéo violette), « … » de la carte Réel (1,45:1 sur une
// mire cyan), rail du lecteur de Réels (J'aime 2,00:1). Le lecteur de story tenait
// 8,85:1 : il tire sa teinte de `CanvasChromeScheme`. Le plein écran d'une scène de
// post rejoint la galerie (directive porteur du même jour) et héritera de sa colonne.
//
// Ce fichier ne porte AUCUNE règle de teinte. La loi est `CanvasChromeScheme` (SDK)
// — sa luminance 8×8, son seuil, son défaut — et le glyphe est celui de
// `glassControlForeground()`. Ce qui vit ici est l'ORCHESTRATION côté app : quel
// média chaque surface affiche réellement, quand on l'échantillonne (une fois par
// média, hors du fil principal), et où le schéma se pose.
// =============================================================================

/// **Le média sur lequel un contrôle se pose** : son empreinte (dans le modèle, sans
/// réseau) et, à défaut, l'adresse du bitmap que la surface a peut-être déjà en
/// mémoire. `key` identifie le MÉDIA — c'est elle qui borne la mesure à une fois.
nonisolated struct MediaChromeBackdrop: Hashable, Sendable {
    let key: String
    let thumbHash: String?
    let bitmapURL: String?

    /// `nil` quand il n'y a rien à échantillonner : le schéma reste alors le défaut de
    /// la loi, jamais une luminance inventée.
    init?(key: String, thumbHash: String?, bitmapURL: String?) {
        let empreinte = thumbHash.flatMap { $0.isEmpty ? nil : $0 }
        let bitmap = bitmapURL.flatMap { $0.isEmpty ? nil : $0 }
        guard empreinte != nil || bitmap != nil else { return nil }
        self.key = key
        self.thumbHash = empreinte
        self.bitmapURL = bitmap
    }

    /// **La page de la galerie** : la pièce affichée.
    static func attachment(_ attachment: MessageAttachment) -> MediaChromeBackdrop? {
        MediaChromeBackdrop(key: attachment.id,
                            thumbHash: attachment.thumbHash,
                            bitmapURL: attachment.thumbnailUrl
                                ?? (attachment.type == .image ? attachment.fileUrl : nil))
    }

    /// **La carte Réel du fil** : le visuel qu'elle peint en fond — la vidéo, sinon la
    /// première image, la couverture d'un réel audio comprise.
    static func feedCard(_ post: FeedPost) -> MediaChromeBackdrop? {
        post.reelBackgroundMedia.flatMap(visual(_:))
    }

    /// **Le lecteur de Réels** : le média que la page montre. Une vidéo gagne, comme
    /// dans `ReelPageView.mediaLayer` ; un carrousel se lit sur l'image qu'il affiche,
    /// pas sur la première.
    static func reel(_ post: FeedPost, visibleMediaId: String?) -> MediaChromeBackdrop? {
        guard let primaire = post.primaryReelDisplayMedia else { return nil }
        switch primaire.type {
        case .video:
            return visual(primaire)
        case .image:
            let affichee = post.reelDisplayMedia.first { $0.type == .image && $0.id == visibleMediaId }
            return visual(affichee ?? primaire)
        case .audio, .document:
            return nil
        }
    }

    /// **La slide du lecteur de story** : son fond média — l'empreinte de la slide d'abord,
    /// celle du média de fond ensuite, la cascade du fond flouté du lecteur
    /// (`resolvedBackdropImage`). `nil` pour une slide sans média de fond : sa couleur se
    /// lit par la loi du fond uni.
    static func story(_ story: StoryItem?) -> MediaChromeBackdrop? {
        guard let story else { return nil }
        let effets = story.storyEffects
        let objets = effets?.mediaObjects ?? []
        guard let fondId = effets?.resolvedBackgroundMedia?.postMediaId
                ?? (objets.isEmpty ? story.media.first?.id : nil) else { return nil }
        let fond = story.media.first { $0.id == fondId && ($0.type == .image || $0.type == .video) }
        guard effets?.resolvedBackgroundMedia != nil || fond != nil else { return nil }
        let empreinte = [effets?.thumbHash, fond?.thumbHash].compactMap { $0 }.first { !$0.isEmpty }
        return MediaChromeBackdrop(key: "\(story.id)#\(fondId)",
                                   thumbHash: empreinte,
                                   bitmapURL: fond.flatMap { $0.thumbnailUrl ?? ($0.type == .image ? $0.url : nil) })
    }

    private static func visual(_ media: FeedMedia) -> MediaChromeBackdrop? {
        MediaChromeBackdrop(key: media.id,
                            thumbHash: media.thumbHash,
                            bitmapURL: media.thumbnailUrl ?? (media.type == .image ? media.url : nil))
    }
}

/// Une luminance mesurée, et le média auquel elle appartient.
nonisolated struct MediaChromeSample: Equatable, Sendable {
    let key: String
    let luminance: Double
}

/// **Le schéma d'un contrôle posé sur un média — la loi du SDK, appliquée.**
nonisolated enum MediaChromeScheme {

    /// Une mesure faite pour un AUTRE média n'entre pas : pendant un feuilletage, la
    /// page qui arrive ne peint pas avec la luminance de la précédente. Sans mesure, le
    /// schéma est le défaut de la loi.
    static func scheme(for backdrop: MediaChromeBackdrop?, sample: MediaChromeSample?) -> ColorScheme {
        let luminance = backdrop.flatMap { cible in sample?.key == cible.key ? sample?.luminance : nil }
        return CanvasChromeScheme.scheme(background: nil, hasMediaBackground: true,
                                         mediaLuminance: luminance)
    }

    /// **Le schéma d'un glyphe NU** (#6704) : la luminance de ce qu'il a SOUS LUI, à la
    /// frontière du glyphe nu. Une mesure faite pour une autre cellule n'entre pas.
    static func glyphScheme(for probe: MediaChromeProbe?, sample: MediaChromeSample?) -> ColorScheme {
        let luminance = probe.flatMap { cible in sample?.key == cible.key ? sample?.luminance : nil }
        return CanvasChromeScheme.scheme(forBareGlyphOver: luminance)
    }
}

/// **Une mesure par média, hors du fil principal, servie ensuite sans recalcul.**
///
/// L'empreinte d'abord : elle est dans le modèle, sans réseau, et sa moyenne est celle
/// de l'image. Le bitmap ensuite, seulement s'il est DÉJÀ en mémoire — l'échantillonnage
/// ne télécharge ni ne décode rien que la surface n'ait déjà.
///
/// La mémoire est bornée (`countLimit`) : un fil qui défile sur des milliers de réels ne
/// la fait pas grossir sans fin.
nonisolated enum MediaLuminanceSampler {

    nonisolated(unsafe) private static let memoire: NSCache<NSString, NSNumber> = {
        let cache = NSCache<NSString, NSNumber>()
        cache.countLimit = 512
        return cache
    }()

    static func memoized(_ backdrop: MediaChromeBackdrop?) -> MediaChromeSample? {
        backdrop.flatMap { memo($0.key) }
    }

    static func sample(_ backdrop: MediaChromeBackdrop?) async -> MediaChromeSample? {
        guard let backdrop else { return nil }
        return await mesurer(backdrop.key, backdrop) { CanvasChromeScheme.averageRelativeLuminance(of: $0) }
    }

    /// **La luminance SOUS un contrôle** (#6704) : une mesure par média ET par cellule, sur
    /// la même source que la moyenne — l'empreinte, sinon le bitmap déjà en mémoire.
    static func memoized(_ probe: MediaChromeProbe?) -> MediaChromeSample? {
        probe.flatMap { memo($0.key) }
    }

    static func sample(_ probe: MediaChromeProbe?) async -> MediaChromeSample? {
        guard let probe else { return nil }
        let placement = probe.placement
        return await mesurer(probe.key, probe.backdrop) { placement.luminance(of: $0) }
    }

    private static func memo(_ key: String) -> MediaChromeSample? {
        memoire.object(forKey: key as NSString).map { MediaChromeSample(key: key, luminance: $0.doubleValue) }
    }

    private static func mesurer(_ key: String, _ backdrop: MediaChromeBackdrop,
                                _ loi: @escaping @Sendable (UIImage) -> Double?) async -> MediaChromeSample? {
        if let connue = memo(key) { return connue }
        let empreinte = backdrop.thumbHash
        let bitmap = backdrop.bitmapURL
        let mesure = await Task.detached(priority: .utility) {
            source(thumbHash: empreinte, bitmapURL: bitmap).flatMap(loi)
        }.value
        guard let mesure else { return nil }
        memoire.setObject(NSNumber(value: mesure), forKey: key as NSString)
        return MediaChromeSample(key: key, luminance: mesure)
    }

    private static func source(thumbHash: String?, bitmapURL: String?) -> UIImage? {
        if let thumbHash, let empreinte = UIImage.fromThumbHash(thumbHash) { return empreinte }
        guard let bitmapURL else { return nil }
        return DiskCacheStore.cachedImage(for: bitmapURL)
    }
}

// MARK: - Côté vue

private struct MediaChromeSchemeKey: EnvironmentKey {
    static let defaultValue: ColorScheme = MediaChromeScheme.scheme(for: nil, sample: nil)
}

extension EnvironmentValues {
    /// Le schéma que la luminance du média affiché commande. Une valeur à part, et non
    /// `colorScheme` lui-même : seuls les contrôles qui le DEMANDENT le suivent
    /// (`mediaChromeTinted()`) — ni l'avatar, ni la légende, ni la feuille d'un menu.
    var mediaChromeScheme: ColorScheme {
        get { self[MediaChromeSchemeKey.self] }
        set { self[MediaChromeSchemeKey.self] = newValue }
    }
}

private struct MediaChromeSchemeProvider: ViewModifier {
    let backdrop: MediaChromeBackdrop?
    @State private var sample: MediaChromeSample?

    func body(content: Content) -> some View {
        content
            .environment(\.mediaChromeScheme, MediaChromeScheme.scheme(for: backdrop, sample: courant))
            .task(id: backdrop) {
                let mesure = await MediaLuminanceSampler.sample(backdrop)
                guard !Task.isCancelled else { return }
                sample = mesure
            }
    }

    /// La mesure de CE média : celle de l'état si elle lui appartient, sinon la mémoire
    /// — c'est ce qui fait naître une carte recyclée avec sa teinte.
    private var courant: MediaChromeSample? {
        if let sample, sample.key == backdrop?.key { return sample }
        return MediaLuminanceSampler.memoized(backdrop)
    }
}

private struct MediaChromeTinted: ViewModifier {
    @Environment(\.mediaChromeScheme) private var scheme

    func body(content: Content) -> some View {
        content.environment(\.colorScheme, scheme)
    }
}

/// Le premier plan d'un glyphe : la teinte d'un état ACTIF quand il y en a une, le
/// verre adaptatif sinon — la forme de `ToolRowForeground` du composer.
private struct MediaChromeForeground: ViewModifier {
    let accent: Color?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let accent {
            content.foregroundStyle(accent)
        } else {
            content.glassControlForeground()
        }
    }
}

private struct MediaChromeLegible: ViewModifier {
    @Environment(\.mediaChromeScheme) private var scheme

    @ViewBuilder
    func body(content: Content) -> some View {
        if scheme == .light {
            content.legibleOverCanvas()
        } else {
            content
        }
    }
}

// MARK: - Glyphes NUS d'un rail (#6704)

private struct MediaChromeRailKey: EnvironmentKey {
    static let defaultValue: MediaChromeRail? = nil
}

extension EnvironmentValues {
    /// Le rail de la surface : ce que ses glyphes NUS lisent pour savoir ce qu'ils ont
    /// sous eux.
    var mediaChromeRail: MediaChromeRail? {
        get { self[MediaChromeRailKey.self] }
        set { self[MediaChromeRailKey.self] = newValue }
    }
}

private struct MediaChromeRailProvider: ViewModifier {
    let backdrop: MediaChromeBackdrop?
    let stage: MediaChromeStage
    let flatBackground: String?
    @State private var container: CGRect?
    @State private var footprintSample: MediaChromeSample?

    func body(content: Content) -> some View {
        let empreinte = footprintProbe
        content
            .environment(\.mediaChromeRail, MediaChromeRail(
                backdrop: backdrop, stage: stage, container: container,
                sharedScheme: MediaChromeRail.sharedScheme(stage: stage, backdrop: backdrop,
                                                           sample: courant(empreinte),
                                                           flatBackground: flatBackground)))
            .coordinateSpace(name: MediaChromeRail.space)
            .onGeometryChange(for: CGRect.self) { proxy in
                MediaChromeRail.fullBleed(size: proxy.size, insets: proxy.safeAreaInsets)
            } action: { cadre in
                container = cadre
            }
            .task(id: empreinte) {
                guard let empreinte else { return }
                let mesure = await MediaLuminanceSampler.sample(empreinte)
                guard !Task.isCancelled else { return }
                footprintSample = mesure
            }
    }

    /// L'empreinte DÉCLARÉE se mesure ici, une fois pour tous les glyphes du rail.
    private var footprintProbe: MediaChromeProbe? {
        guard case .declared = stage else { return nil }
        return MediaChromeRail(backdrop: backdrop, stage: stage, container: nil, sharedScheme: nil).probe(for: nil)
    }

    private func courant(_ probe: MediaChromeProbe?) -> MediaChromeSample? {
        if let footprintSample, footprintSample.key == probe?.key { return footprintSample }
        return MediaLuminanceSampler.memoized(probe)
    }
}

private struct MediaChromeGlyph: ViewModifier {
    @Environment(\.mediaChromeRail) private var rail
    @Environment(\.mediaChromeScheme) private var surfaceScheme
    @State private var frame: CGRect?
    @State private var sample: MediaChromeSample?

    func body(content: Content) -> some View {
        let probe = rail?.probe(for: frame)
        content
            .environment(\.colorScheme, scheme(probe))
            .onGeometryChange(for: CGRect.self) { proxy in
                proxy.frame(in: .named(MediaChromeRail.space))
            } action: { cadre in
                frame = cadre
            }
            .task(id: probe) {
                guard let probe, rail?.sharedScheme == nil else { return }
                let mesure = await MediaLuminanceSampler.sample(probe)
                guard !Task.isCancelled else { return }
                sample = mesure
            }
    }

    private func scheme(_ probe: MediaChromeProbe?) -> ColorScheme {
        guard let rail else { return surfaceScheme }
        if let partage = rail.sharedScheme { return partage }
        let mesure = sample?.key == probe?.key ? sample : MediaLuminanceSampler.memoized(probe)
        return MediaChromeScheme.glyphScheme(for: probe, sample: mesure)
    }
}

private struct MediaChromeHalo: ViewModifier {
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        content.legibleOverCanvas(on: scheme)
    }
}

extension View {

    /// Mesure le média sur lequel ce chrome se pose et en rend le schéma à ses
    /// descendants. Une mesure par média ; le défaut de la loi tant qu'elle manque.
    func mediaChromeScheme(for backdrop: MediaChromeBackdrop?) -> some View {
        modifier(MediaChromeSchemeProvider(backdrop: backdrop))
    }

    /// Fait suivre à ce contrôle — verre et glyphe — le schéma du média dessous.
    func mediaChromeTinted() -> some View {
        modifier(MediaChromeTinted())
    }

    func mediaChromeForeground(_ accent: Color?) -> some View {
        modifier(MediaChromeForeground(accent: accent))
    }

    /// Le TEXTE posé sur le média — le nom d'un auteur — reste blanc, il fait bloc avec
    /// la légende ; quand la loi dit le fond clair, il reçoit l'ombre de lisibilité que la
    /// légende porte déjà (`legibleOverCanvas`, SDK).
    func mediaChromeLegible() -> some View {
        modifier(MediaChromeLegible())
    }

    /// **Le rail d'une surface qui pose des glyphes NUS sur son média** (#6704) : le média
    /// affiché, comment la surface le cadre et le voile, et — à défaut de média — la couleur
    /// de son fond. Les glyphes marqués `mediaChromeGlyph()` s'y lisent.
    func mediaChromeRail(for backdrop: MediaChromeBackdrop?, stage: MediaChromeStage,
                         flatBackground: String? = nil) -> some View {
        modifier(MediaChromeRailProvider(backdrop: backdrop, stage: stage, flatBackground: flatBackground))
    }

    /// Un glyphe NU du rail — verre absent : il prend, glyphe ET libellé, la teinte que
    /// la part du média SOUS LUI commande. Hors d'un rail, le schéma de la surface.
    func mediaChromeGlyph() -> some View {
        modifier(MediaChromeGlyph())
    }

    /// Le plancher de lisibilité d'un glyphe nu : l'ombre de la légende, dans la polarité
    /// opposée à sa teinte.
    func mediaChromeHalo() -> some View {
        modifier(MediaChromeHalo())
    }
}
