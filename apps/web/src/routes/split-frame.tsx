import type { ReactNode } from 'react';

import type { FrameProps } from '@/lib/router';

export const SPLIT_QUERY = '(min-width: 1024px)';

export type SplitPane = 'empty' | 'thread';

export function splitPaneOf(_: { readonly routeKey: string; readonly wide: boolean; readonly guest: boolean }): SplitPane | null {
  return null;
}

export function SplitFrame({ screen }: FrameProps): ReactNode {
  return screen;
}
