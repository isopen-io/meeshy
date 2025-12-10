'use client';

import { AuthGuard } from '@/components/auth';
import { CreateConversationPage } from '@/components/conversations/CreateConversationPage';

export default function NewConversationPage() {
  return (
    <AuthGuard>
      <CreateConversationPage />
    </AuthGuard>
  );
}
