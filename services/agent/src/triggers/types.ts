import type { TriggerContext } from '../graph/state';

export type TriggerCallback = (context: TriggerContext) => Promise<void>;

export type TriggerConfig = {
  conversationId: string;
  triggerOnTimeout: boolean;
  timeoutSeconds: number;
  triggerOnUserMessage: boolean;
  triggerFromUserIds: string[];
  triggerOnReplyTo: boolean;
  cooldownSeconds: number;
};
