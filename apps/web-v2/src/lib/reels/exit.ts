export type ReelsExit = 'back' | 'feed';

export type HistoryView = {
  readonly canGoBack: boolean | undefined;
  readonly historyLength: number;
  readonly onLandingEntry: boolean;
};

export function reelsExitOf(view: HistoryView): ReelsExit {
  return view.historyLength > 1 ? 'back' : 'feed';
}
