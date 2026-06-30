# Plan — Itération 73w (web)

**Surface** : `hooks/conversations/useMessageActions.ts` (actions CRUD messages) + `common.json` ×4
**Classe** : anti-pattern i18n `t('messages.X') || 'EN'` + clé `common.messages.contentRequired` manquante ×4 (vrai bug)

## Étapes
1. [x] Audit parité `common.messages.*` (en/fr/es/pt) → `contentRequired` absente partout (clé brute en toast).
2. [x] Ajouter `contentRequired` aux 4 locales (insertion chirurgicale après `editError`).
3. [x] Élargir le type d'injection `t` → `(key: string, fallback?: string) => string`.
4. [x] Convertir les 10 `t('messages.X') || 'EN'` → `t('messages.X', 'EN exacte')` (anti-flash, leçon 50w).
5. [x] Vérifs : grep anti-pattern = 0, JSON ×4 valides, parité rétablie, jest 9 suites / 279 tests.
6. [ ] Commit + push branche + PR + CI vert → merge `main` + suppression branche.

## Garde-fous
- Orthogonal aux PR en vol #1093 (video-calls) / #1100 (admin/agent) / #1108 (conversations).
- `useMessageActions.ts` ≠ `ConversationLayout.tsx` (caller, touché par #1108) → pas de collision de fichier.
- Valeurs de secours = valeur EN mot pour mot ; pas de reformat des locales.
