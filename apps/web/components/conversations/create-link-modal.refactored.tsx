'use client';

import { Fragment, lazy, Suspense } from 'react';
import { Link2, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { useUser } from '@/stores';
import { TOTAL_WIZARD_STEPS } from './create-link-modal/constants';
import { CreateLinkModalProps } from './create-link-modal/types';
import { useConversationSelection } from './create-link-modal/hooks/useConversationSelection';
import { useLinkSettings } from './create-link-modal/hooks/useLinkSettings';
import { useLinkValidation } from './create-link-modal/hooks/useLinkValidation';
import { useLinkWizard } from './create-link-modal/hooks/useLinkWizard';
import { SuccessView } from './create-link-modal/components/SuccessView';

// Dynamic imports for code splitting
const LinkTypeStep = lazy(() =>
  import('./create-link-modal/steps/LinkTypeStep').then((mod) => ({ default: mod.LinkTypeStep }))
);
const LinkConfigStep = lazy(() =>
  import('./create-link-modal/steps/LinkConfigStep').then((mod) => ({ default: mod.LinkConfigStep }))
);
const LinkSummaryStep = lazy(() =>
  import('./create-link-modal/steps/LinkSummaryStep').then((mod) => ({
    default: mod.LinkSummaryStep
  }))
);

// Loading fallback component
function StepLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}

export function CreateLinkModalV2({
  isOpen,
  onClose,
  onLinkCreated,
  preGeneratedLink,
  preGeneratedToken
}: CreateLinkModalProps) {
  const { t } = useI18n('modals');
  const { user: currentUser } = useUser();

  // Use custom hooks
  const conversationState = useConversationSelection(currentUser, isOpen);
  const linkSettings = useLinkSettings();
  const { linkIdentifierCheckStatus, generateIdentifier } = useLinkValidation(
    linkSettings.linkIdentifier
  );

  const wizard = useLinkWizard({
    isOpen,
    preGeneratedLink,
    preGeneratedToken,
    onLinkCreated,
    currentUser,
    conversations: conversationState.conversations,
    selectedConversationId: conversationState.selectedConversationId,
    createNewConversation: conversationState.createNewConversation,
    newConversationData: conversationState.newConversationData,
    linkSettings: linkSettings.getLinkSettings()
  });

  const handleClose = () => {
    conversationState.reset();
    linkSettings.reset();
    wizard.reset();

    if (wizard.generatedLink) {
      onLinkCreated();
    }

    onClose();
  };

  const handleSelectNewConversation = () => {
    conversationState.setCreateNewConversation(true);
    conversationState.setSelectedConversationId(null);
    if (wizard.currentStep < TOTAL_WIZARD_STEPS) {
      wizard.setCurrentStep(wizard.currentStep + 1);
    }
  };

  const getStepTitle = () => {
    switch (wizard.currentStep) {
      case 1:
        return t('createLinkModal.steps.selectConversation');
      case 2:
        return conversationState.createNewConversation
          ? t('createLinkModal.createNewConversation.title')
          : t('createLinkModal.steps.configureLink');
      case 3:
        return t('createLinkModal.steps.summaryAndGeneration');
      default:
        return '';
    }
  };

  const stepTitles = [
    t('createLinkModal.steps.selectConversation'),
    t('createLinkModal.steps.configureLink'),
    t('createLinkModal.steps.summaryAndGeneration')
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[95vh] p-0 gap-0 flex flex-col sm:max-w-2xl sm:w-[90vw] sm:max-h-[90vh] md:w-[85vw] md:max-h-[85vh] dark:bg-gray-900 dark:border-gray-800">
        <DialogHeader className="flex-shrink-0 bg-background dark:bg-gray-900 border-b dark:border-gray-800 px-3 py-3 sm:px-6 sm:py-4">
          <DialogTitle className="text-base sm:text-xl font-bold flex items-center dark:text-gray-100">
            <Link2 className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
            {t('createLinkModal.title')}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm dark:text-gray-400">
            {t('createLinkModal.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-3 sm:px-6 dark:bg-gray-900">
          {!wizard.generatedLink && (
            <div className="py-6">
              <div className="flex items-center justify-between">
                {Array.from({ length: TOTAL_WIZARD_STEPS }, (_, i) => {
                  const stepNumber = i + 1;
                  const isActive = stepNumber === wizard.currentStep;
                  const isCompleted = stepNumber < wizard.currentStep;

                  return (
                    <Fragment key={i}>
                      {i > 0 && (
                        <div
                          className={`flex-1 h-0.5 ${
                            stepNumber <= wizard.currentStep ? 'bg-primary' : 'bg-muted'
                          }`}
                        />
                      )}

                      <div className="flex flex-col items-center flex-shrink-0">
                        <div
                          className={`w-3 h-3 rounded-full flex-shrink-0 ${
                            isActive
                              ? 'bg-primary ring-4 ring-primary/20'
                              : isCompleted
                              ? 'bg-primary'
                              : 'bg-muted'
                          }`}
                        />

                        <div className="mt-3 text-center max-w-[120px]">
                          <p
                            className={`text-xs font-medium leading-tight ${
                              isActive
                                ? 'text-primary'
                                : isCompleted
                                ? 'text-primary'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {stepTitles[i]}
                          </p>
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          )}

          <div className="min-h-[400px] pb-6">
            {wizard.generatedLink && wizard.generatedToken ? (
              <SuccessView
                generatedLink={wizard.generatedLink}
                createNewConversation={conversationState.createNewConversation}
                newConversationData={conversationState.newConversationData}
                conversations={conversationState.conversations}
                selectedConversationId={conversationState.selectedConversationId}
                expirationDays={linkSettings.expirationDays}
                maxUses={linkSettings.maxUses}
                allowAnonymousMessages={linkSettings.allowAnonymousMessages}
                allowAnonymousImages={linkSettings.allowAnonymousImages}
                allowAnonymousFiles={linkSettings.allowAnonymousFiles}
                allowViewHistory={linkSettings.allowViewHistory}
                copyLink={wizard.copyLink}
                handleClose={handleClose}
              />
            ) : (
              <Suspense fallback={<StepLoader />}>
                {wizard.currentStep === 1 && (
                  <LinkTypeStep
                    conversations={conversationState.conversations}
                    filteredConversations={conversationState.filteredConversations}
                    selectedConversationId={conversationState.selectedConversationId}
                    setSelectedConversationId={conversationState.setSelectedConversationId}
                    createNewConversation={conversationState.createNewConversation}
                    setCreateNewConversation={conversationState.setCreateNewConversation}
                    conversationSearchQuery={conversationState.conversationSearchQuery}
                    setConversationSearchQuery={conversationState.setConversationSearchQuery}
                    isLoadingConversations={conversationState.isLoadingConversations}
                    onSelectNewConversation={handleSelectNewConversation}
                  />
                )}

                {wizard.currentStep === 2 && (
                  <LinkConfigStep
                    createNewConversation={conversationState.createNewConversation}
                    selectedConversationId={conversationState.selectedConversationId}
                    conversations={conversationState.conversations}
                    newConversationData={conversationState.newConversationData}
                    setNewConversationData={conversationState.setNewConversationData}
                    filteredUsers={conversationState.filteredUsers}
                    userSearchQuery={conversationState.userSearchQuery}
                    setUserSearchQuery={conversationState.setUserSearchQuery}
                    isLoadingUsers={conversationState.isLoadingUsers}
                    expirationDays={linkSettings.expirationDays}
                    setExpirationDays={linkSettings.setExpirationDays}
                    maxUses={linkSettings.maxUses}
                    setMaxUses={linkSettings.setMaxUses}
                    requireAccount={linkSettings.requireAccount}
                    setRequireAccount={linkSettings.setRequireAccount}
                    allowAnonymousMessages={linkSettings.allowAnonymousMessages}
                    setAllowAnonymousMessages={linkSettings.setAllowAnonymousMessages}
                    allowAnonymousFiles={linkSettings.allowAnonymousFiles}
                    setAllowAnonymousFiles={linkSettings.setAllowAnonymousFiles}
                    allowAnonymousImages={linkSettings.allowAnonymousImages}
                    setAllowAnonymousImages={linkSettings.setAllowAnonymousImages}
                    allowViewHistory={linkSettings.allowViewHistory}
                    setAllowViewHistory={linkSettings.setAllowViewHistory}
                    requireNickname={linkSettings.requireNickname}
                    setRequireNickname={linkSettings.setRequireNickname}
                    requireEmail={linkSettings.requireEmail}
                    setRequireEmail={linkSettings.setRequireEmail}
                    requireBirthday={linkSettings.requireBirthday}
                    setRequireBirthday={linkSettings.setRequireBirthday}
                    allowedLanguages={linkSettings.allowedLanguages}
                    setAllowedLanguages={linkSettings.setAllowedLanguages}
                    isPermissionsOpen={linkSettings.isPermissionsOpen}
                    setIsPermissionsOpen={linkSettings.setIsPermissionsOpen}
                    isLanguagesOpen={linkSettings.isLanguagesOpen}
                    setIsLanguagesOpen={linkSettings.setIsLanguagesOpen}
                    languageSearchQuery={linkSettings.languageSearchQuery}
                    setLanguageSearchQuery={linkSettings.setLanguageSearchQuery}
                  />
                )}

                {wizard.currentStep === 3 && (
                  <LinkSummaryStep
                    linkTitle={linkSettings.linkTitle}
                    setLinkTitle={linkSettings.setLinkTitle}
                    linkIdentifier={linkSettings.linkIdentifier}
                    setLinkIdentifier={linkSettings.setLinkIdentifier}
                    description={linkSettings.description}
                    setDescription={linkSettings.setDescription}
                    linkIdentifierCheckStatus={linkIdentifierCheckStatus}
                    generateIdentifier={generateIdentifier}
                    createNewConversation={conversationState.createNewConversation}
                    newConversationData={conversationState.newConversationData}
                    conversations={conversationState.conversations}
                    selectedConversationId={conversationState.selectedConversationId}
                    expirationDays={linkSettings.expirationDays}
                    maxUses={linkSettings.maxUses}
                    allowAnonymousMessages={linkSettings.allowAnonymousMessages}
                    allowAnonymousImages={linkSettings.allowAnonymousImages}
                    allowAnonymousFiles={linkSettings.allowAnonymousFiles}
                    allowViewHistory={linkSettings.allowViewHistory}
                    requireNickname={linkSettings.requireNickname}
                    requireEmail={linkSettings.requireEmail}
                    requireAccount={linkSettings.requireAccount}
                    requireBirthday={linkSettings.requireBirthday}
                    allowedLanguages={linkSettings.allowedLanguages}
                    isSummaryOpen={wizard.isSummaryOpen}
                    setIsSummaryOpen={wizard.setIsSummaryOpen}
                  />
                )}
              </Suspense>
            )}
          </div>
        </div>

        {!wizard.generatedLink && (
          <div className="flex-shrink-0 bg-background dark:bg-gray-900 dark:border-gray-800 border-t px-3 py-3 sm:px-6 sm:py-4">
            <div className="flex justify-between items-center">
              <div>
                {wizard.currentStep > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={wizard.prevStep}
                    className="text-xs sm:text-sm h-9 sm:h-10"
                  >
                    <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    {t('createLinkModal.navigation.previous')}
                  </Button>
                )}
              </div>

              <div>
                {wizard.currentStep < TOTAL_WIZARD_STEPS ? (
                  <Button
                    type="button"
                    onClick={wizard.nextStep}
                    disabled={!wizard.canProceedToNext()}
                    className="text-xs sm:text-sm h-9 sm:h-10"
                  >
                    {t('createLinkModal.navigation.next')}
                    <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 ml-1 sm:ml-2" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={wizard.generateLink}
                    disabled={!wizard.canCreateLink() || wizard.isCreating}
                    className="flex items-center text-xs sm:text-sm h-9 sm:h-10"
                  >
                    <Link2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    {wizard.isCreating
                      ? t('createLinkModal.navigation.generating')
                      : t('createLinkModal.navigation.createLink')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
