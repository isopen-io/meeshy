/**
 * Vecteurs inter-plateformes pour `sortConversations`
 * (`packages/shared/utils/conversation-sections.ts`).
 *
 * Fixtures : `packages/shared/fixtures/reading-modes/sort.vectors.json`.
 * Générées en EXÉCUTANT la loi TS (jamais à la main) — voir C-024,
 * `tasks/lentille-workshop-execution.md`.
 *
 * ── Sémantique de l'adaptateur (à reproduire à l'identique côté Swift/Kotlin) ──
 * Entrée JSON → appel loi : mêmes règles de parsing que `sections.vectors.test.ts`
 * (`updatedAt`/`lastMessageAt`/`liveCall.startedAt` en ISO-8601 UTC ; champs
 * absents ⇒ `undefined`, jamais une valeur par défaut inventée). Ce fichier ne
 * couvre PAS `now`/`timeZone` — `sortConversations` est un ordre total pur,
 * indépendant de l'horloge et du calendrier (contrairement à
 * `resolveConversationSections`, qui en a besoin pour le classement
 * temporel).
 *
 * Sortie loi → forme JSON `expected` : le tableau `id` des conversations
 * d'ENTRÉE, RÉORDONNÉ selon le tri complet de la loi — jamais les
 * conversations elles-mêmes. L'ordre total vérifié par ces vecteurs :
 * épinglées → live → catégorie (`orderInCategory`) → `lastMessageAt` desc
 * (repli `updatedAt`) → `id` (départage ordinal final).
 */
import { sortConversations, type SectionableConversation } from '../../utils/conversation-sections.js';
import { runVectors } from './harness.js';

type VectorLiveCall = { readonly voices: number; readonly startedAt: string; readonly joined: boolean };

type VectorConversation = {
  readonly id: string;
  readonly isPinned?: boolean;
  readonly categoryId?: string | null;
  readonly orderInCategory?: number | null;
  readonly lastMessageAt?: string | null;
  readonly updatedAt: string;
  readonly liveCall?: VectorLiveCall | null;
};

type SortVectorInput = {
  readonly conversations: readonly VectorConversation[];
};

const toConversation = (raw: VectorConversation): SectionableConversation => ({
  id: raw.id,
  isPinned: raw.isPinned ?? false,
  categoryId: raw.categoryId ?? undefined,
  orderInCategory: raw.orderInCategory ?? undefined,
  lastMessageAt: raw.lastMessageAt != null ? new Date(raw.lastMessageAt) : raw.lastMessageAt === null ? null : undefined,
  updatedAt: new Date(raw.updatedAt),
  liveCall: raw.liveCall ?? undefined,
});

const adaptSort = (input: SortVectorInput): readonly string[] =>
  sortConversations(input.conversations.map(toConversation)).map((conversation) => conversation.id);

runVectors<SortVectorInput, readonly string[]>('sort', adaptSort);
