import SwiftUI
import MeeshySDK

// MARK: - La Vitrine d'un autre, faite du kit (#18857, planche `Autre-Vitrine`, loi 12)
//
// Sous le nom et la pilule de relation : la bio, puis ses puces (K41) — langues, pays, heure chez lui, chiffrement —,
// sans section « À propos » ni carte de bio. Plus bas : « Sa voix » (K44 + K35, « Échantillon ») et « En chiffres »
// (K44, « Membre depuis » en tête, puis la bande K34).

/// La bio et les puces d'identité, dans l'ordre de la planche. Rien de servi ⇒ rien de posé.
struct ProfileIdentityChips: View {
    let user: ProfileSheetUser

    @ResolvedThemePalette private var theme

    var body: some View {
        let languages = Self.languageNames(system: user.systemLanguage, regional: user.regionalLanguage)
        let hasChips = !languages.isEmpty || user.registrationCountry != nil || user.timezone != nil || user.hasE2EE
        let bio = user.bio?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !bio.isEmpty || hasChips {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                if !bio.isEmpty {
                    Text(verbatim: bio)
                        .font(.callout)
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(5)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityIdentifier("profile.vitrine.bio")
                }
                if hasChips {
                    FlowLayout(spacing: MeeshySpacing.xsPlus) {
                        chips(languages: languages)
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("profile.vitrine.chips")
                }
            }
        }
    }

    @ViewBuilder
    private func chips(languages: [String]) -> some View {
        if !languages.isEmpty {
            MeeshyBadge(.label(languages.joined(separator: " · ")), leading: .systemImage("translate"), lineLimit: 2)
        }
        if let country = user.registrationCountry {
            MeeshyBadge(.label("\(CountryFlag.emoji(for: country)) \(CountryFlag.name(for: country) ?? country)"),
                        lineLimit: 2)
        }
        if let timezone = user.timezone {
            TimelineView(.everyMinute) { context in
                MeeshyBadge(.label(ProfileVitrineCopy.localTime(timezone: timezone, name: user.resolvedDisplayName,
                                                                now: context.date)),
                            leading: .systemImage("clock"), lineLimit: 2)
            }
        }
        if user.hasE2EE {
            ProfileE2EEBadge()
        }
    }

    /// Sa langue principale, puis sa langue régionale quand elle diffère : les noms, dans la langue du téléphone.
    static func languageNames(system: String?, regional: String?) -> [String] {
        let primary = LanguageDisplay.from(code: system)
        let secondary = LanguageDisplay.from(code: regional).flatMap { $0.code == primary?.code ? nil : $0 }
        return [primary, secondary].compactMap { $0?.name }
    }
}

/// « Sa voix » (K44) : l'échantillon que la personne rend public, sur le lecteur d'onde du kit (K35). Un seul son à la
/// fois, arrêté en quittant la fiche.
struct ProfileVoiceSample: View {
    let url: String
    let durationMs: Int?
    let tint: Color

    @StateObject private var player = AudioPlaybackManager(registerWithCoordinator: true)

    var body: some View {
        let isLoaded = player.currentUrl == url
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileVitrineCopy.voiceTitle)
            MeeshyGroupCard {
                MeeshyWavePlayer(
                    label: ProfileVitrineCopy.voiceSample,
                    progress: isLoaded ? player.progress : 0,
                    isPlaying: isLoaded && player.isPlaying,
                    duration: Double(durationMs ?? 0) / 1000,
                    tint: tint,
                    phase: isLoaded && player.isLoading ? .buffering : .ready,
                    onToggle: { toggle() },
                    onScrub: scrub(isLoaded: isLoaded),
                    onScrubbingChange: nil,
                    trailing: {
                        MeeshyBadge(.label(ProfileVitrineCopy.voiceSample), leading: .systemImage("waveform"))
                            .accessibilityHidden(true)
                    }
                )
            }
        }
        .accessibilityIdentifier("profile.vitrine.voice")
        .onDisappear { player.stop() }
    }

    /// Le glissement n'existe que sur l'échantillon chargé.
    private func scrub(isLoaded: Bool) -> ((Double) -> Void)? {
        guard isLoaded else { return nil }
        return { fraction in player.seek(to: fraction) }
    }

    private func toggle() {
        if player.currentUrl == url {
            player.togglePlayPause()
        } else {
            player.play(urlString: url)
        }
    }
}

/// « En chiffres » (K44) : « Membre depuis janv. 2026 » en tête, puis la bande de chiffres (K34). Les chiffres sont
/// lus avec le profil (#10093), cache d'abord ; le squelette du kit ne se montre que sur un cache vide.
struct ProfileFiguresSection: View {
    let memberSince: Date?
    let stats: UserStats?
    let isLoadingStats: Bool

    @Environment(\.locale) private var locale

    var body: some View {
        let showsBand = ProfileVitrineFigures.isVisible(stats: stats, isLoading: isLoadingStats)
        if memberSince != nil || showsBand {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: ProfileVitrineCopy.figuresTitle, lead: { EmptyView() }, accessory: {
                    if let memberSince {
                        MeeshyBadge(.label(ProfileVitrineCopy.memberSince(memberSince, locale: locale)),
                                    leading: .systemImage("calendar"))
                            .accessibilityIdentifier("profile.vitrine.memberSince")
                    }
                })
                if showsBand {
                    MeeshyFigureBand(items: ProfileVitrineFigures.items(of: stats), size: .compact,
                                     isLoading: stats == nil && isLoadingStats,
                                     emptyLabel: ProfileVitrineFigures.emptyLabel)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityIdentifier("profile.vitrine.figures")
                }
            }
        }
    }
}
