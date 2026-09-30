import type { AdminEntityRef } from '@/components/admin/entity-chip';
import type { AdminGlyphName } from '@/components/glyphs-admin';
import { conversationLabel } from '@/lib/admin/interpret/labels';
import type { AdminTone, Interpreted } from '@/lib/admin/interpret/types';
import { translateAdmin, translateAdminMaybe } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **CE QUE L'AGENT FAIT, EN MOTS** (#8876) — l'issue d'un scan, son déclencheur,
 * l'étape du graphe en cours, et la conversation que l'agent suit, NOMMÉE.
 *
 * Les codes sont ceux que le service agent écrit (`scan-tracer.ts` :
 * `messages_sent | reactions_only | skipped | error` ; `conversation-scanner.ts` :
 * `auto | manual`), et les étapes celles du graphe LangGraph (`observer →
 * strategist → generator → qualityGate`). Un code que les tables ne connaissent
 * pas se dit « Non reconnu » — le code brut ne vit que dans `raw`, jamais peint :
 * une issue inventée serait pire qu'une issue avouée inconnue.
 */
export const AGENT_OUTCOMES = ['messages_sent', 'reactions_only', 'skipped', 'error'] as const;
export const AGENT_TRIGGERS = ['auto', 'manual'] as const;
const AGENT_NODES = ['observer', 'strategist', 'generator', 'qualityGate'] as const;

type Entry = { readonly tone: AdminTone; readonly glyph?: AdminGlyphName };

const OUTCOME_TABLE: Readonly<Record<(typeof AGENT_OUTCOMES)[number], Entry>> = {
  messages_sent: { tone: 'success', glyph: 'checkCircle' },
  reactions_only: { tone: 'info', glyph: 'info' },
  skipped: { tone: 'neutral' },
  error: { tone: 'danger', glyph: 'warningCircle' },
};

const TRIGGER_TABLE: Readonly<Record<(typeof AGENT_TRIGGERS)[number], Entry>> = {
  auto: { tone: 'neutral' },
  manual: { tone: 'brand' },
};

const isOneOf = <T extends string>(values: readonly T[], code: string): code is T => values.some((value) => value === code);

function interpretAgentCode<T extends string>(
  family: 'outcome' | 'trigger',
  codes: readonly T[],
  table: Readonly<Record<T, Entry>>,
  code: string | null | undefined,
  language: InterfaceLanguage,
): Interpreted {
  const raw = code?.trim() ?? '';
  if (raw === '') return { label: translateAdmin(language, 'admin.value.notProvided'), tone: 'neutral', explain: null, raw: '' };
  if (!isOneOf(codes, raw)) return { label: translateAdmin(language, 'admin.value.unrecognized'), tone: 'neutral', explain: null, raw };

  const entry = table[raw];
  return {
    label: translateAdminMaybe(language, `admin.agentPanel.${family}.${raw}`) ?? translateAdmin(language, 'admin.value.unrecognized'),
    tone: entry.tone,
    explain: translateAdminMaybe(language, `admin.agentPanel.${family}.${raw}.explain`),
    ...(entry.glyph === undefined ? {} : { glyph: entry.glyph }),
    raw,
  };
}

export const interpretAgentOutcome = (code: string | null | undefined, language: InterfaceLanguage): Interpreted =>
  interpretAgentCode('outcome', AGENT_OUTCOMES, OUTCOME_TABLE, code, language);

export const interpretAgentTrigger = (code: string | null | undefined, language: InterfaceLanguage): Interpreted =>
  interpretAgentCode('trigger', AGENT_TRIGGERS, TRIGGER_TABLE, code, language);

/** Ce que l'agent est EN TRAIN de faire, dit à la suite de « Scan en cours : » (« rédige un message »). Une étape inconnue reste dite, sans nom de nœud. */
export function agentNodeLabel(node: string | null, language: InterfaceLanguage): string {
  const known = node === null ? undefined : AGENT_NODES.find((candidate) => candidate === node);
  return translateAdmin(language, known === undefined ? 'admin.agentPanel.node.unknown' : `admin.agentPanel.node.${known}`);
}

/**
 * La conversation que l'agent suit, comme entité NOMMÉE. Les listes de l'agent ne
 * servent que le titre et le type — pas les membres : un direct sans titre se dit
 * donc « Conversation sans titre » ici, et « Awa et Jean » sur sa fiche, qui les
 * connaît.
 */
export function agentConversationRefOf(
  conversation: { readonly conversationId: string; readonly title: string | null; readonly conversationType: string | null },
  language: InterfaceLanguage,
): AdminEntityRef {
  return {
    kind: 'conversation',
    id: conversation.conversationId,
    label: conversationLabel({ title: conversation.title, type: conversation.conversationType }, language),
  };
}
