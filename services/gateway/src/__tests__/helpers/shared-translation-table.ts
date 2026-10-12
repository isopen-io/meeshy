import { jest } from '@jest/globals';
import { matchesMongoWhere } from './mongo-where';

/**
 * La table `SharedTranslation` (#9899) EN MÉMOIRE, dont `deleteMany` APPLIQUE le
 * `where` qu'il reçoit.
 *
 * ## Pourquoi un double qui ÉVALUE, et pas un `mockResolvedValue({ count: 1 })`
 *
 * Un témoin d'effacement a deux façons de mentir, et un double qui répond
 * `{ count: n }` à toute requête les laisse passer toutes les deux :
 *
 * - **effacer trop peu** : la ligne d'un autre message, ou celle d'une version
 *   que l'édition vient de périmer, survit — et le double ne le voit que si la
 *   ligne est encore LÀ à la fin du test ;
 * - **effacer trop** : un `deleteMany({})` — la requête qu'un filtre oublié
 *   produit — vide la table pour TOUTES les conversations. `matchesMongoWhere`
 *   rend `true` pour un `where` absent, comme Prisma, donc l'oubli se voit comme
 *   une suppression trop LARGE et non comme un no-op.
 *
 * Le résultat parle : les assertions lisent les lignes qui RESTENT. Toute forme
 * de filtre que `matchesMongoWhere` ne connaît pas JETTE — jamais ignorée.
 */
export type SharedTranslationRow = {
  readonly id: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly targetLanguage: string;
  readonly sourceVersion: string;
  readonly kdf: string;
  readonly payload: string;
  readonly sharedById: string;
};

export const ORIGINAL_SOURCE_VERSION = 'original';

let sequence = 0;

/** Une enveloppe scellée plausible ; chaque appel porte un `id` distinct. */
export function sharedTranslationRow(overrides: Partial<SharedTranslationRow> = {}): SharedTranslationRow {
  sequence += 1;
  return {
    id: `st-${sequence}`,
    conversationId: '507f1f77bcf86cd799439022',
    messageId: '507f1f77bcf86cd799439011',
    targetLanguage: 'fr',
    sourceVersion: ORIGINAL_SOURCE_VERSION,
    kdf: 'message-content',
    payload: 'enveloppe-scellee',
    sharedById: '507f1f77bcf86cd799439033',
    ...overrides,
  };
}

export function sharedTranslationTable(seed: readonly SharedTranslationRow[] = []) {
  const state = { rows: [...seed] };

  const deleteMany = jest.fn(async (args?: { where?: Record<string, unknown> }) => {
    const doomed = state.rows.filter((row) => matchesMongoWhere(row, args?.where));
    state.rows = state.rows.filter((row) => !doomed.includes(row));
    return { count: doomed.length };
  });

  return {
    state,
    /** Ce que le client Prisma expose sous `prisma.sharedTranslation`. */
    delegate: { deleteMany },
    deleteMany,
    /** Les identifiants des lignes qui RESTENT, dans l'ordre d'insertion. */
    remainingIds: (): string[] => state.rows.map((row) => row.id),
    /** Les versions de source qui subsistent pour UN message — une entrée par ligne, langues confondues. */
    remainingVersionsOf: (messageId: string): string[] =>
      state.rows.filter((row) => row.messageId === messageId).map((row) => row.sourceVersion),
  };
}

/**
 * Seule la DATE devient factice : les minuteurs, `setImmediate` et les
 * micro-tâches restent les vrais, parce que Fastify (`inject`) et les doubles
 * asynchrones en dépendent. À défaire par `jest.useRealTimers()`.
 */
export function useFakeDateOnly(now: Date): void {
  jest.useFakeTimers({
    now,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
}

/** De combien l'horloge factice avance après l'écriture d'une édition. */
const CLOCK_STEP_AFTER_EDIT_MS = 5;

/**
 * La course d'une ÉDITION, rejouée à l'écriture : la ligne qui pose un
 * `editedAt` est suivie, aussitôt, du partage d'un appareil qui a lu ce NOUVEL
 * instant. La ligne de cet appareil porte la version de source que la route
 * vient d'ÉCRIRE (`editedAt.toISOString()`) — relue de l'écriture, jamais d'une
 * horloge du test.
 *
 * Elle déplace ensuite l'horloge factice (voir {@link useFakeDateOnly}) : tout
 * instant relevé APRÈS l'écriture diffère de celui qu'elle a posé. Un transport
 * qui confierait à l'effacement un second `new Date()` au lieu de l'instant
 * écrit ne peut ainsi plus s'en tirer par la chance de la même milliseconde.
 *
 * À appeler depuis le double de l'écriture (`update` / `updateMany`) avec le
 * `data` reçu.
 */
export function sharedOnEditWrite(
  table: ReturnType<typeof sharedTranslationTable>,
  { messageId, targetLanguage = 'de' }: { readonly messageId: string; readonly targetLanguage?: string }
) {
  let written: Date | undefined;

  return {
    onWrite(data: Record<string, unknown>): void {
      if (!(data.editedAt instanceof Date)) return;
      written = data.editedAt;
      jest.setSystemTime(new Date(data.editedAt.getTime() + CLOCK_STEP_AFTER_EDIT_MS));
      table.state.rows = [
        ...table.state.rows,
        sharedTranslationRow({ messageId, sourceVersion: data.editedAt.toISOString(), targetLanguage }),
      ];
    },
    /** L'instant d'édition que la route a ÉCRIT, tel que la base l'a reçu. */
    writtenEditedAt(): Date {
      if (!written) throw new Error("aucune écriture d'édition capturée");
      return written;
    },
  };
}
