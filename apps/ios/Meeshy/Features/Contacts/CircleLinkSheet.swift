import SwiftUI
import MeeshySDK
import MeeshyUI

/// La fiche d'un lien (#13938) : la personne, son niveau et ce qu'il ouvre, ce qui manque pour monter, et les réglages
/// PAR PERSONNE — écoute, talkie, Bring. « Bloquer ses Bring » (#13936), « Couper son talkie » (#16673) et « Ce que
/// j'écoute » (#16803) sont ACTIFS ; la position en direct n'existe côté serveur qu'avec son lot du jalon 2. Tant qu'il
/// n'est pas livré, son interrupteur n'est PAS rendu (épure #18088) : un interrupteur sans effet est un mensonge, et
/// l'excuser est du texte en trop. Une section sans réglage n'est pas rendue non plus.
struct CircleLinkSheet: View {
    @ObservedObject var viewModel: CirclesViewModel
    let row: CirclesViewModel.Row
    @ObservedObject private var locks: BloodLockCenter = BloodLockHolder.center()
    @State private var confirmsLowering = false
    @State private var isLowering = false
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }

    private var name: String { viewModel.name(of: row.id, fallback: row.person?.name) }
    private var level: RelationLevel { row.link.effectiveLevel }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                    header
                    if let line = CircleProgressSummary.make(row.link).text(levelTitle: { viewModel.title(of: $0) }) {
                        Text(line).font(.subheadline).foregroundStyle(theme.textSecondary)
                    }
                    if lock.isLocked {
                        bloodLockedSection
                    } else if !settings.isEmpty {
                        settingsSection
                    }
                }
                .padding(MeeshySpacing.xl)
            }
            .background(theme.backgroundPrimary.ignoresSafeArea())
            .task(id: row.id) { await locks.refresh(row.id) }
            .navigationTitle(name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "circles.sheet.close", defaultValue: "Fermer", bundle: .main)) { dismiss() }
                }
            }
        }
    }

    private var header: some View {
        HStack(spacing: MeeshySpacing.mdPlus) {
            LivePresence { MeeshyAvatar(
                name: name,
                context: .userListItem,
                accentColor: DynamicColorGenerator.colorForName(name),
                avatarURL: row.person?.avatarURL,
                presenceState: PresenceManager.shared.knownPresenceState(for: row.id),
                ring: row.person?.ring
            ) }
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(name).font(.headline).foregroundStyle(theme.textPrimary)
                Text("\(viewModel.icon(of: level)) \(viewModel.title(of: level))")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(CircleLevelColor.color(for: level))
                Text(CircleLevelNames.opens(of: level))
                    .font(.footnote)
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// Entre Sangs, rien ne se coupe (#20359) : aucun interrupteur, une seule porte — redescendre à Proche, où chaque
    /// élément suit le choix de la personne. Le geste est la baisse ordinaire de « Notre cercle » : silencieuse, immédiate.
    private var bloodLockedSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            MeeshyButton(BloodLockWording.restrictAction, systemImage: "arrow.down.circle", kind: .outline,
                         width: .fill, isPending: isLowering, action: { confirmsLowering = true })
                .accessibilityIdentifier("circles.bloodLocked.restrict")
        }
        .confirmationDialog(ProfileCircleLowering.demote(.close).confirmationTitle(name: name),
                            isPresented: $confirmsLowering, titleVisibility: .visible) {
            Button(ProfileCircleLowering.demote(.close).label, role: .destructive) { Task { await lowerToClose() } }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        } message: {
            Text(ProfileCircleLowering.demote(.close).confirmationBody(name: name, from: .blood))
        }
    }

    private func lowerToClose() async {
        isLowering = true
        defer { isLowering = false }
        let model = ProfileCircleModels.model(for: row.id)
        await model.load()
        guard await model.lower(.demote(.close)) else { return }
        await viewModel.load(forceNetwork: true)
        dismiss()
    }

    private var lock: RelationBloodLock { locks.lock(for: row.id) }

    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(String(localized: "circles.sheet.settings.title", defaultValue: "Réglages pour cette personne", bundle: .main))
                .font(.subheadline.weight(.bold))
                .foregroundStyle(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            ForEach(settings) { setting in
                if let personSwitch = setting.personSwitch {
                    CircleReceptionBlockToggle(
                        userId: row.id,
                        personSwitch: personSwitch,
                        title: setting.title,
                        detail: setting.detail,
                        note: setting.infoNote,
                        identifier: "circles.settings.\(setting.rawValue)"
                    )
                }
            }
        }
    }

    /// Les réglages que ce cercle ouvre ET dont le serveur sert l'état (jalon 2, #14229).
    private var settings: [CirclePersonSetting] { CirclePersonSetting.shown(at: level) }
}
