import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les sections de la face Actions d'un autre que l'app lit (#19433, planche `Autre-Actions`) : Talkie, « Ensemble »,
/// « Son téléphone », et dans « Sa fiche » ses nouveautés et notre cercle. Chacune lit le MÊME modèle de cercle que la
/// pilule et « Notre cercle » (cache d'abord) et ne rend rien sous le cercle qui l'ouvre (loi 4) : ni titre, ni trou —
/// chaque section porte son propre espace.
struct ProfileActionsPartContent: View {
    let part: ProfileActionsPart
    let request: ProfileLiveRequest

    var body: some View {
        switch part {
        case .talkie:
            ProfileTalkieSection(request: request).id(request.userId)
        case .together:
            ProfileTogetherSection(request: request).id(request.userId)
        case .phone:
            ProfilePhoneSection(request: request).id(request.userId)
        case .newsNotify:
            ProfileNewsNotifyRow(userId: request.userId, tint: request.tint).id(request.userId)
        case .circle:
            ProfileOurCircleRow(userId: request.userId, displayName: request.displayName).id(request.userId)
        case .nextCircle:
            ProfileNextCircleSection(request: request).id(request.userId)
        }
    }
}

// MARK: - Pour aller plus loin

/// « Pour aller plus loin » d'un lien servi (#19674) : les cercles qu'il reste à gagner depuis le cercle commun, le
/// chemin de chacun, et sous le prochain, où en est la série telle que le serveur la sert. Sans lien, la fiche la pose
/// elle-même sous la demande d'ami ; au Sang, rien.
private struct ProfileNextCircleSection: View {
    let request: ProfileLiveRequest
    @StateObject private var circle: ProfileCircleViewModel

    init(request: ProfileLiveRequest) {
        self.request = request
        _circle = StateObject(wrappedValue: ProfileCircleModels.model(for: request.userId))
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear.frame(height: 0).accessibilityHidden(true)
            if circle.shownLevel != nil, !ProfileNextCircleLadder.steps(above: circle.toolGateLevel).isEmpty {
                ProfileNextCircles(level: circle.toolGateLevel, name: request.displayName, tint: request.tint,
                                   progress: circle.summary)
                    .padding(.bottom, MeeshySpacing.xxl)
            }
        }
    }
}

// MARK: - Talkie

/// La carte « Talkie », dès Proche.
private struct ProfileTalkieSection: View {
    let request: ProfileLiveRequest
    @StateObject private var circle: ProfileCircleViewModel

    init(request: ProfileLiveRequest) {
        self.request = request
        _circle = StateObject(wrappedValue: ProfileCircleModels.model(for: request.userId))
    }

    var body: some View {
        if circle.offersTalkie {
            ProfileTalkieRow(userId: request.userId, displayName: request.displayName, tint: request.tint)
        }
    }
}

// MARK: - Ensemble

/// « Ensemble » : regarder et écouter ensemble et lui envoyer un contenu dès Proche, Bring dès Ami avec son compteur du
/// jour.
private struct ProfileTogetherSection: View {
    let request: ProfileLiveRequest
    @StateObject private var circle: ProfileCircleViewModel
    @StateObject private var bring: ProfileBringViewModel
    @State private var picking: TogetherMediaKind?
    @State private var sendingContent = false

    init(request: ProfileLiveRequest) {
        self.request = request
        _circle = StateObject(wrappedValue: ProfileCircleModels.model(for: request.userId))
        _bring = StateObject(wrappedValue: ProfileBringViewModel(userId: request.userId))
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear.frame(height: 0).accessibilityHidden(true)
            if circle.offersTogether || (circle.offersBring && bring.isOffered) {
                section
            }
        }
        .task(id: circle.offersBring) {
            if circle.offersBring { await bring.load() }
        }
        .adaptiveOnChange(of: bring.notice) { _, new in
            guard let new else { return }
            FeedbackToastManager.shared.showError(new)
            bring.notice = nil
        }
        .sheet(isPresented: isPicking) {
            if let media = picking {
                ProfileTogetherPicker(userId: request.userId, displayName: request.displayName, media: media,
                                      tint: request.tint)
            }
        }
        .sheet(isPresented: $sendingContent) {
            ProfileSendContentSheet(userId: request.userId, displayName: request.displayName, tint: request.tint)
        }
    }

    private var section: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileActionsWording.together)
            MeeshyActionGrid {
                if circle.offersTogether {
                    MeeshyLabeledAction(title: TogetherRowWording.watch, systemImage: "play.rectangle.on.rectangle",
                                        tint: request.tint, action: { picking = .video })
                        .accessibilityIdentifier("together.watch")
                    MeeshyLabeledAction(title: TogetherRowWording.listen, systemImage: "headphones",
                                        tint: request.tint, action: { picking = .audio })
                        .accessibilityIdentifier("together.listen")
                }
                if circle.offersBring {
                    ProfileBringAction(viewModel: bring, displayName: request.displayName, tint: request.tint)
                }
                if circle.offersTogether {
                    MeeshyLabeledAction(title: ProfileSendContentCopy.title, systemImage: ProfileSendContentCopy.glyph,
                                        tint: request.tint, action: { sendingContent = true })
                        .accessibilityIdentifier("together.sendContent")
                }
            }
            if circle.offersBring {
                ProfileBringRow(viewModel: bring, displayName: request.displayName)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, MeeshySpacing.xxl)
    }

    private var isPicking: Binding<Bool> {
        Binding(get: { picking != nil }, set: { if !$0 { picking = nil } })
    }
}

// MARK: - Son téléphone

/// « Son téléphone », dès Proche : la batterie et le réseau en tuiles (les mêmes que la Vitrine), la cause probable
/// d'une injoignabilité, « Me prévenir s'il devient injoignable », puis mes partages avec lui.
private struct ProfilePhoneSection: View {
    let request: ProfileLiveRequest
    @StateObject private var circle: ProfileCircleViewModel
    @State private var battery: BatteryReaderState?
    @State private var unreachable: PhoneReachabilityState?

    init(request: ProfileLiveRequest) {
        self.request = request
        _circle = StateObject(wrappedValue: ProfileCircleModels.model(for: request.userId))
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear.frame(height: 0).accessibilityHidden(true)
            if circle.offersBattery || circle.offersPhoneReachability {
                TimelineView(.periodic(from: .now, by: 30)) { context in
                    section(now: context.date)
                }
            }
        }
        .task(id: request.userId) {
            battery = nil
            for await next in BatteryLiveState.stream(of: request.userId).values { battery = next }
        }
        .task(id: request.userId) {
            unreachable = nil
            for await next in PhoneReachabilityLiveState.stream(of: request.userId).values { unreachable = next }
        }
        .adaptiveOnChange(of: circle.offersBattery) { _, offered in if !offered { battery = nil } }
        .adaptiveOnChange(of: circle.offersPhoneReachability) { _, offered in if !offered { unreachable = nil } }
    }

    /// Un relevé n'est rendu qu'au cercle qui l'ouvre : passé sous lui, la dernière valeur en mémoire ne se montre plus.
    private func section(now: Date) -> some View {
        let shownUnreachable = circle.offersPhoneReachability ? unreachable : nil
        return VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileActionsWording.phone)
            InactivityAlertDetailSection(userId: request.userId)
            if let board = ProfileLiveBoard.resolve(
                level: circle.toolGateLevel, place: nil,
                battery: circle.offersBattery ? ProfileLiveSourceRules.battery(battery, now: now) : nil,
                unreachableSince: shownUnreachable?.unreachableSince,
                isOnline: request.isOnline, staleAge: request.staleAge
            ) {
                ProfileDeviceTiles(board: board, now: now)
            }
            if let state = shownUnreachable, let cause = PhoneReachabilityWording.cause(state.cause) {
                MeeshyNote(cause, lead: .systemImage("info.circle"))
            }
            if circle.offersPhoneReachability {
                ProfilePhoneReachabilityRow(userId: request.userId, displayName: request.displayName,
                                            asksConsent: circle.phoneReachabilityAsksConsent, showsDetail: false,
                                            tint: request.tint)
            }
            if circle.offersBattery {
                ProfileBatteryRow(userId: request.userId, displayName: request.displayName,
                                  canPull: circle.offersBatteryPull, asksConsent: circle.batteryAsksConsent,
                                  showsDetail: false)
            }
            if circle.offersInactivity {
                ProfileInactivityRow(userId: request.userId, tint: request.tint)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, MeeshySpacing.xxl)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("profile.actions.phone")
    }
}

// MARK: - Sa fiche : ses nouveautés

/// « Notifications de ses nouveautés » : une exception par personne au cran par cercle (#14062). La rangée n'existe
/// que lorsque la passerelle sert le choix (#19434) ; elle porte son filet, la rangée d'avant n'en sait rien.
private struct ProfileNewsNotifyRow: View {
    @StateObject private var viewModel: CircleReceptionBlockViewModel
    let tint: Color

    init(userId: String, tint: Color) {
        _viewModel = StateObject(wrappedValue: CircleReceptionBlockViewModel(userId: userId, personSwitch: .subscription(.news)))
        self.tint = tint
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear.frame(height: 0).accessibilityHidden(true)
            if viewModel.isServed {
                MeeshyToggleRow(ProfileActionsWording.newsNotify, systemImage: "bell",
                                accessory: .toggle(isOn: viewModel.isOn), showsDivider: true, tint: tint) {
                    Task { await viewModel.setOn(!viewModel.isOn) }
                }
                .disabled(viewModel.isSaving)
                .accessibilityIdentifier("profile.actions.newsNotify")
            }
        }
        .task(id: viewModel.userId) { await viewModel.load() }
        .adaptiveOnChange(of: viewModel.notice) { _, new in
            guard let new else { return }
            FeedbackToastManager.shared.showError(new)
            viewModel.notice = nil
        }
    }
}

/// Les mots des sections de la face Actions lues par l'app.
enum ProfileActionsWording {
    static var together: String {
        String(localized: "profile.actions.together", defaultValue: "Ensemble", bundle: .main)
    }

    static var phone: String {
        String(localized: "profile.actions.phone", defaultValue: "Son téléphone", bundle: .main)
    }

    static var newsNotify: String {
        String(localized: "profile.actions.newsNotify", defaultValue: "Notifications de ses nouveautés", bundle: .main)
    }

    static func ourCircleHint(name: String) -> String {
        String(format: String(localized: "profile.actions.ourCircle.hint", defaultValue: "Ouvre ce que vous partagez, %@ et toi", bundle: .main), name)
    }
}
