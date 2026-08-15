/**
 * Vecteurs inter-plateformes pour `resolveConversationSections`
 * (`packages/shared/utils/conversation-sections.ts`).
 *
 * Fixtures : `packages/shared/fixtures/reading-modes/sections.vectors.json`.
 * Générées en EXÉCUTANT la loi TS (jamais à la main) — voir C-024,
 * `tasks/lentille-workshop-execution.md`.
 *
 * ── Sémantique de l'adaptateur (à reproduire à l'identique côté Swift/Kotlin) ──
 * Entrée JSON → appel loi :
 *   - `conversations[].updatedAt` / `lastMessageAt` / `liveCall.startedAt` / `now`
 *     sont des chaînes ISO-8601 UTC (`Z`) — parsées en instant epoch (`Date`
 *     côté TS, `Date`/`Instant` côté Swift/Kotlin). Pas de fuseau caché : le
 *     SEUL fuseau qui influence le résultat est `input.timeZone`, passé tel
 *     quel à `resolveConversationSections`.
 *   - `lastMessageAt` ABSENT du JSON (clé non présente) ⇒ `undefined` (aucune
 *     valeur connue, la loi n'y touche pas puisqu'elle lit
 *     `lastMessageAt ?? updatedAt`) ; `lastMessageAt: null` explicite ⇒ `null`
 *     (même comportement de repli, distingué seulement pour documenter le cas
 *     legacy où le champ existe mais vide). Les deux convergent vers le même
 *     résultat ici — voir `effectiveTimestamp` dans la loi.
 *   - `categoryId` / `orderInCategory` / `liveCall` absents du JSON ⇒
 *     `undefined`, jamais une valeur par défaut inventée par l'adaptateur.
 *   - `locale` n'est PAS un champ du vecteur : la loi la reçoit mais ne
 *     l'utilise jamais pour ses bornes calendaires (voir le commentaire de
 *     `ResolveConversationSectionsParams.locale` dans la loi) — l'adaptateur
 *     fixe une valeur arbitraire constante (`'en-US'`) qui n'a AUCUN effet
 *     sur `expected`.
 *
 * Sortie loi → forme JSON `expected` (sérialisation SIMPLE, sans les
 * conversations complètes) :
 *   - Une section devient `{ kind, categoryId?, ids }` — `categoryId` présent
 *     UNIQUEMENT pour `kind: 'category'`, `ids` = les `id` des conversations
 *     de la section DANS L'ORDRE rendu par la loi (déjà trié par
 *     `sortConversations`, jamais retrié par l'adaptateur).
 *   - L'ordre des sections dans le tableau `expected` EST significatif :
 *     pinned → live → catégories (ordre déclaré) → today → yesterday →
 *     thisWeek → older. Une section absente du tableau = aucune conversation
 *     n'y a été classée (jamais une section vide émise).
 */
import { resolveConversationSections, type SectionableConversation } from '../../utils/conversation-sections.js';
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

type SectionsVectorInput = {
  readonly conversations: readonly VectorConversation[];
  readonly categories: ReadonlyArray<{ readonly id: string }>;
  readonly now: string;
  readonly timeZone: string;
};

type SerializedSection =
  | { readonly kind: 'pinned' | 'live' | 'today' | 'yesterday' | 'thisWeek' | 'older'; readonly ids: readonly string[] }
  | { readonly kind: 'category'; readonly categoryId: string; readonly ids: readonly string[] };

const toConversation = (raw: VectorConversation): SectionableConversation => ({
  id: raw.id,
  isPinned: raw.isPinned ?? false,
  categoryId: raw.categoryId ?? undefined,
  orderInCategory: raw.orderInCategory ?? undefined,
  lastMessageAt: raw.lastMessageAt != null ? new Date(raw.lastMessageAt) : raw.lastMessageAt === null ? null : undefined,
  updatedAt: new Date(raw.updatedAt),
  liveCall: raw.liveCall ?? undefined,
});

const adaptSections = (input: SectionsVectorInput): readonly SerializedSection[] => {
  const sections = resolveConversationSections({
    conversations: input.conversations.map(toConversation),
    categories: input.categories,
    now: new Date(input.now),
    locale: 'en-US',
    timeZone: input.timeZone,
  });

  return sections.map((section) =>
    section.kind === 'category'
      ? { kind: 'category' as const, categoryId: section.categoryId, ids: section.conversations.map((c) => c.id) }
      : { kind: section.kind, ids: section.conversations.map((c) => c.id) }
  );
};

runVectors<SectionsVectorInput, readonly SerializedSection[]>('sections', adaptSections);
