'use client';

import { useState, useEffect, useRef } from 'react';
import type { ConversationLink as BaseConversationLink } from '@meeshy/shared/types';
import { buildApiUrl } from '@/lib/config';
import { usersService } from '@/services/users.service';

export interface ConversationLink extends BaseConversationLink {
  requireAccount?: boolean;
  requireBirthday?: boolean;
}

export type UsernameCheckStatus = 'idle' | 'checking' | 'available' | 'taken';

export function useLinkValidation(linkId: string) {
  const [conversationLink, setConversationLink] = useState<ConversationLink | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    const initializePage = async () => {
      try {
        const linkResponse = await fetch(`${buildApiUrl('/anonymous/link')}/${linkId}`);

        if (linkResponse.ok) {
          const result = await linkResponse.json();
          if (result.success) {
            setConversationLink(result.data);

            if (result.data.creator?.id) {
              fetchAndStoreCreatorAffiliateToken(result.data.creator.id);
            }
          } else {
            setLinkError(result.message);
          }
        } else {
          const errorResult = await linkResponse.json().catch(() => ({}));
          setLinkError(errorResult.message || 'Erreur lors du chargement du lien');
        }
      } catch (error) {
        console.error('Erreur initialisation:', error);
        setLinkError('Erreur lors du chargement du lien');
      } finally {
        setIsLoading(false);
      }
    };

    if (linkId) {
      initializePage();
    }
  }, [linkId]);

  return {
    conversationLink,
    isLoading,
    linkError
  };
}

export function useUsernameValidation(username: string) {
  const [usernameCheckStatus, setUsernameCheckStatus] = useState<UsernameCheckStatus>('idle');
  const usernameCheckTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (usernameCheckTimeout.current) {
      clearTimeout(usernameCheckTimeout.current);
    }

    if (!username.trim()) {
      setUsernameCheckStatus('idle');
      return;
    }

    setUsernameCheckStatus('checking');

    usernameCheckTimeout.current = setTimeout(async () => {
      try {
        const response = await fetch(
          buildApiUrl(`/auth/check-availability?username=${encodeURIComponent(username.trim())}`)
        );

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            setUsernameCheckStatus(result.data?.usernameAvailable ? 'available' : 'taken');
          } else {
            setUsernameCheckStatus('idle');
          }
        } else {
          setUsernameCheckStatus('idle');
        }
      } catch (error) {
        console.error('Erreur vérification username:', error);
        setUsernameCheckStatus('idle');
      }
    }, 500);

    return () => {
      if (usernameCheckTimeout.current) {
        clearTimeout(usernameCheckTimeout.current);
      }
    };
  }, [username]);

  return usernameCheckStatus;
}

async function fetchAndStoreCreatorAffiliateToken(creatorId: string) {
  try {
    const response = await usersService.getUserAffiliateToken(creatorId);

    if (response.data && response.data.token) {
      const affiliateToken = response.data.token;

      if (typeof window !== 'undefined') {
        localStorage.setItem('meeshy_affiliate_token', affiliateToken);
        document.cookie = `meeshy_affiliate_token=${affiliateToken}; max-age=${30 * 24 * 60 * 60}; path=/; samesite=lax`;

        if (process.env.NODE_ENV === 'development') {
          console.log(`[JOIN] Token d'affiliation du créateur stocké: ${affiliateToken.substring(0, 10)}...`);
        }
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[JOIN] Erreur récupération token affiliation:', error);
    }
  }
}
