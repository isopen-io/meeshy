'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { authManager } from '@/services/auth-manager.service';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { LinkIdentifierStatus } from '../types';

export function useLinkValidation(linkIdentifier: string) {
  const [linkIdentifierCheckStatus, setLinkIdentifierCheckStatus] =
    useState<LinkIdentifierStatus>('idle');
  const linkIdentifierCheckTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (linkIdentifierCheckTimeout.current) {
      clearTimeout(linkIdentifierCheckTimeout.current);
    }

    if (!linkIdentifier.trim()) {
      setLinkIdentifierCheckStatus('idle');
      return;
    }

    setLinkIdentifierCheckStatus('checking');

    linkIdentifierCheckTimeout.current = setTimeout(async () => {
      try {
        const token = authManager.getAuthToken();
        const response = await fetch(
          buildApiUrl(
            API_ENDPOINTS.CONVERSATION.CHECK_LINK_IDENTIFIER(
              encodeURIComponent(linkIdentifier.trim())
            )
          ),
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            setLinkIdentifierCheckStatus(result.available ? 'available' : 'taken');
          } else {
            setLinkIdentifierCheckStatus('idle');
          }
        } else {
          setLinkIdentifierCheckStatus('idle');
        }
      } catch (error) {
        console.error('Error checking link identifier:', error);
        setLinkIdentifierCheckStatus('idle');
      }
    }, 500);

    return () => {
      if (linkIdentifierCheckTimeout.current) {
        clearTimeout(linkIdentifierCheckTimeout.current);
      }
    };
  }, [linkIdentifier]);

  const generateIdentifier = useCallback((baseText: string) => {
    return (
      baseText
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 30) +
      '-' +
      Math.random().toString(36).substring(2, 8)
    );
  }, []);

  return {
    linkIdentifierCheckStatus,
    generateIdentifier
  };
}
