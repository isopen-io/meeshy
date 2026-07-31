import SwiftUI
import Combine
import MeeshySDK

/// Sélecteur de son de la bibliothèque, présenté depuis le composer de story.
///
/// Deux vues, deux routes distinctes :
/// - **Mes sons** — les sons dont l'appelant est l'auteur. Il peut les nommer ;
///   sans titre, la ligne affiche la date d'envoi.
/// - **Tendances** — la liste publique, triée par usage côté serveur.
///
/// La recherche existe dans les deux. Côté « Tendances » elle part au serveur
/// (titre **ou** pseudo) ; côté « Mes sons » elle filtre localement — une
/// bibliothèque personnelle tient dans quelques pages, inutile d'ajouter un
/// balayage serveur pour ça.
@MainActor
public struct SoundLibraryPicker: View {
    public enum Tab: Hashable { case mine, trending }

    private let onPick: (APISound) -> Void
    private let onCancel: () -> Void

    @StateObject private var model: SoundLibraryPickerModel
    @Environment(\.colorScheme) private var colorScheme
    @FocusState private var searchFocused: Bool
    @State private var renameDraft: String = ""

    public init(service: SoundLibraryServiceProviding = SoundLibraryService.shared,
                onPick: @escaping (APISound) -> Void,
                onCancel: @escaping () -> Void) {
        self.onPick = onPick
        self.onCancel = onCancel
        _model = StateObject(wrappedValue: SoundLibraryPickerModel(service: service))
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                picker
                searchField
                content
            }
            .padding(.top, 8)
            .navigationTitle(String(localized: "story.sound.library.title",
                                    defaultValue: "Choisir un son", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(String(localized: "story.composer.cancel",
                                  defaultValue: "Annuler", bundle: .module), action: onCancel)
                }
            }
        }
        .task { await model.loadIfNeeded() }
        // Sans ça, fermer la feuille pendant un aperçu laissait le son tourner
        // par-dessus le composer.
        .onDisappear { model.stopPreview() }
        .alert(String(localized: "story.sound.library.renameTitle",
                      defaultValue: "Nommer ce son", bundle: .module),
               isPresented: Binding(get: { model.renaming != nil },
                                    set: { if !$0 { model.renaming = nil } })) {
            TextField(String(localized: "story.sound.library.renamePlaceholder",
                             defaultValue: "Titre", bundle: .module),
                      text: $renameDraft)
            Button(String(localized: "story.sound.library.renameConfirm",
                          defaultValue: "Enregistrer", bundle: .module)) {
                if let sound = model.renaming {
                    Task { await model.commitRename(sound, title: renameDraft) }
                }
            }
            Button(String(localized: "story.composer.cancel",
                          defaultValue: "Annuler", bundle: .module), role: .cancel) {
                model.renaming = nil
            }
        } message: {
            // Le titre est PUBLIC et porte le crédit : le dire évite le
            // surnom privé qu'on ne voulait pas publier.
            Text(String(localized: "story.sound.library.renameHint",
                        defaultValue: "Ce titre sera visible par tous ceux qui découvrent ce son. Laissez vide pour revenir au libellé par défaut.",
                        bundle: .module))
        }
        .onReceive(model.$renaming.compactMap { $0 }) { sound in
            // Pré-remplir avec le titre courant : renommer, c'est corriger, pas
            // repartir de zéro.
            renameDraft = sound.title
        }
    }

    private var picker: some View {
        Picker("", selection: $model.tab) {
            Text(String(localized: "story.sound.library.mine",
                        defaultValue: "Mes sons", bundle: .module)).tag(Tab.mine)
            Text(String(localized: "story.sound.library.trending",
                        defaultValue: "Tendances", bundle: .module)).tag(Tab.trending)
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 16)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField(String(localized: "story.sound.library.search",
                             defaultValue: "Rechercher un son ou un auteur", bundle: .module),
                      text: $model.query)
                .focused($searchFocused)
                .submitLabel(.search)
                .autocorrectionDisabled()
            if !model.query.isEmpty {
                Button { model.query = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
                .accessibilityLabel(String(localized: "story.sound.library.clearSearch",
                                           defaultValue: "Effacer la recherche", bundle: .module))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(colorScheme == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
        )
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoading && model.sounds.isEmpty {
            Spacer(); ProgressView(); Spacer()
        } else if model.sounds.isEmpty {
            Spacer()
            emptyState
            Spacer()
        } else {
            List {
                ForEach(model.sounds) { sound in
                    SoundLibraryRow(
                        sound: sound,
                        isPlaying: model.previewingId == sound.id,
                        isPreparing: model.preparingId == sound.id,
                        canRename: model.tab == .mine,
                        onTogglePreview: { model.togglePreview(sound) },
                        onRename: { model.beginRename(sound) },
                        onPick: { model.stopPreview(); onPick(sound) }
                    )
                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                }
                if model.canLoadMore {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .task { await model.loadMore() }
                }
            }
            .listStyle(.plain)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "waveform")
                .font(.system(size: 34, weight: .light))
                .foregroundStyle(.secondary)
            Text(model.emptyMessage)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
    }
}

// MARK: - Ligne

@MainActor
struct SoundLibraryRow: View {
    let sound: APISound
    let isPlaying: Bool
    /// Téléchargement en cours avant lecture.
    let isPreparing: Bool
    let canRename: Bool
    let onTogglePreview: () -> Void
    let onRename: () -> Void
    let onPick: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 12) {
            cover
            VStack(alignment: .leading, spacing: 2) {
                Text(SoundLibraryPickerModel.displayTitle(for: sound))
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(1)
                metadataLine
                // Gris discret, et seulement dans « Mes sons » sur un son
                // NOMMÉ : ailleurs la date est déjà le libellé principal.
                if let date = SoundLibraryPickerModel.secondaryDate(for: sound, isMine: canRename) {
                    Text(date)
                        .font(.system(size: 11))
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if canRename {
                Button(action: onRename) {
                    Image(systemName: "pencil").font(.system(size: 13, weight: .semibold))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .accessibilityLabel(String(localized: "story.sound.library.rename",
                                           defaultValue: "Renommer", bundle: .module))
            }
            Button(action: onPick) {
                Text(String(localized: "story.sound.library.use",
                            defaultValue: "Utiliser", bundle: .module))
                    .font(.system(size: 13, weight: .semibold))
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
        }
        .contentShape(Rectangle())
    }

    private var playButtonLabel: String {
        if isPreparing {
            return String(localized: "story.sound.library.preparing",
                          defaultValue: "Préparation…", bundle: .module)
        }
        return isPlaying
            ? String(localized: "story.sound.library.stop", defaultValue: "Arrêter", bundle: .module)
            : String(localized: "story.sound.library.play", defaultValue: "Écouter", bundle: .module)
    }

    /// Auteur, publications, lectures — la ligne qui rend une entrée sans titre
    /// identifiable.
    ///
    /// Le crédit s'affiche AUSSI sur ses propres sons : dans « Mes sons » c'est
    /// redondant, mais c'est ce qui rend les deux onglets lisibles de la même
    /// façon, et un son emprunté puis retrouvé chez soi garde son auteur visible.
    ///
    /// Chiffres en icône + nombre plutôt qu'en toutes lettres : c'est dense, ça
    /// ne déborde dans aucune des sept langues, et le libellé complet part en
    /// accessibilité — où il a sa place, contrairement à une ligne de liste.
    private var metadataLine: some View {
        HStack(spacing: 8) {
            if let author = sound.authorLabel {
                Text(author).lineLimit(1).layoutPriority(1)
            }
            if sound.postCount > 0 {
                Label(sound.postCount.formatted(.number.notation(.compactName)),
                      systemImage: "rectangle.stack")
                    .labelStyle(.titleAndIcon)
            }
            if sound.playCount > 0 {
                Label(sound.playCount.formatted(.number.notation(.compactName)),
                      systemImage: "play.fill")
                    .labelStyle(.titleAndIcon)
            }
        }
        .font(.system(size: 12))
        .foregroundStyle(.secondary)
        .lineLimit(1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilitySummary)
    }

    /// Ce que VoiceOver énonce à la place des icônes. Les pluriels sont portés
    /// par le catalogue — l'arabe en a six formes, aucune concaténation ne s'en
    /// sort.
    private var accessibilitySummary: String {
        var parts: [String] = []
        if let author = sound.authorLabel { parts.append(author) }
        if sound.postCount > 0 {
            parts.append(String(localized: "story.sound.library.postCount",
                                defaultValue: "\(sound.postCount) publications", bundle: .module))
        }
        if sound.playCount > 0 {
            parts.append(String(localized: "story.sound.library.playCount",
                                defaultValue: "\(sound.playCount) lectures", bundle: .module))
        }
        return parts.joined(separator: ", ")
    }

    /// Cercle porteur du bouton play/stop. Cascade : vignette du contenu →
    /// `thumbHash` → avatar de l'auteur. Jamais de cercle vide.
    private var cover: some View {
        ZStack {
            if sound.coverUrl != nil || sound.coverThumbHash != nil {
                CachedAsyncImage(url: sound.coverUrl,
                                 targetSize: CGSize(width: 48, height: 48),
                                 thumbHash: sound.coverThumbHash)
                    .frame(width: 48, height: 48)
                    .clipShape(Circle())
            } else if let uploader = sound.uploader {
                MeeshyAvatar(name: uploader.displayName ?? uploader.username,
                             context: .userListItem,
                             avatarURL: uploader.avatar)
                    .frame(width: 48, height: 48)
            } else {
                Circle()
                    .fill(colorScheme == .dark ? Color.white.opacity(0.12) : Color.black.opacity(0.08))
                    .frame(width: 48, height: 48)
            }

            Button(action: onTogglePreview) {
                ZStack {
                    Circle().fill(Color.black.opacity(0.42))
                    if isPreparing {
                        // Le son n'est pas encore sur le disque : on le
                        // télécharge avant de jouer. Montrer « stop » ici
                        // mentirait — il n'y a rien à arrêter.
                        ProgressView()
                            .progressViewStyle(.circular)
                            .tint(.white)
                    } else {
                        Image(systemName: isPlaying ? "stop.fill" : "play.fill")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.white)
                    }
                }
                .frame(width: 48, height: 48)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(playButtonLabel)
        }
        .frame(width: 48, height: 48)
    }
}
