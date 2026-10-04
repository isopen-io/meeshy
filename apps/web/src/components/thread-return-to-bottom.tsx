import type { ListPaginationState } from '@/lib/lens/pagination';
import type { ThreadChromeSignals } from '@/lib/view/use-thread-chrome-signals';

export function ThreadReturnToBottom(_props: {
  readonly chrome: Pick<
    ThreadChromeSignals,
    'scrollButtonVisible' | 'scrollButtonUnreadCount' | 'scrollButtonSenderName' | 'scrollButtonPreviewText' | 'onScrollToBottom'
  >;
  readonly windowLoading: boolean;
  readonly newerState: ListPaginationState;
}) {
  return null;
}
