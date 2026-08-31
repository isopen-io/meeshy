import XCTest

/// Bidirectional consistency between the localization catalogs and the code.
///
/// Guards the `splash.tagline`-class bug where an identifier key referenced in
/// code renders RAW on screen because it does not resolve in the app's
/// development language (`en`): the app's `developmentRegion` is `en`, so a key
/// missing its `en` entry falls back to the key string itself, never to `fr`.
///
/// A second axis, added in 220i: a key carrying an inline `defaultValue:` can
/// never render raw, so the check above deliberately skips it — but that
/// `defaultValue` is written in the catalog's source language (`fr`). A key that
/// exists ONLY as a `defaultValue` therefore renders **French** on the six other
/// locales the app ships. Those calls look localized and are not, which is why
/// the backlog below is pinned and only ever allowed to shrink.
///
/// Scope: IDENTIFIER keys only (dot/underscore, no spaces — e.g.
/// `call.ended.missed`). Natural-text / format keys (`"Annuler"`, `"%@ membres"`)
/// are excluded on purpose — they never render as a raw identifier, and Xcode
/// normalizes interpolation (`"\(x) membres"` in code → `"%@ membres"` in the
/// catalog), which makes them unverifiable by static source scanning.
///
/// Runs purely in-process (no subprocess — `Process` is unavailable on iOS) by
/// reading the source tree relative to this file. A command-line mirror lives at
/// `apps/ios/scripts/check_localization.py`.
@MainActor
final class LocalizationConsistencyTests: XCTestCase {

    // Targets whose `String(localized:)` calls resolve against the app's main
    // bundle (default / `bundle: .main`), plus the SDK — its code references
    // both the app catalog (`.main`) and its own catalog (`.module`). The old
    // `apps/ios/MeeshyIntents` root was recabled into `apps/ios/Meeshy/Features/Intents/`
    // on 2026-06-24 (cf. apps/ios/CLAUDE.md § App Extensions) — already
    // covered by the `apps/ios/Meeshy` root below, so it was dropped here.
    private static let sourceRoots = [
        "apps/ios/Meeshy",
        "apps/ios/MeeshyNotificationExtension",
        "apps/ios/MeeshyWidgets",
        "apps/ios/MeeshyShareExtension",
        "apps/ios/MeeshyContextMenu",
        "packages/MeeshySDK/Sources",
    ]

    private static let appCatalogPath = "apps/ios/Meeshy/Localizable.xcstrings"
    private static let sdkCatalogPath = "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings"

    /// Documented exceptions. Keep empty; add a key only with a justifying comment.
    private static let orphanAllowlist: Set<String> = []
    private static let rawAllowlist: Set<String> = []

    // MARK: - Tests

    func test_everyUsedIdentifierKeyResolvesInDevelopmentLanguage() throws {
        let env = try makeEnvironment()

        var violations: [String] = []
        for file in env.sourceFiles {
            let text = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
            for call in LocalizedCallScanner.localizedCalls(in: text) {
                guard LocalizedCallScanner.isIdentifier(call.key),
                      !call.hasDefaultValue,
                      !Self.rawAllowlist.contains(call.key) else { continue }
                let catalog = call.isModuleBundle ? env.sdkKeysWithEn : env.appKeysWithEn
                if !catalog.contains(call.key) {
                    violations.append("\(call.isModuleBundle ? "[SDK] " : "[APP] ")\(call.key)  (\(file.lastPathComponent))")
                }
            }
        }
        violations = Array(Set(violations)).sorted()
        XCTAssertTrue(
            violations.isEmpty,
            "These identifier keys are used without a defaultValue but have no `en` "
            + "entry in their catalog, so they render RAW (e.g. `splash.tagline`):\n"
            + violations.joined(separator: "\n")
        )
    }

    func test_everyAppCatalogIdentifierKeyIsReferencedInCode() throws {
        let env = try makeEnvironment()

        // A clean quoted identifier token is matched even inside string
        // interpolation, so this is immune to the nested-literal pitfalls that
        // break naive literal extraction.
        let quotedTokens = LocalizedCallScanner.quotedIdentifierTokens(in: env.combinedSource)

        let orphans = env.appIdentifierKeys
            .filter { !Self.orphanAllowlist.contains($0) && !quotedTokens.contains($0) }
            .sorted()

        XCTAssertTrue(
            orphans.isEmpty,
            "These app-catalog identifier keys are never referenced in code (dead keys):\n"
            + orphans.joined(separator: "\n")
        )
    }

    // MARK: - Translation completeness (added 220i)

    /// Screens whose every app-bundle identifier key is translated in all shipped
    /// locales. Additive list: an iteration that finishes localizing a screen adds
    /// its path here so the screen can never silently regress to French-only.
    private static let fullyLocalizedScreens = [
        // Lot 4.6 — la surface qui SERT les six déclencheurs du mood. Elle a été
        // ajoutée ici dès sa présentation, et non au retrait de l'écran
        // historique : la liste est ADDITIVE, et l'écran que les auteurs voient
        // ne doit à aucun moment sortir du cliquet.
        //
        // Lot 4.8 — `StatusComposerView.swift` a quitté cette liste AVEC le
        // fichier, et pas une ligne avant : la remplaçante était déjà là, si
        // bien qu'aucun écran n'est sorti du cliquet entre les deux lots.
        "apps/ios/Meeshy/Features/Main/Composer/ComposerMoodSurface.swift",
        // 225i — the registration step flow: the first screens a new account ever
        // sees, and the largest single-file gap in the catalog when it was pinned.
        "apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift",
        // 226i — share-link creation, the largest remaining gap after 225i (55 keys).
        "apps/ios/Meeshy/Features/Main/Views/CreateShareLinkView.swift",
        // 263i (#4309) — quarante écrans qui passaient DÉJÀ les deux règles
        // (chaque clé traduite dans les six locales requises ET `defaultValue`
        // inline égal à la valeur du catalogue). Les épingler ne change pas une
        // ligne de production : cela interdit seulement qu'ils REDESCENDENT.
        //
        // La liste s'arrête à quarante parce que 92 autres fichiers sont tout
        // aussi propres, mais que le parseur qui les a élus n'est pas
        // compilable ici : on épingle un lot que la CI valide, puis on poursuit.
        //
        // Ce qui MANQUE à cette liste dit l'essentiel :
        // `NotificationSettingsView` (53 clés), `SecurityView` (44),
        // `ConversationView` (43), `MyStoriesView` (42), `GlobalSearchView`
        // (34)… en sont ABSENTS non par oubli mais parce que leurs
        // `defaultValue` inline divergent de la valeur du catalogue — 648 clés
        // dans tout le dépôt. `test_pinnedScreenDefaultsMatchCatalog` le refuse
        // à raison : le catalogue est ce qui S'AFFICHE, donc un `defaultValue`
        // divergent est du texte mort qui ment au lecteur (#4308).
        "apps/ios/Meeshy/Features/Main/Views/SettingsView.swift",  // 87
        "apps/ios/Meeshy/Features/Main/Components/SyncPillLabels.swift",  // 53
        "apps/ios/Meeshy/Features/Main/Views/ParticipantProfileSheet.swift",  // 43
        "apps/ios/Meeshy/Features/Main/Views/ProfileView.swift",  // 37
        "apps/ios/Meeshy/Features/Main/Views/VoiceProfileManageView.swift",  // 34
        "apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift",  // 32
        "apps/ios/Meeshy/Features/Main/Views/NearbyDiscoveryView.swift",  // 31
        "apps/ios/Meeshy/Features/Main/Components/ConversationLockSheet.swift",  // 30
        "apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift",  // 22
        "apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift",  // 21
        "apps/ios/Meeshy/Features/Main/Views/ConversationContextMenuView.swift",  // 21
        "apps/ios/Meeshy/Features/Main/Views/LoginView.swift",  // 20
        "apps/ios/Meeshy/Features/Main/Components/NearbyDiscoverabilityControl.swift",  // 17
        "apps/ios/Meeshy/Features/Main/Components/LocationSharingSettingsSection.swift",  // 16
        "apps/ios/Meeshy/Features/Main/Views/OnboardingView.swift",  // 16
        "apps/ios/Meeshy/Features/Main/Lentille/Row/LentilleConversationRow.swift",  // 14
        "apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift",  // 14
        "apps/ios/Meeshy/Features/Main/Views/CallBubbleView.swift",  // 14
        "apps/ios/Meeshy/Features/Main/Focal/Lens/ReadingModeLensSheet.swift",  // 13
        "apps/ios/Meeshy/Features/Main/Views/ActiveSessionsView.swift",  // 12
        "apps/ios/Meeshy/Features/Main/Views/ConversationListQuickActions.swift",  // 12
        "apps/ios/Meeshy/Features/Main/Components/MediaKindLabel.swift",  // 11
        "apps/ios/Meeshy/Features/Main/Lentille/Mode/LentilleModeLabels.swift",  // 10
        "apps/ios/Meeshy/Features/Main/Lentille/Row/LentilleBridgeLine.swift",  // 9
        "apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift",  // 9
        "apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift",  // 9
        "apps/ios/Meeshy/Features/Main/Views/StoryExportShareSheet.swift",  // 9
        "apps/ios/Meeshy/Features/Contacts/DiscoverViewModel.swift",  // 8
        "apps/ios/Meeshy/Features/Contacts/RequestsViewModel.swift",  // 8
        "apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageEditsDetailView.swift",  // 8
        "apps/ios/Meeshy/Features/Main/Focal/Summary/LivingSummaryView.swift",  // 8
        "apps/ios/Meeshy/Features/Main/Services/CallManager.swift",  // 8
        "apps/ios/Meeshy/Features/Main/Views/CallWaitingBannerView.swift",  // 8
        "apps/ios/Meeshy/Features/Main/Views/StarredMessagesView.swift",  // 8
        "apps/ios/Meeshy/Features/Main/Views/StoryTrayActions.swift",  // 8
        "apps/ios/Meeshy/Features/Main/Composer/ComposerLeadingRail.swift",  // 7
        "apps/ios/Meeshy/Features/Main/Views/CallEffectsOverlay.swift",  // 7
        "apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift",  // 7
        "apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingAnimations.swift",  // 6
        "apps/ios/Meeshy/Features/Main/Composer/StickerLibraryPaste.swift",  // 6
        // 267i (#4322) — les 92 écrans restants qui passaient DÉJÀ les deux
        // règles, soit 280 clés. #4309 en avait épinglé 40 sur 132 en disant
        // pourquoi il n'en prenait pas plus : « le risque n'est pas par fichier
        // mais par PARSEUR — s'il se trompe, il se trompe partout ». La CI a
        // depuis validé ce parseur sur les 40 premiers, du premier coup, sur les
        // DEUX règles. Le solde est donc pris avec une confiance mesurée.
        //
        // Ce qui reste dehors n'y est pas par oubli : 164 fichiers échouent
        // encore, dont 154 sur la SEULE règle du `defaultValue` (#4308, 648 clés
        // divergentes). C'est la dette de littéraux, pas la traduction, qui
        // borne désormais ce cliquet — la règle A n'en retient que 56.
        "apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift",  // 15
        "apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift",  // 7
        "apps/ios/Meeshy/Features/Main/Views/StoryLanguageDetailView.swift",  // 7
        "apps/ios/Meeshy/Features/Main/Riviere/View/RiverBubbleView.swift",  // 6
        "apps/ios/Meeshy/Features/Main/ViewModels/VoiceProfileManageViewModel.swift",  // 6
        "apps/ios/Meeshy/Features/Main/Views/ConversationListHelpers.swift",  // 6
        "apps/ios/Meeshy/Features/Main/Views/ConversationListView+Rows.swift",  // 6
        "apps/ios/Meeshy/Features/Main/Views/MyStoriesDeleteConfirmation.swift",  // 6
        "apps/ios/Meeshy/Features/Main/Views/RootMenuLadderEntry.swift",  // 6
        "apps/ios/Meeshy/Features/Main/Views/ShareLinkIdentitySheet.swift",  // 6
        "apps/ios/Meeshy/Features/Main/Components/CallSignalGlyph.swift",  // 5
        "apps/ios/Meeshy/Features/Main/Components/LanguageFlagChip.swift",  // 5
        "apps/ios/Meeshy/Features/Main/Composer/ComposerDescriptionLayer.swift",  // 5
        "apps/ios/Meeshy/Features/Main/Composer/ComposerFormatFan.swift",  // 5
        "apps/ios/Meeshy/Features/Main/Focal/Summary/EpisodeSegmenter.swift",  // 5
        "apps/ios/Meeshy/Features/Main/Lentille/Chrome/LentilleSectionIdentity.swift",  // 5
        "apps/ios/Meeshy/Features/Main/Services/CrashDiagnosticsManager.swift",  // 5
        "apps/ios/Meeshy/Features/Main/Services/MediaPermissionCoordinator.swift",  // 5
        "apps/ios/Meeshy/Features/Main/ViewModels/ConversationOptionsViewModel.swift",  // 5
        "apps/ios/Meeshy/Features/Main/ViewModels/TwoFactorViewModel.swift",  // 5
        "apps/ios/Meeshy/Features/Main/Views/ConversationView+Selection.swift",  // 5
        "apps/ios/Meeshy/Features/Main/Views/MyStoryCardPresentation.swift",  // 5
        "apps/ios/Meeshy/Features/Contacts/PeopleDiscoveryView.swift",  // 4
        "apps/ios/Meeshy/Features/Main/Composer/ConversationMediaComposerDoor.swift",  // 4
        "apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost.swift",  // 4
        "apps/ios/Meeshy/Features/Main/Composer/UpgradeGateView.swift",  // 4
        "apps/ios/Meeshy/Features/Main/Lentille/Mode/LentilleFocusCard.swift",  // 4
        "apps/ios/Meeshy/Features/Main/Services/StoryPhotoSaveService.swift",  // 4
        "apps/ios/Meeshy/Features/Main/Services/StoryPublishService.swift",  // 4
        "apps/ios/Meeshy/Features/Main/Views/Cells/PostStatAccessibility.swift",  // 4
        "apps/ios/Meeshy/Features/Main/Views/ConversationHelperViews.swift",  // 4
        "apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift",  // 4
        "apps/ios/Meeshy/Features/Main/Views/MessageListView.swift",  // 4
        "apps/ios/Meeshy/Features/Main/Views/MyStoriesTab.swift",  // 4
        "apps/ios/Meeshy/Features/Main/Views/StoryAuthorIdentityCard.swift",  // 4
        "apps/ios/Meeshy/Features/Main/Views/StoryUploadPresentation.swift",  // 4
        "apps/ios/Meeshy/Features/Contacts/BlockedViewModel.swift",  // 3
        "apps/ios/Meeshy/Features/Main/Services/StatusBubbleController.swift",  // 3
        "apps/ios/Meeshy/Features/Main/ViewModels/ActiveSessionsViewModel.swift",  // 3
        "apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift",  // 3
        "apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleExpandableText.swift",  // 3
        "apps/ios/Meeshy/Features/Main/Views/FeedPostLocationView.swift",  // 3
        "apps/ios/Meeshy/Features/Main/Views/MyStoryCard.swift",  // 3
        "apps/ios/Meeshy/Features/Main/Views/StoryCanvasAccessibility.swift",  // 3
        "apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift",  // 3
        "apps/ios/Meeshy/Features/Main/Views/iPadRootView+Navigation.swift",  // 3
        "apps/ios/Meeshy/Features/Main/Components/BrandSignature.swift",  // 2
        "apps/ios/Meeshy/Features/Main/Components/ReelFeedSoundButton.swift",  // 2
        "apps/ios/Meeshy/Features/Main/Components/ToggleStateAccessibility.swift",  // 2
        "apps/ios/Meeshy/Features/Main/Focal/Row/FocalIdentityHeader.swift",  // 2
        "apps/ios/Meeshy/Features/Main/Focal/Summary/EpisodeListView.swift",  // 2
        "apps/ios/Meeshy/Features/Main/Focal/Summary/FaceRampView.swift",  // 2
        "apps/ios/Meeshy/Features/Main/Lentille/Mode/LentilleModeMenu.swift",  // 2
        "apps/ios/Meeshy/Features/Main/Models/ConversationFilterComposition.swift",  // 2
        "apps/ios/Meeshy/Features/Main/Services/MessageForwardService.swift",  // 2
        "apps/ios/Meeshy/Features/Main/ViewModels/UserProfileViewModel.swift",  // 2
        "apps/ios/Meeshy/Features/Main/ViewModels/VoiceProfileWizardViewModel.swift",  // 2
        "apps/ios/Meeshy/Features/Main/Views/AudioPostComposerView.swift",  // 2
        "apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFailedRetryBar.swift",  // 2
        "apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift",  // 2
        "apps/ios/Meeshy/Features/Main/Views/StoryLanguageQuickBar.swift",  // 2
        "apps/ios/Meeshy/Features/Main/Views/iPadRootView.swift",  // 2
        "apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationOfflineContent.swift",  // 2
        "apps/ios/Meeshy/Core/DependencyContainer.swift",  // 1
        "apps/ios/Meeshy/Features/Auth/ViewModels/EmailVerificationViewModel.swift",  // 1
        "apps/ios/Meeshy/Features/Contacts/CallStarter.swift",  // 1
        "apps/ios/Meeshy/Features/Contacts/CallsViewModel.swift",  // 1
        "apps/ios/Meeshy/Features/Contacts/ContactsSkeletonList.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Components/BackgroundColorPalette.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Components/BackgroundSoundBadge.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Components/ComposerMentionStrip.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Components/LocalizedNumber.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Composer/ComposerTrailingRail.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Focal/Row/FocalConversationStartRow.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Focal/Row/FocalMetaRow.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Navigation/Router+StoryReply.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Riviere/Core/RiverConversationMapping.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Riviere/View/RiverLaneHeaderStrip.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Riviere/View/RiverTimeHandle.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Services/ContactSyncService.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Services/ConversationCreator.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Services/WidgetDataManager.swift",  // 1
        "apps/ios/Meeshy/Features/Main/ViewModels/NewConversationViewModel.swift",  // 1
        "apps/ios/Meeshy/Features/Main/ViewModels/StoryExportShareViewModel.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Views/ConversationMediaFilmstrip.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Views/HashtagResultsView.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonFeedPost.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonLinkRow.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonProfileHeader.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonStoryThumb.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Views/StoryLocationReaderTapOverlay.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Views/VideoLegacySupport.swift",  // 1
        // 268i (#4308) — les 105 écrans débloqués par la RÉCONCILIATION des
        // `defaultValue`. Ils ne butaient que sur la règle B : leur littéral
        // inline disait « Reply » là où le catalogue `fr` — celui qui
        // S'AFFICHE — dit « Répondre ». 498 littéraux réalignés sur le
        // catalogue, aucun changement de comportement.
        //
        // Trois fichiers du lot en sont EXCLUS : `StatsTimelineChart`,
        // `MembersCountLabel`, `UnreadCountLabel`. Leurs clés sont
        // PLURIELLES, donc sans `stringUnit` plat — la règle B compare le
        // littéral à une valeur source qui n'existe pas pour un pluriel, et
        // aucune réconciliation ne peut la satisfaire (suivi ouvert).
        "apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift",  // 60
        "apps/ios/Meeshy/Features/Main/Views/SecurityView.swift",  // 58
        "apps/ios/Meeshy/Features/Main/Views/NotificationSettingsView.swift",  // 56
        "apps/ios/Meeshy/Features/Main/Views/ConversationView.swift",  // 49
        "apps/ios/Meeshy/Features/Main/Views/TwoFactorSetupView.swift",  // 41
        "apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift",  // 40
        "apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift",  // 38
        "apps/ios/Meeshy/Features/Main/Components/ConversationDashboardView.swift",  // 37
        "apps/ios/Meeshy/Features/Main/Components/ConversationPreferencesTab.swift",  // 31
        "apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift",  // 31
        "apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift",  // 29
        "apps/ios/Meeshy/Features/Main/Views/PrivacySettingsView.swift",  // 29
        "apps/ios/Meeshy/Features/Main/Views/VoiceProfileWizardView.swift",  // 29
        "apps/ios/Meeshy/Features/Main/Views/DeleteAccountView.swift",  // 28
        "apps/ios/Meeshy/Features/Main/Views/SharePickerView.swift",  // 28
        "apps/ios/Meeshy/Features/Main/Navigation/Router.swift",  // 27
        "apps/ios/Meeshy/Features/Main/Components/EffectsPickerView.swift",  // 24
        "apps/ios/Meeshy/Features/Main/Views/CreateTrackingLinkView.swift",  // 24
        "apps/ios/Meeshy/Features/Main/Views/ProfileUserPostsList.swift",  // 24
        "apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift",  // 24
        "apps/ios/Meeshy/Features/Main/Components/EditPostSheet.swift",  // 23
        "apps/ios/Meeshy/Features/Main/Components/ReportMessageSheet.swift",  // 21
        "apps/ios/Meeshy/Features/Main/Views/FeedView.swift",  // 21
        "apps/ios/Meeshy/Features/Contacts/DiscoverTab.swift",  // 19
        "apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift",  // 19
        "apps/ios/Meeshy/Features/Main/Views/ShareLinkDetailView.swift",  // 19
        "apps/ios/Meeshy/Features/Main/Views/RootView.swift",  // 18
        "apps/ios/Meeshy/Features/Auth/Views/EmailVerificationView.swift",  // 17
        "apps/ios/Meeshy/Features/Main/Components/RecentMediaStrip.swift",  // 17
        "apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift",  // 17
        "apps/ios/Meeshy/Features/Main/Views/ChangePasswordView.swift",  // 17
        "apps/ios/Meeshy/Features/Main/Components/CameraView.swift",  // 16
        "apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift",  // 16
        "apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift",  // 16
        "apps/ios/Meeshy/Features/Main/Views/MagicLinkView.swift",  // 16
        "apps/ios/Meeshy/Features/Main/Views/ReportUserView.swift",  // 16
        "apps/ios/Meeshy/Features/Main/Views/VideoFiltersPanel.swift",  // 16
        "apps/ios/Meeshy/Features/Contacts/CallsTab.swift",  // 15
        "apps/ios/Meeshy/Features/Contacts/RequestsTab.swift",  // 15
        "apps/ios/Meeshy/Features/Main/Components/MemberManagementSection.swift",  // 15
        "apps/ios/Meeshy/Features/Main/Views/EmojiPickerSheet.swift",  // 15
        "apps/ios/Meeshy/Features/Main/Views/IncomingCallView.swift",  // 15
        "apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift",  // 15
        "apps/ios/Meeshy/Features/Contacts/KeypadTab.swift",  // 14
        "apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleSystemViews.swift",  // 14
        "apps/ios/Meeshy/Features/Main/Views/DataExportView.swift",  // 14
        "apps/ios/Meeshy/Features/Main/Views/LinksHubView.swift",  // 14
        "apps/ios/Meeshy/AppDelegate.swift",  // 13
        "apps/ios/Meeshy/Features/Contacts/CallDetailSheet.swift",  // 13
        "apps/ios/Meeshy/Features/Main/Components/AttachmentLoadingTile.swift",  // 13
        "apps/ios/Meeshy/Features/Main/Components/MessageActionsMenu.swift",  // 13
        "apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift",  // 13
        "apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift",  // 13
        "apps/ios/Meeshy/Features/Main/Views/AffiliateCreateView.swift",  // 12
        "apps/ios/Meeshy/Features/Main/Views/NewConversationView.swift",  // 12
        "apps/ios/Meeshy/Features/Main/Views/CommunityLinkDetailView.swift",  // 11
        "apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift",  // 10
        "apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageTranscriptionDetailView.swift",  // 10
        "apps/ios/Meeshy/Features/Main/ViewModels/ReelsViewModel.swift",  // 10
        "apps/ios/Meeshy/Features/Main/Views/MediaDownloadSettingsView.swift",  // 10
        "apps/ios/Meeshy/Features/Main/Views/UserStatsView.swift",  // 10
        "apps/ios/Meeshy/Features/Contacts/ContactsListTab.swift",  // 9
        "apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageReportDetailView.swift",  // 9
        "apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift",  // 9
        "apps/ios/Meeshy/Features/Main/Views/PrivacyPolicyView.swift",  // 9
        "apps/ios/Meeshy/Features/Main/Views/TermsOfServiceView.swift",  // 9
        "apps/ios/Meeshy/Features/Contacts/BlockedTab.swift",  // 8
        "apps/ios/Meeshy/Features/Main/Components/MessageDetailSentimentTab.swift",  // 8
        "apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Recording.swift",  // 8
        "apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift",  // 8
        "apps/ios/Meeshy/Features/Main/Views/ConversationView+Header.swift",  // 8
        "apps/ios/Meeshy/Features/Main/Views/VideoFilterControlView.swift",  // 8
        "apps/ios/Meeshy/Features/Main/Focal/Row/FocalQuotedReplyView.swift",  // 7
        "apps/ios/Meeshy/Features/Main/ViewModels/StatusViewModel.swift",  // 7
        "apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleDeliveryCheck.swift",  // 7
        "apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift",  // 7
        "apps/ios/Meeshy/Features/Main/Views/DataStorageView.swift",  // 7
        "apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift",  // 7
        "apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift",  // 7
        "apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingFlowView.swift",  // 6
        "apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageLanguageDetailView.swift",  // 6
        "apps/ios/Meeshy/Features/Main/Views/StoryViewerContainer.swift",  // 6
        "apps/ios/Meeshy/Features/Main/Views/iPadRootView+Panels.swift",  // 6
        "apps/ios/Meeshy/MeeshyApp.swift",  // 6
        "apps/ios/Meeshy/Features/Main/Components/ContactCardView.swift",  // 5
        "apps/ios/Meeshy/Features/Main/Components/LanguagePickerSheet.swift",  // 5
        "apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageReactionsDetailView.swift",  // 5
        "apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleReactionsOverlay.swift",  // 5
        "apps/ios/Meeshy/Features/Main/Components/ConnectionBanner.swift",  // 4
        "apps/ios/Meeshy/Features/Main/Views/CommentMediaView.swift",  // 4
        "apps/ios/Meeshy/Features/Main/Components/CrashReportSheet.swift",  // 3
        "apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Drop.swift",  // 3
        "apps/ios/Meeshy/Features/Main/Composer/PasteIntoComposer.swift",  // 3
        "apps/ios/Meeshy/Features/Main/Views/AchievementBadgeView.swift",  // 3
        "apps/ios/Meeshy/Features/Main/Views/WebRTCVideoView.swift",  // 3
        "apps/ios/Meeshy/Features/Contacts/ContactsHubView.swift",  // 2
        "apps/ios/Meeshy/Features/Main/Components/MentionSuggestionPanel.swift",  // 2
        "apps/ios/Meeshy/Features/Main/Focal/Row/FocalProtectedContent.swift",  // 2
        "apps/ios/Meeshy/Features/Main/Focal/Row/FocalSystemRows.swift",  // 2
        "apps/ios/Meeshy/Features/Main/ViewModels/BookmarksViewModel.swift",  // 2
        "apps/ios/Meeshy/Features/Main/Views/StoryRepostEmbedCell.swift",  // 2
        "apps/ios/Meeshy/Features/Contacts/AffiliatesViewModel.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Components/CharacterCountLabel.swift",  // 1
        "apps/ios/Meeshy/Features/Main/Services/VoIPPushManager.swift",  // 1
        "apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationLoadingView.swift",  // 1
        // 270i (#4364) — the four screens the eleven new catalog entries unblock.
        // Each held a key that was ABSENT from the catalog, so its `defaultValue`
        // shipped French to the six other locales; each is now translated in all
        // seven. Three of the four are ACCESSIBILITY surfaces, where the gap was
        // spoken rather than read.
        "apps/ios/Meeshy/Features/Main/Focal/Preferences/MessageAccessibilityLabelComposer.swift",  // 20
        "apps/ios/Meeshy/Features/Main/Components/AddParticipantSheet.swift",  // 11
        "apps/ios/Meeshy/Features/Main/Components/SyncPill.swift",  // 4
        "apps/ios/Meeshy/Features/Main/Focal/Lens/ReadingModeChip.swift",  // 4
        // 270i — the first two sources OUTSIDE the app target ever pinned. They
        // needed no work: both already passed BOTH rules against the widget
        // catalog. What was missing was the map entry telling this suite which
        // catalog serves them (`catalogByTargetFragment`), without which they were
        // measured against the app catalog and looked untranslated.
        "apps/ios/MeeshyWidgets/MeeshyWidgets.swift",  // 25
        "apps/ios/MeeshyWidgets/LiveActivities.swift",  // 11
        // 271i — la grille média du fil. Elle portait DEUX clés absentes du
        // catalogue, toutes deux en anglais dans les sept locales :
        // `feed.media.moreItems` (supprimée — la tuile « +N » sert désormais
        // `a11y.post.media.more`, déjà traduite et déjà servie par la grille
        // jumelle de `PostDetailView`) et `feed.media.item`, écrite CINQ fois
        // avec cinq phrases différentes parce que la position était gravée dans
        // le littéral. La position voyage maintenant en argument, la clé est au
        // catalogue dans les sept locales, et l'écran devient épinglable.
        "apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift",  // 5
    ]

    /// Keys exempt from `fullyLocalizedScreens`, each with the reason it is not
    /// simply a missing translation. Keep this list as short as the truth allows.
    private static let untranslatableKeys: Set<String> = [
        // 225i — the in-app terms of use. Product/legal copy: it is not a UI label
        // an iteration may translate on its own authority, and a machine rendering
        // of terms a user is asked to ACCEPT is worse than an honest source-language
        // one. Needs a reviewed translation, tracked outside the UI/UX track.
        "onboarding.step.recap.terms.body",
    ]

    /// La source d'un écran épinglé, résolue pour l'UNITÉ quand `path` désigne
    /// `StoryViewModel.swift` (#4425).
    ///
    /// Ce fichier s'est scindé en plusieurs frères : un appel `String(localized:)`
    /// épinglé « traduit dans les 6 locales » ou « defaultValue == catalogue »
    /// peut migrer vers `StoryViewModel+Publication.swift` sans que son texte
    /// change — mais une lecture bornée au seul fichier historique cesserait de
    /// le voir, et les deux cliquets ci-dessous rétréciraient en silence : ils
    /// ne verraient plus JAMAIS ces appels, ni pour les confirmer conformes ni
    /// pour signaler une régression future. Tout autre écran épinglé continue
    /// de se lire tel quel — un seul fichier, une lecture directe.
    private func pinnedScreenSource(at url: URL, path: String) throws -> String {
        guard path == "apps/ios/" + AppSourceGuard.storyViewModelPath else {
            return try String(contentsOf: url, encoding: .utf8)
        }
        let unit = try AppSourceGuard.storyViewModelSource()
        XCTAssertGreaterThan(
            unit.count, 400,
            "L'unité de StoryViewModel est introuvable ou vide — ce cliquet ne mesurerait plus rien pour cet écran."
        )
        return unit
    }

    func test_fullyLocalizedScreensStayTranslatedInEveryShippedLocale() throws {
        let env = try makeEnvironment()

        var violations: [String] = []
        for path in Self.fullyLocalizedScreens {
            let url = env.repoRoot.appendingPathComponent(path)
            let catalog = env.catalog(resolvedFor: url)
            let text = try pinnedScreenSource(at: url, path: path)
            for call in LocalizedCallScanner.localizedCalls(in: text) {
                guard LocalizedCallScanner.isIdentifier(call.key), !call.isModuleBundle,
                      !Self.untranslatableKeys.contains(call.key) else { continue }
                let missing = catalog.requiredLocales.subtracting(catalog.translations[call.key] ?? [])
                guard !missing.isEmpty else { continue }
                violations.append("\(call.key)  (\(url.lastPathComponent) → missing \(missing.sorted().joined(separator: ", ")))")
            }
        }
        violations = Array(Set(violations)).sorted()
        XCTAssertTrue(
            violations.isEmpty,
            "These keys belong to a screen pinned as fully localized but lack a translation. "
            + "Their defaultValue is source-language only, so those locales render French:\n"
            + violations.joined(separator: "\n")
        )
    }

    /// Added 225i. A pinned screen carries each string TWICE: as the inline
    /// `defaultValue:` the compiler bakes in, and as the catalog's source-language
    /// entry. Nothing makes them agree, so a later edit to one alone silently splits
    /// the screen in two — French users read the code literal, the six translated
    /// locales are generated from the catalog one. This also pins the 225i repair
    /// itself: 13 of these keys held ENGLISH text in a `fr`-source `defaultValue`,
    /// so French users read English until the catalog `fr` entry was added beside it.
    func test_fullyLocalizedScreenDefaultValuesMatchTheCatalogSourceLanguage() throws {
        let env = try makeEnvironment()

        var violations: [String] = []
        for path in Self.fullyLocalizedScreens {
            let url = env.repoRoot.appendingPathComponent(path)
            let catalog = env.catalog(resolvedFor: url)
            let text = try pinnedScreenSource(at: url, path: path)
            for call in LocalizedCallScanner.localizedCalls(in: text) {
                guard LocalizedCallScanner.isIdentifier(call.key), !call.isModuleBundle,
                      !Self.untranslatableKeys.contains(call.key),
                      let inline = call.defaultValue,
                      // Xcode rewrites `"… \(x)"` to `"… %@"` on extraction, so an
                      // interpolated default legitimately differs from its catalog
                      // entry (cf. the natural-text exclusion in this file's header).
                      !inline.contains("\\(") else { continue }
                let catalogSource = catalog.sourceValues[call.key]
                guard catalogSource != inline else { continue }
                violations.append(
                    "\(call.key)  (\(url.lastPathComponent))\n"
                    + "      code: \(inline)\n"
                    + "   catalog: \(catalogSource ?? "<no \(catalog.sourceLanguage) entry>")"
                )
            }
        }
        violations = Array(Set(violations)).sorted()
        XCTAssertTrue(
            violations.isEmpty,
            "On a pinned screen the inline defaultValue and the catalog's "
            + "\(env.appCatalog.sourceLanguage) entry are the same string rendered by two different "
            + "paths, so they must be identical:\n"
            + violations.joined(separator: "\n")
        )
    }

    /// Added 226i. A pluralized entry stores its text under
    /// `variations.plural.<CLDR category>` and has no flat `stringUnit`, so a reader
    /// that only looks at the flat unit sees NOTHING translated and reports the key as
    /// a gap in every locale. That was silently true of all nine plural entries the
    /// catalog had: fully translated, permanently counted against the backlog, and —
    /// worse — impossible to clear, so no screen holding a pluralized key could ever
    /// be pinned as fully localized.
    func test_pluralizedKeysAreRecognizedAsTranslated() throws {
        let env = try makeEnvironment()

        let pluralKeys = try pluralizedKeys(
            env.repoRoot.appendingPathComponent(Self.appCatalogPath)
        )
        XCTAssertFalse(
            pluralKeys.isEmpty,
            "The catalog is expected to contain pluralized entries; if none remain, this "
            + "guard has nothing to protect and should be reconsidered rather than deleted."
        )

        let unseen = pluralKeys
            .filter { (env.appCatalog.translations[$0] ?? []).isEmpty }
            .sorted()
        XCTAssertTrue(
            unseen.isEmpty,
            "These pluralized keys are translated in the catalog but the reader reports no "
            + "locale for them, so they can never leave the backlog:\n"
            + unseen.joined(separator: "\n")
        )
    }

    /// **Added 270i (#4364). Every catalog shipped by a target is READ by this suite.**
    ///
    /// An app extension is a separate bundle, so a `String(localized:)` in its sources
    /// resolves against the catalog shipped INSIDE it. `catalogByTargetFragment` is the
    /// map that says which — and it named the share extension and the notification
    /// extension while `MeeshyWidgets/Localizable.xcstrings` (39 keys, all seven
    /// locales) sat unread beside them. Nothing went red: an unmapped target simply
    /// falls back to the app catalog, where its keys do not exist, so its strings are
    /// reported as untranslated when they are translated, and its sources can never be
    /// pinned. A silent MIS-measure, not a failure.
    ///
    /// The omission was invisible from the map itself — a map is only ever read for the
    /// entries it has. It becomes visible from the FILESYSTEM, which is what this guard
    /// reads: every `Localizable.xcstrings` in the iOS tree is either the app catalog or
    /// mapped to the fragment of the target that owns it. The reverse direction too, so
    /// a moved or renamed catalog cannot leave a dead entry behind — that would restore
    /// the exact same silent fallback.
    func test_everyPerTargetCatalogIsMapped() throws {
        let env = try makeEnvironment()
        let iosRoot = env.repoRoot.appendingPathComponent("apps/ios")

        let catalogsOnDisk = catalogFiles(under: iosRoot)
            .map { $0.path.replacingOccurrences(of: env.repoRoot.path + "/", with: "") }
            .filter { $0 != Self.appCatalogPath }
            .sorted()
        XCTAssertFalse(
            catalogsOnDisk.isEmpty,
            "No per-target catalog found under apps/ios — the scan lost its way rather "
            + "than the extensions losing their catalogs."
        )

        let mapped = Set(Environment.catalogByTargetFragment.values)
        let unmapped = catalogsOnDisk.filter { !mapped.contains($0) }
        XCTAssertTrue(
            unmapped.isEmpty,
            "These catalogs ship inside a target but are never read by this suite, so "
            + "that target's keys are measured against the app catalog — where they do "
            + "not exist. Add them to `catalogByTargetFragment`:\n"
            + unmapped.joined(separator: "\n")
        )

        let onDisk = Set(catalogsOnDisk)
        let dangling = mapped.filter { !onDisk.contains($0) }.sorted()
        XCTAssertTrue(
            dangling.isEmpty,
            "These mapped catalogs no longer exist, so their target silently falls back "
            + "to the app catalog:\n" + dangling.joined(separator: "\n")
        )

        // A mapped entry is only worth its line if a source under that fragment
        // actually resolves to it: the map is consulted by `catalog(resolvedFor:)`,
        // whose fallback is the app catalog — the very thing being guarded against.
        for (fragment, path) in Environment.catalogByTargetFragment {
            let probe = URL(fileURLWithPath: "\(env.repoRoot.path)\(fragment)Probe.swift")
            let expected = try loadTranslations(env.repoRoot.appendingPathComponent(path))
            XCTAssertEqual(
                Set(env.catalog(resolvedFor: probe).translations.keys), Set(expected.keys),
                "A source under \(fragment) does not resolve against \(path)"
            )
        }
    }

    /// Every `Localizable.xcstrings` under `directory`, build products excluded.
    ///
    /// The FILENAME is the scope, not the extension: a catalog is a string TABLE, and
    /// `String(localized:)` without a `table:` argument resolves against `Localizable`
    /// alone. `InfoPlist.xcstrings` — which two targets also ship — localizes Info.plist
    /// values (bundle name, usage descriptions) that the system reads directly, so it is
    /// no more mappable here than it is callable from code. Measured: no call site in
    /// the iOS tree passes `table:`, so `Localizable` is the whole of what this suite
    /// models.
    ///
    /// Derived data is skipped by DESCENT rather than by filtering its files:
    /// `apps/ios/Build` holds tens of thousands of intermediates, each with its own copy.
    private func catalogFiles(under directory: URL) -> [URL] {
        guard let enumerator = FileManager.default.enumerator(
            at: directory,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else { return [] }
        var catalogs: [URL] = []
        for case let url as URL in enumerator {
            if url.lastPathComponent == "Build" || url.lastPathComponent == ".build" {
                enumerator.skipDescendants()
                continue
            }
            if url.lastPathComponent == "Localizable.xcstrings" { catalogs.append(url) }
        }
        return catalogs
    }

    /// **Borne du scanner — il voit les DEUX écritures d'un appel (258i, #4292).**
    ///
    /// Le marqueur a été un littéral pendant huit itérations, et un appel réparti sur
    /// plusieurs lignes lui était invisible. Le cliquet ci-dessus repose entièrement
    /// sur ce que le scanner VOIT : rétréci à nouveau, il ne rougirait pas — il
    /// compterait simplement moins, et le plafond deviendrait franchissable sans que
    /// rien ne le signale.
    ///
    /// Cette borne épingle donc les deux formes contre un échantillon dont la réponse
    /// est connue, plutôt que contre le dépôt, dont le contenu bouge.
    func test_leScannerVoitLesAppelsRepartisSurPlusieursLignes() {
        let source = """
        let a = String(localized: "une.ligne", defaultValue: "A", bundle: .main)
        let b = String(
            localized: "plusieurs.lignes",
            defaultValue: "B",
            bundle: .main
        )
        """
        let keys = LocalizedCallScanner.localizedCalls(in: source).map(\.key).sorted()
        XCTAssertEqual(
            keys, ["plusieurs.lignes", "une.ligne"],
            "le scanner doit voir l'appel sur une ligne ET l'appel réparti — sinon le "
            + "plafond du cliquet borne une mesure partielle"
        )
    }

    /// Keys with at least one locale expressed as plural variations.
    private func pluralizedKeys(_ url: URL) throws -> [String] {
        let json = try JSONSerialization.jsonObject(with: try Data(contentsOf: url)) as? [String: Any]
        let strings = json?["strings"] as? [String: Any] ?? [:]
        return strings.compactMap { key, value in
            let localizations = (value as? [String: Any])?["localizations"] as? [String: Any] ?? [:]
            let hasPlural = localizations.values.contains {
                ($0 as? [String: Any])?["variations"] != nil
            }
            return hasPlural ? key : nil
        }
    }

    func test_untranslatedKeyBacklogDoesNotGrow() throws {
        let env = try makeEnvironment()

        var untranslated: Set<String> = []
        for file in env.sourceFiles {
            let catalog = env.catalog(resolvedFor: file)
            let text = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
            for call in LocalizedCallScanner.localizedCalls(in: text) {
                guard LocalizedCallScanner.isIdentifier(call.key), !call.isModuleBundle else { continue }
                if !catalog.requiredLocales.isSubset(of: catalog.translations[call.key] ?? []) {
                    untranslated.insert(call.key)
                }
            }
        }

        // History: 1669 at 220i, −63 for the onboarding step flow (225i), then −54 for
        // share-link creation and −7 once pluralized keys stopped being miscounted
        // (226i) — pinned at 1545. RE-MEASURED at 224i when the scan became per-target:
        // unchanged, because the five share-extension keys are currently duplicated
        // into the app catalog as well, so they were already counted as translated.
        //
        // RE-PINNED at 258i (#4292) — 1545 → 114. The ceiling had stopped bounding
        // anything: the catalog filled up over the intervening iterations (3397 of
        // 3408 entries translated in all six required locales), so the real backlog had
        // fallen to 102 while the pin stayed at 1545. A ratchet that admits 1443 new
        // untranslated keys is a comment, not a ratchet. The +12 on top of 102 are keys
        // the scanner could not SEE until this iteration widened its marker to
        // multi-line calls — they were always untranslated, merely uncountable, and
        // making them countable is the precondition for ever clearing them (#4293).
        //
        // RE-PINNED at 270i (#4364) — 114 → 81, in two independent moves. −22 is pure
        // measurement: `MeeshyWidgets` ships its own fully translated catalog and this
        // suite had never read it, so 22 widget keys were counted against the app
        // catalog, where they do not exist. −11 is real work: eleven keys entered the
        // app catalog in all seven locales, ten of them copied verbatim from an entry
        // that already carried the same French text (see the `contacts.phonebook` /
        // `sync.pill.a11y` / `a11y.delivery` fills of that iteration).
        //
        // RE-PINNED at 271i — 81 → 79, both from the feed's media grid.
        // `feed.media.item` entered the catalog in all seven locales, its position
        // now travelling as an ARGUMENT rather than baked into five different
        // fallbacks; `feed.media.moreItems` left the repo entirely, the "+N" tile
        // now serving `a11y.post.media.more` — the key `PostDetailView` already
        // serves for the same affordance, already translated.
        //
        // The number must only ever go DOWN: a failure means a new key was introduced
        // with a `defaultValue` alone, which ships the source language to every other
        // locale. Add the catalog entry — with its translations, to the catalog of
        // the target that OWNS the key — instead of raising the ceiling.
        let backlogCeiling = 79
        XCTAssertLessThanOrEqual(
            untranslated.count, backlogCeiling,
            "\(untranslated.count) identifier keys are untranslated in at least one shipped "
            + "locale (ceiling \(backlogCeiling)). Add the missing entries to the catalog of the "
            + "target that owns them."
        )
    }

    // MARK: - Langue déclarée du document (T2.2)

    /// **Cliquet i18n — la clé neuve existe dans les SEPT locales expédiées,
    /// vérifié par DUMP du catalogue, jamais à l'œil.**
    ///
    /// `composer.document.a11y.language` est la clé accessible que
    /// `ComposerDocumentCopy.language` sert à la capsule de langue du meuble
    /// (`MeeshyComposerHost.documentLanguageCapsule`). L'édition du catalogue
    /// est TEXTUELLE (un `json.load`/`json.dump` réordonnerait les 3369
    /// entrées existantes) : cette garde relit le résultat par la MÊME voie
    /// que le reste de la suite — `JSONSerialization`, jamais un coup d'œil
    /// sur le diff — pour prouver que l'édition à la main n'a oublié aucune
    /// locale.
    func test_composerDocumentLanguageKey_isTranslatedInAllSevenShippedLocales() throws {
        let env = try makeEnvironment()
        let shipped = try shippedLocales(repoRoot: env.repoRoot)

        XCTAssertEqual(
            shipped.count, 7,
            "La prémisse de cette garde est que l'app expédie SEPT locales (ar, de, en, es, fr, "
            + "it, pt-BR) — si ce compte a changé, la garde doit changer avec lui."
        )

        let key = "composer.document.a11y.language"
        guard let translated = env.appCatalog.translations[key] else {
            return XCTFail(
                "`\(key)` est absent du catalogue — la capsule de langue du document affichera son "
                + "identifiant brut."
            )
        }

        let manquantes = shipped.subtracting(translated).sorted()
        XCTAssertTrue(
            manquantes.isEmpty,
            "`\(key)` manque dans : \(manquantes.joined(separator: ", ")). Une locale absente "
            + "affiche soit l'identifiant brut (`fr`, langue source), soit le français "
            + "(les six autres) — dans les deux cas, jamais la traduction attendue."
        )
    }

    // MARK: - Libellés de menu contextuel d'avatar

    /// **Un littéral nu passé à `AvatarContextMenuItem(label:)` est invisible
    /// aux deux axes ci-dessus.** Ils ne scannent que les appels
    /// `String(localized:)` ; `label` est une `String` rendue TELLE QUELLE
    /// (`MeeshyAvatar.AvatarContextMenuItem.label`), donc un littéral y sort
    /// dans la langue source pour les sept locales, sans qu'aucun test ne
    /// rougisse.
    ///
    /// La garde vise le BLOC d'appel — le couple `label:` … `icon:` qui
    /// identifie ce constructeur —, jamais le fichier : un `label:` alimenté
    /// par `String(localized:)` ou par une constante de copie
    /// (`StoryTrayCopy.viewProfile`) passe sans réserve.
    func test_avatarContextMenuLabels_areNeverBareLiterals() throws {
        let env = try makeEnvironment()

        var violations: [String] = []
        for file in env.sourceFiles {
            guard let text = try? String(contentsOf: file, encoding: .utf8) else { continue }
            for literal in Self.bareContextMenuLabels(in: text) {
                violations.append("\(file.lastPathComponent) : label: \"\(literal)\"")
            }
        }
        violations.sort()
        XCTAssertTrue(
            violations.isEmpty,
            "Ces libellés de menu contextuel d'avatar sont des littéraux nus : ils "
            + "s'affichent dans la langue source quelle que soit l'interface choisie. "
            + "Les passer par `String(localized:…, bundle:)`, avec l'entrée au catalogue "
            + "du bundle qui les résout :\n"
            + violations.joined(separator: "\n")
        )
    }

    /// **Contre-épreuve de la garde négative ci-dessus.** Une garde qui ne
    /// reconnaît plus la forme qu'elle interdit passe au vert en ayant perdu sa
    /// protection. Ces vecteurs prouvent qu'elle rougirait si un littéral nu
    /// revenait — sur une ligne comme sur plusieurs — et qu'elle ne condamne
    /// pas les deux formes légitimes.
    func test_bareContextMenuLabelScanner_recognizesTheFormItForbids() {
        let forbiddenInline = """
        items.append(AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill", action: onViewProfile))
        """
        XCTAssertEqual(Self.bareContextMenuLabels(in: forbiddenInline), ["Voir le profil"])

        let forbiddenMultiline = """
        AvatarContextMenuItem(
            label: "Voir la story",
            icon: "play.circle.fill"
        ) { onViewStory() }
        """
        XCTAssertEqual(Self.bareContextMenuLabels(in: forbiddenMultiline), ["Voir la story"])

        let localizedCall = """
        AvatarContextMenuItem(
            label: String(localized: "avatar.menu.view_profile", defaultValue: "Voir le profil", bundle: .module),
            icon: "person.fill"
        ) { onViewProfile() }
        """
        XCTAssertEqual(Self.bareContextMenuLabels(in: localizedCall), [])

        let namedConstant = """
        AvatarContextMenuItem(label: StoryTrayCopy.viewProfile, icon: "person.fill") { }
        """
        XCTAssertEqual(Self.bareContextMenuLabels(in: namedConstant), [])

        let roleBetweenLabelAndIcon = """
        AvatarContextMenuItem(label: "Voir le profil", role: .destructive, icon: "person.fill") { }
        """
        XCTAssertEqual(Self.bareContextMenuLabels(in: roleBetweenLabelAndIcon), ["Voir le profil"])
    }

    /// Littéraux nus passés en `label:` d'un `AvatarContextMenuItem`. Le couple
    /// `label:` suivi d'`icon:` est ce qui identifie ce constructeur : il
    /// attrape aussi bien `AvatarContextMenuItem(label:…)` que le
    /// `.init(label:…)` des sites qui laissent le type se déduire. Tolère un
    /// `role: …,` intercalé entre les deux (l'ordre déclaré de l'initialiseur
    /// est `label:icon:role:action:`, mais la garde ne dépend pas de cet ordre
    /// pour rester correcte si le paramètre bouge).
    private static func bareContextMenuLabels(in source: String) -> [String] {
        let ns = source as NSString
        guard let regex = try? NSRegularExpression(
            pattern: #"label:\s*"((?:[^"\\]|\\.)*)"\s*,\s*(?:role:\s*[^,]+,\s*)?icon:"#
        ) else { return [] }
        var found: [String] = []
        regex.enumerateMatches(in: source, range: NSRange(location: 0, length: ns.length)) { match, _, _ in
            if let match, match.numberOfRanges > 1 {
                found.append(ns.substring(with: match.range(at: 1)))
            }
        }
        return found
    }

    // MARK: - Environment

    /// One catalog, indexed. Added 224i, when the single-catalog model started
    /// reporting correctly-localized extension strings as untranslated.
    private struct CatalogIndex {
        /// Key → locales whose string unit is in the `translated` state.
        let translations: [String: Set<String>]
        /// Shipped locales minus THIS catalog's source language.
        let requiredLocales: Set<String>
        /// This catalog's source language — `fr` for the app, `en` for the share extension.
        let sourceLanguage: String
        /// Key → its value in the source language, when it has a flat one.
        let sourceValues: [String: String]
    }

    private struct Environment {
        /// An app extension is a SEPARATE BUNDLE: a `String(localized:)` in its sources
        /// resolves against ITS `Localizable.xcstrings`, never the host app's. Checking
        /// those sources against the app catalog reports keys as untranslated while they
        /// are in fact fully translated in the catalog shipping beside them.
        /// Path fragment → the catalog that target actually resolves against.
        ///
        /// Declared HERE rather than on the enclosing suite on purpose: the suite is
        /// `@MainActor`, so a static of its own would be actor-isolated and unreadable
        /// from `catalog(resolvedFor:)`, which is nonisolated — a nested type does not
        /// inherit the enclosing type's global actor.
        ///
        /// **`MeeshyWidgets` joined at 270i (#4364).** It has shipped its own catalog —
        /// 39 keys, all seven locales — since the target existed, and this map named two
        /// of the three. Every guard in this suite therefore measured the home-screen
        /// widgets and the Live Activities against the APP catalog, where their keys do
        /// not exist: 22 keys counted as untranslated while fully translated in the
        /// catalog that actually serves them, and the two widget sources unpinnable
        /// though both already pass both rules. `test_everyPerTargetCatalogIsMapped` is the
        /// witness that keeps the next extension from repeating it.
        static let catalogByTargetFragment: [String: String] = [
            "/MeeshyShareExtension/": "apps/ios/MeeshyShareExtension/Localizable.xcstrings",
            "/MeeshyNotificationExtension/": "apps/ios/MeeshyNotificationExtension/Localizable.xcstrings",
            "/MeeshyWidgets/": "apps/ios/MeeshyWidgets/Localizable.xcstrings",
        ]

        let repoRoot: URL
        let sourceFiles: [URL]
        let combinedSource: String
        let appIdentifierKeys: [String]
        let appKeysWithEn: Set<String>
        let sdkKeysWithEn: Set<String>
        /// Catalog repo-path → its index. Always contains the app catalog.
        let catalogs: [String: CatalogIndex]
        let appCatalogPath: String

        /// The catalog the given source file's bundle resolves against.
        func catalog(resolvedFor file: URL) -> CatalogIndex {
            for (fragment, catalogPath) in Self.catalogByTargetFragment
            where file.path.contains(fragment) {
                if let index = catalogs[catalogPath] { return index }
            }
            return appCatalog
        }

        /// Force-unwrap-free accessor: the app catalog is always loaded.
        var appCatalog: CatalogIndex {
            catalogs[appCatalogPath]
                ?? CatalogIndex(translations: [:], requiredLocales: [], sourceLanguage: "fr", sourceValues: [:])
        }
    }

    private func makeEnvironment() throws -> Environment {
        let repoRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // repo root

        let appCatalog = repoRoot.appendingPathComponent(Self.appCatalogPath)
        let sdkCatalog = repoRoot.appendingPathComponent(Self.sdkCatalogPath)
        guard FileManager.default.fileExists(atPath: appCatalog.path),
              FileManager.default.fileExists(atPath: sdkCatalog.path) else {
            throw XCTSkip("Localization catalogs not reachable from \(repoRoot.path) — source tree unavailable")
        }

        let appKeys = try loadCatalog(appCatalog)
        let sdkKeys = try loadCatalog(sdkCatalog)

        var files: [URL] = []
        for root in Self.sourceRoots {
            files.append(contentsOf: LocalizedCallScanner.swiftFiles(under: repoRoot.appendingPathComponent(root)))
        }
        guard !files.isEmpty else {
            throw XCTSkip("No Swift sources found — source tree unavailable")
        }

        let combined = files
            .compactMap { try? String(contentsOf: $0, encoding: .utf8) }
            .joined(separator: "\n")

        // Index the app catalog plus every per-target catalog. Each is measured
        // against the shipped locales minus ITS OWN source language, which differs:
        // the app catalog is authored in `fr`, the share extension's in `en`.
        let shipped = try shippedLocales(repoRoot: repoRoot)
        var catalogs: [String: CatalogIndex] = [:]
        for path in [Self.appCatalogPath] + Environment.catalogByTargetFragment.values {
            let url = repoRoot.appendingPathComponent(path)
            guard FileManager.default.fileExists(atPath: url.path) else { continue }
            let language = try sourceLanguage(url)
            catalogs[path] = CatalogIndex(
                translations: try loadTranslations(url),
                requiredLocales: shipped.subtracting([language]),
                sourceLanguage: language,
                sourceValues: try values(url, locale: language)
            )
        }

        return Environment(
            repoRoot: repoRoot,
            sourceFiles: files,
            combinedSource: combined,
            appIdentifierKeys: appKeys.keys.filter(LocalizedCallScanner.isIdentifier),
            appKeysWithEn: Set(appKeys.filter { $0.value }.keys),
            sdkKeysWithEn: Set(sdkKeys.filter { $0.value }.keys),
            catalogs: catalogs,
            appCatalogPath: Self.appCatalogPath
        )
    }

    /// Key → its flat string-unit value in `locale`. Plural variations have no single
    /// value and are absent, which keeps them out of the source-parity check.
    private func values(_ url: URL, locale: String) throws -> [String: String] {
        let json = try JSONSerialization.jsonObject(with: try Data(contentsOf: url)) as? [String: Any]
        let strings = json?["strings"] as? [String: Any] ?? [:]
        var result: [String: String] = [:]
        for (key, value) in strings {
            let localizations = (value as? [String: Any])?["localizations"] as? [String: Any]
            let unit = (localizations?[locale] as? [String: Any])?["stringUnit"] as? [String: Any]
            if let text = unit?["value"] as? String { result[key] = text }
        }
        return result
    }

    /// Locales the app actually ships — read from `Info.plist`, not hard-coded.
    private func shippedLocales(repoRoot: URL) throws -> Set<String> {
        let url = repoRoot.appendingPathComponent("apps/ios/Meeshy/Info.plist")
        let plist = try PropertyListSerialization.propertyList(from: try Data(contentsOf: url), format: nil)
        let locales = (plist as? [String: Any])?["CFBundleLocalizations"] as? [String]
        return Set(locales ?? [])
    }

    private func sourceLanguage(_ url: URL) throws -> String {
        let json = try JSONSerialization.jsonObject(with: try Data(contentsOf: url)) as? [String: Any]
        return json?["sourceLanguage"] as? String ?? "fr"
    }

    /// Key → locales whose string unit is explicitly `translated` (a stale or
    /// needs-review unit is not a shipped translation).
    ///
    /// A pluralized key carries no flat `stringUnit`: its text lives under
    /// `variations.plural.<CLDR category>`. Reading only the flat unit reported every
    /// such key as untranslated in EVERY locale even when fully translated — the nine
    /// plural entries the catalog already had were all counted as gaps (fixed 226i).
    private func loadTranslations(_ url: URL) throws -> [String: Set<String>] {
        let json = try JSONSerialization.jsonObject(with: try Data(contentsOf: url)) as? [String: Any]
        let strings = json?["strings"] as? [String: Any] ?? [:]
        var result: [String: Set<String>] = [:]
        for (key, value) in strings {
            let localizations = (value as? [String: Any])?["localizations"] as? [String: Any] ?? [:]
            var translated: Set<String> = []
            for (locale, payload) in localizations {
                if isTranslated(payload) { translated.insert(locale) }
            }
            result[key] = translated
        }
        return result
    }

    /// Whether one locale's payload is a shipped translation: either a flat string
    /// unit marked `translated`, or a set of plural variations whose EVERY category is
    /// marked `translated` — one stale category leaves the key partly untranslated for
    /// the counts that select it, so `allSatisfy` is deliberate rather than `contains`.
    private func isTranslated(_ payload: Any?) -> Bool {
        guard let payload = payload as? [String: Any] else { return false }
        if let unit = payload["stringUnit"] as? [String: Any] {
            return unit["state"] as? String == "translated"
        }
        guard let plural = (payload["variations"] as? [String: Any])?["plural"] as? [String: Any],
              !plural.isEmpty else { return false }
        return plural.values.allSatisfy { category in
            ((category as? [String: Any])?["stringUnit"] as? [String: Any])?["state"] as? String == "translated"
        }
    }

    /// Returns every key in a `.xcstrings` catalog mapped to whether it has an
    /// `en` localization (flat string unit or plural variations).
    private func loadCatalog(_ url: URL) throws -> [String: Bool] {
        let data = try Data(contentsOf: url)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let strings = json?["strings"] as? [String: Any] ?? [:]
        var result: [String: Bool] = [:]
        for (key, value) in strings {
            let localizations = (value as? [String: Any])?["localizations"] as? [String: Any]
            result[key] = localizations?["en"] != nil
        }
        return result
    }

    // MARK: - Source scanning

    // Le scanner (`localizedCalls`, `isIdentifier`, `swiftFiles`,
    // `quotedIdentifierTokens`…) a été SORTI d'ici au cycle 271i vers
    // `LocalizedCallScanner`, parce qu'un second témoin en avait besoin
    // (`LocalizedKeySinglePhraseGuardTests`) et qu'une copie aurait donné deux
    // lectures divergentes de la même syntaxe. Les témoins de forme du scanner
    // restent ci-dessus : ils vérifient le comportement, pas l'emplacement.
}
