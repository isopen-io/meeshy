import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Download Badge View (3 states: idle → downloading → cached)
struct DownloadBadgeView: View {
    let attachment: MessageAttachment
    let accentColor: String
    let messageDeliveryStatus: Message.DeliveryStatus
    var onShareFile: ((URL) -> Void)? = nil
    /// L'URL que la surface AFFICHE réellement — la variante élue par
    /// `ImageVariantSelector`, souvent distincte de `attachment.fileUrl`.
    /// Sur le disque, elle suffit à taire le badge (#10370).
    var displayedURL: String? = nil
    /// L'hôte a vu l'image affichée ARRIVER (`ProgressiveCachedImage`
    /// `onFullImageLoaded`) : elle a été téléchargée par un autre chemin que
    /// ce badge, qui ne l'observe pas — sans ce signal, il restait « ↓ » pour
    /// toujours au-dessus d'une image nette (#10370).
    var displayedImageLanded: Bool = false
    /// La forme du bouton « télécharger », que décide la case qui le pose
    /// (`MediaTileDownloadPlacement`) : compacte sur la case « +N » (#11569).
    var form: MediaTileDownloadPlacement.Form = .prominent
    /// La case porte-t-elle le lecteur de la vidéo (`MediaTileVideoPresentation`) ?
    /// La case « +N » n'en monte pas : le badge y redevient le seul chemin
    /// de téléchargement de la vidéo, comme pour une photo (#11586).
    var tileHostsVideoPlayer: Bool = true

    @StateObject private var downloader = AttachmentDownloader()
    private var accent: Color { Color(hex: accentColor) }

    /// Local optimistic media (a `file://` URL) and messages still in their
    /// optimistic phase (`.sending` / `.slow` / `.invisible`) are already on
    /// disk — a download badge must never appear for them. `.slow` is a row
    /// that failed once and is retrying via the outbox: still optimistic, still
    /// local. See Sprint 3 RC3.2.
    /// **Une vidéo n'a qu'UN composant de téléchargement : le bouton de son
    /// lecteur** (#7492). `VideoAvailabilityResolver` + `MeeshyVideoPlayer`
    /// portent déjà « ↓ taille », l'anneau de progression et l'auto-DL selon la
    /// politique réseau. Ce badge se posait PAR-DESSUS la même tuile (rangée
    /// plate, carrousel) : deux boutons, deux anneaux, deux téléchargeurs dont
    /// aucun ne voyait l'autre. Il ne sert plus que l'image, dont la vue n'a pas
    /// d'autre affordance.
    ///
    /// Depuis #8231 ce lecteur, dans le fil, n'a que trois contrôles (son,
    /// lecture/pause, plein écran) ; son bouton central garde le
    /// téléchargement. La tuile de débordement et la pièce protégée ne
    /// montrent qu'un poster. La pièce protégée garde son voile, sans badge ;
    /// la case « +N », sans lecteur, garde le badge de la photo (#11586).
    var yieldsToThePlayer: Bool {
        attachment.type == .video && tileHostsVideoPlayer
    }

    var hidesForLocalOrOptimisticMedia: Bool {
        attachment.fileUrl.hasPrefix("file://")
            || messageDeliveryStatus == .sending
            || messageDeliveryStatus == .slow
            || messageDeliveryStatus == .invisible
    }

    /// **Un média déjà sur l'appareil n'a pas de badge « télécharger »**
    /// (#10370), dès le PREMIER rendu : la règle unique et synchrone
    /// `AttachmentDownloadCenter.isOnDevice` lit le disque (et, pour l'image,
    /// toute variante décodée en mémoire) pour l'original, la variante
    /// affichée et les variantes déclarées. Le `checkCache` asynchrone ne fait
    /// plus que confirmer.
    private var isAlreadyOnDevice: Bool {
        displayedImageLanded || AttachmentDownloadCenter.isOnDevice(attachment, displayedURL: displayedURL)
    }

    private var totalSizeText: String {
        if downloader.totalBytes > 0 { return MediaFormat.bytes(downloader.totalBytes) }
        if attachment.fileSize > 0 { return MediaFormat.bytes(Int64(attachment.fileSize)) }
        return ""
    }

    var body: some View {
        Group {
            if yieldsToThePlayer || hidesForLocalOrOptimisticMedia || isAlreadyOnDevice {
                EmptyView()
            } else if downloader.isCached {
                EmptyView()
            } else if downloader.isDownloading {
                downloadingBadge
                    .transition(.scale(scale: 0.8).combined(with: .opacity))
            } else {
                idleBadge
                    .transition(.scale(scale: 0.8).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.15), value: downloader.isCached)
        .animation(.easeInOut(duration: 0.15), value: downloader.isDownloading)
    }

    private var idleBadge: some View {
        Button {
            downloader.start(attachment: attachment, origin: .manual, onShare: onShareFile)
        } label: {
            switch form {
            case .prominent: centredIdleBadge
            case .compact: compactIdleBadge
            }
        }
        .task {
            await downloader.checkCache(attachment)
        }
        .accessibilityLabel(String(localized: "a11y.media.download.action", defaultValue: "Télécharger", bundle: .main))
        .accessibilityValue(totalSizeText)
    }

    private var centredIdleBadge: some View {
        VStack(spacing: 6) {
            ZStack {
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 56, height: 56)
                Circle()
                    .fill(accent.opacity(MeeshyOpacity.intense))
                    .frame(width: 48, height: 48)
                Image(systemName: "arrow.down.to.line")
                    .font(MeeshyFont.relative(MeeshyIconSize.xxl, weight: .bold))
                    .foregroundStyle(Color.white)
            }
            .shadow(color: .black.opacity(MeeshyOpacity.medium), radius: 8, y: 4)

            if !totalSizeText.isEmpty {
                Text(totalSizeText)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, MeeshySpacing.sm)
                    .padding(.vertical, MeeshySpacing.xxs)
                    .background(Capsule().fill(MeeshyColors.mediaScrim))
            }
        }
    }

    /// La forme compacte : le même disque et la même flèche, sans la taille
    /// (restée dans `accessibilityValue`), dans une cible de 44 pt — elle tient
    /// dans le coin d'une case de grille sans toucher au « +N » du centre.
    private var compactIdleBadge: some View {
        ZStack {
            Circle()
                .fill(.ultraThinMaterial)
                .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
            Circle()
                .fill(accent.opacity(MeeshyOpacity.intense))
                .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
            Image(systemName: "arrow.down.to.line")
                .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .bold))
                .foregroundStyle(Color.white)
        }
        .shadow(color: .black.opacity(MeeshyOpacity.medium), radius: 4, y: 2)
        .frame(width: MediaTileDownloadPlacement.compactHitTarget,
               height: MediaTileDownloadPlacement.compactHitTarget)
        .contentShape(Rectangle())
        .padding(MeeshySpacing.xxs)
    }

    private var downloadingBadge: some View {
        Button { downloader.cancel() } label: {
            VStack(spacing: MeeshySpacing.xxs) {
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(MeeshyOpacity.light), lineWidth: MeeshyBorder.strong)
                    Circle()
                        .trim(from: 0, to: downloader.progress)
                        .stroke(accent, style: StrokeStyle(lineWidth: MeeshyBorder.strong, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.linear(duration: 0.2), value: downloader.progress)

                    if downloader.progress > 0 {
                        Text("\(Int(downloader.progress * 100))")
                            .font(MeeshyFont.relative(7, weight: .bold, design: .monospaced))
                            .foregroundStyle(Color.white)
                    } else {
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(Color.white)
                            .frame(width: 7, height: 7)
                    }
                }
                .frame(width: 24, height: 24)

                Text("\(MediaFormat.bytes(downloader.downloadedBytes))/\(totalSizeText)")
                    .font(MeeshyFont.relative(7, weight: .medium, design: .monospaced))
                    .foregroundStyle(Color.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
            }
            .padding(MeeshySpacing.xs)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.xs).fill(MeeshyColors.mediaScrim))
        }
        .padding(MeeshySpacing.xs)
        .accessibilityLabel(String(localized: "a11y.media.download.cancel", defaultValue: "Annuler le téléchargement", bundle: .main))
        .accessibilityValue(downloader.progress.formatted(.percent))
    }
}

// MARK: - MediaTileDownloadPlacement — où se pose le badge sur une case de grille

/// **Le badge et le « +N » ne se disputent jamais le centre d'une case** (#11569).
///
/// La dernière case d'une grille de plus de quatre pièces porte « +N » au
/// centre, et le badge de la bulle s'y posait aussi, à 56 pt sur une case de
/// 119 pt de haut : on ne lisait ni l'un ni l'autre tant que la photo n'était
/// pas sur l'appareil, et le Fil posait le même badge ailleurs. Sur cette case, la
/// bulle et le Fil partagent UNE disposition : le « +N » garde le centre (c'est
/// le sens de la case, dont le toucher ouvre le carrousel), le badge prend le
/// coin haut-gauche sous sa forme compacte — le seul coin libre des deux
/// modes : en bas à droite la bulle pose l'heure et l'état d'envoi sur cette
/// dernière case, en bas à gauche vit la pastille des réactions, en haut à
/// droite le compteur de vue unique. Les autres cases gardent chacune la leur.
nonisolated struct MediaTileDownloadPlacement: Equatable {
    enum Surface: Equatable { case bubbleGrid, focalGrid }
    enum Form: Equatable { case prominent, compact }

    let alignment: Alignment
    let form: Form

    static var overflowLabelAlignment: Alignment { .center }
    static var compactHitTarget: CGFloat { MeeshyControlSize.tapTarget }

    static func resolve(surface: Surface, overflowCount: Int) -> MediaTileDownloadPlacement {
        guard overflowCount <= 0 else {
            return MediaTileDownloadPlacement(alignment: .topLeading, form: .compact)
        }
        switch surface {
        case .bubbleGrid: return MediaTileDownloadPlacement(alignment: .center, form: .prominent)
        case .focalGrid: return MediaTileDownloadPlacement(alignment: .bottomTrailing, form: .prominent)
        }
    }
}

// MARK: - MediaTileVideoPresentation — ce qu'une case de grille fait d'une vidéo

/// **La case « +N » n'est pas une vidéo : c'est la porte de la galerie** (#11586).
///
/// Le Fil montait le lecteur inline sous le voile du « +N », la bulle un
/// poster à bouton lecture : dans les deux modes, un bouton central se posait
/// sur le libellé, sur une case dont le toucher ouvre la galerie. Sur cette
/// case, la vidéo n'est plus qu'une image fixe, sans bouton lecture ni durée,
/// et son téléchargement suit la règle de la photo (badge compact au coin,
/// `MediaTileDownloadPlacement`). Une pièce protégée encore voilée garde son
/// poster et son repère de lecture ; toute autre case monte le lecteur à trois
/// contrôles (#8231), dont le bouton central télécharge.
nonisolated enum MediaTileVideoPresentation: Equatable {
    case inlinePlayer
    case poster(showsPlaybackCue: Bool)

    static func resolve(overflowCount: Int, isHiddenByProtection: Bool) -> MediaTileVideoPresentation {
        if overflowCount > 0 { return .poster(showsPlaybackCue: false) }
        if isHiddenByProtection { return .poster(showsPlaybackCue: true) }
        return .inlinePlayer
    }

    var hostsPlayer: Bool { self == .inlinePlayer }

    var showsPlaybackCue: Bool {
        switch self {
        case .inlinePlayer: return true
        case .poster(let showsPlaybackCue): return showsPlaybackCue
        }
    }
}

/// Le « +N » de la dernière case d'une grille, dessiné une seule fois pour la
/// bulle et le Fil (#11569). Le texte reste un élément VoiceOver.
struct MediaTileOverflowLabel: View {
    let count: Int

    var body: some View {
        ZStack(alignment: MediaTileDownloadPlacement.overflowLabelAlignment) {
            MeeshyColors.mediaScrim
            Text("+\(count)")
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                .foregroundStyle(Color.white)
        }
    }
}

// `AttachmentDownloader` vit dans `AttachmentDownloadCenter.swift` depuis #7492 :
// une façade par vue sur le registre UNIQUE des téléchargements.

// `CachedPlayIcon` a vécu ici jusqu'au 2026-08-26 : ZÉRO site d'appel, et sa
// `.task` bouclait `FileManager.fileExists` toutes les 1,5 s SANS TERMINAISON
// pour un média jamais mis en cache (auto-DL refusé par la policy) — une mine
// d'E/S disque périodique qu'un futur montage aurait réarmée sans bruit.
// Supprimé plutôt que laissé en piège (audit chauffe 2026-08-26).
