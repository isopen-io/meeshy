import type { AgentTopic, AgentTopicInput } from '@/lib/api/admin-agent-topics';

/**
 * **UN SUJET DE L'AGENT, EN BROUILLON** (lot Agent complet) — les bornes de
 * `TopicInputSchema` (`services/gateway/src/routes/admin/agent-topics.ts`),
 * relues AVANT d'envoyer : un champ hors bornes est nommé sous le formulaire au
 * lieu de partir vers un 400.
 *
 * La SÛRETÉ des motifs, elle, ne se juge pas ici : seule la passerelle sait
 * mesurer ce qu'un motif coûte à exécuter (`certifyPatterns`). Son refus — qui
 * NOMME le motif — est rendu tel quel.
 *
 * Les motifs et les exemples s'écrivent un par ligne ; les lignes vides tombent.
 */
export type AgentTopicDraft = {
  readonly slug: string;
  readonly label: string;
  readonly description: string;
  readonly keywordPatterns: string;
  readonly instructionTemplate: string;
  readonly searchHintTemplate: string;
  readonly examples: string;
  readonly cooldownMinutes: string;
  readonly priority: string;
  readonly isActive: boolean;
};

export type AgentTopicField = keyof AgentTopicDraft;

export const AGENT_TOPIC_FIELDS: readonly AgentTopicField[] = [
  'label',
  'slug',
  'description',
  'keywordPatterns',
  'instructionTemplate',
  'searchHintTemplate',
  'examples',
  'cooldownMinutes',
  'priority',
  'isActive',
];

export function topicDraftOf(topic: AgentTopic | null): AgentTopicDraft {
  return {
    slug: topic?.slug ?? '',
    label: topic?.label ?? '',
    description: topic?.description ?? '',
    keywordPatterns: topic?.keywordPatterns.join('\n') ?? '',
    instructionTemplate: topic?.instructionTemplate ?? '',
    searchHintTemplate: topic?.searchHintTemplate ?? '',
    examples: topic?.examples.join('\n') ?? '',
    cooldownMinutes: String(topic?.cooldownMinutes ?? 60),
    priority: String(topic?.priority ?? 0),
    isActive: topic?.isActive ?? true,
  };
}

const lines = (text: string): readonly string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

const integer = (text: string, min: number, max: number): number | null => {
  const value = Number(text.trim());
  return text.trim() !== '' && Number.isInteger(value) && value >= min && value <= max ? value : null;
};

export type AgentTopicVerdict =
  | { readonly ok: true; readonly input: AgentTopicInput }
  | { readonly ok: false; readonly invalid: readonly AgentTopicField[] };

export function topicInputOf(draft: AgentTopicDraft): AgentTopicVerdict {
  const invalid: AgentTopicField[] = [];
  const slug = draft.slug.trim();
  const label = draft.label.trim();
  const description = draft.description.trim();
  const patterns = lines(draft.keywordPatterns);
  const instruction = draft.instructionTemplate.trim();
  const hint = draft.searchHintTemplate.trim();
  const examples = lines(draft.examples);
  const cooldown = integer(draft.cooldownMinutes, 0, 10080);
  const priority = integer(draft.priority, 0, 10);

  if (!/^[a-z0-9_-]{2,40}$/.test(slug)) invalid.push('slug');
  if (label.length < 1 || label.length > 80) invalid.push('label');
  if (description.length > 280) invalid.push('description');
  if (patterns.length < 1 || patterns.length > 10 || patterns.some((pattern) => pattern.length > 200)) invalid.push('keywordPatterns');
  if (instruction.length < 20 || instruction.length > 1000) invalid.push('instructionTemplate');
  if (hint.length < 5 || hint.length > 200) invalid.push('searchHintTemplate');
  if (examples.length > 5 || examples.some((example) => example.length > 300)) invalid.push('examples');
  if (cooldown === null) invalid.push('cooldownMinutes');
  if (priority === null) invalid.push('priority');

  if (invalid.length > 0 || cooldown === null || priority === null) return { ok: false, invalid };
  return {
    ok: true,
    input: {
      slug,
      label,
      description: description === '' ? null : description,
      keywordPatterns: patterns,
      instructionTemplate: instruction,
      searchHintTemplate: hint,
      examples,
      cooldownMinutes: cooldown,
      priority,
      isActive: draft.isActive,
    },
  };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Ce qu'une édition change par rapport au sujet servi — le PATCH n'envoie que cela. */
export function topicChangesOf(topic: AgentTopic, input: AgentTopicInput): Partial<AgentTopicInput> {
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(input) as (keyof AgentTopicInput)[]) {
    if (!same(input[key], topic[key])) changes[key] = input[key];
  }
  return changes as Partial<AgentTopicInput>;
}
