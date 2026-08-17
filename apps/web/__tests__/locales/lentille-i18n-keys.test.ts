/**
 * Réserve 12(b) — REV-1 (C-034).
 *
 * `useI18n('conversations')` (`hooks/use-i18n.ts`) charge `conversations.json`,
 * puis — quand le namespace est aussi une clé du JSON — DESCEND dedans avant
 * toute résolution de chemin :
 *   `translations = data.default || data; if (ns in translations) translations = translations[ns]`
 * Donc pour `ns = 'conversations'`, la portée réelle de `t(key)` est
 * `data.conversations`, PAS la racine du fichier. Le bloc `lentille` ajouté
 * par S-005 avait été posé en SIBLING de `"conversations"` au niveau racine
 * du fichier — hors de portée, `t('lentille.bridge.messages')` retombait
 * silencieusement sur la clé brute. Corrigé ici en déplaçant le bloc SOUS
 * `"conversations"`.
 *
 * Ces tests répliquent l'extraction + la résolution par chemin EXACTEMENT
 * comme `useI18n` (même mécanique que `conversations-i18n-keys.test.ts`,
 * iter 72w) pour prouver que chaque clé `lentille.*` résout bien via le
 * `t` réellement scopé `useI18n('conversations')`.
 */

const LOCALES = ['en', 'fr', 'es', 'pt'] as const;

/** Reproduit `useI18n`'s `loadTranslations` extraction: `data[ns] ?? data`. */
const scopeToNamespace = (data: Record<string, unknown>, namespace: string): Record<string, unknown> =>
  (namespace in data ? (data[namespace] as Record<string, unknown>) : data);

/** Reproduit la marche `key.split('.')` de `useI18n`'s `t()`. */
const resolve = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object' && segment in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);

const loadScopedConversations = (locale: string): Record<string, unknown> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const data = require(`@/locales/${locale}/conversations.json`);
  return scopeToNamespace(data.default ?? data, 'conversations');
};

const LENTILLE_KEYS = [
  'lentille.bridge.authorsOne',
  'lentille.bridge.authorsTwo',
  'lentille.bridge.authorsMore',
  'lentille.bridge.messagesOne',
  'lentille.bridge.messagesOther',
  'lentille.bridge.media.images',
  'lentille.bridge.media.audio',
  'lentille.bridge.media.files',
  'lentille.bridge.partial',
  'lentille.modes.title',
  'lentille.modes.auto',
  'lentille.modes.focal',
  'lentille.modes.script',
  'lentille.modes.resume',
  'lentille.modes.riviere',
  // WL-108 : nom du mode `bubbles` — la décision du drapeau ÉTEINT. Rend
  // `decisionModeLabel` (`components/conversations/lentille/lentille-mode-labels.ts`)
  // exhaustif sur `ConversationReadingMode` plutôt que de prétendre un cas
  // inatteignable ; pendant du `lentille.mode.name.bubbles` iOS.
  'lentille.modes.bubbles',
  'lentille.modes.autoBadge',
  // Trifurcation amendée (REV-3/B3, S1) — WL-106/LWS-11 : la raison Rivière
  // grisée n'est plus une formule unique (l'ancienne paire
  // `riviereLocked`/`riviereLockedDirect`, dishonnête sur `direct` et sur un
  // compte inconnu — voir `packages/shared/utils/reading-modes.ts`,
  // `RiverEligibilityReasonKind`). Trois clés, patron `lentille.mode.river.*`
  // de `apps/ios/Meeshy/Localizable.xcstrings`, transposé en camelCase JSON.
  'lentille.modes.river.never',
  'lentille.modes.river.thresholdOnly',
  'lentille.modes.river.reason',
  'lentille.typing.one',
  'lentille.draft',
  'lentille.sections.pinned',
  'lentille.sections.live',
  'lentille.sections.today',
  'lentille.sections.yesterday',
  'lentille.sections.thisWeek',
  'lentille.sections.older',
  // V4ter/B1 — behaviour-matrix:L16 : le nombre de non-lus de l'aria-label
  // n'est plus émis nu (mensonge #1, verdict REV-4bis) — mention localisée
  // et pluralisée, patron `lentille.bridge.messagesOne/Other` déjà éprouvé
  // par ce même fichier. Consommées par `LentilleRow.tsx`
  // (`resolveUnreadAriaSegment`).
  'lentille.a11y.unreadOne',
  'lentille.a11y.unreadOther',
  // behaviour-matrix:L12 — noms accessibles de l'affordance d'avatar (le geste
  // PROPRE de l'avatar : profil d'un DM, infos de conversation d'un groupe).
  // Consommées par `LentilleRow.tsx` (`AvatarAffordance`).
  'lentille.a11y.openProfile',
  'lentille.a11y.openConversationInfo',
];

describe('lentille namespace i18n keys — reachable via useI18n(\'conversations\') scoping (REV-1 réserve 12b)', () => {
  LOCALES.forEach((locale) => {
    const ns = loadScopedConversations(locale);

    LENTILLE_KEYS.forEach((key) => {
      it(`[${locale}] t('${key}') resolves to a non-empty string under the real 'conversations' scope`, () => {
        const value = resolve(ns, key);
        expect(typeof value).toBe('string');
        expect((value as string).trim().length).toBeGreaterThan(0);
      });
    });
  });

  it('does NOT expose "lentille" at the raw file root (would mean the block escaped the "conversations" scope again)', () => {
    LOCALES.forEach((locale) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const raw = require(`@/locales/${locale}/conversations.json`);
      const data = raw.default ?? raw;
      expect(data.lentille).toBeUndefined();
    });
  });

  it('no longer exposes the un-suffixed "messages" key — imitates the real "One"/"Other" pluralization pair (e.g. newPostsOne/newPostsOther, allAlreadyMembersOne/allAlreadyMembersOther)', () => {
    LOCALES.forEach((locale) => {
      const ns = loadScopedConversations(locale);
      const bridge = resolve(ns, 'lentille.bridge') as Record<string, unknown>;
      expect(bridge.messages).toBeUndefined();
    });
  });

  it('messagesOne is the true singular form (no trailing "s"/locale plural suffix), distinct from messagesOther', () => {
    const expectedOne: Record<(typeof LOCALES)[number], string> = {
      fr: '{count} message',
      en: '{count} message',
      es: '{count} mensaje',
      pt: '{count} mensagem',
    };

    LOCALES.forEach((locale) => {
      const ns = loadScopedConversations(locale);
      expect(resolve(ns, 'lentille.bridge.messagesOne')).toBe(expectedOne[locale]);
      expect(resolve(ns, 'lentille.bridge.messagesOne')).not.toBe(resolve(ns, 'lentille.bridge.messagesOther'));
    });
  });
});
