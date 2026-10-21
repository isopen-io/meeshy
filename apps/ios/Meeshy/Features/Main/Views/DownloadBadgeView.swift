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
    /// montrent qu'un poster : c'est le plein écran qui y télécharge.
    var yieldsToThePlayer: Bool {
        attachment.type == .video
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
        if downloader.totalBytes > 0 { return AttachmentDownloader.fmt(downloader.totalBytes) }
        if attachment.fileSize > 0 { return AttachmentDownloader.fmt(Int64(attachment.fileSize)) }
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
            centredIdleBadge
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

                Text("\(AttachmentDownloader.fmt(downloader.downloadedBytes))/\(totalSizeText)")
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

// `AttachmentDownloader` vit dans `AttachmentDownloadCenter.swift` depuis #7492 :
// une façade par vue sur le registre UNIQUE des téléchargements.

// `CachedPlayIcon` a vécu ici jusqu'au 2026-08-26 : ZÉRO site d'appel, et sa
// `.task` bouclait `FileManager.fileExists` toutes les 1,5 s SANS TERMINAISON
// pour un média jamais mis en cache (auto-DL refusé par la policy) — une mine
// d'E/S disque périodique qu'un futur montage aurait réarmée sans bruit.
// Supprimé plutôt que laissé en piège (audit chauffe 2026-08-26).
