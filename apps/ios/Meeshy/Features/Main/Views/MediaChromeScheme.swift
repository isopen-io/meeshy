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
        guard let backdrop,
              let valeur = memoire.object(forKey: backdrop.key as NSString) else { return nil }
        return MediaChromeSample(key: backdrop.key, luminance: valeur.doubleValue)
    }

    static func sample(_ backdrop: MediaChromeBackdrop?) async -> MediaChromeSample? {
        guard let backdrop else { return nil }
        if let connue = memoized(backdrop) { return connue }
        let empreinte = backdrop.thumbHash
        let bitmap = backdrop.bitmapURL
        let mesure = await Task.detached(priority: .utility) {
            luminance(thumbHash: empreinte, bitmapURL: bitmap)
        }.value
        guard let mesure else { return nil }
        memoire.setObject(NSNumber(value: mesure), forKey: backdrop.key as NSString)
        return MediaChromeSample(key: backdrop.key, luminance: mesure)
    }

    private static func luminance(thumbHash: String?, bitmapURL: String?) -> Double? {
        if let thumbHash,
           let empreinte = UIImage.fromThumbHash(thumbHash),
           let valeur = CanvasChromeScheme.averageRelativeLuminance(of: empreinte) {
            return valeur
        }
        guard let bitmapURL, let bitmap = DiskCacheStore.cachedImage(for: bitmapURL) else { return nil }
        return CanvasChromeScheme.averageRelativeLuminance(of: bitmap)
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
}
