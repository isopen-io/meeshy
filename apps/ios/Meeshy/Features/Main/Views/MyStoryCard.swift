import SwiftUI
import MeeshySDK
import MeeshyUI

/// Carte d'une story dans « Mes stories » — vignette, bande de glyphes, date.
///
/// UNE carte pour les deux onglets. Ce qui change entre une story publiée et
/// un brouillon est porté par `MyStoryCardModel` (des données), pas par deux
/// vues jumelles : le patron de glyphe est déjà écrit trois fois dans la vue
/// d'origine, deux cartes distinctes en auraient fait cinq.
struct MyStoryCardModel: Equatable {
    let id: String
    let kind: MyStoryCardKind
    let thumbnailURL: String?
    /// Composite de TOUTES les couches (texte, dessin, stickers), seule
    /// representation cliente de ce que l'auteur a reellement compose.
    /// `thumbnailURL` ne reflete que le media de FOND.
    let thumbHash: String?
    /// Chemin LOCAL d'une vignette de brouillon. Lu directement depuis le
    /// disque : `CachedAsyncImage` resout des URL DISTANTES via MeeshyConfig
    /// et ne sait rien faire d'un `file://`.
    let localCoverPath: String?
    /// Fond de slide d'un brouillon. Un brouillon n'a pas de `thumbHash` — il
    /// n'est compose qu'a la publication — donc sans ce fond la carte n'avait
    /// litteralement rien a peindre.
    let backgroundHex: String?
    /// Date affichée sous la carte : publication pour une story, dernière
    /// modification pour un brouillon.
    let date: Date
    /// `nil` pour un brouillon — rien n'expire tant que rien n'est publié.
    let expiresAt: Date?
    let counts: [MyStoryGlyph: Int]
    /// Titre d'un brouillon, quand il en a un. Les stories publiées n'en
    /// affichent pas : leur vignette parle pour elles.
    let title: String?
    /// Progression d'un export vers la photothèque en cours pour CETTE
    /// story (`StoryPhotoSaveService.shared.progress(for:)`) — `nil` =
    /// aucun job en vol, la carte n'affiche alors aucun anneau. Même
    /// source de vérité que le rail du lecteur (`StoryViewerView+Sidebar`) :
    /// un export lancé depuis l'une des deux surfaces progresse sur les deux.
    let saveProgress: Double?
    /// `false` dès que l'écriture photothèque a commencé — voir
    /// `StoryPhotoSaveService.isCancellable(storyId:)`. Contrôle si
    /// l'anneau répond encore au tap (annulation).
    let saveIsCancellable: Bool
}

struct MyStoryCard: View {
    /// Taille de rendu d'une cellule de grille (adaptive 150pt, ratio 9:16) —
    /// borne le décodage de la vignette à la taille affichée.
    static let thumbnailTargetSize = CGSize(width: 180, height: 320)

    let model: MyStoryCardModel
    let now: Date
    let accentColor: Color
    let isDark: Bool
    let onOpen: () -> Void
    let onGlyph: (MyStoryGlyph) -> Void
    let moreMenu: AnyView?
    /// Mode sélection de la grille (suppression en masse). Défauts `false` :
    /// l'onglet brouillons et les previews restent hors sélection sans bruit.
    var isSelecting: Bool = false
    var isSelected: Bool = false

    @Environment(\.locale) private var locale

    private var isVeiled: Bool {
        MyStoryCardPresentation.isVeiled(expiresAt: model.expiresAt, now: now)
    }

    private var selectionIndicator: MyStorySelectionIndicator {
        MyStoryCardPresentation.selectionIndicator(isSelecting: isSelecting, isSelected: isSelected)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            thumbnail
            MyStoryActionBar(
                glyphs: MyStoryCardPresentation.glyphs(for: model.kind),
                counts: model.counts,
                moreMenu: moreMenu,
                onSelect: onGlyph
            )
            .equatable()
            dateLabel
        }
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(accentColor, lineWidth: 2.5)
                .opacity(selectionIndicator == .selected ? 1 : 0)
        )
        // La carte compose son propre libellé : sans cela VoiceOver énonce une
        // vignette muette suivie de compteurs nus.
        .accessibilityElement(children: .contain)
    }

    /// `Color.clear` POSE le cadre, le contenu vient en overlay.
    ///
    /// L'image etait posee directement dans un `ZStack` : en `scaledToFill()`
    /// elle DIMENSIONNE la pile, donc la carte prenait la largeur de l'image
    /// au lieu de celle de la cellule — les tuiles se chevauchaient et le
    /// `clipShape` de la carte arrivait trop tard. Un cadre neutre d'abord,
    /// l'image ensuite, le rognage juste apres : la cellule impose sa taille.
    private var thumbnail: some View {
        Color.clear
            .aspectRatio(9 / 16, contentMode: .fit)
            .overlay(thumbnailLayers)
            .clipped()
            .overlay(alignment: .topTrailing) { selectionBadge }
            .overlay { saveProgressOverlay }
            .contentShape(Rectangle())
            .onTapGesture(perform: onOpen)
            .accessibilityAddTraits(.isButton)
            .accessibilityAddTraits(selectionIndicator == .selected ? .isSelected : [])
            .accessibilityLabel(thumbnailAccessibilityLabel)
    }

    /// Pastille de sélection — cercle vide (à sélectionner) ou plein avec
    /// coche (dans le lot). Rien hors mode sélection.
    @ViewBuilder
    private var selectionBadge: some View {
        switch selectionIndicator {
        case .hidden:
            EmptyView()
        case .unselected:
            Circle()
                .strokeBorder(Color.white, lineWidth: 2)
                .background(Circle().fill(Color.black.opacity(0.25)))
                .frame(width: 22, height: 22)
                .shadow(color: .black.opacity(0.35), radius: 2)
                .padding(6)
        case .selected:
            ZStack {
                Circle().fill(accentColor)
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
            }
            .frame(width: 22, height: 22)
            .shadow(color: .black.opacity(0.35), radius: 2)
            .padding(6)
        }
    }

    /// Anneau d'export en cours vers la photothèque — même job, même source
    /// de vérité que le rail du lecteur (`StoryViewerView+Sidebar:511-540`) :
    /// un export lancé depuis l'une des deux surfaces progresse sur les
    /// deux. Centré sur la vignette, avec un fond translucide pour rester
    /// lisible sur une couverture claire.
    @ViewBuilder
    private var saveProgressOverlay: some View {
        if MyStoryCardPresentation.showsSaveProgressRing(saveProgress: model.saveProgress),
           let progress = model.saveProgress {
            Button {
                HapticFeedback.light()
                StoryPhotoSaveService.shared.cancel(storyId: model.id)
            } label: {
                StorySaveProgressRing(progress: progress, tint: accentColor, diameter: 32,
                                      isCancellable: model.saveIsCancellable)
                    .padding(8)
                    .background(Circle().fill(Color.black.opacity(0.35)))
            }
            .buttonStyle(.plain)
            // Le tap cesse d'être actif dès que l'écriture photothèque a
            // commencé — même règle que le rail du lecteur, sinon les deux
            // surfaces divergeraient sur le même job.
            .disabled(!model.saveIsCancellable)
            .accessibilityLabel(String(localized: "story.mine.save.cancel.a11y",
                                       defaultValue: "Annuler l'enregistrement", bundle: .main))
            .accessibilityValue(Text(String(
                localized: "story.mine.save.progress.a11y",
                defaultValue: "Enregistrement \(StorySaveProgressRing.percent(progress)) %", bundle: .main)))
        }
    }

    @ViewBuilder
    private var thumbnailLayers: some View {
        ZStack {
            // Delegue a `MyStoryThumbnailResolver` — reimplementer le choix
            // ici rendait vide toute story SANS media de fond (texte seul,
            // dessin) : elles n'ont pas d'URL, seulement un thumbHash.
            // Le fond de slide d'abord : c'est la seule couche que TOUT
            // brouillon possede, et elle reste visible sous une vignette
            // transparente ou pas encore chargee.
            if let hex = model.backgroundHex {
                // `storyBackgroundStyle` est le rendu UNIQUE de
                // `StoryEffects.background` (hex ou « gradient:A:B »), deja
                // partage par le letterbox du composer et les mini-previews.
                Rectangle().fill(storyBackgroundStyle(hex))
            }

            // P1-4a : plus de `UIImage(contentsOfFile:)` dans le body — le
            // décodage plein format tournait sur le main thread À CHAQUE
            // render de cellule. `CachedAsyncImage` décode off-main, borné à
            // la taille de cellule, et son NSCache rend les re-renders
            // synchrones. Pendant le chargement — et si le fichier local est
            // illisible (tué mi-écriture) — le placeholder EST la chaîne de
            // repli historique (thumbHash → miniature serveur), donc aucun
            // état ne rend moins que l'ancien code.
            if let path = model.localCoverPath, FileManager.default.fileExists(atPath: path) {
                // showsStatusOverlays: false — surface décorative : ni spinner
                // pendant le décodage, ni bouton Retry sans issue sur un
                // fichier local illisible.
                CachedAsyncImage(
                    url: URL(fileURLWithPath: path).absoluteString,
                    targetSize: Self.thumbnailTargetSize,
                    showsStatusOverlays: false
                ) { resolvedThumbnailFallback }
                .scaledToFill()
            } else {
                resolvedThumbnailFallback
            }

            if isVeiled {
                // Le voile couvre la VIGNETTE seule : la bande de glyphes reste
                // nette en dessous — c'est par elle qu'on consulte encore vues,
                // réactions et commentaires d'une story éteinte.
                Rectangle().fill(Color.black.opacity(0.55))
            }

            if let title = model.title, !title.isEmpty {
                Text(title)
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .padding(8)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                    .shadow(color: .black.opacity(0.5), radius: 2)
            }
        }
    }

    /// Chaîne de repli historique de la vignette (thumbHash composite →
    /// miniature serveur → placeholder), déléguée à `MyStoryThumbnailResolver`.
    /// Sert de branche sans cover local ET de placeholder du cover local
    /// (pendant son décodage, ou s'il est illisible).
    @ViewBuilder
    private var resolvedThumbnailFallback: some View {
        switch MyStoryThumbnailResolver.resolve(thumbHash: model.thumbHash,
                                                remoteURL: model.thumbnailURL) {
        case .composite(let hash):
            if let image = UIImage.fromThumbHash(hash) {
                Image(uiImage: image).resizable().scaledToFill()
            } else if let url = model.thumbnailURL, !url.isEmpty {
                // targetSize ≈ cellule de grille 9:16 (adaptive 150pt) —
                // décode downsamplé au lieu du plafond 1200 px plein format.
                CachedAsyncImage(url: url, targetSize: Self.thumbnailTargetSize) { emptyOrPlaceholder }
            } else {
                emptyOrPlaceholder
            }
        case .remoteURL(let url):
            CachedAsyncImage(url: url, targetSize: Self.thumbnailTargetSize) { emptyOrPlaceholder }
        case .placeholder:
            emptyOrPlaceholder
        }
    }

    /// Rien par-dessus un fond deja peint : l'aplat de repli masquerait la
    /// couleur reelle du brouillon.
    @ViewBuilder
    private var emptyOrPlaceholder: some View {
        if model.backgroundHex == nil { placeholderFill } else { Color.clear }
    }

    private var placeholderFill: some View {
        Rectangle()
            .fill(accentColor.opacity(0.20))
            .overlay(Image(systemName: "photo").foregroundColor(accentColor))
    }

    private var dateLabel: some View {
        Text(MyStoryCardPresentation.dateLabel(for: model.date, now: now, locale: locale))
            .font(MeeshyFont.relative(11, weight: .medium))
            .foregroundColor(.secondary)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.bottom, 8)
    }

    private var thumbnailAccessibilityLabel: String {
        let date = MyStoryCardPresentation.dateLabel(for: model.date, now: now, locale: locale)
        guard isVeiled else { return date }
        return String(localized: "story.mine.card.expired",
                      defaultValue: "Story expirée, \(date)")
    }
}
