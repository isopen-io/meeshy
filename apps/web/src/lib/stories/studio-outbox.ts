import type { DeviceRecords } from '@/lib/send/send-queue';

import type { PublishChoice } from './publication-layout';
import type { StudioDraft } from './studio';
import type { StudioDoor } from './studio-page';

export type StudioOutboxSlot = { readonly pageId: string; readonly door: StudioDoor; readonly file: File; readonly meta: Readonly<Record<string, unknown>> };
export type StudioOutboxIntent = { readonly choice: PublishChoice; readonly promoted: boolean; readonly state: 'armed' | 'failed'; readonly keys: readonly (readonly [string, string])[] };
export type StudioOutboxRecord = { readonly slots: readonly StudioOutboxSlot[]; readonly intent: StudioOutboxIntent | null };

export const outboxSlotsOf = (_draft: StudioDraft): readonly StudioOutboxSlot[] => [];
export const draftWithOutbox = (draft: StudioDraft, _slots: readonly StudioOutboxSlot[], _env: { readonly makeUrl: (file: File) => string; readonly language: string }): StudioDraft => draft;
export function createStudioOutbox(_records: DeviceRecords) {
  return { load: async (_viewerId: string): Promise<StudioOutboxRecord | null> => null, save: async (_viewerId: string, _record: StudioOutboxRecord) => false, clear: async (_viewerId: string) => false };
}
