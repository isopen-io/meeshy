import { createStore } from 'zustand/vanilla';

/**
 * **L'APERÇU D'UNE CONVERSATION TIRÉ DEPUIS LA BANNIÈRE** (#8821, jumelle de
 * `notificationPreviewConversation` iOS, `RootView.openNotificationPreview`) —
 * tirer la bannière vers le bas pose ICI la conversation à prévisualiser ; la
 * coquille monte l'aperçu tant qu'elle y est.
 *
 * Module LÉGER, comme `in-app-banner.ts` qui le lit : la bannière se tait sur
 * la conversation ouverte en aperçu, exactement comme sur son fil.
 */

type ConversationPreviewState = { readonly conversationId: string | null };

export const conversationPreviewStore = createStore<ConversationPreviewState>(() => ({ conversationId: null }));

export function openConversationPreview(conversationId: string): void {
  conversationPreviewStore.setState({ conversationId });
}

export function closeConversationPreview(): void {
  conversationPreviewStore.setState({ conversationId: null });
}
