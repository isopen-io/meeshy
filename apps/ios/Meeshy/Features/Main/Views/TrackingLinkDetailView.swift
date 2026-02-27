import SwiftUI
import MeeshySDK

struct TrackingLinkDetailView: View {
    let link: TrackingLink

    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel: TrackingDetailViewModel
    @State private var copiedFeedback = false
    @State private var showDeleteConfirm = false
    @Environment(\.dismiss) private var dismiss

    init(link: TrackingLink) {
        self.link = link
        _viewModel = StateObject(wrappedValue: TrackingDetailViewModel(token: link.token))
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 20) {
                    headerCard.padding(.horizontal, 16)
                    actionsBar.padding(.horizontal, 16)
                    mainStatsSection.padding(.horizontal, 16)
                    if !viewModel.clicks.isEmpty {
                        geoBreakdown.padding(.horizontal, 16)
                        deviceBreakdown.padding(.horizontal, 16)
                        clicksTimeline.padding(.horizontal, 16)
                    }
                    utmInfoSection.padding(.horizontal, 16)
                }
                .padding(.top, 16).padding(.bottom, 60)
            }
        }
        .navigationTitle(link.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .confirmationDialog("Supprimer ce lien ?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Supprimer", role: .destructive) { deleteLink() }
            Button("Annuler", role: .cancel) {}
        }
    }

    // MARK: - Header card

    private var headerCard: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle().fill(Color(hex: link.isActive ? "A855F7" : "888888").opacity(0.15))
                    .frame(width: 60, height: 60)
                Image(systemName: "chart.bar.fill").font(.system(size: 26))
                    .foregroundColor(Color(hex: link.isActive ? "A855F7" : "888888"))
            }
            Text(link.displayName).font(.system(size: 18, weight: .bold)).foregroundColor(theme.textPrimary)
            Text(link.shortUrl).font(.system(size: 12, design: .monospaced))
                .foregroundColor(theme.textSecondary).lineLimit(1)
            HStack(spacing: 6) {
                if let c = link.campaign { utmTag(c, color: "A855F7") }
                if let s = link.source { utmTag(s, color: "6366F1") }
                if let m = link.medium { utmTag(m, color: "08D9D6") }
            }
        }
        .padding(20).frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 20).fill(theme.surfaceGradient(tint: "A855F7"))
            .overlay(RoundedRectangle(cornerRadius: 20)
                .stroke(Color(hex: "A855F7").opacity(0.2), lineWidth: 1)))
    }

    private func utmTag(_ value: String, color: String) -> some View {
        Text(value).font(.system(size: 11, weight: .medium))
            .foregroundColor(Color(hex: color))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(Color(hex: color).opacity(0.12)))
    }

    // MARK: - Actions bar

    private var actionsBar: some View {
        HStack(spacing: 10) {
            detailActionButton("Copier", icon: copiedFeedback ? "checkmark" : "doc.on.doc",
                               color: copiedFeedback ? "2ECC71" : "A855F7") {
                UIPasteboard.general.string = link.shortUrl
                HapticFeedback.success()
                withAnimation { copiedFeedback = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { withAnimation { copiedFeedback = false } }
            }
            detailActionButton("Partager", icon: "square.and.arrow.up", color: "A855F7") {
                guard let url = URL(string: link.shortUrl) else { return }
                let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                presentVC(av)
            }
            detailActionButton("QR Code", icon: "qrcode", color: "6366F1") {
                generateQRAndShare()
            }
            detailActionButton("Supprimer", icon: "trash", color: "FF2E63") {
                showDeleteConfirm = true
            }
        }
    }

    private func detailActionButton(_ label: String, icon: String, color: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 5) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12).fill(Color(hex: color).opacity(0.15))
                        .frame(width: 46, height: 46)
                    Image(systemName: icon).font(.system(size: 18))
                        .foregroundColor(Color(hex: color))
                }
                Text(label).font(.system(size: 9, weight: .medium)).foregroundColor(theme.textSecondary)
            }
        }.frame(maxWidth: .infinity)
    }

    // MARK: - Main stats

    private var mainStatsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("STATISTIQUES")
            HStack(spacing: 12) {
                bigStatCard("\(link.totalClicks)", label: "Total clics", icon: "cursorarrow.click", color: "A855F7")
                bigStatCard("\(link.uniqueClicks)", label: "Clics uniques", icon: "person.fill", color: "6366F1")
            }
            if let last = link.lastClickedAt {
                HStack {
                    Image(systemName: "clock").foregroundColor(theme.textMuted)
                    Text("Dernier clic : \(last.formatted(date: .abbreviated, time: .shortened))")
                        .font(.system(size: 13)).foregroundColor(theme.textMuted)
                }
                .padding(.horizontal, 4)
            }
        }
    }

    private func bigStatCard(_ value: String, label: String, icon: String, color: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 24)).foregroundColor(Color(hex: color))
            VStack(alignment: .leading, spacing: 2) {
                Text(value).font(.system(size: 26, weight: .bold)).foregroundColor(theme.textPrimary)
                Text(label).font(.system(size: 12)).foregroundColor(theme.textSecondary)
            }
            Spacer()
        }
        .padding(14).frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 14).fill(theme.surfaceGradient(tint: color))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: color).opacity(0.2), lineWidth: 1)))
    }

    // MARK: - Geo breakdown

    private var geoBreakdown: some View {
        breakdownCard(title: "PAYS", icon: "globe", color: "08D9D6", items: viewModel.topCountries)
    }

    // MARK: - Device breakdown

    private var deviceBreakdown: some View {
        VStack(spacing: 12) {
            breakdownCard(title: "APPAREILS", icon: "iphone", color: "6366F1", items: viewModel.topDevices)
            breakdownCard(title: "NAVIGATEURS", icon: "safari.fill", color: "2ECC71", items: viewModel.topBrowsers)
        }
    }

    private func breakdownCard(title: String, icon: String, color: String, items: [(String, Int)]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: icon).font(.system(size: 13)).foregroundColor(Color(hex: color))
                sectionTitle(title)
            }
            if items.isEmpty {
                Text("Aucune donnée").font(.system(size: 13)).foregroundColor(theme.textMuted)
                    .frame(maxWidth: .infinity, alignment: .center).padding(.vertical, 8)
            } else {
                VStack(spacing: 8) {
                    ForEach(items.prefix(5), id: \.0) { item in
                        breakdownRow(item.0, count: item.1, total: link.totalClicks, color: color)
                    }
                }
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 16)
            .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.white.opacity(0.08), lineWidth: 1)))
    }

    private func breakdownRow(_ label: String, count: Int, total: Int, color: String) -> some View {
        let pct = total > 0 ? CGFloat(count) / CGFloat(total) : 0
        return HStack(spacing: 8) {
            Text(label).font(.system(size: 13)).foregroundColor(theme.textPrimary).frame(width: 80, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4).fill(Color(hex: color).opacity(0.15)).frame(height: 8)
                    RoundedRectangle(cornerRadius: 4).fill(Color(hex: color).opacity(0.7))
                        .frame(width: geo.size.width * pct, height: 8)
                }
            }
            .frame(height: 8)
            Text("\(count)").font(.system(size: 12, weight: .semibold)).foregroundColor(theme.textSecondary)
                .frame(width: 30, alignment: .trailing)
        }
    }

    // MARK: - Timeline des clics

    private var clicksTimeline: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "list.bullet.clipboard").font(.system(size: 13))
                    .foregroundColor(Color(hex: "A855F7"))
                sectionTitle("DERNIERS CLICS")
                Spacer()
                if viewModel.isLoadingMore { ProgressView().scaleEffect(0.7) }
            }
            VStack(spacing: 0) {
                ForEach(Array(viewModel.clicks.prefix(20).enumerated()), id: \.element.id) { idx, click in
                    clickRow(click)
                    if idx < min(viewModel.clicks.count, 20) - 1 {
                        Divider().padding(.leading, 52)
                    }
                }
            }
            .background(RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03)))
        }
    }

    private func clickRow(_ click: TrackingLinkClick) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(deviceColor(click.device).opacity(0.12)).frame(width: 36, height: 36)
                Image(systemName: deviceIcon(click.device)).font(.system(size: 14))
                    .foregroundColor(deviceColor(click.device))
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    if let country = click.country { Text(countryFlag(country)).font(.system(size: 16)) }
                    Text(click.city ?? click.country ?? "Inconnu")
                        .font(.system(size: 13, weight: .medium)).foregroundColor(theme.textPrimary)
                    if let social = click.socialSource {
                        Text("· \(social)").font(.system(size: 12)).foregroundColor(Color(hex: "A855F7"))
                    }
                }
                HStack(spacing: 4) {
                    if let browser = click.browser {
                        Text(browser).font(.system(size: 11)).foregroundColor(theme.textMuted)
                    }
                    if let os = click.os {
                        Text("· \(os)").font(.system(size: 11)).foregroundColor(theme.textMuted)
                    }
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(click.clickedAt.formatted(.relative(presentation: .named)))
                    .font(.system(size: 11)).foregroundColor(theme.textMuted)
                Circle().fill(click.redirectStatus == "confirmed" ? Color.green : Color.red)
                    .frame(width: 6, height: 6)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
    }

    // MARK: - UTM info

    private var utmInfoSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("CONFIGURATION UTM")
            VStack(spacing: 0) {
                if let c = link.campaign { infoRow("Campaign", value: c) }
                if link.campaign != nil && link.source != nil { Divider().padding(.leading, 16) }
                if let s = link.source { infoRow("Source", value: s) }
                if link.source != nil && link.medium != nil { Divider().padding(.leading, 16) }
                if let m = link.medium { infoRow("Medium", value: m) }
                Divider().padding(.leading, 16)
                infoRow("URL destination", value: link.originalUrl)
                Divider().padding(.leading, 16)
                infoRow("Créé le", value: link.createdAt.formatted(date: .abbreviated, time: .shortened))
            }
            .background(RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03)))
        }
    }

    // MARK: - Helpers

    private func sectionTitle(_ text: String) -> some View {
        Text(text).font(.system(size: 12, weight: .semibold)).foregroundColor(theme.textSecondary).kerning(0.8)
    }

    private func infoRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label).font(.system(size: 14)).foregroundColor(theme.textSecondary)
            Spacer()
            Text(value).font(.system(size: 14, weight: .medium)).foregroundColor(theme.textPrimary).lineLimit(1)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }

    private func deviceIcon(_ device: String?) -> String {
        switch device?.lowercased() {
        case "mobile", "phone": return "iphone"
        case "tablet": return "ipad"
        case "desktop": return "desktopcomputer"
        default: return "globe"
        }
    }

    private func deviceColor(_ device: String?) -> Color {
        switch device?.lowercased() {
        case "mobile", "phone": return Color(hex: "A855F7")
        case "tablet": return Color(hex: "6366F1")
        case "desktop": return Color(hex: "08D9D6")
        default: return Color(hex: "888888")
        }
    }

    private func countryFlag(_ countryCode: String) -> String {
        let base: UInt32 = 127397
        return countryCode.uppercased().unicodeScalars
            .compactMap { Unicode.Scalar(base + $0.value) }.map { String($0) }.joined()
    }

    private func generateQRAndShare() {
        guard let url = URL(string: link.shortUrl),
              let filter = CIFilter(name: "CIQRCodeGenerator") else { return }
        filter.setValue(url.absoluteString.data(using: .utf8), forKey: "inputMessage")
        filter.setValue("H", forKey: "inputCorrectionLevel")
        guard let ciImage = filter.outputImage else { return }
        let scaled = ciImage.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        let context = CIContext()
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return }
        let uiImage = UIImage(cgImage: cgImage)
        let av = UIActivityViewController(activityItems: [uiImage], applicationActivities: nil)
        presentVC(av)
    }

    private func presentVC(_ vc: UIViewController) {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first,
              let root = window.rootViewController else { return }
        root.present(vc, animated: true)
    }

    private func deleteLink() {
        Task {
            do {
                try await TrackingLinkService.shared.deleteLink(token: link.token)
                await MainActor.run { dismiss() }
            } catch { /* handle if needed */ }
        }
    }
}

// MARK: - ViewModel

@MainActor
class TrackingDetailViewModel: ObservableObject {
    @Published var clicks: [TrackingLinkClick] = []
    @Published var isLoadingMore = false

    let token: String

    init(token: String) { self.token = token }

    func load() async {
        isLoadingMore = true
        defer { isLoadingMore = false }
        if let detail = try? await TrackingLinkService.shared.fetchClicks(token: token) {
            clicks = detail.clicks
        }
    }

    var topCountries: [(String, Int)] {
        Dictionary(grouping: clicks.compactMap(\.country), by: { $0 })
            .map { ($0.key, $0.value.count) }
            .sorted { $0.1 > $1.1 }
    }

    var topDevices: [(String, Int)] {
        Dictionary(grouping: clicks.compactMap(\.device), by: { $0 })
            .map { ($0.key, $0.value.count) }
            .sorted { $0.1 > $1.1 }
    }

    var topBrowsers: [(String, Int)] {
        Dictionary(grouping: clicks.compactMap(\.browser), by: { $0 })
            .map { ($0.key, $0.value.count) }
            .sorted { $0.1 > $1.1 }
    }
}
