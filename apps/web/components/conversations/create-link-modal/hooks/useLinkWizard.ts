'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { authManager } from '@/services/auth-manager.service';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { copyToClipboard } from '@/lib/clipboard';
import { generateLinkName } from '@/utils/link-name-generator';
import { useI18n } from '@/hooks/useI18n';
import { User, Conversation } from '@meeshy/shared/types';
import { TOTAL_WIZARD_STEPS } from '../constants';
import { LinkSettings, NewConversationData } from '../types';

interface UseLinkWizardOptions {
  isOpen: boolean;
  preGeneratedLink?: string;
  preGeneratedToken?: string;
  onLinkCreated: () => void;
  currentUser: User | null;
  conversations: Conversation[];
  selectedConversationId: string | null;
  createNewConversation: boolean;
  newConversationData: NewConversationData;
  linkSettings: LinkSettings;
}

export function useLinkWizard({
  isOpen,
  preGeneratedLink,
  preGeneratedToken,
  onLinkCreated,
  currentUser,
  conversations,
  selectedConversationId,
  createNewConversation,
  newConversationData,
  linkSettings
}: UseLinkWizardOptions) {
  const { t } = useI18n('modals');
  const [currentStep, setCurrentStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  useEffect(() => {
    if (isOpen && preGeneratedLink && preGeneratedToken) {
      setGeneratedLink(preGeneratedLink);
      setGeneratedToken(preGeneratedToken);
    }
  }, [isOpen, preGeneratedLink, preGeneratedToken]);

  const nextStep = useCallback(() => {
    if (currentStep < TOTAL_WIZARD_STEPS) {
      setCurrentStep(currentStep + 1);
    }
  }, [currentStep]);

  const prevStep = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  const canProceedToNext = useCallback(() => {
    switch (currentStep) {
      case 1:
        return selectedConversationId || createNewConversation;
      case 2:
        if (createNewConversation) {
          return newConversationData.title.trim() !== '';
        }
        return true;
      case 3:
        return true;
      default:
        return false;
    }
  }, [currentStep, selectedConversationId, createNewConversation, newConversationData]);

  const canCreateLink = useCallback(() => {
    const hasConversation = selectedConversationId || createNewConversation;
    if (!hasConversation) return false;

    if (createNewConversation && !newConversationData.title.trim()) return false;

    if (!createNewConversation) {
      const selectedConv = conversations.find((c) => c.id === selectedConversationId);
      if (!selectedConv?.title) return false;
    }

    return true;
  }, [selectedConversationId, createNewConversation, newConversationData, conversations]);

  const generateLink = useCallback(async () => {
    if (!selectedConversationId && !createNewConversation) {
      toast.error(t('createLinkModal.errors.selectConversation'));
      return;
    }

    if (createNewConversation && !newConversationData.title.trim()) {
      toast.error(t('createLinkModal.errors.enterTitle'));
      return;
    }

    setIsCreating(true);
    try {
      const token = authManager.getAuthToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + linkSettings.expirationDays);

      const conversationTitle = createNewConversation
        ? newConversationData.title
        : conversations.find((c) => c.id === selectedConversationId)?.title;

      const generatedLinkName = conversationTitle
        ? generateLinkName({
            conversationTitle,
            language: currentUser?.systemLanguage || 'fr',
            durationDays: linkSettings.expirationDays,
            maxParticipants: linkSettings.maxConcurrentUsers,
            maxUses: linkSettings.maxUses,
            isPublic: !linkSettings.maxConcurrentUsers && !linkSettings.maxUses
          })
        : 'Lien de partage';

      const requestBody: any = {
        name: generatedLinkName,
        description: linkSettings.description.trim() || undefined,
        expiresAt: expiresAt.toISOString(),
        maxUses: linkSettings.maxUses || undefined,
        maxConcurrentUsers: linkSettings.maxConcurrentUsers || undefined,
        maxUniqueSessions: linkSettings.maxUniqueSessions || undefined,
        allowAnonymousMessages: linkSettings.allowAnonymousMessages,
        allowAnonymousFiles: linkSettings.allowAnonymousFiles,
        allowAnonymousImages: linkSettings.allowAnonymousImages,
        allowViewHistory: linkSettings.allowViewHistory,
        requireAccount: linkSettings.requireAccount,
        requireNickname: linkSettings.requireNickname,
        requireEmail: linkSettings.requireEmail,
        requireBirthday: linkSettings.requireBirthday,
        allowedLanguages:
          linkSettings.allowedLanguages.length > 0 ? linkSettings.allowedLanguages : undefined
      };

      if (createNewConversation) {
        requestBody.newConversation = {
          title: newConversationData.title.trim(),
          description: newConversationData.description.trim() || undefined,
          memberIds: newConversationData.memberIds
        };
      } else {
        requestBody.conversationId = selectedConversationId;
      }

      const response = await fetch(buildApiUrl(API_ENDPOINTS.CONVERSATION.CREATE_LINK), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const data = await response.json();

        const linkToken = data.data?.linkId || data.linkId;
        if (!linkToken) {
          throw new Error('Token de lien manquant dans la réponse');
        }

        const linkUrl = `${window.location.origin}/join/${linkToken}`;
        setGeneratedLink(linkUrl);
        setGeneratedToken(linkToken);

        const copyResult = await copyToClipboard(linkUrl);
        if (copyResult.success) {
          toast.success(t('createLinkModal.successMessages.linkGeneratedAndCopied'));
        } else {
          toast.success(t('createLinkModal.successMessages.linkGenerated'));
        }
      } else {
        const error = await response.json();
        console.error('[CREATE_LINK_V2] API Error:', error);
        toast.error(error.message || `Erreur lors de la génération du lien (${response.status})`);
      }
    } catch (error) {
      console.error('[CREATE_LINK_V2] Error generating link:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la génération du lien');
    } finally {
      setIsCreating(false);
    }
  }, [
    selectedConversationId,
    createNewConversation,
    newConversationData,
    linkSettings,
    currentUser,
    conversations,
    t
  ]);

  const copyLink = useCallback(async () => {
    if (generatedLink) {
      const copyResult = await copyToClipboard(generatedLink, 'input[readonly]');
      if (copyResult.success) {
        toast.success(t('createLinkModal.successMessages.linkCopied'));
      } else {
        toast.info(copyResult.message);
      }
    }
  }, [generatedLink, t]);

  const copyToken = useCallback(async () => {
    if (generatedToken) {
      const copyResult = await copyToClipboard(generatedToken);
      if (copyResult.success) {
        toast.success(t('createLinkModal.successMessages.tokenCopied'));
      } else {
        toast.info(copyResult.message);
      }
    }
  }, [generatedToken, t]);

  const reset = useCallback(() => {
    setCurrentStep(1);
    setGeneratedLink(null);
    setGeneratedToken(null);
    setIsSummaryOpen(false);
  }, []);

  return {
    currentStep,
    setCurrentStep,
    isCreating,
    generatedLink,
    generatedToken,
    isSummaryOpen,
    setIsSummaryOpen,
    nextStep,
    prevStep,
    canProceedToNext,
    canCreateLink,
    generateLink,
    copyLink,
    copyToken,
    reset
  };
}
