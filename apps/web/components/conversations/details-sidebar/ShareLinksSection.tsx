'use client';

import { Link2 } from 'lucide-react';
import { ConversationLinksSection } from '../conversation-links-section';
import { CreateLinkButton } from '../create-link-button';
import { useI18n } from '@/hooks/use-i18n';

interface ShareLinksSectionProps {
  conversationId: string;
  onLinkCreated?: () => void;
}

/**
 * Section for managing share links
 * Only shown for group conversations
 */
export function ShareLinksSection({ conversationId, onLinkCreated }: ShareLinksSectionProps) {
  const { t } = useI18n('conversations');

  return (
    <div className="space-y-4">
      <CreateLinkButton
        forceModal={true}
        onLinkCreated={() => {
          onLinkCreated?.();
          // Reload to refresh links list
          window.location.reload();
        }}
        variant="outline"
        className="w-full"
      >
        <Link2 className="h-4 w-4 mr-2" />
        {t('conversationDetails.createLink')}
      </CreateLinkButton>

      <ConversationLinksSection conversationId={conversationId} />
    </div>
  );
}
