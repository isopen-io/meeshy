import SwiftUI
import Combine
import MeeshySDK

/// Vue-modèle de la purge sélective.
///
/// Le rafraîchissement passe par un pipeline Combine (`refreshSubject`) et non
/// par un `.onChange` SwiftUI : le dépôt les proscrit, et la variante
/// `.onChange(of:initial:)` n'existe de toute façon qu'à partir d'iOS 17 alors
/// que la cible est iOS 16.
@MainActor
public final class CachePurgeViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    @Published public private(set) var report: CachePurgeReport?
    @Published public private(set) var isMeasuring = false
    @Published public private(set) var isPurging = false
    @Published public var selection: Set<CachePurgeCellID> = []
    @Published public private(set) var lastFreedBytes: Int?
    @Published public var includeUnattributed = false

    private let service: CachePurgeService
    private let refreshSubject = PassthroughSubject<Void, Never>()
    private var cancellables = Set<AnyCancellable>()

    public init(service: CachePurgeService = .shared) {
        self.service = service
        bind()
    }

    private func bind() {
        // Un `debounce` court absorbe les rafales (apparition de la vue +
        // retour de purge) : la mesure balaie les quatre stores disque et la
        // base, ce n'est pas gratuit.
        refreshSubject
            .debounce(for: .milliseconds(120), scheduler: DispatchQueue.main)
            .sink { [weak self] in
                guard let self else { return }
                Task { await self.measure() }
            }
            .store(in: &cancellables)
    }

    public func refresh() {
        refreshSubject.send(())
    }

    private func measure() async {
        isMeasuring = true
        let fresh = await service.report()
        report = fresh
        // Une case devenue vide ou indisponible ne doit pas rester
        // sélectionnée : l'utilisateur validerait une purge sans effet.
        selection = selection.filter { id in
            fresh.cell(id.kind, id.domain)?.availability.isPurgeable ?? false
        }
        isMeasuring = false
    }

    // MARK: - Sélection

    public func isSelected(_ id: CachePurgeCellID) -> Bool {
        selection.contains(id)
    }

    public func toggle(_ id: CachePurgeCellID) {
        guard availability(for: id)?.isPurgeable == true else { return }
        if selection.contains(id) { selection.remove(id) } else { selection.insert(id) }
    }

    public func availability(for id: CachePurgeCellID) -> CachePurgeAvailability? {
        report?.cell(id.kind, id.domain)?.availability
    }

    /// Sélectionne (ou désélectionne) toutes les cases purgeables d'un type.
    public func toggleKind(_ kind: CacheDataKind) {
        let ids = purgeableIDs.filter { $0.kind == kind }
        applyToggle(over: ids)
    }

    /// Idem pour un domaine entier.
    public func toggleDomain(_ domain: CacheDomain) {
        let ids = purgeableIDs.filter { $0.domain == domain }
        applyToggle(over: ids)
    }

    public func toggleAll() {
        applyToggle(over: purgeableIDs)
    }

    private func applyToggle(over ids: [CachePurgeCellID]) {
        guard !ids.isEmpty else { return }
        let allSelected = ids.allSatisfy { selection.contains($0) }
        if allSelected {
            ids.forEach { selection.remove($0) }
        } else {
            ids.forEach { selection.insert($0) }
        }
    }

    private var purgeableIDs: [CachePurgeCellID] {
        (report?.cells ?? [])
            .filter { $0.availability.isPurgeable && $0.availability.bytes > 0 }
            .map(\.id)
    }

    /// Octets que la sélection courante libérerait. Somme de valeurs MESURÉES.
    ///
    /// Un même fichier peut être revendiqué par deux domaines (une story
    /// republiée en post) : il serait alors compté deux fois. On ne peut pas
    /// dédupliquer ici sans recalculer l'attribution complète, donc cette somme
    /// est un MAJORANT — le libellé de l'UI dit « jusqu'à ».
    public var selectedBytes: Int {
        let cellBytes = selection.reduce(0) { $0 + (availability(for: $1)?.bytes ?? 0) }
        return cellBytes + (includeUnattributed ? (report?.unattributedBytes ?? 0) : 0)
    }

    public var hasSelection: Bool {
        !selection.isEmpty || (includeUnattributed && (report?.unattributedBytes ?? 0) > 0)
    }

    // MARK: - Purge

    public func purgeSelection() async {
        guard hasSelection else { return }
        isPurging = true
        var freed = await service.purge(selection)
        if includeUnattributed {
            freed += await service.purgeUnattributed()
        }
        lastFreedBytes = freed
        selection.removeAll()
        includeUnattributed = false
        isPurging = false
        refresh()
    }
}

// MARK: - Vue

/// Tableau de purge croisant TYPE de donnée et DOMAINE métier.
///
/// Les cases grisées ne sont pas des trous d'implémentation : ce sont des
/// limites structurelles du cache, explicitées à l'utilisateur (cf.
/// `CachePurgeLimitation`).
public struct SelectiveCachePurgeView: View {

    @StateObject private var viewModel = CachePurgeViewModel()
    @State private var showConfirm = false
    @Environment(\.colorScheme) private var colorScheme

    private var theme: ThemeManager { ThemeManager.shared }
    private let accentColor = MeeshyColors.brandPrimaryHex

    public init() {}

    public var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            ForEach(CacheDataKind.allCases, id: \.self) { kind in
                kindSection(kind)
            }
            unattributedSection
            purgeButton
        }
        .task { viewModel.refresh() }
        .alert(
            String(localized: "settings.cache.purge.confirm.title", defaultValue: "Vider définitivement ?", bundle: .module),
            isPresented: $showConfirm
        ) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module), role: .cancel) {}
            Button(String(localized: "settings.cache.purge.confirm.action", defaultValue: "Vider", bundle: .module), role: .destructive) {
                Task { await viewModel.purgeSelection() }
            }
        } message: {
            Text(String(
                localized: "settings.cache.purge.confirm.message",
                defaultValue: "Cette suppression est irréversible. Les données concernées seront retéléchargées à la demande.",
                bundle: .module
            ))
        }
    }

    // MARK: - Section par type

    private func kindSection(_ kind: CacheDataKind) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                HapticFeedback.light()
                viewModel.toggleKind(kind)
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: Self.icon(for: kind))
                        .font(MeeshyFont.relative(12, weight: .semibold))
                    Text(Self.label(for: kind).uppercased())
                        .font(MeeshyFont.relative(11, weight: .bold, design: .rounded))
                        .tracking(1.2)
                    Spacer()
                    Text(Self.formatBytes(viewModel.report?.bytes(for: kind) ?? 0))
                        .font(MeeshyFont.relative(11, weight: .semibold))
                }
                .foregroundColor(Color(hex: accentColor))
                .padding(.leading, 4)
            }
            .accessibilityHint(String(
                localized: "settings.cache.purge.kind.hint",
                defaultValue: "Sélectionne ou désélectionne toutes les cases de ce type",
                bundle: .module
            ))

            VStack(spacing: 0) {
                ForEach(CacheDomain.allCases, id: \.self) { domain in
                    cellRow(kind: kind, domain: domain)
                }
            }
            .background(sectionBackground(tint: accentColor))
        }
    }

    @ViewBuilder
    private func cellRow(kind: CacheDataKind, domain: CacheDomain) -> some View {
        let id = CachePurgeCellID(kind: kind, domain: domain)
        let availability = viewModel.availability(for: id)

        switch availability {
        case .purgeable(let bytes):
            Button {
                HapticFeedback.light()
                viewModel.toggle(id)
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: viewModel.isSelected(id) ? "checkmark.square.fill" : "square")
                        .font(MeeshyFont.relative(16, weight: .medium))
                        .foregroundColor(viewModel.isSelected(id) ? Color(hex: accentColor) : theme.textMuted)

                    Text(Self.label(for: domain))
                        .font(MeeshyFont.relative(14, weight: .medium))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    Text(Self.formatBytes(bytes))
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(bytes > 0 ? theme.textPrimary : theme.textMuted)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(viewModel.isSelected(id) ? [.isButton, .isSelected] : .isButton)

        case .unavailable(let limitation):
            // Case grisée : on affiche la RAISON. Pas de taille — elle serait
            // inventée, puisque rien n'est mesurable pour cette case.
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "minus.square")
                    .font(MeeshyFont.relative(16, weight: .medium))
                    .foregroundColor(theme.textMuted.opacity(0.5))

                VStack(alignment: .leading, spacing: 2) {
                    Text(Self.label(for: domain))
                        .font(MeeshyFont.relative(14, weight: .medium))
                        .foregroundColor(theme.textMuted)
                    Text(Self.explanation(for: limitation))
                        .font(MeeshyFont.relative(11, weight: .regular))
                        .foregroundColor(theme.textMuted.opacity(0.8))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .accessibilityElement(children: .combine)

        case .none:
            EmptyView()
        }
    }

    // MARK: - Résidu non attribué

    @ViewBuilder
    private var unattributedSection: some View {
        let bytes = viewModel.report?.unattributedBytes ?? 0
        if bytes > 0 {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "questionmark.folder")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                    Text(String(localized: "settings.cache.purge.unattributed.title",
                                defaultValue: "Non attribué", bundle: .module).uppercased())
                        .font(MeeshyFont.relative(11, weight: .bold, design: .rounded))
                        .tracking(1.2)
                }
                .foregroundColor(Color(hex: MeeshyColors.neutral500Hex))
                .padding(.leading, 4)

                Button {
                    HapticFeedback.light()
                    viewModel.includeUnattributed.toggle()
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: viewModel.includeUnattributed ? "checkmark.square.fill" : "square")
                            .font(MeeshyFont.relative(16, weight: .medium))
                            .foregroundColor(viewModel.includeUnattributed ? Color(hex: accentColor) : theme.textMuted)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(String(localized: "settings.cache.purge.unattributed.label",
                                        defaultValue: "Médias orphelins", bundle: .module))
                                .font(MeeshyFont.relative(14, weight: .medium))
                                .foregroundColor(theme.textPrimary)
                            Text(String(
                                localized: "settings.cache.purge.unattributed.description",
                                defaultValue: "Fichiers encore sur l'appareil dont la publication, la story ou la conversation d'origine n'est plus en cache. Impossible de les rattacher à un domaine.",
                                bundle: .module
                            ))
                                .font(MeeshyFont.relative(11, weight: .regular))
                                .foregroundColor(theme.textMuted)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Spacer()

                        Text(Self.formatBytes(bytes))
                            .font(MeeshyFont.relative(13, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .background(sectionBackground(tint: MeeshyColors.neutral500Hex))
                .accessibilityElement(children: .combine)
            }
        }
    }

    // MARK: - Action

    private var purgeButton: some View {
        VStack(spacing: 10) {
            Button {
                HapticFeedback.medium()
                viewModel.toggleAll()
            } label: {
                Text(String(localized: "settings.cache.purge.selectAll",
                            defaultValue: "Tout sélectionner", bundle: .module))
                    .font(MeeshyFont.relative(13, weight: .medium))
                    .foregroundColor(Color(hex: accentColor))
            }

            Button {
                HapticFeedback.medium()
                showConfirm = true
            } label: {
                HStack(spacing: 8) {
                    if viewModel.isPurging {
                        ProgressView().scaleEffect(0.7)
                    } else {
                        Image(systemName: "trash.fill")
                            .font(MeeshyFont.relative(14, weight: .medium))
                    }
                    Text(purgeButtonTitle)
                        .font(MeeshyFont.relative(14, weight: .semibold))
                }
                .foregroundColor(viewModel.hasSelection ? MeeshyColors.error : theme.textMuted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(MeeshyColors.error.opacity(viewModel.hasSelection ? 0.12 : 0.04))
                )
            }
            .disabled(!viewModel.hasSelection || viewModel.isPurging)
            // Le libellé est dynamique (« Vider — jusqu'à 42 Mo ») : il annonce
            // le volume, pas la conséquence. Pour l'action la plus destructive
            // de l'écran, le hint est ce qui dit que c'est définitif — les
            // en-têtes de type en ont un depuis toujours, ce bouton était le
            // seul à ne pas en avoir.
            .accessibilityHint(String(
                localized: "settings.cache.purge.action.hint",
                defaultValue: "Supprime définitivement les données sélectionnées ; elles seront retéléchargées à la demande",
                bundle: .module
            ))
        }
    }

    private var purgeButtonTitle: String {
        guard viewModel.hasSelection else {
            return String(localized: "settings.cache.purge.action.empty",
                          defaultValue: "Sélectionnez ce qu'il faut vider", bundle: .module)
        }
        // « Jusqu'à » : un fichier partagé par deux domaines est compté dans
        // les deux cases, donc la somme est un majorant (cf. `selectedBytes`).
        let size = Self.formatBytes(viewModel.selectedBytes)
        return String(
            format: String(localized: "settings.cache.purge.action.withSize",
                           defaultValue: "Vider — jusqu'à %@", bundle: .module),
            size
        )
    }

    // MARK: - Habillage

    private func sectionBackground(tint: String) -> some View {
        RoundedRectangle(cornerRadius: 16)
            .fill(theme.surfaceGradient(tint: tint))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(theme.border(tint: tint), lineWidth: 1)
            )
    }

    // MARK: - Libellés

    static func label(for kind: CacheDataKind) -> String {
        switch kind {
        case .images:
            return String(localized: "settings.cache.kind.images", defaultValue: "Images", bundle: .module)
        case .videos:
            return String(localized: "settings.cache.kind.videos", defaultValue: "Vidéos", bundle: .module)
        case .audio:
            return String(localized: "settings.cache.kind.audio", defaultValue: "Sons", bundle: .module)
        case .documents:
            return String(localized: "settings.cache.kind.documents", defaultValue: "Documents", bundle: .module)
        case .messages:
            return String(localized: "settings.cache.kind.messages", defaultValue: "Messages", bundle: .module)
        case .reactions:
            return String(localized: "settings.cache.kind.reactions", defaultValue: "Réactions", bundle: .module)
        case .payloads:
            return String(localized: "settings.cache.kind.payloads", defaultValue: "Données", bundle: .module)
        }
    }

    static func label(for domain: CacheDomain) -> String {
        switch domain {
        case .posts:
            return String(localized: "settings.cache.domain.posts", defaultValue: "Publications", bundle: .module)
        case .reels:
            return String(localized: "settings.cache.domain.reels", defaultValue: "Réels", bundle: .module)
        case .conversations:
            return String(localized: "settings.cache.domain.conversations", defaultValue: "Conversations", bundle: .module)
        case .stories:
            return String(localized: "settings.cache.domain.stories", defaultValue: "Stories", bundle: .module)
        }
    }

    static func explanation(for limitation: CachePurgeLimitation) -> String {
        switch limitation {
        case .noDedicatedStore:
            return String(
                localized: "settings.cache.limitation.noStore",
                defaultValue: "Les documents ne sont pas conservés en cache : il n'y a rien à libérer.",
                bundle: .module
            )
        case .embeddedInPayload:
            return String(
                localized: "settings.cache.limitation.embedded",
                defaultValue: "Les réactions font partie du contenu qui les porte et n'occupent pas d'entrée propre.",
                bundle: .module
            )
        case .indivisibleFromPosts:
            return String(
                localized: "settings.cache.limitation.indivisible",
                defaultValue: "Les données des réels et des publications partagent le même stockage : videz la ligne Publications.",
                bundle: .module
            )
        case .notApplicable:
            return String(
                localized: "settings.cache.limitation.notApplicable",
                defaultValue: "Sans objet pour ce domaine.",
                bundle: .module
            )
        }
    }

    static func icon(for kind: CacheDataKind) -> String {
        switch kind {
        case .images: return "photo.fill"
        case .videos: return "video.fill"
        case .audio: return "waveform"
        case .documents: return "doc.fill"
        case .messages: return "bubble.left.fill"
        case .reactions: return "heart.fill"
        case .payloads: return "externaldrive.fill"
        }
    }

    static func formatBytes(_ bytes: Int) -> String {
        AudioPlayerView.formatBytes(Int64(bytes))
    }
}
