# Plan — Itération 64wb (web)

## Objectif
Solder un cluster **orthogonal** de l'anti-pattern `t()||fallback` (différé 60w) :
les **en-têtes de catégories de la liste de conversations** (carrousel + groupes).

## Périmètre (bounded, 0-fichier-partagé avec #854/#857/#858/#859/#855)
1. `components/conversations/CommunityCarousel.tsx` → `conversationsList.{all,reacted,archived}` (3)
2. `components/conversations/conversation-groups/ConversationGroup.tsx` → `conversationsList.{pinned,uncategorized}` (2)

## Étapes
- [x] `git fetch` + `list_pull_requests` → cartographier la contention 64w, choisir surface orthogonale
- [x] Vérifier que les 5 clés `conversationsList.*` existent ×4 locales (oui → 0 locale)
- [x] Convertir `t('k') || 'fr/en'` → `t('k', 'En')` (fallbacks anglicisés, leçon 50w)
- [x] Élargir le type du prop `t` `(key)=>string` → `(key, fallback?)=>string` sur les 2 interfaces
- [x] Vérifier 0 anti-pattern restant + non-régression du mock de test
- [ ] Commit + push branche `claude/practical-fermat-y6vyvh`
- [ ] PR → CI vert → merge dans `main` + suppression branche
- [ ] MAJ `branch-tracking.md` (History + annotation SOLDÉ)

## Différé restant (pour 65w+) — classe `t()||fallback`
`ConversationSettingsModal.tsx` (29), `app/auth/magic-link/page.tsx` (44),
`app/auth/verify-phone/page.tsx` (26), `app/links/tracked/[token]/page.tsx` (15),
`hooks/conversations/useMessageActions.ts` (10), `ConversationDetailsStep.tsx` (3, ns `modals`),
`conversation-participants-drawer.tsx` (2 + placeholder FR brut admin l.581),
`ConversationLayout.tsx` (1, `messageRestored`), `app/settings/page.tsx` (1),
`app/dashboard/LastMessagePreview.tsx` (1), `app/(connected)/contacts/page.tsx` (1),
hooks recovery (`use-recovery-flow`/`use-recovery-submission`/`use-message-interactions`),
`PhoneResetFlow.tsx` (56, post-#800). Lots **bornés et orthogonaux** (contention forte).

## Continuité
- Base : `main` HEAD post-#853. Branche de travail : `claude/practical-fermat-y6vyvh`.
- Après merge : supprimer la branche, repartir de `main` HEAD pour 65w.
