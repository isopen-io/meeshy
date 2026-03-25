export type AgentType =
  | 'personal'
  | 'support'
  | 'faq'
  | 'animator'
  | 'commercial'
  | 'tutor'
  | 'manager'
  | 'leader'
  | 'journalist'
  | 'analyst'
  | 'moderator';

export const AGENT_TYPES: readonly AgentType[] = [
  'personal',
  'support',
  'faq',
  'animator',
  'commercial',
  'tutor',
  'manager',
  'leader',
  'journalist',
  'analyst',
  'moderator',
] as const;
