import SwiftUI
import MeeshySDK

struct AffiliateView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel = AffiliateViewModel()
    @State private var showCreateSheet = false

    private let accentColor = "2ECC71"

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }
        }
        .sheet(isPresented: $showCreateSheet) {
            AffiliateCreateView { token in
                viewModel.tokens.insert(token, at: 0)
            }
            .presentationDetents([.medium])
        }
        .task { await viewModel.load() }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Text("Parrainage")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Button {
                HapticFeedback.light()
                showCreateSheet = true
            } label: {
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: 22))
                    .foregroundColor(Color(hex: accentColor))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                statsOverview
                tokensSection
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    // MARK: - Stats Overview

    private var statsOverview: some View {
        HStack(spacing: 12) {
            affiliateStatCard(
                value: "\(viewModel.tokens.count)",
                label: "Liens",
                color: accentColor,
                icon: "link"
            )
            affiliateStatCard(
                value: "\(viewModel.tokens.reduce(0) { $0 + $1.referralCount })",
                label: "Inscrits",
                color: accentColor,
                icon: "person.fill.checkmark"
            )
            affiliateStatCard(
                value: "\(viewModel.tokens.reduce(0) { $0 + $1.clickCount })",
                label: "Clics",
                color: accentColor,
                icon: "cursorarrow.click"
            )
        }
    }

    private func affiliateStatCard(value: String, label: String, color: String, icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(Color(hex: color))

            Text(value)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))

            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: color))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: color), lineWidth: 1)
                )
        )
    }

    // MARK: - Tokens Section

    private var tokensSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "link.badge.plus")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
                Text("MES LIENS")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: accentColor))
                    .tracking(1.2)
            }
            .padding(.leading, 4)

            if viewModel.tokens.isEmpty {
                emptyTokensState
            } else {
                VStack(spacing: 0) {
                    ForEach(viewModel.tokens) { token in
                        tokenRow(token)
                        if token.id != viewModel.tokens.last?.id {
                            Divider().background(theme.textMuted.opacity(0.1))
                        }
                    }
                }
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(theme.surfaceGradient(tint: accentColor))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(theme.border(tint: accentColor), lineWidth: 1)
                        )
                )
            }
        }
    }

    private var emptyTokensState: some View {
        VStack(spacing: 12) {
            Image(systemName: "link")
                .font(.system(size: 36))
                .foregroundColor(Color(hex: accentColor).opacity(0.4))

            Text("Aucun lien de parrainage")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            Text("Creez un lien pour inviter vos amis")
                .font(.system(size: 12))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(theme.border(tint: accentColor), lineWidth: 1)
                )
        )
    }

    private func tokenRow(_ token: AffiliateToken) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(token.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    Label("\(token.clickCount) clics", systemImage: "cursorarrow.click")
                        .font(.system(size: 12))
                        .foregroundColor(theme.textMuted)
                    Text("·")
                        .foregroundColor(theme.textMuted)
                    Label("\(token.referralCount) inscrit(s)", systemImage: "person.fill.checkmark")
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "2ECC71"))
                }
            }

            Spacer()

            Button {
                if let link = token.affiliateLink {
                    UIPasteboard.general.string = link
                    HapticFeedback.success()
                }
            } label: {
                Image(systemName: "doc.on.doc")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(hex: accentColor))
            }

            // Partager
            Button {
                guard let link = token.affiliateLink, let url = URL(string: link) else { return }
                let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                   let window = scene.windows.first,
                   let root = window.rootViewController {
                    root.present(av, animated: true)
                }
            } label: {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 16))
                    .foregroundColor(Color(hex: "2ECC71"))
            }

            Button {
                Task { await viewModel.deleteToken(token) }
            } label: {
                Image(systemName: "trash")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(hex: "EF4444"))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
}

// MARK: - ViewModel

@MainActor
final class AffiliateViewModel: ObservableObject {
    @Published var tokens: [AffiliateToken] = []
    @Published var isLoading = false

    func load() async {
        isLoading = true
        do {
            tokens = try await AffiliateService.shared.listTokens()
        } catch {}
        isLoading = false
    }

    func deleteToken(_ token: AffiliateToken) async {
        do {
            try await AffiliateService.shared.deleteToken(id: token.id)
            tokens.removeAll { $0.id == token.id }
            HapticFeedback.success()
        } catch {
            HapticFeedback.error()
        }
    }
}
