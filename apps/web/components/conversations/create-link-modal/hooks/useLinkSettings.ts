'use client';

import { useState, useCallback, useEffect } from 'react';
import { DEFAULT_LINK_SETTINGS } from '../constants';
import { LinkSettings } from '../types';

export function useLinkSettings() {
  const [linkTitle, setLinkTitle] = useState('');
  const [linkIdentifier, setLinkIdentifier] = useState('');
  const [description, setDescription] = useState('');
  const [expirationDays, setExpirationDays] = useState(DEFAULT_LINK_SETTINGS.expirationDays);
  const [maxUses, setMaxUses] = useState<number | undefined>(DEFAULT_LINK_SETTINGS.maxUses);
  const [maxConcurrentUsers, setMaxConcurrentUsers] = useState<number | undefined>(
    DEFAULT_LINK_SETTINGS.maxConcurrentUsers
  );
  const [maxUniqueSessions, setMaxUniqueSessions] = useState<number | undefined>(
    DEFAULT_LINK_SETTINGS.maxUniqueSessions
  );

  const [allowAnonymousMessages, setAllowAnonymousMessages] = useState(
    DEFAULT_LINK_SETTINGS.allowAnonymousMessages
  );
  const [allowAnonymousFiles, setAllowAnonymousFiles] = useState(
    DEFAULT_LINK_SETTINGS.allowAnonymousFiles
  );
  const [allowAnonymousImages, setAllowAnonymousImages] = useState(
    DEFAULT_LINK_SETTINGS.allowAnonymousImages
  );
  const [allowViewHistory, setAllowViewHistory] = useState(DEFAULT_LINK_SETTINGS.allowViewHistory);
  const [requireAccount, setRequireAccount] = useState(DEFAULT_LINK_SETTINGS.requireAccount);
  const [requireNickname, setRequireNickname] = useState(DEFAULT_LINK_SETTINGS.requireNickname);
  const [requireEmail, setRequireEmail] = useState(DEFAULT_LINK_SETTINGS.requireEmail);
  const [requireBirthday, setRequireBirthday] = useState(DEFAULT_LINK_SETTINGS.requireBirthday);
  const [allowedLanguages, setAllowedLanguages] = useState<string[]>(
    DEFAULT_LINK_SETTINGS.allowedLanguages
  );

  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [isLanguagesOpen, setIsLanguagesOpen] = useState(false);
  const [languageSearchQuery, setLanguageSearchQuery] = useState('');

  // Auto-enable all permissions when requireAccount is enabled
  useEffect(() => {
    if (requireAccount) {
      setAllowAnonymousMessages(true);
      setAllowAnonymousFiles(true);
      setAllowAnonymousImages(true);
      setAllowViewHistory(true);
      setRequireNickname(true);
      setRequireEmail(true);
      setRequireBirthday(true);
    }
  }, [requireAccount]);

  const reset = useCallback(() => {
    setLinkTitle('');
    setLinkIdentifier('');
    setDescription('');
    setExpirationDays(DEFAULT_LINK_SETTINGS.expirationDays);
    setMaxUses(DEFAULT_LINK_SETTINGS.maxUses);
    setMaxConcurrentUsers(DEFAULT_LINK_SETTINGS.maxConcurrentUsers);
    setMaxUniqueSessions(DEFAULT_LINK_SETTINGS.maxUniqueSessions);
    setAllowAnonymousMessages(DEFAULT_LINK_SETTINGS.allowAnonymousMessages);
    setAllowAnonymousFiles(DEFAULT_LINK_SETTINGS.allowAnonymousFiles);
    setAllowAnonymousImages(DEFAULT_LINK_SETTINGS.allowAnonymousImages);
    setAllowViewHistory(DEFAULT_LINK_SETTINGS.allowViewHistory);
    setRequireAccount(DEFAULT_LINK_SETTINGS.requireAccount);
    setRequireNickname(DEFAULT_LINK_SETTINGS.requireNickname);
    setRequireEmail(DEFAULT_LINK_SETTINGS.requireEmail);
    setRequireBirthday(DEFAULT_LINK_SETTINGS.requireBirthday);
    setAllowedLanguages(DEFAULT_LINK_SETTINGS.allowedLanguages);
    setLanguageSearchQuery('');
  }, []);

  const getLinkSettings = useCallback((): LinkSettings => {
    return {
      linkTitle,
      linkIdentifier,
      description,
      expirationDays,
      maxUses,
      maxConcurrentUsers,
      maxUniqueSessions,
      allowAnonymousMessages,
      allowAnonymousFiles,
      allowAnonymousImages,
      allowViewHistory,
      requireAccount,
      requireNickname,
      requireEmail,
      requireBirthday,
      allowedLanguages
    };
  }, [
    linkTitle,
    linkIdentifier,
    description,
    expirationDays,
    maxUses,
    maxConcurrentUsers,
    maxUniqueSessions,
    allowAnonymousMessages,
    allowAnonymousFiles,
    allowAnonymousImages,
    allowViewHistory,
    requireAccount,
    requireNickname,
    requireEmail,
    requireBirthday,
    allowedLanguages
  ]);

  return {
    // State
    linkTitle,
    linkIdentifier,
    description,
    expirationDays,
    maxUses,
    maxConcurrentUsers,
    maxUniqueSessions,
    allowAnonymousMessages,
    allowAnonymousFiles,
    allowAnonymousImages,
    allowViewHistory,
    requireAccount,
    requireNickname,
    requireEmail,
    requireBirthday,
    allowedLanguages,
    isPermissionsOpen,
    isLanguagesOpen,
    languageSearchQuery,

    // Setters
    setLinkTitle,
    setLinkIdentifier,
    setDescription,
    setExpirationDays,
    setMaxUses,
    setMaxConcurrentUsers,
    setMaxUniqueSessions,
    setAllowAnonymousMessages,
    setAllowAnonymousFiles,
    setAllowAnonymousImages,
    setAllowViewHistory,
    setRequireAccount,
    setRequireNickname,
    setRequireEmail,
    setRequireBirthday,
    setAllowedLanguages,
    setIsPermissionsOpen,
    setIsLanguagesOpen,
    setLanguageSearchQuery,

    // Methods
    reset,
    getLinkSettings
  };
}
