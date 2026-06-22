# Plan de correction — Itération 63w (web)

**Date** : 2026-06-22
**Cible** : anti-pattern i18n `t('key') || 'fallback'` dans la sidebar de détails de conversation
**Branche** : `claude/practical-fermat-yly7ym` (base `main` HEAD `9dafd59`)

## Problème

`useI18n().t(key)` retourne la clé brute (truthy) pendant le flash de chargement async des namespaces.
`t('key') || 'fallback'` ⇒ (1) `||` dead-code quand la clé existe, (2) clé brute affichée à l'écran
pendant le chargement, dans toutes les langues. Même classe que 50w/60w/60wb/62w.

## Périmètre (orthogonal aux PR en vol)

Cluster **sidebar de détails** — aucune PR ouverte ne le touche (#835 = header, #843/#842 = bubble,
#814 = dialogues image, #841 = layout déjà mergé) :

| Fichier | Occ. | Clé(s) |
|---------|------|--------|
| `details-sidebar/DetailsHeader.tsx` | 1 | `conversationDetails.clickToChangeImage` |
| `details-sidebar/CategorySelector.tsx` | 1 | `common.loading` |
| `details-sidebar/TagsManager.tsx` | 1 | `common.loading` |
| `details-sidebar/CustomizationManager.tsx` | 1 | `common.loading` |
| `conversation-details-sidebar.tsx` | 2 | `conversationDetails.imageUpdated`, `conversationDetails.imageUploadError` |

## Étapes

1. [x] Vérifier la parité 4-locales des clés ciblées (`en/fr/es/pt/conversations.json`) → toutes présentes.
2. [x] Remplacer `t('key') || 'fb'` → `t('key', 'EN fallback')` (secours alignés sur la valeur EN exacte du locale).
3. [x] Ne PAS toucher les `|| ''` nullables légitimes (customName, title, description, firstName…).
4. [x] Documenter l'analyse + annoter `branch-tracking.md`.
5. [ ] Commit + push, ouvrir PR, CI vert, merge dans `main`, supprimer la branche.

## Critères d'acceptation

- 0 occurrence `t(...) || '...'` restante dans les 5 fichiers du cluster.
- 0 ajout/modification de locale (clés déjà présentes ×4).
- Aucun changement de comportement runtime (valeur traduite rendue à l'identique quand la clé existe).

## Suite (64w+)

~41 fichiers conservent l'anti-pattern (failed-message-banner, emoji-picker, SystemStatusBanner,
ConversationSettingsModal, hooks conversations, video-calls/audio-effects…). Continuer par lots cohérents
bornés, toujours après `git fetch` + `list_pull_requests`.
