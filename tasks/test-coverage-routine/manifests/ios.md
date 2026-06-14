# Coverage Manifest — iOS app (SwiftUI)

> Exhaustive list of **every** source file, grouped by feature/domain. `[~]` = a same-named test exists today (heuristic — may be shallow); `[ ]` = no obvious test. The routine must bring each to **92% line+branch** and flip to `[x]` once reviewer-approved.

- Source files: **346**
- With a same-named test today (heuristic): **96** (28%)
- Needing tests / verification: **250**

Heuristic note: a `[~]` only means a similarly-named test file exists — it does NOT mean 92% coverage. Every file, `[~]` included, must be verified to 92%.

## (root)  (0/3 have a test)

- [ ] `apps/ios/Meeshy/AppDelegate.swift`
- [ ] `apps/ios/Meeshy/MeeshyApp.swift`
- [ ] `apps/ios/Meeshy/MeeshyUIExports.swift`

## Core  (1/3 have a test)

- [~] `apps/ios/Meeshy/Core/DependencyContainer.swift`
- [ ] `apps/ios/Meeshy/Core/DeviceLayout.swift`
- [ ] `apps/ios/Meeshy/Core/ImageDownsamplingConfig.swift`

## Features/Auth/Onboarding  (0/3 have a test)

- [ ] `apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingAnimations.swift`
- [ ] `apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingFlowView.swift`
- [ ] `apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`

## Features/Auth/ViewModels  (1/1 have a test)

- [~] `apps/ios/Meeshy/Features/Auth/ViewModels/EmailVerificationViewModel.swift`

## Features/Auth/Views  (0/1 have a test)

- [ ] `apps/ios/Meeshy/Features/Auth/Views/EmailVerificationView.swift`

## Features/Contacts  (4/10 have a test)

- [ ] `apps/ios/Meeshy/Features/Contacts/BlockedTab.swift`
- [~] `apps/ios/Meeshy/Features/Contacts/BlockedViewModel.swift`
- [ ] `apps/ios/Meeshy/Features/Contacts/ContactsHubView.swift`
- [ ] `apps/ios/Meeshy/Features/Contacts/ContactsListTab.swift`
- [~] `apps/ios/Meeshy/Features/Contacts/ContactsListViewModel.swift`
- [ ] `apps/ios/Meeshy/Features/Contacts/ContactsShared.swift`
- [ ] `apps/ios/Meeshy/Features/Contacts/DiscoverTab.swift`
- [~] `apps/ios/Meeshy/Features/Contacts/DiscoverViewModel.swift`
- [ ] `apps/ios/Meeshy/Features/Contacts/RequestsTab.swift`
- [~] `apps/ios/Meeshy/Features/Contacts/RequestsViewModel.swift`

## Features/Main/Components  (4/41 have a test)

- [ ] `apps/ios/Meeshy/Features/Main/Components/AddParticipantSheet.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/AttachmentLoadingTile.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/CameraView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/ComposerModels.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/ConnectionBanner.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/ContactCardView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/ConversationDashboardView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/ConversationEncryptionDetailSheet.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/ConversationLockSheet.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/ConversationPreferencesTab.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/CrashReportSheet.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/EditPostSheet.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/EffectsPickerView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/GlobalEnvironment.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/InviteFriendsSheet.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/LanguagePickerSheet.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/LinkPreviewCard.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/MediaPlayerContext.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/MemberManagementSection.swift`
- [~] `apps/ios/Meeshy/Features/Main/Components/MentionComposerController.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/MentionSuggestionPanel.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/MessageDetailSentimentTab.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/MessageEffectModifiers.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/MessageInfoSheet.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift`
- [~] `apps/ios/Meeshy/Features/Main/Components/MiniAudioPlayerBar.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/ReportMessageSheet.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/SecurityVerificationView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/StatusBubbleOverlay.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/SyncPill.swift`
- [~] `apps/ios/Meeshy/Features/Main/Components/SyncPillLabels.swift`
- [~] `apps/ios/Meeshy/Features/Main/Components/SyncPillRotator.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Attachments.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Recording.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/UploadProgressBar.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Components/VideoPreviewView.swift`

## Features/Main/Models  (2/12 have a test)

- [ ] `apps/ios/Meeshy/Features/Main/Models/AnonymousSessionContext.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Models/AnyCodable.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Models/AuthModels.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Models/Conversation.swift`
- [~] `apps/ios/Meeshy/Features/Main/Models/ConversationLanguagePreferences.swift`
- [~] `apps/ios/Meeshy/Features/Main/Models/ConversationLoadingPhase.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Models/FeedModels.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Models/Message.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Models/MessageModels.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Models/Models.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Models/PostModels.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Models/StoryModels.swift`

## Features/Main/Navigation  (1/3 have a test)

- [ ] `apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Navigation/Router+StoryReply.swift`
- [~] `apps/ios/Meeshy/Features/Main/Navigation/Router.swift`

## Features/Main/Services  (46/69 have a test)

- [ ] `apps/ios/Meeshy/Features/Main/Services/APIClient.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/AnalyticsManager.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/AnonymousSessionStore.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/AttachmentPreparationService.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/AttachmentSendService.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/AttachmentUploader.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/AudioPlaybackEngineDriving.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/AudioQueueBuilder.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/AudioRecorderManager.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/BackgroundTaskManager.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/CallEventQueue.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator+NowPlaying.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/ConversationCreator.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/ConversationLockManager.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/CrashDiagnosticsManager.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/CrashlyticsReporter.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/DarkFrameDetector.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/DraftStore.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/E2EAPI.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/E2EEService.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/E2ESessionManager.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/EditHistoryStore.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/FeedbackToastManager.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/FeedbackToastSurfacing.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/HapticSurfacing.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/LanguageProviding.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/LinkPreviewStore.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/LiveActivityBridge.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/LocallyHiddenMessagesStore.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/Logger+Categories.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/MediaCompressor.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/MeeshyFocusFilter.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/MultiAttachmentSendPlanner.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/NSEPendingMessageConsumer.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/OptimisticAttachmentAdopter.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/ParticipantService.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/PendingStatusQueue.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/PresenceManager.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/PresenceService.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/ReplyThreadLoader.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/RingbackTonePlayer.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/Sleeping.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/StarredMessagesStore.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/StatusBubbleController.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/StoryInteractionService.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/StoryPublishService.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/StoryVideoExportService.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/TaskTimeout.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/ThermalStateMonitor.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/ThreadRepliesLoader.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/VideoFilterPipeline.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/VoIPDedupRing.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/VoIPPushManager.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/WebRTC/AudioEffectTypes.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallAudioEffectsService.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallMediaConfig.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/WebRTC/MediaPipelineHook.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/WebRTC/MeeshyAudioProcessingModule.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/WebRTC/VideoSurvivalController.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/WebRTCService.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Services/WidgetActionFlusher.swift`
- [~] `apps/ios/Meeshy/Features/Main/Services/WidgetDataManager.swift`

## Features/Main/Stores  (1/3 have a test)

- [ ] `apps/ios/Meeshy/Features/Main/Stores/CommentStore.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Stores/FeedStore.swift`
- [~] `apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift`

## Features/Main/ViewModels  (21/28 have a test)

- [~] `apps/ios/Meeshy/Features/Main/ViewModels/ActiveSessionsViewModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/BookmarksViewModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/ConnectionStatusViewModel.swift`
- [ ] `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationCommandHandler.swift`
- [ ] `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationMediaHandler.swift`
- [ ] `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationSearchHandler.swift`
- [ ] `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationStateStore.swift`
- [ ] `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/TranslationResolver.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/ConversationOptionsViewModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift`
- [ ] `apps/ios/Meeshy/Features/Main/ViewModels/FeedSocketHandler.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/NewConversationViewModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/ReelsViewModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/SharePickerViewModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/StatusViewModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/StoryExportShareViewModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift`
- [ ] `apps/ios/Meeshy/Features/Main/ViewModels/SyncPillViewModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/TwoFactorViewModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/UserProfileViewModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/VoiceProfileManageViewModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/ViewModels/VoiceProfileWizardViewModel.swift`

## Features/Main/Views  (12/161 have a test)

- [ ] `apps/ios/Meeshy/Features/Main/Views/AboutView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/AchievementBadgeView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ActiveSessionsView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/AdaptiveRootView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/AffiliateCreateView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/AffiliateView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/AudioAvailabilityResolver.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/AudioEffectsPanel.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/AudioPostComposerView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/BlockedUsersView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift`
- [~] `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleRouter.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioCarouselView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleBackground.swift`
- [~] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleBlurRevealLifecycle.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleCallbacks.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContent.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleDeliveryCheck.swift`
- [~] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleEphemeralLifecycle.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleExpandableText.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFailedRetryBar.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift`
- [~] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFooterModel.swift`
- [~] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleLanguageFlagController.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleMetaBadges.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleReactionsOverlay.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleSecondaryContent.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStyle.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleSystemViews.swift`
- [~] `apps/ios/Meeshy/Features/Main/Views/Bubble/MessageDayGrouping.swift`
- [~] `apps/ios/Meeshy/Features/Main/Views/Bubble/MessageDayLabel.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/MessageDaySeparator.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Bubble/MessageDayStickyOverlay.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/BubbleAnimations.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/CallEffectsOverlay.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/CallView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/CallWaitingBannerView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Cells/LoadMoreRepliesCell.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Cells/MediaPostCell.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Cells/ReplyCell.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Cells/TextPostCell.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Cells/TopLevelCommentCell.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ChangePasswordView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/CommentListView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/CommentListViewController.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/CommunityLinkDetailView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/CommunityLinksView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ContextActionMenu.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ConversationAnimatedBackground.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ConversationBackgroundComponents.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ConversationHelperViews.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ConversationListHelpers.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Rows.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ConversationView+ContextOverlay.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ConversationView+Header.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/CreateShareLinkView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/CreateTrackingLinkView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/DataExportView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/DataStorageView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/DeleteAccountView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/DiffableTypes.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/EditProfileView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/EmojiPickerSheet.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/FeedListView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/FeedListViewController.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/FeedView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift`
- [~] `apps/ios/Meeshy/Features/Main/Views/GuestConversationContainer.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/IncomingCallView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/LicensesView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/LinksHubView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/LoginView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/MagicLinkView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/MediaDownloadSettingsView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/MessageContextOverlay.swift`
- [~] `apps/ios/Meeshy/Features/Main/Views/MessageFrameTracker.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift`
- [~] `apps/ios/Meeshy/Features/Main/Views/MessageOverlayLayoutEngine.swift`
- [~] `apps/ios/Meeshy/Features/Main/Views/MessageRowEnvelope.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/NewConversationView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/NotificationSettingsView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/OnboardingView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/OverlayMenu.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/PostTranslationSheet.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/PrivacyPolicyView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/PrivacySettingsView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ProfileView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ReplyContextCleaner.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ReplyThreadOverlay.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ReportUserView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/RootView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/SecurityView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/SettingsView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ShareLinkDetailView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ShareLinksView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/SharePickerView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonFeedPost.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonProfileHeader.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonStoryThumb.swift`
- [~] `apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonVisibilityResolver.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/StarredMessagesView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/StatsTimelineChart.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/StatusBarView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/StoryExportShareSheet.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/StoryRepostEmbedCell.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/StoryViewerContainer.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/SupportView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/TermsOfServiceView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/ThreadView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/TrackingLinkDetailView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/TrackingLinksView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/TwoFactorSetupView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/UserStatsView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/VideoAvailabilityResolver.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/VideoFilterControlView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/VideoFiltersPanel.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/VideoLegacySupport.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/VoiceProfileManageView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/VoiceProfileWizardView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/WebRTCVideoView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/WidgetPreviewView.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/iPadRootView+Navigation.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/iPadRootView+Overlays.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/iPadRootView+Panels.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/iPadRootView+Sheets.swift`
- [ ] `apps/ios/Meeshy/Features/Main/Views/iPadRootView.swift`

## Features/Stories/Notifications  (3/8 have a test)

- [~] `apps/ios/Meeshy/Features/Stories/Notifications/StoryActiveBridge.swift`
- [~] `apps/ios/Meeshy/Features/Stories/Notifications/StoryExpiredContent.swift`
- [ ] `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationIntent.swift`
- [ ] `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationLoadingView.swift`
- [ ] `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetScreen.swift`
- [~] `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetViewModel.swift`
- [ ] `apps/ios/Meeshy/Features/Stories/Notifications/StoryViewerCoordinator.swift`
- [ ] `apps/ios/Meeshy/Features/Stories/Notifications/StoryViewerInitialAction.swift`
