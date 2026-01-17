/**
 * Hook pour gérer le formulaire de création de groupe
 * Suit les Vercel React Best Practices: rerender-lazy-state-init
 */

import { useState, useCallback, useEffect } from 'react';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';
import { toast } from 'sonner';
import {
  generateCommunityIdentifier,
  sanitizeCommunityIdentifier
} from '@/utils/community-identifier';
import type { Group } from '@meeshy/shared/types';

interface UseGroupFormOptions {
  onSuccess?: (group: Group) => void;
  tGroups: (key: string) => string;
}

export function useGroupForm({ onSuccess, tGroups }: UseGroupFormOptions) {
  // États formulaire avec lazy initialization
  const [newGroupName, setNewGroupName] = useState(() => '');
  const [newGroupDescription, setNewGroupDescription] = useState(() => '');
  const [newGroupIdentifier, setNewGroupIdentifier] = useState(() => '');
  const [newGroupIsPrivate, setNewGroupIsPrivate] = useState(() => false);

  // États de vérification d'unicité
  const [isCheckingIdentifier, setIsCheckingIdentifier] = useState(false);
  const [identifierAvailable, setIdentifierAvailable] = useState<boolean | null>(null);
  const [identifierCheckTimeout, setIdentifierCheckTimeout] = useState<NodeJS.Timeout | null>(null);

  // Vérifier la disponibilité de l'identifiant
  const checkIdentifierAvailability = useCallback(async (identifier: string) => {
    if (!identifier || identifier.trim() === '') {
      setIdentifierAvailable(null);
      return;
    }

    const fullIdentifier = `mshy_${identifier}`;

    setIsCheckingIdentifier(true);
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        setIsCheckingIdentifier(false);
        return;
      }

      const response = await fetch(
        buildApiUrl(`/communities/check-identifier/${encodeURIComponent(fullIdentifier)}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.ok) {
        const result = await response.json();
        setIdentifierAvailable(result.available);
      }
    } catch (error) {
      console.error('[Groups] Error checking identifier availability:', error);
    } finally {
      setIsCheckingIdentifier(false);
    }
  }, []);

  // Créer un groupe
  const createGroup = useCallback(async () => {
    if (identifierAvailable === false) {
      toast.error(tGroups('errors.identifierTaken'));
      return;
    }

    try {
      const token = authManager.getAuthToken();
      if (!token) return;

      const fullIdentifier = `mshy_${newGroupIdentifier}`;

      const response = await fetch(buildApiUrl(API_ENDPOINTS.GROUP.CREATE), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newGroupName,
          description: newGroupDescription,
          identifier: fullIdentifier,
          isPrivate: newGroupIsPrivate
        })
      });

      if (response.ok) {
        const result = await response.json();
        const data = result.success ? result.data : result;

        // Réinitialiser le formulaire
        resetForm();

        toast.success(tGroups('success.groupCreated'));

        // Callback de succès
        onSuccess?.(data);
      } else {
        const error = await response.json();
        toast.error(error.message || tGroups('errors.createError'));
      }
    } catch (error) {
      console.error('[Groups] Error creating community:', error);
      toast.error(tGroups('errors.createError'));
    }
  }, [
    newGroupName,
    newGroupDescription,
    newGroupIdentifier,
    newGroupIsPrivate,
    identifierAvailable,
    tGroups,
    onSuccess
  ]);

  // Réinitialiser le formulaire
  const resetForm = useCallback(() => {
    setNewGroupName('');
    setNewGroupDescription('');
    setNewGroupIdentifier('');
    setNewGroupIsPrivate(false);
    setIdentifierAvailable(null);
  }, []);

  // Mettre à jour l'identifiant automatiquement basé sur le nom
  useEffect(() => {
    if (newGroupName && newGroupName.trim()) {
      const generatedIdentifier = generateCommunityIdentifier(newGroupName);
      setNewGroupIdentifier(generatedIdentifier);

      if (identifierCheckTimeout) {
        clearTimeout(identifierCheckTimeout);
      }

      const timeout = setTimeout(() => {
        checkIdentifierAvailability(generatedIdentifier);
      }, 500);

      setIdentifierCheckTimeout(timeout);
    }
  }, [newGroupName, checkIdentifierAvailability, identifierCheckTimeout]);

  // Vérifier l'unicité lorsque l'utilisateur modifie manuellement l'identifiant
  useEffect(() => {
    if (newGroupIdentifier && newGroupIdentifier.trim()) {
      if (identifierCheckTimeout) {
        clearTimeout(identifierCheckTimeout);
      }

      const timeout = setTimeout(() => {
        checkIdentifierAvailability(newGroupIdentifier);
      }, 500);

      setIdentifierCheckTimeout(timeout);
    } else {
      setIdentifierAvailable(null);
    }

    return () => {
      if (identifierCheckTimeout) {
        clearTimeout(identifierCheckTimeout);
      }
    };
  }, [newGroupIdentifier, checkIdentifierAvailability, identifierCheckTimeout]);

  return {
    // Form state
    newGroupName,
    setNewGroupName,
    newGroupDescription,
    setNewGroupDescription,
    newGroupIdentifier,
    setNewGroupIdentifier: (value: string) => {
      const sanitized = sanitizeCommunityIdentifier(value);
      setNewGroupIdentifier(sanitized);
    },
    newGroupIsPrivate,
    setNewGroupIsPrivate,

    // Validation state
    isCheckingIdentifier,
    identifierAvailable,

    // Actions
    createGroup,
    resetForm,

    // Validation
    isValid: !!(
      newGroupName.trim() &&
      newGroupIdentifier.trim() &&
      identifierAvailable === true &&
      !isCheckingIdentifier
    )
  };
}
