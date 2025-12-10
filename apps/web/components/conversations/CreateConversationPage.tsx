'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/stores';
import { CreateConversationModal } from './create-conversation-modal';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';

export function CreateConversationPage() {
  const user = useUser();
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { t } = useI18n('conversations');

  useEffect(() => {
    if (user) {
      setIsModalOpen(true);
    }
  }, [user]);

  const handleConversationCreated = (conversationId: string) => {
    router.push(`/conversations/${conversationId}`);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    router.push('/conversations');
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <CreateConversationModal
        isOpen={isModalOpen}
        onClose={handleClose}
        currentUser={user}
        onConversationCreated={handleConversationCreated}
      />
    </div>
  );
}

