# Coverage Manifest — Web (Next.js)

> Exhaustive list of **every** source file, grouped by feature/domain. `[~]` = a same-named test exists today (heuristic — may be shallow); `[ ]` = no obvious test. The routine must bring each to **92% line+branch** and flip to `[x]` once reviewer-approved.

- Source files: **1091**
- With a same-named test today (heuristic): **363** (33%)
- Needing tests / verification: **728**

Heuristic note: a `[~]` only means a similarly-named test file exists — it does NOT mean 92% coverage. Every file, `[~]` included, must be verified to 92%.

## (root)  (0/5 have a test)

- [ ] `apps/web/firebase-config.ts`
- [ ] `apps/web/middleware.ts`
- [ ] `apps/web/next.config.ts`
- [ ] `apps/web/playwright.config.ts`
- [ ] `apps/web/tailwind.config.ts`

## __mocks__/components  (0/2 have a test)

- [ ] `apps/web/__mocks__/components/markdown/MermaidDiagramImpl.tsx`
- [ ] `apps/web/__mocks__/components/messages/MarkdownMessage.tsx`

## app  (1/3 have a test)

- [ ] `apps/web/app/global-error.tsx`
- [ ] `apps/web/app/layout.tsx`
- [~] `apps/web/app/page.tsx`

## app/.well-known  (0/1 have a test)

- [ ] `apps/web/app/.well-known/apple-app-site-association/route.ts`

## app/about  (1/2 have a test)

- [ ] `apps/web/app/about/layout.tsx`
- [~] `apps/web/app/about/page.tsx`

## app/admin  (24/25 have a test)

- [~] `apps/web/app/admin/agent/page.tsx`
- [~] `apps/web/app/admin/analytics/page.tsx`
- [~] `apps/web/app/admin/anonymous-users/page.tsx`
- [~] `apps/web/app/admin/audit-logs/page.tsx`
- [~] `apps/web/app/admin/broadcasts/[id]/page.tsx`
- [~] `apps/web/app/admin/broadcasts/new/page.tsx`
- [~] `apps/web/app/admin/broadcasts/page.tsx`
- [~] `apps/web/app/admin/communities/page.tsx`
- [x] `apps/web/app/admin/debug.tsx`
- [~] `apps/web/app/admin/invitations/page.tsx`
- [~] `apps/web/app/admin/languages/page.tsx`
- [~] `apps/web/app/admin/loading.tsx`
- [~] `apps/web/app/admin/messages/page.tsx`
- [~] `apps/web/app/admin/moderation/page.tsx`
- [~] `apps/web/app/admin/monitoring/page.tsx`
- [~] `apps/web/app/admin/page.tsx`
- [~] `apps/web/app/admin/ranking/page.tsx`
- [~] `apps/web/app/admin/reports/page.tsx`
- [~] `apps/web/app/admin/settings/page.tsx`
- [~] `apps/web/app/admin/share-links/page.tsx`
- [~] `apps/web/app/admin/tracking-links/page.tsx`
- [~] `apps/web/app/admin/translations/page.tsx`
- [~] `apps/web/app/admin/users/[id]/page.tsx`
- [~] `apps/web/app/admin/users/new/page.tsx`
- [~] `apps/web/app/admin/users/page.tsx`

## app/api  (0/5 have a test)

- [ ] `apps/web/app/api/client-error/route.ts`
- [ ] `apps/web/app/api/health/route.ts`
- [ ] `apps/web/app/api/metadata/route.ts`
- [ ] `apps/web/app/api/upload/avatar/route.ts`
- [ ] `apps/web/app/api/upload/banner/route.ts`

## app/auth  (5/5 have a test)

- [~] `apps/web/app/auth/magic-link/page.tsx`
- [~] `apps/web/app/auth/magic-link/validate/page.tsx`
- [~] `apps/web/app/auth/verify-2fa/page.tsx`
- [~] `apps/web/app/auth/verify-email/page.tsx`
- [~] `apps/web/app/auth/verify-phone/page.tsx`

## app/auth-status  (1/1 have a test)

- [~] `apps/web/app/auth-status/page.tsx`

## app/call  (1/1 have a test)

- [~] `apps/web/app/call/[callId]/page.tsx`

## app/chat  (2/3 have a test)

- [ ] `apps/web/app/chat/[id]/layout.tsx`
- [~] `apps/web/app/chat/[id]/page.tsx`
- [~] `apps/web/app/chat/loading.tsx`

## app/contact  (1/1 have a test)

- [~] `apps/web/app/contact/page.tsx`

## app/contacts  (2/2 have a test)

- [~] `apps/web/app/contacts/loading.tsx`
- [~] `apps/web/app/contacts/page.tsx`

## app/conversation  (1/2 have a test)

- [ ] `apps/web/app/conversation/[conversationId]/RedirectMessage.tsx`
- [~] `apps/web/app/conversation/[conversationId]/page.tsx`

## app/conversations  (3/4 have a test)

- [~] `apps/web/app/conversations/[[...id]]/page.tsx`
- [ ] `apps/web/app/conversations/layout.tsx`
- [~] `apps/web/app/conversations/loading.tsx`
- [~] `apps/web/app/conversations/new/page.tsx`

## app/dashboard  (2/3 have a test)

- [ ] `apps/web/app/dashboard/LastMessagePreview.tsx`
- [~] `apps/web/app/dashboard/loading.tsx`
- [~] `apps/web/app/dashboard/page.tsx`

## app/feeds  (2/3 have a test)

- [ ] `apps/web/app/feeds/layout.tsx`
- [~] `apps/web/app/feeds/page.tsx`
- [~] `apps/web/app/feeds/post/[postId]/page.tsx`

## app/forgot-password  (2/2 have a test)

- [~] `apps/web/app/forgot-password/check-email/page.tsx`
- [~] `apps/web/app/forgot-password/page.tsx`

## app/groups  (3/5 have a test)

- [ ] `apps/web/app/groups/[identifier]/layout.tsx`
- [~] `apps/web/app/groups/[identifier]/page.tsx`
- [ ] `apps/web/app/groups/layout.tsx`
- [~] `apps/web/app/groups/loading.tsx`
- [~] `apps/web/app/groups/page.tsx`

## app/join  (2/3 have a test)

- [ ] `apps/web/app/join/[linkId]/layout.tsx`
- [~] `apps/web/app/join/[linkId]/page.tsx`
- [~] `apps/web/app/join/loading.tsx`

## app/l  (2/4 have a test)

- [ ] `apps/web/app/l/[token]/layout.tsx`
- [~] `apps/web/app/l/[token]/loading.tsx`
- [~] `apps/web/app/l/[token]/page.tsx`
- [ ] `apps/web/app/l/layout.tsx`

## app/links  (3/4 have a test)

- [~] `apps/web/app/links/loading.tsx`
- [~] `apps/web/app/links/page.tsx`
- [ ] `apps/web/app/links/tracked/[token]/TrackedLinkClicksChart.tsx`
- [~] `apps/web/app/links/tracked/[token]/page.tsx`

## app/login  (1/2 have a test)

- [ ] `apps/web/app/login/layout.tsx`
- [~] `apps/web/app/login/page.tsx`

## app/notifications  (3/4 have a test)

- [ ] `apps/web/app/notifications/layout.tsx`
- [~] `apps/web/app/notifications/loading.tsx`
- [~] `apps/web/app/notifications/page.tsx`
- [~] `apps/web/app/notifications/preferences/page.tsx`

## app/partners  (1/2 have a test)

- [ ] `apps/web/app/partners/layout.tsx`
- [~] `apps/web/app/partners/page.tsx`

## app/privacy  (1/2 have a test)

- [ ] `apps/web/app/privacy/layout.tsx`
- [~] `apps/web/app/privacy/page.tsx`

## app/reset-password  (1/1 have a test)

- [~] `apps/web/app/reset-password/page.tsx`

## app/search  (1/2 have a test)

- [ ] `apps/web/app/search/SearchPageContent.tsx`
- [~] `apps/web/app/search/page.tsx`

## app/settings  (3/4 have a test)

- [ ] `apps/web/app/settings/layout.tsx`
- [~] `apps/web/app/settings/loading.tsx`
- [~] `apps/web/app/settings/page.tsx`
- [~] `apps/web/app/settings/verify-email-change/page.tsx`

## app/signup  (2/4 have a test)

- [ ] `apps/web/app/signup/affiliate/[token]/layout.tsx`
- [~] `apps/web/app/signup/affiliate/[token]/page.tsx`
- [ ] `apps/web/app/signup/layout.tsx`
- [~] `apps/web/app/signup/page.tsx`

## app/terms  (1/2 have a test)

- [ ] `apps/web/app/terms/layout.tsx`
- [~] `apps/web/app/terms/page.tsx`

## app/u  (3/4 have a test)

- [ ] `apps/web/app/u/[id]/layout.tsx`
- [~] `apps/web/app/u/[id]/page.tsx`
- [~] `apps/web/app/u/loading.tsx`
- [~] `apps/web/app/u/page.tsx`

## app/v2  (17/19 have a test)

- [~] `apps/web/app/v2/(protected)/chats/page.tsx`
- [~] `apps/web/app/v2/(protected)/communities/[id]/page.tsx`
- [~] `apps/web/app/v2/(protected)/communities/page.tsx`
- [~] `apps/web/app/v2/(protected)/contacts/page.tsx`
- [~] `apps/web/app/v2/(protected)/feeds/page.tsx`
- [~] `apps/web/app/v2/(protected)/feeds/post/[postId]/page.tsx`
- [ ] `apps/web/app/v2/(protected)/layout.tsx`
- [~] `apps/web/app/v2/(protected)/links/page.tsx`
- [~] `apps/web/app/v2/(protected)/me/page.tsx`
- [~] `apps/web/app/v2/(protected)/notifications/page.tsx`
- [~] `apps/web/app/v2/(protected)/settings/page.tsx`
- [~] `apps/web/app/v2/(protected)/u/[username]/page.tsx`
- [~] `apps/web/app/v2/forgot-password/page.tsx`
- [~] `apps/web/app/v2/landing/page.tsx`
- [ ] `apps/web/app/v2/layout.tsx`
- [~] `apps/web/app/v2/login/page.tsx`
- [~] `apps/web/app/v2/privacy-policy/page.tsx`
- [~] `apps/web/app/v2/signup/page.tsx`
- [~] `apps/web/app/v2/terms/page.tsx`

## components  (0/2 have a test)

- [ ] `apps/web/components/index.ts`
- [ ] `apps/web/components/not-found-page.tsx`

## components/admin  (38/62 have a test)

- [x] `apps/web/components/admin/AdminLayout.tsx`
- [x] `apps/web/components/admin/Charts.tsx`
- [x] `apps/web/components/admin/ChartsImpl.tsx`
- [x] `apps/web/components/admin/ConfirmDialog.tsx`
- [x] `apps/web/components/admin/TableSkeleton.tsx`
- [x] `apps/web/components/admin/agent/AgentArchetypesTab.tsx`
- [x] `apps/web/components/admin/agent/AgentConfigDialog.tsx`
- [x] `apps/web/components/admin/agent/AgentConversationsTab.tsx`
- [x] `apps/web/components/admin/agent/AgentGlobalConfigTab.tsx`
- [x] `apps/web/components/admin/agent/AgentHistoryTab.tsx`
- [x] `apps/web/components/admin/agent/AgentLiveTab.tsx`
- [x] `apps/web/components/admin/agent/AgentLlmTab.tsx`
- [x] `apps/web/components/admin/agent/AgentMessagesModal.tsx`
- [x] `apps/web/components/admin/agent/AgentOverviewTab.tsx`
- [x] `apps/web/components/admin/agent/AgentRolesSection.tsx`
- [x] `apps/web/components/admin/agent/AgentScheduleTimeline.tsx`
- [x] `apps/web/components/admin/agent/AgentTopicEditModal.tsx`
- [x] `apps/web/components/admin/agent/AgentTopicRegexTester.tsx`
- [x] `apps/web/components/admin/agent/AgentTopicsTab.tsx`
- [x] `apps/web/components/admin/agent/ConversationPicker.tsx`
- [x] `apps/web/components/admin/agent/DeliveryQueueItemCard.tsx`
- [x] `apps/web/components/admin/agent/DeliveryQueuePanel.tsx`
- [x] `apps/web/components/admin/agent/InfoIcon.tsx`
- [x] `apps/web/components/admin/agent/ScanControlPanel.tsx`
- [x] `apps/web/components/admin/agent/ScanHistoryChart.tsx`
- [x] `apps/web/components/admin/agent/ScanLogDetail.tsx`
- [x] `apps/web/components/admin/agent/ScanLogTable.tsx`
- [x] `apps/web/components/admin/agent/TriggerSchedulingModal.tsx`
- [x] `apps/web/components/admin/agent/UserDisplay.tsx`
- [x] `apps/web/components/admin/agent/UserPicker.tsx`
- [x] `apps/web/components/admin/agent/config-form-merge.ts`
- [x] `apps/web/components/admin/ranking/ConversationRankCard.tsx`
- [x] `apps/web/components/admin/ranking/LinkRankCard.tsx`
- [x] `apps/web/components/admin/ranking/MessageRankCard.tsx`
- [x] `apps/web/components/admin/ranking/RankingFilters.tsx`
- [x] `apps/web/components/admin/ranking/RankingPodium.tsx`
- [x] `apps/web/components/admin/ranking/RankingStats.tsx`
- [x] `apps/web/components/admin/ranking/RankingStatsImpl.tsx`
- [x] `apps/web/components/admin/ranking/RankingTable.tsx`
- [x] `apps/web/components/admin/ranking/UserRankCard.tsx`
- [x] `apps/web/components/admin/ranking/constants.ts`
- [x] `apps/web/components/admin/ranking/index.ts`
- [x] `apps/web/components/admin/ranking/utils.tsx`
- [x] `apps/web/components/admin/settings/DatabaseSettingsSection.tsx`
- [x] `apps/web/components/admin/settings/FeaturesSettingsSection.tsx`
- [x] `apps/web/components/admin/settings/GeneralSettingsSection.tsx`
- [x] `apps/web/components/admin/settings/MessagesSettingsSection.tsx`
- [x] `apps/web/components/admin/settings/RateLimitingSettingsSection.tsx`
- [x] `apps/web/components/admin/settings/SecuritySettingsSection.tsx`
- [x] `apps/web/components/admin/settings/ServerSettingsSection.tsx`
- [x] `apps/web/components/admin/settings/SettingField.tsx`
- [x] `apps/web/components/admin/settings/SettingsAlerts.tsx`
- [x] `apps/web/components/admin/settings/SettingsHeader.tsx`
- [x] `apps/web/components/admin/settings/SettingsStats.tsx`
- [x] `apps/web/components/admin/settings/UploadsSettingsSection.tsx`
- [x] `apps/web/components/admin/settings/index.ts`
- [x] `apps/web/components/admin/user-detail/UserActivitySection.tsx`
- [x] `apps/web/components/admin/user-detail/UserContactInfoSection.tsx`
- [x] `apps/web/components/admin/user-detail/UserConversationsSection.tsx`
- [x] `apps/web/components/admin/user-detail/UserGeolocationSection.tsx`
- [x] `apps/web/components/admin/user-detail/UserLanguageSection.tsx`
- [x] `apps/web/components/admin/user-detail/UserMediaSection.tsx`
- [x] `apps/web/components/admin/user-detail/UserPersonalInfoSection.tsx`
- [x] `apps/web/components/admin/user-detail/UserPostsSection.tsx`
- [x] `apps/web/components/admin/user-detail/UserReportedMessagesSection.tsx`
- [x] `apps/web/components/admin/user-detail/UserReportsSection.tsx`
- [x] `apps/web/components/admin/user-detail/UserSecuritySection.tsx`

## components/affiliate  (0/2 have a test)

- [ ] `apps/web/components/affiliate/share-affiliate-button.tsx`
- [ ] `apps/web/components/affiliate/share-affiliate-modal.tsx`

## components/analytics  (0/2 have a test)

- [ ] `apps/web/components/analytics/GoogleAnalytics.tsx`
- [ ] `apps/web/components/analytics/index.ts`

## components/attachments  (8/31 have a test)

- [~] `apps/web/components/attachments/AttachmentCarousel.tsx`
- [ ] `apps/web/components/attachments/AttachmentContextMenu.tsx`
- [ ] `apps/web/components/attachments/AttachmentDeleteDialog.tsx`
- [~] `apps/web/components/attachments/AttachmentDetails.tsx`
- [~] `apps/web/components/attachments/AttachmentGallery.tsx`
- [ ] `apps/web/components/attachments/AttachmentGridLayout.tsx`
- [ ] `apps/web/components/attachments/AttachmentLightboxes.tsx`
- [~] `apps/web/components/attachments/AttachmentLimitModal.tsx`
- [~] `apps/web/components/attachments/AttachmentPreviewMini.tsx`
- [~] `apps/web/components/attachments/AttachmentPreviewReply.tsx`
- [ ] `apps/web/components/attachments/AudioAttachment.tsx`
- [ ] `apps/web/components/attachments/DocumentAttachment.tsx`
- [ ] `apps/web/components/attachments/FileAttachment.tsx`
- [ ] `apps/web/components/attachments/ImageAttachment.tsx`
- [ ] `apps/web/components/attachments/ImageLightbox.tsx`
- [~] `apps/web/components/attachments/MessageAttachments.tsx`
- [ ] `apps/web/components/attachments/VideoAttachment.tsx`
- [ ] `apps/web/components/attachments/carousel/AudioFilePreview.tsx`
- [ ] `apps/web/components/attachments/carousel/FilePreviewCard.tsx`
- [ ] `apps/web/components/attachments/carousel/LightboxRenderers.tsx`
- [ ] `apps/web/components/attachments/carousel/MediaViewers.tsx`
- [ ] `apps/web/components/attachments/carousel/hooks/useFileUrls.ts`
- [ ] `apps/web/components/attachments/carousel/hooks/useLightboxState.ts`
- [ ] `apps/web/components/attachments/carousel/hooks/useThumbnails.ts`
- [ ] `apps/web/components/attachments/carousel/index.ts`
- [~] `apps/web/components/attachments/carousel/types.ts`
- [ ] `apps/web/components/attachments/hooks/useAttachmentDeletion.ts`
- [ ] `apps/web/components/attachments/hooks/useAttachmentLightbox.ts`
- [ ] `apps/web/components/attachments/hooks/useResponsiveDetection.ts`
- [ ] `apps/web/components/attachments/index.ts`
- [ ] `apps/web/components/attachments/utils/attachmentFilters.ts`

## components/audio  (7/17 have a test)

- [ ] `apps/web/components/audio/AudioControls.tsx`
- [ ] `apps/web/components/audio/AudioEffectIcon.tsx`
- [~] `apps/web/components/audio/AudioEffectTile.tsx`
- [~] `apps/web/components/audio/AudioEffectsBadge.tsx`
- [ ] `apps/web/components/audio/AudioEffectsGraph.tsx`
- [ ] `apps/web/components/audio/AudioEffectsOverview.tsx`
- [ ] `apps/web/components/audio/AudioEffectsPanel.tsx`
- [ ] `apps/web/components/audio/AudioEffectsTimeline.tsx`
- [~] `apps/web/components/audio/AudioEffectsTimelineView.tsx`
- [ ] `apps/web/components/audio/AudioProgressBar.tsx`
- [~] `apps/web/components/audio/AudioRecorderCard.tsx`
- [~] `apps/web/components/audio/AudioRecorderWithEffects.tsx`
- [ ] `apps/web/components/audio/AudioTranscriptionPanel.tsx`
- [~] `apps/web/components/audio/AudioWaveform.tsx`
- [~] `apps/web/components/audio/SimpleAudioPlayer.tsx`
- [ ] `apps/web/components/audio/TranscriptionViewer.tsx`
- [ ] `apps/web/components/audio/index.ts`

## components/auth  (7/39 have a test)

- [ ] `apps/web/components/auth/AnonymousRedirect.tsx`
- [~] `apps/web/components/auth/AuthGuard.tsx`
- [ ] `apps/web/components/auth/FeatureGate.tsx`
- [~] `apps/web/components/auth/ForgotPasswordForm.tsx`
- [ ] `apps/web/components/auth/PasswordRequirementsChecklist.tsx`
- [~] `apps/web/components/auth/PasswordStrengthMeter.tsx`
- [ ] `apps/web/components/auth/PhoneExistsModal.tsx`
- [~] `apps/web/components/auth/PhoneResetFlow.tsx`
- [ ] `apps/web/components/auth/ResetPasswordForm.tsx`
- [~] `apps/web/components/auth/account-recovery-modal.tsx`
- [ ] `apps/web/components/auth/index.ts`
- [~] `apps/web/components/auth/login-form.tsx`
- [ ] `apps/web/components/auth/recovery/EmailRecoveryStep.tsx`
- [ ] `apps/web/components/auth/recovery/OTPInput.tsx`
- [ ] `apps/web/components/auth/recovery/PhoneCodeStep.tsx`
- [ ] `apps/web/components/auth/recovery/PhoneIdentityStep.tsx`
- [ ] `apps/web/components/auth/recovery/PhoneRecoveryStep.tsx`
- [ ] `apps/web/components/auth/recovery/RecoveryChoiceStep.tsx`
- [ ] `apps/web/components/auth/recovery/SuccessStep.tsx`
- [ ] `apps/web/components/auth/recovery/index.ts`
- [~] `apps/web/components/auth/register-form-wizard.tsx`
- [ ] `apps/web/components/auth/register-form.tsx`
- [ ] `apps/web/components/auth/register-form/EmailField.tsx`
- [ ] `apps/web/components/auth/register-form/FormField.tsx`
- [ ] `apps/web/components/auth/register-form/FormFooter.tsx`
- [ ] `apps/web/components/auth/register-form/LanguageSelector.tsx`
- [ ] `apps/web/components/auth/register-form/PasswordField.tsx`
- [ ] `apps/web/components/auth/register-form/PersonalInfoStep.tsx`
- [ ] `apps/web/components/auth/register-form/PhoneField.tsx`
- [ ] `apps/web/components/auth/register-form/UsernameField.tsx`
- [ ] `apps/web/components/auth/register-form/index.tsx`
- [ ] `apps/web/components/auth/wizard-steps/ContactStep.tsx`
- [ ] `apps/web/components/auth/wizard-steps/ExistingAccountAlert.tsx`
- [ ] `apps/web/components/auth/wizard-steps/IdentityStep.tsx`
- [ ] `apps/web/components/auth/wizard-steps/PreferencesStep.tsx`
- [ ] `apps/web/components/auth/wizard-steps/SecurityStep.tsx`
- [ ] `apps/web/components/auth/wizard-steps/UsernameStep.tsx`
- [ ] `apps/web/components/auth/wizard-steps/WizardProgress.tsx`
- [ ] `apps/web/components/auth/wizard-steps/index.ts`

## components/branding  (0/2 have a test)

- [ ] `apps/web/components/branding/index.ts`
- [ ] `apps/web/components/branding/logo.tsx`

## components/bubble-stream  (0/4 have a test)

- [ ] `apps/web/components/bubble-stream/StreamComposer.tsx`
- [ ] `apps/web/components/bubble-stream/StreamHeader.tsx`
- [ ] `apps/web/components/bubble-stream/StreamSidebar.tsx`
- [ ] `apps/web/components/bubble-stream/index.ts`

## components/chat  (0/1 have a test)

- [ ] `apps/web/components/chat/message-with-links.tsx`

## components/common  (13/41 have a test)

- [ ] `apps/web/components/common/Breadcrumb.tsx`
- [~] `apps/web/components/common/BubbleMessage.tsx`
- [ ] `apps/web/components/common/CriticalPreloader.tsx`
- [~] `apps/web/components/common/ErrorBoundary.tsx`
- [ ] `apps/web/components/common/HtmlLangSync.tsx`
- [~] `apps/web/components/common/LoadingStates.tsx`
- [ ] `apps/web/components/common/MentionAutocomplete.tsx`
- [ ] `apps/web/components/common/PrintButton.tsx`
- [ ] `apps/web/components/common/SystemStatusBanner.tsx`
- [ ] `apps/web/components/common/TabNotificationManager.tsx`
- [~] `apps/web/components/common/bubble-message/BubbleMessageNormalView.tsx`
- [ ] `apps/web/components/common/bubble-message/CallSystemMessage.tsx`
- [ ] `apps/web/components/common/bubble-message/DeleteConfirmationView.tsx`
- [ ] `apps/web/components/common/bubble-message/EditMessageView.tsx`
- [~] `apps/web/components/common/bubble-message/LanguageSelectionMessageView.tsx`
- [ ] `apps/web/components/common/bubble-message/MessageActionsBar.tsx`
- [ ] `apps/web/components/common/bubble-message/MessageAttachmentsSection.tsx`
- [ ] `apps/web/components/common/bubble-message/MessageContent.tsx`
- [ ] `apps/web/components/common/bubble-message/MessageHeader.tsx`
- [ ] `apps/web/components/common/bubble-message/MessageNameDate.tsx`
- [ ] `apps/web/components/common/bubble-message/MessageReadStatusDetails.tsx`
- [ ] `apps/web/components/common/bubble-message/MessageReplyPreview.tsx`
- [ ] `apps/web/components/common/bubble-message/ReactionSelectionMessageView.tsx`
- [ ] `apps/web/components/common/bubble-message/ReportMessageView.tsx`
- [~] `apps/web/components/common/bubble-message/types.ts`
- [ ] `apps/web/components/common/bubble-stream-page.tsx`
- [ ] `apps/web/components/common/client-only.tsx`
- [~] `apps/web/components/common/emoji-picker.tsx`
- [ ] `apps/web/components/common/index.ts`
- [~] `apps/web/components/common/language-switcher.tsx`
- [~] `apps/web/components/common/message-composer/DynamicGlow.tsx`
- [~] `apps/web/components/common/message-composer/GlassContainer.tsx`
- [~] `apps/web/components/common/message-composer/SendButton.tsx`
- [~] `apps/web/components/common/message-composer/ToolbarButtons.tsx`
- [ ] `apps/web/components/common/message-composer/index.tsx`
- [ ] `apps/web/components/common/message-reactions.tsx`
- [~] `apps/web/components/common/messages-display.tsx`
- [ ] `apps/web/components/common/metadata-test.tsx`
- [ ] `apps/web/components/common/translation-provider.tsx`
- [ ] `apps/web/components/common/trending-section.tsx`
- [ ] `apps/web/components/common/user-selector.tsx`

## components/contacts  (0/9 have a test)

- [ ] `apps/web/components/contacts/ContactsList.tsx`
- [ ] `apps/web/components/contacts/ContactsSearch.tsx`
- [ ] `apps/web/components/contacts/ContactsStats.tsx`
- [ ] `apps/web/components/contacts/ConversationDropdown.tsx`
- [ ] `apps/web/components/contacts/index.ts`
- [ ] `apps/web/components/contacts/tabs/AffiliatesTab.tsx`
- [ ] `apps/web/components/contacts/tabs/ConnectedContactsTab.tsx`
- [ ] `apps/web/components/contacts/tabs/PendingRequestsTab.tsx`
- [ ] `apps/web/components/contacts/tabs/RefusedRequestsTab.tsx`

## components/conversations  (27/90 have a test)

- [~] `apps/web/components/conversations/CommunityCarousel.tsx`
- [~] `apps/web/components/conversations/ConversationEmptyState.tsx`
- [~] `apps/web/components/conversations/ConversationEncryptionSection.tsx`
- [~] `apps/web/components/conversations/ConversationHeader.tsx`
- [~] `apps/web/components/conversations/ConversationLayout.tsx`
- [~] `apps/web/components/conversations/ConversationList.tsx`
- [~] `apps/web/components/conversations/ConversationMessages.tsx`
- [~] `apps/web/components/conversations/ConversationSettingsModal.tsx`
- [~] `apps/web/components/conversations/ConversationView.tsx`
- [ ] `apps/web/components/conversations/CreateConversationPage.tsx`
- [ ] `apps/web/components/conversations/MessageSearch.tsx`
- [ ] `apps/web/components/conversations/PinnedMessageBanner.tsx`
- [~] `apps/web/components/conversations/connection-status-indicator.tsx`
- [ ] `apps/web/components/conversations/conversation-details-sidebar.tsx`
- [ ] `apps/web/components/conversations/conversation-groups/ConversationGroup.tsx`
- [ ] `apps/web/components/conversations/conversation-groups/EmptyConversations.tsx`
- [ ] `apps/web/components/conversations/conversation-groups/index.ts`
- [~] `apps/web/components/conversations/conversation-image-upload-dialog.tsx`
- [ ] `apps/web/components/conversations/conversation-item/ConversationItem.tsx`
- [ ] `apps/web/components/conversations/conversation-item/ConversationItemActions.tsx`
- [~] `apps/web/components/conversations/conversation-item/ParticipantPresenceIndicator.tsx`
- [ ] `apps/web/components/conversations/conversation-item/conversation-utils.tsx`
- [ ] `apps/web/components/conversations/conversation-item/index.ts`
- [ ] `apps/web/components/conversations/conversation-item/message-formatting.tsx`
- [~] `apps/web/components/conversations/conversation-links-section.tsx`
- [ ] `apps/web/components/conversations/conversation-participants-drawer.tsx`
- [~] `apps/web/components/conversations/conversation-participants.tsx`
- [~] `apps/web/components/conversations/conversation-preview.tsx`
- [ ] `apps/web/components/conversations/conversation-search/ConversationSearchBar.tsx`
- [ ] `apps/web/components/conversations/conversation-search/index.ts`
- [~] `apps/web/components/conversations/create-conversation-modal.tsx`
- [ ] `apps/web/components/conversations/create-link-button.tsx`
- [~] `apps/web/components/conversations/create-link-modal.tsx`
- [ ] `apps/web/components/conversations/create-link-modal/components/InfoIcon.tsx`
- [ ] `apps/web/components/conversations/create-link-modal/components/SelectableSquare.tsx`
- [ ] `apps/web/components/conversations/create-link-modal/components/SuccessView.tsx`
- [ ] `apps/web/components/conversations/create-link-modal/constants.ts`
- [~] `apps/web/components/conversations/create-link-modal/hooks/useConversationSelection.ts`
- [ ] `apps/web/components/conversations/create-link-modal/hooks/useLinkSettings.ts`
- [ ] `apps/web/components/conversations/create-link-modal/hooks/useLinkValidation.ts`
- [ ] `apps/web/components/conversations/create-link-modal/hooks/useLinkWizard.ts`
- [ ] `apps/web/components/conversations/create-link-modal/index.ts`
- [ ] `apps/web/components/conversations/create-link-modal/steps/LinkConfigStep.tsx`
- [ ] `apps/web/components/conversations/create-link-modal/steps/LinkSummaryStep.tsx`
- [ ] `apps/web/components/conversations/create-link-modal/steps/LinkTypeStep.tsx`
- [ ] `apps/web/components/conversations/create-link-modal/steps/config-sections/ConversationSection.tsx`
- [ ] `apps/web/components/conversations/create-link-modal/steps/config-sections/LanguagesSection.tsx`
- [ ] `apps/web/components/conversations/create-link-modal/steps/config-sections/LinkSettingsSection.tsx`
- [ ] `apps/web/components/conversations/create-link-modal/steps/config-sections/PermissionsSection.tsx`
- [ ] `apps/web/components/conversations/create-link-modal/steps/summary-sections/SummaryDetails.tsx`
- [~] `apps/web/components/conversations/create-link-modal/types.ts`
- [~] `apps/web/components/conversations/details-sidebar/ActiveUsersSection.tsx`
- [ ] `apps/web/components/conversations/details-sidebar/CategorySelector.tsx`
- [ ] `apps/web/components/conversations/details-sidebar/CustomizationManager.tsx`
- [ ] `apps/web/components/conversations/details-sidebar/DescriptionSection.tsx`
- [ ] `apps/web/components/conversations/details-sidebar/DetailsHeader.tsx`
- [ ] `apps/web/components/conversations/details-sidebar/ShareLinksSection.tsx`
- [ ] `apps/web/components/conversations/details-sidebar/TagsManager.tsx`
- [ ] `apps/web/components/conversations/details-sidebar/index.ts`
- [ ] `apps/web/components/conversations/header/HeaderActions.tsx`
- [~] `apps/web/components/conversations/header/HeaderAvatar.tsx`
- [ ] `apps/web/components/conversations/header/HeaderTagsBar.tsx`
- [ ] `apps/web/components/conversations/header/HeaderToolbar.tsx`
- [ ] `apps/web/components/conversations/header/ParticipantsDisplay.tsx`
- [ ] `apps/web/components/conversations/header/TypingIndicator.tsx`
- [ ] `apps/web/components/conversations/header/index.ts`
- [~] `apps/web/components/conversations/header/types.ts`
- [x] `apps/web/components/conversations/header/use-call-banner.ts`
- [ ] `apps/web/components/conversations/header/use-encryption-info.ts`
- [ ] `apps/web/components/conversations/header/use-header-actions.ts`
- [~] `apps/web/components/conversations/header/use-header-preferences.ts`
- [ ] `apps/web/components/conversations/header/use-participant-info.ts`
- [ ] `apps/web/components/conversations/header/use-permissions.ts`
- [ ] `apps/web/components/conversations/hooks/index.ts`
- [ ] `apps/web/components/conversations/hooks/useConversationFiltering.ts`
- [ ] `apps/web/components/conversations/hooks/useConversationPreferences.ts`
- [ ] `apps/web/components/conversations/hooks/useConversationSorting.ts`
- [ ] `apps/web/components/conversations/hooks/useVirtualizedList.ts`
- [ ] `apps/web/components/conversations/identifier-suggestions.tsx`
- [ ] `apps/web/components/conversations/index.ts`
- [~] `apps/web/components/conversations/invite-user-modal.tsx`
- [~] `apps/web/components/conversations/link-summary-modal.tsx`
- [ ] `apps/web/components/conversations/quick-link-config-modal.tsx`
- [~] `apps/web/components/conversations/smart-search.tsx`
- [ ] `apps/web/components/conversations/steps/CommunitySelectionStep.tsx`
- [ ] `apps/web/components/conversations/steps/ConversationDetailsStep.tsx`
- [ ] `apps/web/components/conversations/steps/ConversationTypeStep.tsx`
- [ ] `apps/web/components/conversations/steps/MemberSelectionStep.tsx`
- [ ] `apps/web/components/conversations/steps/index.ts`
- [~] `apps/web/components/conversations/typing-indicator.tsx`

## components/dashboard  (0/8 have a test)

- [ ] `apps/web/components/dashboard/CommunitiesWidget.tsx`
- [ ] `apps/web/components/dashboard/ConversationsWidget.tsx`
- [ ] `apps/web/components/dashboard/CreateGroupModal.tsx`
- [ ] `apps/web/components/dashboard/DashboardHeader.tsx`
- [ ] `apps/web/components/dashboard/DashboardStats.tsx`
- [ ] `apps/web/components/dashboard/QuickActionsWidget.tsx`
- [ ] `apps/web/components/dashboard/StatsWidget.tsx`
- [ ] `apps/web/components/dashboard/index.ts`

## components/groups  (3/11 have a test)

- [~] `apps/web/components/groups/CommunityMembersPanel.tsx`
- [~] `apps/web/components/groups/CommunityPreferencesMenu.tsx`
- [~] `apps/web/components/groups/CommunitySettingsPanel.tsx`
- [ ] `apps/web/components/groups/ConversationsList.tsx`
- [ ] `apps/web/components/groups/CreateGroupModal.tsx`
- [ ] `apps/web/components/groups/GroupCard.tsx`
- [ ] `apps/web/components/groups/GroupDetails.tsx`
- [ ] `apps/web/components/groups/GroupsList.tsx`
- [ ] `apps/web/components/groups/groups-layout-responsive.tsx`
- [ ] `apps/web/components/groups/groups-layout.tsx`
- [ ] `apps/web/components/groups/index.ts`

## components/join  (0/7 have a test)

- [ ] `apps/web/components/join/AnonymousForm.tsx`
- [ ] `apps/web/components/join/JoinActions.tsx`
- [ ] `apps/web/components/join/JoinError.tsx`
- [ ] `apps/web/components/join/JoinHeader.tsx`
- [ ] `apps/web/components/join/JoinInfo.tsx`
- [ ] `apps/web/components/join/JoinLoading.tsx`
- [ ] `apps/web/components/join/index.ts`

## components/landing  (0/1 have a test)

- [ ] `apps/web/components/landing/LandingContent.tsx`

## components/language  (0/2 have a test)

- [ ] `apps/web/components/language/language-indicators.tsx`
- [ ] `apps/web/components/language/sidebar-language-header.tsx`

## components/layout  (3/4 have a test)

- [~] `apps/web/components/layout/DashboardLayout.tsx`
- [~] `apps/web/components/layout/Footer.tsx`
- [~] `apps/web/components/layout/Header.tsx`
- [ ] `apps/web/components/layout/index.ts`

## components/links  (1/8 have a test)

- [ ] `apps/web/components/links/create-link-button.tsx`
- [ ] `apps/web/components/links/create-tracking-link-modal.tsx`
- [ ] `apps/web/components/links/edit-tracking-link-modal.tsx`
- [ ] `apps/web/components/links/expandable-link-card.tsx`
- [ ] `apps/web/components/links/expandable-tracking-link-card.tsx`
- [~] `apps/web/components/links/link-details-modal.tsx`
- [ ] `apps/web/components/links/link-edit-modal.tsx`
- [ ] `apps/web/components/links/tracking-link-details-modal.tsx`

## components/markdown  (4/5 have a test)

- [~] `apps/web/components/markdown/CodeHighlighter.tsx`
- [~] `apps/web/components/markdown/MarkdownLightbox.tsx`
- [~] `apps/web/components/markdown/MarkdownViewer.tsx`
- [~] `apps/web/components/markdown/MermaidDiagram.tsx`
- [ ] `apps/web/components/markdown/MermaidDiagramImpl.tsx`

## components/messages  (1/3 have a test)

- [ ] `apps/web/components/messages/FailedMessageBar.tsx`
- [ ] `apps/web/components/messages/MarkdownMessage.tsx`
- [~] `apps/web/components/messages/failed-message-banner.tsx`

## components/notifications  (0/11 have a test)

- [ ] `apps/web/components/notifications/ConnectionStatusIndicator.tsx`
- [ ] `apps/web/components/notifications/NotificationBell.tsx`
- [ ] `apps/web/components/notifications/NotificationDropdown.tsx`
- [ ] `apps/web/components/notifications/NotificationEmptyState.tsx`
- [ ] `apps/web/components/notifications/NotificationFilters.tsx`
- [ ] `apps/web/components/notifications/NotificationItem.tsx`
- [ ] `apps/web/components/notifications/NotificationList.tsx`
- [ ] `apps/web/components/notifications/NotificationSkeleton.tsx`
- [ ] `apps/web/components/notifications/NotificationTest.tsx`
- [ ] `apps/web/components/notifications/PushPermissionBanner.tsx`
- [ ] `apps/web/components/notifications/index.ts`

## components/pdf  (1/3 have a test)

- [ ] `apps/web/components/pdf/PDFLightboxSimple.tsx`
- [ ] `apps/web/components/pdf/PDFViewer.tsx`
- [~] `apps/web/components/pdf/PDFViewerWrapper.tsx`

## components/pptx  (0/2 have a test)

- [ ] `apps/web/components/pptx/PPTXLightbox.tsx`
- [ ] `apps/web/components/pptx/PPTXViewer.tsx`

## components/presence  (2/2 have a test)

- [~] `apps/web/components/presence/UserPresenceBadge.tsx`
- [~] `apps/web/components/presence/UserPresenceLabel.tsx`

## components/providers  (0/6 have a test)

- [ ] `apps/web/components/providers/FirebaseInitializer.tsx`
- [ ] `apps/web/components/providers/PresenceProvider.tsx`
- [ ] `apps/web/components/providers/QueryProvider.tsx`
- [ ] `apps/web/components/providers/ServiceWorkerInitializer.tsx`
- [ ] `apps/web/components/providers/ThemeProvider.tsx`
- [ ] `apps/web/components/providers/index.ts`

## components/settings  (14/41 have a test)

- [ ] `apps/web/components/settings/ApplicationSettings.example.tsx`
- [~] `apps/web/components/settings/ApplicationSettings.tsx`
- [ ] `apps/web/components/settings/BetaPlayground.example.tsx`
- [ ] `apps/web/components/settings/BetaPlayground.tsx`
- [ ] `apps/web/components/settings/ConsentDialog.tsx`
- [ ] `apps/web/components/settings/DocumentSettings.tsx`
- [ ] `apps/web/components/settings/MessageSettings.tsx`
- [ ] `apps/web/components/settings/ProfileSettings.example.tsx`
- [ ] `apps/web/components/settings/ProfileSettings.tsx`
- [~] `apps/web/components/settings/TwoFactorSettings.tsx`
- [ ] `apps/web/components/settings/VideoSettings.tsx`
- [~] `apps/web/components/settings/_archived/complete-user-settings.tsx`
- [~] `apps/web/components/settings/_archived/settings-layout.tsx`
- [ ] `apps/web/components/settings/application-settings.tsx`
- [~] `apps/web/components/settings/audio-settings.tsx`
- [~] `apps/web/components/settings/avatar-crop-dialog.tsx`
- [ ] `apps/web/components/settings/beta-playground.tsx`
- [~] `apps/web/components/settings/config-modal.tsx`
- [ ] `apps/web/components/settings/document-settings.tsx`
- [~] `apps/web/components/settings/encryption-settings.tsx`
- [ ] `apps/web/components/settings/font-preview.tsx`
- [~] `apps/web/components/settings/font-selector.tsx`
- [ ] `apps/web/components/settings/index.ts`
- [~] `apps/web/components/settings/language-selector.tsx`
- [ ] `apps/web/components/settings/media-settings.tsx`
- [ ] `apps/web/components/settings/message-settings.tsx`
- [~] `apps/web/components/settings/notification-settings.tsx`
- [~] `apps/web/components/settings/password-settings.tsx`
- [~] `apps/web/components/settings/privacy-settings.tsx`
- [ ] `apps/web/components/settings/theme-settings.tsx`
- [ ] `apps/web/components/settings/user-settings-content.tsx`
- [ ] `apps/web/components/settings/user-settings-modal.tsx`
- [~] `apps/web/components/settings/user-settings.tsx`
- [ ] `apps/web/components/settings/video-settings.tsx`
- [ ] `apps/web/components/settings/voice-profile-settings.tsx`
- [ ] `apps/web/components/settings/voice/VoiceProfileConsent.tsx`
- [ ] `apps/web/components/settings/voice/VoiceProfileInfo.tsx`
- [ ] `apps/web/components/settings/voice/VoiceQualityConfig.tsx`
- [ ] `apps/web/components/settings/voice/VoiceRecorder.tsx`
- [ ] `apps/web/components/settings/voice/VoiceSettingsPanel.tsx`
- [ ] `apps/web/components/settings/voice/index.ts`

## components/text  (2/2 have a test)

- [~] `apps/web/components/text/TextLightbox.tsx`
- [~] `apps/web/components/text/TextViewer.tsx`

## components/translation  (1/6 have a test)

- [ ] `apps/web/components/translation/index.ts`
- [ ] `apps/web/components/translation/language-flag-selector.tsx`
- [~] `apps/web/components/translation/language-selector.tsx`
- [ ] `apps/web/components/translation/language-settings.tsx`
- [ ] `apps/web/components/translation/translation-monitor.tsx`
- [ ] `apps/web/components/translation/translation-stats.tsx`

## components/ui  (1/35 have a test)

- [ ] `apps/web/components/ui/FeatureErrorBoundary.tsx`
- [ ] `apps/web/components/ui/access-denied.tsx`
- [ ] `apps/web/components/ui/accordion.tsx`
- [ ] `apps/web/components/ui/alert-dialog.tsx`
- [ ] `apps/web/components/ui/alert.tsx`
- [ ] `apps/web/components/ui/avatar.tsx`
- [ ] `apps/web/components/ui/badge.tsx`
- [~] `apps/web/components/ui/button.tsx`
- [ ] `apps/web/components/ui/card.tsx`
- [ ] `apps/web/components/ui/checkbox.tsx`
- [ ] `apps/web/components/ui/collapsible.tsx`
- [ ] `apps/web/components/ui/command.tsx`
- [ ] `apps/web/components/ui/dialog.tsx`
- [ ] `apps/web/components/ui/dropdown-menu.tsx`
- [ ] `apps/web/components/ui/foldable-section.tsx`
- [ ] `apps/web/components/ui/index.ts`
- [ ] `apps/web/components/ui/input.tsx`
- [ ] `apps/web/components/ui/label.tsx`
- [ ] `apps/web/components/ui/language-select.tsx`
- [ ] `apps/web/components/ui/loading-state.tsx`
- [ ] `apps/web/components/ui/online-indicator.tsx`
- [ ] `apps/web/components/ui/popover.tsx`
- [ ] `apps/web/components/ui/progress.tsx`
- [ ] `apps/web/components/ui/responsive-tabs.tsx`
- [ ] `apps/web/components/ui/scroll-area.tsx`
- [ ] `apps/web/components/ui/select.tsx`
- [ ] `apps/web/components/ui/separator.tsx`
- [ ] `apps/web/components/ui/sheet.tsx`
- [ ] `apps/web/components/ui/skeleton.tsx`
- [ ] `apps/web/components/ui/slider.tsx`
- [ ] `apps/web/components/ui/sonner.tsx`
- [ ] `apps/web/components/ui/switch.tsx`
- [ ] `apps/web/components/ui/tabs.tsx`
- [ ] `apps/web/components/ui/textarea.tsx`
- [ ] `apps/web/components/ui/tooltip.tsx`

## components/v2  (3/72 have a test)

- [ ] `apps/web/components/v2/AudioPlayer.tsx`
- [ ] `apps/web/components/v2/AudioPostComposer.tsx`
- [ ] `apps/web/components/v2/Avatar.tsx`
- [ ] `apps/web/components/v2/Badge.tsx`
- [ ] `apps/web/components/v2/BlockedUserCard.tsx`
- [ ] `apps/web/components/v2/Button.tsx`
- [ ] `apps/web/components/v2/Card.tsx`
- [ ] `apps/web/components/v2/CategoryHeader.tsx`
- [ ] `apps/web/components/v2/CommentComposer.tsx`
- [ ] `apps/web/components/v2/CommentItem.tsx`
- [ ] `apps/web/components/v2/CommentList.tsx`
- [ ] `apps/web/components/v2/CommentThread.tsx`
- [~] `apps/web/components/v2/CommunityCarousel.tsx`
- [ ] `apps/web/components/v2/ContactCard.tsx`
- [~] `apps/web/components/v2/ContactLastSeenLabel.tsx`
- [ ] `apps/web/components/v2/ConversationDrawer.tsx`
- [ ] `apps/web/components/v2/ConversationItem.tsx`
- [ ] `apps/web/components/v2/ConversationSettings.tsx`
- [ ] `apps/web/components/v2/Dialog.tsx`
- [ ] `apps/web/components/v2/EmptyState.tsx`
- [ ] `apps/web/components/v2/EmptyStates.tsx`
- [ ] `apps/web/components/v2/FriendRequestCard.tsx`
- [ ] `apps/web/components/v2/GhostBadge.tsx`
- [ ] `apps/web/components/v2/ImageGallery.tsx`
- [ ] `apps/web/components/v2/Input.tsx`
- [ ] `apps/web/components/v2/Label.tsx`
- [ ] `apps/web/components/v2/LanguageOrb.tsx`
- [ ] `apps/web/components/v2/MediaAudioCard.tsx`
- [ ] `apps/web/components/v2/MediaImageCard.tsx`
- [ ] `apps/web/components/v2/MediaVideoCard.tsx`
- [ ] `apps/web/components/v2/MessageBubble.tsx`
- [ ] `apps/web/components/v2/MessageComposer.tsx`
- [ ] `apps/web/components/v2/MessageTimestamp.tsx`
- [ ] `apps/web/components/v2/PostCard.tsx`
- [ ] `apps/web/components/v2/PostComposer.tsx`
- [ ] `apps/web/components/v2/PostDetail.tsx`
- [ ] `apps/web/components/v2/PostEditor.tsx`
- [ ] `apps/web/components/v2/ProgressSteps.tsx`
- [ ] `apps/web/components/v2/RadioGroup.tsx`
- [ ] `apps/web/components/v2/ReactionPicker.tsx`
- [ ] `apps/web/components/v2/ReplyPreview.tsx`
- [ ] `apps/web/components/v2/RepostModal.tsx`
- [ ] `apps/web/components/v2/Resizer.tsx`
- [ ] `apps/web/components/v2/Separator.tsx`
- [ ] `apps/web/components/v2/Skeleton.tsx`
- [ ] `apps/web/components/v2/StatusBar.tsx`
- [ ] `apps/web/components/v2/StatusComposer.tsx`
- [ ] `apps/web/components/v2/StoryComposer.tsx`
- [ ] `apps/web/components/v2/StoryTray.tsx`
- [ ] `apps/web/components/v2/StoryViewer.tsx`
- [ ] `apps/web/components/v2/SwipeableRow.tsx`
- [ ] `apps/web/components/v2/Switch.tsx`
- [ ] `apps/web/components/v2/TagInput.tsx`
- [ ] `apps/web/components/v2/Textarea.tsx`
- [ ] `apps/web/components/v2/ThemeProvider.tsx`
- [ ] `apps/web/components/v2/ThemeToggle.tsx`
- [ ] `apps/web/components/v2/Toast.tsx`
- [ ] `apps/web/components/v2/Tooltip.tsx`
- [ ] `apps/web/components/v2/TranslationToggle.tsx`
- [ ] `apps/web/components/v2/TypingIndicator.tsx`
- [~] `apps/web/components/v2/VideoPlayer.tsx`
- [ ] `apps/web/components/v2/auth/AuthGuardV2.tsx`
- [ ] `apps/web/components/v2/auth/index.ts`
- [ ] `apps/web/components/v2/flags.ts`
- [ ] `apps/web/components/v2/index.ts`
- [ ] `apps/web/components/v2/layout/ConversationSidebar.tsx`
- [ ] `apps/web/components/v2/layout/PageHeader.tsx`
- [ ] `apps/web/components/v2/layout/RightPanelHeader.tsx`
- [ ] `apps/web/components/v2/layout/SplitViewContext.tsx`
- [ ] `apps/web/components/v2/layout/SplitViewLayout.tsx`
- [ ] `apps/web/components/v2/layout/index.ts`
- [ ] `apps/web/components/v2/theme.ts`

## components/video  (6/6 have a test)

- [x] `apps/web/components/video/CompactVideoPlayer.tsx`
- [x] `apps/web/components/video/VideoControls.tsx`
- [x] `apps/web/components/video/VideoLightbox.tsx`
- [x] `apps/web/components/video/VideoPlayer.tsx`
- [x] `apps/web/components/video/VolumeControl.tsx`
- [x] `apps/web/components/video/index.ts`

## components/video-call  (0/3 have a test)

- [ ] `apps/web/components/video-call/CallManager.tsx`
- [ ] `apps/web/components/video-call/CallNotification.tsx`
- [ ] `apps/web/components/video-call/index.ts`

## components/video-calls  (5/27 have a test)

- [ ] `apps/web/components/video-calls/AudioEffectsCarousel.tsx`
- [ ] `apps/web/components/video-calls/AudioEffectsPanel.tsx`
- [~] `apps/web/components/video-calls/CallControls.tsx`
- [ ] `apps/web/components/video-calls/CallErrorBoundary.tsx`
- [~] `apps/web/components/video-calls/CallInfoOverlay.tsx`
- [~] `apps/web/components/video-calls/CallQualityOverlay.tsx`
- [ ] `apps/web/components/video-calls/CallStatusIndicator.tsx`
- [ ] `apps/web/components/video-calls/ConnectionQualityBadge.tsx`
- [ ] `apps/web/components/video-calls/DraggableParticipantOverlay.tsx`
- [~] `apps/web/components/video-calls/LocalVideoTile.tsx`
- [ ] `apps/web/components/video-calls/OngoingCallBanner.tsx`
- [ ] `apps/web/components/video-calls/PermissionRequest.tsx`
- [~] `apps/web/components/video-calls/VideoCallInterface.tsx`
- [ ] `apps/web/components/video-calls/VideoStream.tsx`
- [ ] `apps/web/components/video-calls/audio-effects/CarouselNavigation.tsx`
- [ ] `apps/web/components/video-calls/audio-effects/EffectCard.tsx`
- [ ] `apps/web/components/video-calls/audio-effects/EffectDetailsPreview.tsx`
- [ ] `apps/web/components/video-calls/audio-effects/effect-details/BabyVoiceDetails.tsx`
- [ ] `apps/web/components/video-calls/audio-effects/effect-details/BackSoundDetails.tsx`
- [ ] `apps/web/components/video-calls/audio-effects/effect-details/DemonVoiceDetails.tsx`
- [ ] `apps/web/components/video-calls/audio-effects/effect-details/VoiceCoderDetails.tsx`
- [ ] `apps/web/components/video-calls/audio-effects/hooks/useAudioEffects.ts`
- [ ] `apps/web/components/video-calls/audio-effects/index.ts`
- [ ] `apps/web/components/video-calls/hooks/useCallSignaling.ts`
- [ ] `apps/web/components/video-calls/hooks/useVideoFilters.ts`
- [ ] `apps/web/components/video-calls/hooks/useWebRTC.ts`
- [ ] `apps/web/components/video-calls/index.ts`

## config  (0/1 have a test)

- [ ] `apps/web/config/admin-settings-config.ts`

## constants  (1/3 have a test)

- [ ] `apps/web/constants/animations.ts`
- [~] `apps/web/constants/auth.ts`
- [ ] `apps/web/constants/countries.ts`

## hooks  (34/103 have a test)

- [~] `apps/web/hooks/compatibility-hooks.ts`
- [ ] `apps/web/hooks/index.ts`
- [ ] `apps/web/hooks/use-accessibility.ts`
- [~] `apps/web/hooks/use-active-peer-connection.ts`
- [~] `apps/web/hooks/use-adaptive-degradation.ts`
- [ ] `apps/web/hooks/use-anonymous-messages.ts`
- [ ] `apps/web/hooks/use-anonymous-session.ts`
- [ ] `apps/web/hooks/use-app-badge.ts`
- [ ] `apps/web/hooks/use-audio-effects-analysis.ts`
- [ ] `apps/web/hooks/use-audio-effects-timeline.ts`
- [ ] `apps/web/hooks/use-audio-effects.ts`
- [ ] `apps/web/hooks/use-audio-playback.ts`
- [ ] `apps/web/hooks/use-audio-translation.ts`
- [~] `apps/web/hooks/use-auth-guard.ts`
- [~] `apps/web/hooks/use-auth.ts`
- [x] `apps/web/hooks/use-auto-retry-failed-messages.ts`
- [~] `apps/web/hooks/use-bot-protection.ts`
- [x] `apps/web/hooks/use-call-duration.ts`
- [x] `apps/web/hooks/use-call-quality.ts`
- [x] `apps/web/hooks/use-connection-status.ts`
- [ ] `apps/web/hooks/use-contacts-actions.ts`
- [ ] `apps/web/hooks/use-contacts-data.ts`
- [~] `apps/web/hooks/use-contacts-filtering.ts`
- [~] `apps/web/hooks/use-conversation-creation.ts`
- [ ] `apps/web/hooks/use-conversation-details.ts`
- [ ] `apps/web/hooks/use-conversation-join.ts`
- [~] `apps/web/hooks/use-conversation-messages.ts`
- [ ] `apps/web/hooks/use-conversation-stats.ts`
- [ ] `apps/web/hooks/use-dashboard-data.ts`
- [ ] `apps/web/hooks/use-dashboard-stats.ts`
- [~] `apps/web/hooks/use-draggable.ts`
- [~] `apps/web/hooks/use-encryption.ts`
- [~] `apps/web/hooks/use-fcm-notifications.ts`
- [~] `apps/web/hooks/use-feature-flags.ts`
- [ ] `apps/web/hooks/use-field-validation.ts`
- [ ] `apps/web/hooks/use-firebase-init.ts`
- [ ] `apps/web/hooks/use-fix-z-index.ts`
- [~] `apps/web/hooks/use-font-preference.ts`
- [ ] `apps/web/hooks/use-fullscreen.ts`
- [ ] `apps/web/hooks/use-group-modal.ts`
- [ ] `apps/web/hooks/use-groups-responsive.ts`
- [~] `apps/web/hooks/use-i18n.ts`
- [~] `apps/web/hooks/use-identifier-validation.ts`
- [ ] `apps/web/hooks/use-join-flow.ts`
- [ ] `apps/web/hooks/use-landing-auth.ts`
- [~] `apps/web/hooks/use-language.ts`
- [ ] `apps/web/hooks/use-lazy-image.ts`
- [ ] `apps/web/hooks/use-link-validation.ts`
- [~] `apps/web/hooks/use-live-user-status.ts`
- [~] `apps/web/hooks/use-long-press.ts`
- [ ] `apps/web/hooks/use-manual-status-refresh.ts`
- [ ] `apps/web/hooks/use-message-display.ts`
- [ ] `apps/web/hooks/use-message-interactions.ts`
- [~] `apps/web/hooks/use-message-reactions.ts`
- [~] `apps/web/hooks/use-message-translations.ts`
- [ ] `apps/web/hooks/use-message-view-state.tsx`
- [x] `apps/web/hooks/use-messaging.ts`
- [~] `apps/web/hooks/use-network-status.ts`
- [ ] `apps/web/hooks/use-participant-management.ts`
- [ ] `apps/web/hooks/use-phone-validation.ts`
- [x] `apps/web/hooks/use-post-translation.ts`
- [ ] `apps/web/hooks/use-preferences.ts`
- [ ] `apps/web/hooks/use-prefetch-on-hover.ts`
- [ ] `apps/web/hooks/use-prefetch.ts`
- [~] `apps/web/hooks/use-push-notifications.ts`
- [ ] `apps/web/hooks/use-pwa-badge.ts`
- [ ] `apps/web/hooks/use-ranking-data.ts`
- [ ] `apps/web/hooks/use-ranking-filters.ts`
- [ ] `apps/web/hooks/use-ranking-sort.ts`
- [ ] `apps/web/hooks/use-recovery-flow.ts`
- [ ] `apps/web/hooks/use-recovery-submission.ts`
- [ ] `apps/web/hooks/use-recovery-validation.ts`
- [~] `apps/web/hooks/use-register-form.ts`
- [ ] `apps/web/hooks/use-registration-submit.ts`
- [ ] `apps/web/hooks/use-registration-validation.ts`
- [ ] `apps/web/hooks/use-registration-wizard.ts`
- [x] `apps/web/hooks/use-resolved-theme.ts`
- [ ] `apps/web/hooks/use-single-tap.ts`
- [x] `apps/web/hooks/use-socketio-messaging.ts`
- [ ] `apps/web/hooks/use-stream-messages.ts`
- [ ] `apps/web/hooks/use-stream-socket.ts`
- [ ] `apps/web/hooks/use-stream-translation.ts`
- [ ] `apps/web/hooks/use-stream-ui.ts`
- [x] `apps/web/hooks/use-tab-notification.ts`
- [ ] `apps/web/hooks/use-translation-performance.ts`
- [ ] `apps/web/hooks/use-unsaved-changes-warning.ts`
- [ ] `apps/web/hooks/use-user-search.ts`
- [~] `apps/web/hooks/use-user-status-realtime.ts`
- [x] `apps/web/hooks/use-video-playback.ts`
- [ ] `apps/web/hooks/use-virtual-keyboard.ts`
- [ ] `apps/web/hooks/use-voice-analysis.ts`
- [ ] `apps/web/hooks/use-voice-profile-management.ts`
- [ ] `apps/web/hooks/use-voice-recording.ts`
- [ ] `apps/web/hooks/use-voice-settings.ts`
- [ ] `apps/web/hooks/use-volume.ts`
- [~] `apps/web/hooks/use-webrtc-p2p.ts`
- [~] `apps/web/hooks/use-websocket.ts`
- [ ] `apps/web/hooks/useHapticFeedback.ts`
- [ ] `apps/web/hooks/useI18n.ts`
- [ ] `apps/web/hooks/useMessageTranslation.ts`
- [~] `apps/web/hooks/usePerformanceProfile.ts`
- [ ] `apps/web/hooks/useTextAttachmentDetection.ts`
- [ ] `apps/web/hooks/useThrottle.ts`

## hooks/admin  (5/5 have a test)

- [x] `apps/web/hooks/admin/index.ts`
- [x] `apps/web/hooks/admin/use-admin-settings.ts`
- [x] `apps/web/hooks/admin/use-agent-admin-events.ts`
- [x] `apps/web/hooks/admin/use-settings-save.ts`
- [x] `apps/web/hooks/admin/use-settings-validation.ts`

## hooks/composer  (11/12 have a test)

- [ ] `apps/web/hooks/composer/index.ts`
- [~] `apps/web/hooks/composer/useAnimationConfig.ts`
- [~] `apps/web/hooks/composer/useAttachmentUpload.ts`
- [~] `apps/web/hooks/composer/useAudioRecorder.ts`
- [~] `apps/web/hooks/composer/useClipboardPaste.ts`
- [~] `apps/web/hooks/composer/useComposerState.ts`
- [~] `apps/web/hooks/composer/useDraftAutosave.ts`
- [~] `apps/web/hooks/composer/useMentions.ts`
- [~] `apps/web/hooks/composer/useRateLimiting.ts`
- [~] `apps/web/hooks/composer/useTextareaAutosize.ts`
- [~] `apps/web/hooks/composer/useTypingGlow.ts`
- [~] `apps/web/hooks/composer/useUploadRetry.ts`

## hooks/conversations  (8/9 have a test)

- [ ] `apps/web/hooks/conversations/index.ts`
- [~] `apps/web/hooks/conversations/use-participants.ts`
- [~] `apps/web/hooks/conversations/use-translation-state.ts`
- [x] `apps/web/hooks/conversations/use-video-call.ts`
- [~] `apps/web/hooks/conversations/useComposerDrafts.ts`
- [~] `apps/web/hooks/conversations/useConversationSelection.ts`
- [~] `apps/web/hooks/conversations/useConversationTyping.ts`
- [~] `apps/web/hooks/conversations/useConversationUI.ts`
- [~] `apps/web/hooks/conversations/useMessageActions.ts`

## hooks/examples  (0/1 have a test)

- [ ] `apps/web/hooks/examples/use-preferences-example.tsx`

## hooks/queries  (19/24 have a test)

- [ ] `apps/web/hooks/queries/index.ts`
- [~] `apps/web/hooks/queries/types.ts`
- [~] `apps/web/hooks/queries/use-comment-mutations.ts`
- [~] `apps/web/hooks/queries/use-comments-query.ts`
- [~] `apps/web/hooks/queries/use-communities-query.ts`
- [~] `apps/web/hooks/queries/use-community-preferences-query.ts`
- [~] `apps/web/hooks/queries/use-conversation-messages-rq.ts`
- [~] `apps/web/hooks/queries/use-conversation-preferences-query.ts`
- [~] `apps/web/hooks/queries/use-conversations-pagination-rq.ts`
- [~] `apps/web/hooks/queries/use-conversations-query.ts`
- [x] `apps/web/hooks/queries/use-feed-query.ts`
- [x] `apps/web/hooks/queries/use-feed-variants.ts`
- [ ] `apps/web/hooks/queries/use-message-status-details.ts`
- [~] `apps/web/hooks/queries/use-messages-query.ts`
- [ ] `apps/web/hooks/queries/use-notifications-manager-rq.tsx`
- [~] `apps/web/hooks/queries/use-notifications-query.ts`
- [x] `apps/web/hooks/queries/use-post-mutations.ts`
- [~] `apps/web/hooks/queries/use-post-query.ts`
- [x] `apps/web/hooks/queries/use-post-socket-cache-sync.ts`
- [ ] `apps/web/hooks/queries/use-preferences-queries.ts`
- [x] `apps/web/hooks/queries/use-reactions-query.ts`
- [~] `apps/web/hooks/queries/use-send-message-mutation.ts`
- [~] `apps/web/hooks/queries/use-socket-cache-sync.ts`
- [~] `apps/web/hooks/queries/use-users-query.ts`

## hooks/social  (0/4 have a test)

- [x] `apps/web/hooks/social/use-feed-realtime.ts`
- [ ] `apps/web/hooks/social/use-social-socket.ts`
- [x] `apps/web/hooks/social/use-stories-realtime.ts`
- [x] `apps/web/hooks/social/use-stories.ts`

## hooks/v2  (4/14 have a test)

- [ ] `apps/web/hooks/v2/index.ts`
- [~] `apps/web/hooks/v2/use-blocked-users-v2.ts`
- [ ] `apps/web/hooks/v2/use-chat-v2.ts`
- [~] `apps/web/hooks/v2/use-contacts-v2.ts`
- [ ] `apps/web/hooks/v2/use-conversation-url-sync.ts`
- [ ] `apps/web/hooks/v2/use-conversations-v2.ts`
- [ ] `apps/web/hooks/v2/use-forgot-password-v2.ts`
- [~] `apps/web/hooks/v2/use-friend-requests-v2.ts`
- [ ] `apps/web/hooks/v2/use-login-v2.ts`
- [ ] `apps/web/hooks/v2/use-messages-v2.ts`
- [x] `apps/web/hooks/v2/use-notifications-v2.ts`
- [~] `apps/web/hooks/v2/use-profile-v2.ts`
- [ ] `apps/web/hooks/v2/use-settings-v2.ts`
- [ ] `apps/web/hooks/v2/use-signup-v2.ts`

## lib  (14/29 have a test)

- [~] `apps/web/lib/avatar-utils.ts`
- [ ] `apps/web/lib/bubble-stream-modules.ts`
- [~] `apps/web/lib/clipboard.ts`
- [ ] `apps/web/lib/config.ts`
- [ ] `apps/web/lib/contacts-utils.ts`
- [~] `apps/web/lib/cursor-position.ts`
- [~] `apps/web/lib/device-locale.ts`
- [~] `apps/web/lib/fonts.ts`
- [ ] `apps/web/lib/geolocation.ts`
- [ ] `apps/web/lib/i18n-server.ts`
- [~] `apps/web/lib/i18n-utils.ts`
- [~] `apps/web/lib/i18n.ts`
- [ ] `apps/web/lib/icons.ts`
- [ ] `apps/web/lib/lazy-components.tsx`
- [~] `apps/web/lib/lru-cache.ts`
- [ ] `apps/web/lib/motion.tsx`
- [ ] `apps/web/lib/og-images.ts`
- [ ] `apps/web/lib/polyfills.ts`
- [ ] `apps/web/lib/seo-config.ts`
- [ ] `apps/web/lib/server-cache.ts`
- [ ] `apps/web/lib/settings-sync.ts`
- [~] `apps/web/lib/share-utils.ts`
- [x] `apps/web/lib/story-transforms.ts`
- [~] `apps/web/lib/ui-imports.ts`
- [~] `apps/web/lib/user-status.ts`
- [~] `apps/web/lib/utils.ts`
- [ ] `apps/web/lib/voice-profile-utils.ts`
- [ ] `apps/web/lib/z-index-validator.ts`
- [~] `apps/web/lib/z-index.ts`

## lib/calls  (1/1 have a test)

- [x] `apps/web/lib/calls/adaptive-degradation.ts`

## lib/constants  (1/1 have a test)

- [~] `apps/web/lib/constants/languages.ts`

## lib/encryption  (5/7 have a test)

- [~] `apps/web/lib/encryption/adapters/browser-signal-stores.ts`
- [ ] `apps/web/lib/encryption/adapters/index.ts`
- [~] `apps/web/lib/encryption/adapters/indexeddb-key-storage-adapter.ts`
- [~] `apps/web/lib/encryption/adapters/web-crypto-adapter.ts`
- [~] `apps/web/lib/encryption/attachment-encryption.ts`
- [~] `apps/web/lib/encryption/e2ee-crypto.ts`
- [ ] `apps/web/lib/encryption/index.ts`

## lib/i18n  (2/3 have a test)

- [~] `apps/web/lib/i18n/locale-config.ts`
- [~] `apps/web/lib/i18n/metadata.ts`
- [ ] `apps/web/lib/i18n/server-locale.ts`

## lib/images  (1/1 have a test)

- [~] `apps/web/lib/images/srcset.ts`

## lib/react-query  (0/4 have a test)

- [ ] `apps/web/lib/react-query/focus-manager.ts`
- [ ] `apps/web/lib/react-query/persister.ts`
- [ ] `apps/web/lib/react-query/query-client.ts`
- [ ] `apps/web/lib/react-query/query-keys.ts`

## lib/utils  (0/2 have a test)

- [ ] `apps/web/lib/utils/image-thumbnail.ts`
- [ ] `apps/web/lib/utils/link-parser.ts`

## locales/en  (0/2 have a test)

- [ ] `apps/web/locales/en/example-usage.ts`
- [ ] `apps/web/locales/en/index.ts`

## locales/es  (0/1 have a test)

- [ ] `apps/web/locales/es/index.ts`

## locales/fr  (0/1 have a test)

- [ ] `apps/web/locales/fr/index.ts`

## locales/fr.backup.20251025_133021  (0/1 have a test)

- [ ] `apps/web/locales/fr.backup.20251025_133021/index.ts`

## locales/pt  (0/1 have a test)

- [ ] `apps/web/locales/pt/index.ts`

## scripts  (0/2 have a test)

- [ ] `apps/web/scripts/analyze-hooks-detailed.ts`
- [ ] `apps/web/scripts/analyze-unused-hooks.ts`

## services  (12/42 have a test)

- [x] `apps/web/services/admin.service.ts`
- [ ] `apps/web/services/advanced-translation.service.ts`
- [ ] `apps/web/services/agent-admin.service.ts`
- [ ] `apps/web/services/anonymous-chat.service.ts`
- [~] `apps/web/services/api.service.ts`
- [ ] `apps/web/services/attachmentService.ts`
- [ ] `apps/web/services/auth-manager.service.ts`
- [~] `apps/web/services/auth.service.ts`
- [~] `apps/web/services/communities.service.ts`
- [~] `apps/web/services/conversations.service.ts`
- [ ] `apps/web/services/dashboard.service.ts`
- [ ] `apps/web/services/groups.service.ts`
- [ ] `apps/web/services/index.ts`
- [x] `apps/web/services/link-conversation.service.ts`
- [ ] `apps/web/services/magic-link.service.ts`
- [ ] `apps/web/services/markdown-parser-v2.2-optimized.ts`
- [ ] `apps/web/services/markdown.ts`
- [ ] `apps/web/services/meeshy-socketio-compat.ts`
- [~] `apps/web/services/meeshy-socketio.service.ts`
- [ ] `apps/web/services/mentions.service.ts`
- [ ] `apps/web/services/message-translation.service.ts`
- [ ] `apps/web/services/message.service.ts`
- [x] `apps/web/services/messages.service.ts`
- [ ] `apps/web/services/monitoring.service.ts`
- [x] `apps/web/services/notification-socketio.singleton.ts`
- [~] `apps/web/services/notification.service.ts`
- [ ] `apps/web/services/password-reset.service.ts`
- [~] `apps/web/services/permissions.service.ts`
- [ ] `apps/web/services/phone-password-reset.service.ts`
- [ ] `apps/web/services/phone-transfer.service.ts`
- [x] `apps/web/services/posts.service.ts`
- [ ] `apps/web/services/push-token.service.ts`
- [ ] `apps/web/services/report.service.ts`
- [x] `apps/web/services/story.service.ts`
- [ ] `apps/web/services/tracking-links.ts`
- [~] `apps/web/services/translation.service.ts`
- [ ] `apps/web/services/tusUploadService.ts`
- [ ] `apps/web/services/two-factor.service.ts`
- [ ] `apps/web/services/user-preferences.service.ts`
- [~] `apps/web/services/users.service.ts`
- [x] `apps/web/services/webrtc-service.ts`
- [ ] `apps/web/services/websocket.service.ts`

## services/conversations  (3/7 have a test)

- [x] `apps/web/services/conversations/crud.service.ts`
- [ ] `apps/web/services/conversations/index.ts`
- [x] `apps/web/services/conversations/links.service.ts`
- [~] `apps/web/services/conversations/messages.service.ts`
- [~] `apps/web/services/conversations/participants.service.ts`
- [x] `apps/web/services/conversations/transformers.service.ts`
- [~] `apps/web/services/conversations/types.ts`

## services/markdown  (16/16 have a test)

- [x] `apps/web/services/markdown/cache.ts`
- [x] `apps/web/services/markdown/index.ts`
- [x] `apps/web/services/markdown/markdown-parser.ts`
- [x] `apps/web/services/markdown/parsers/block-parser.ts`
- [x] `apps/web/services/markdown/parsers/inline-parser.ts`
- [x] `apps/web/services/markdown/parsers/table-parser.ts`
- [x] `apps/web/services/markdown/renderers/block-renderer.ts`
- [x] `apps/web/services/markdown/renderers/inline-renderer.ts`
- [x] `apps/web/services/markdown/renderers/table-renderer.ts`
- [x] `apps/web/services/markdown/rules/constants.ts`
- [x] `apps/web/services/markdown/rules/emoji-map.ts`
- [x] `apps/web/services/markdown/rules/patterns.ts`
- [x] `apps/web/services/markdown/security/sanitizer.ts`
- [x] `apps/web/services/markdown/security/validators.ts`
- [x] `apps/web/services/markdown/types.ts`
- [x] `apps/web/services/markdown/utils.ts`

## services/socketio  (2/9 have a test)

- [ ] `apps/web/services/socketio/connection.service.ts`
- [ ] `apps/web/services/socketio/index.ts`
- [ ] `apps/web/services/socketio/messaging.service.ts`
- [ ] `apps/web/services/socketio/orchestrator.service.ts`
- [ ] `apps/web/services/socketio/preferences-sync.service.ts`
- [ ] `apps/web/services/socketio/presence.service.ts`
- [~] `apps/web/services/socketio/translation.service.ts`
- [~] `apps/web/services/socketio/types.ts`
- [ ] `apps/web/services/socketio/typing.service.ts`

## stores  (12/15 have a test)

- [~] `apps/web/stores/app-store.ts`
- [~] `apps/web/stores/auth-form-store.ts`
- [~] `apps/web/stores/auth-store.ts`
- [x] `apps/web/stores/call-store.ts`
- [~] `apps/web/stores/conversation-preferences-store.ts`
- [~] `apps/web/stores/conversation-ui-store.ts`
- [~] `apps/web/stores/failed-messages-store.ts`
- [ ] `apps/web/stores/index.ts`
- [~] `apps/web/stores/language-store.ts`
- [~] `apps/web/stores/notification-store.ts`
- [~] `apps/web/stores/password-reset-store.ts`
- [~] `apps/web/stores/reply-store.ts`
- [ ] `apps/web/stores/store-initializer.tsx`
- [ ] `apps/web/stores/user-preferences-store.ts`
- [~] `apps/web/stores/user-store.ts`

## types  (1/10 have a test)

- [ ] `apps/web/types/admin-settings.ts`
- [ ] `apps/web/types/bubble-stream.ts`
- [ ] `apps/web/types/contacts.ts`
- [ ] `apps/web/types/frontend.ts`
- [~] `apps/web/types/i18n.ts`
- [ ] `apps/web/types/index.ts`
- [ ] `apps/web/types/notification.ts`
- [ ] `apps/web/types/preferences.ts`
- [ ] `apps/web/types/socketio.ts`
- [ ] `apps/web/types/web-speech.ts`

## utils  (30/60 have a test)

- [~] `apps/web/utils/attachment-url.ts`
- [ ] `apps/web/utils/audio-effect-presets.ts`
- [ ] `apps/web/utils/audio-effects-config.ts`
- [ ] `apps/web/utils/audio-effects.ts`
- [ ] `apps/web/utils/audio-formatters.ts`
- [~] `apps/web/utils/auth.ts`
- [~] `apps/web/utils/avatar-upload.ts`
- [ ] `apps/web/utils/badge.ts`
- [ ] `apps/web/utils/client-message-id.ts`
- [~] `apps/web/utils/community-identifier.ts`
- [ ] `apps/web/utils/console-override.ts`
- [~] `apps/web/utils/conversation-id-utils.ts`
- [~] `apps/web/utils/custom-toast.tsx`
- [x] `apps/web/utils/date-format.ts`
- [~] `apps/web/utils/debounce.ts`
- [~] `apps/web/utils/error-context-collector.ts`
- [ ] `apps/web/utils/fcm-manager.ts`
- [ ] `apps/web/utils/firebase-availability-checker.ts`
- [~] `apps/web/utils/image-crop.ts`
- [~] `apps/web/utils/ios-notification-manager.ts`
- [ ] `apps/web/utils/language-detection-logger.ts`
- [~] `apps/web/utils/language-detection.ts`
- [~] `apps/web/utils/language-utils.ts`
- [~] `apps/web/utils/link-identifier.ts`
- [~] `apps/web/utils/link-name-generator.ts`
- [~] `apps/web/utils/logger.ts`
- [~] `apps/web/utils/media-compression.ts`
- [ ] `apps/web/utils/media-manager.ts`
- [ ] `apps/web/utils/mention-display.ts`
- [~] `apps/web/utils/messaging-utils.ts`
- [~] `apps/web/utils/notification-helpers.ts`
- [x] `apps/web/utils/notification-sound.ts`
- [x] `apps/web/utils/notification-translations.ts`
- [ ] `apps/web/utils/optimistic-message.ts`
- [ ] `apps/web/utils/participant-helpers.ts`
- [~] `apps/web/utils/participant-mapper.ts`
- [ ] `apps/web/utils/phone-validation-robust.ts`
- [~] `apps/web/utils/phone-validator.ts`
- [ ] `apps/web/utils/push-notifications.ts`
- [~] `apps/web/utils/pwa-badge.ts`
- [ ] `apps/web/utils/ringtone.ts`
- [ ] `apps/web/utils/route-utils.ts`
- [ ] `apps/web/utils/safe-redirect.ts`
- [~] `apps/web/utils/secure-storage.ts`
- [ ] `apps/web/utils/service-worker-registration.ts`
- [ ] `apps/web/utils/service-worker.ts`
- [~] `apps/web/utils/socket-validator.ts`
- [x] `apps/web/utils/tag-colors.ts`
- [~] `apps/web/utils/token-utils.ts`
- [ ] `apps/web/utils/translation-adapter.ts`
- [ ] `apps/web/utils/translation-cleaner.ts`
- [ ] `apps/web/utils/translation-persistence.ts`
- [~] `apps/web/utils/translation.ts`
- [ ] `apps/web/utils/user-adapter.ts`
- [ ] `apps/web/utils/user-analytics-collector.ts`
- [~] `apps/web/utils/user-display-name.ts`
- [ ] `apps/web/utils/user-language-preferences.ts`
- [~] `apps/web/utils/user.ts`
- [ ] `apps/web/utils/websocket-diagnostics.ts`
- [~] `apps/web/utils/xss-protection.ts`

## utils/v2  (0/1 have a test)

- [ ] `apps/web/utils/v2/transform-conversation.ts`
