export type InterpellationType = 'mention' | 'reply' | 'greeting' | 'none';

export type InterpellationResult = {
  detected: boolean;
  type: InterpellationType;
  targetUserIds: string[];
  isGreeting: boolean;
};

const GREETING_PATTERNS = [
  /^(bonjour|bonsoir|salut|hello|hey|hi|coucou|yo|wesh)\b/i,
  /^(bon(ne)?\s+(journee|soiree|matinee|nuit|aprem))\b/i,
  /^(good\s+(morning|afternoon|evening|night))\b/i,
];

function isGreetingContent(content: string): boolean {
  const trimmed = content.replace(/@\w+/g, '').trim();
  const stripped = trimmed.replace(/[!?.,:;]+$/g, '').trim();
  if (stripped.split(/\s+/).length > 4) return false;
  return GREETING_PATTERNS.some((p) => p.test(trimmed));
}

export function detectInterpellation(input: {
  mentionedUserIds: string[];
  replyToUserId: string | undefined;
  content: string;
  controlledUserIds: Set<string>;
  controlledUsernames?: Map<string, string>;
}): InterpellationResult {
  const targets = new Set<string>();

  for (const uid of input.mentionedUserIds) {
    if (input.controlledUserIds.has(uid)) targets.add(uid);
  }

  if (input.replyToUserId && input.controlledUserIds.has(input.replyToUserId)) {
    targets.add(input.replyToUserId);
  }

  if (targets.size === 0 && input.controlledUsernames) {
    const mentionRegex = /@(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(input.content)) !== null) {
      const userId = input.controlledUsernames.get(match[1].toLowerCase());
      if (userId) targets.add(userId);
    }
  }

  if (targets.size === 0) {
    return { detected: false, type: 'none', targetUserIds: [], isGreeting: false };
  }

  const targetUserIds = [...targets];
  const greeting = isGreetingContent(input.content);

  if (greeting) return { detected: true, type: 'greeting', targetUserIds, isGreeting: true };

  const type: InterpellationType = input.mentionedUserIds.some((uid) => input.controlledUserIds.has(uid))
    ? 'mention' : 'reply';

  return { detected: true, type, targetUserIds, isGreeting: false };
}
