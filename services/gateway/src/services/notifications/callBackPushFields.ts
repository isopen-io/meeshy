import { notificationString } from '@meeshy/shared/utils/notification-strings';

const CALL_BACK_NOTIFICATION_TYPES: ReadonlySet<string> = new Set(['missed_call', 'CALL_MISSED', 'call_declined']);

export type CallBackPushInput = {
  readonly type: string;
  readonly metadata: unknown;
  readonly language: () => Promise<string>;
};

export type CallBackPushFields = {
  readonly callType?: 'audio' | 'video';
  readonly isVideo?: 'true' | 'false';
  readonly callBackLabel?: string;
};

const callTypeOf = (metadata: unknown): 'audio' | 'video' =>
  metadata !== null && typeof metadata === 'object' && (metadata as { readonly callType?: unknown }).callType === 'video'
    ? 'video'
    : 'audio';

export async function callBackPushFields(input: CallBackPushInput): Promise<CallBackPushFields> {
  if (!CALL_BACK_NOTIFICATION_TYPES.has(input.type)) return {};
  const callType = callTypeOf(input.metadata);
  return {
    callType,
    isVideo: callType === 'video' ? 'true' : 'false',
    callBackLabel: notificationString(await input.language(), 'call.action.callBack'),
  };
}
