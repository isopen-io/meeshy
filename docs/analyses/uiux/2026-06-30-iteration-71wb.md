# Analyse UI/UX — Itération 71wb (web)

> **Scope** : `apps/web` **exclusivement**. Les vues iOS ne servent que de référence de parité (couleurs/features naturelles Meeshy), jamais d'objet de revue.

**Date** : 2026-06-30
**Base** : `main` HEAD `3b0b596` (post-merge #1088 iter-70w)
**Branche** : `claude/practical-fermat-kajcer`
**Classe** : parité dark-mode — couleurs catégorielles codées en dur sans variante `dark:`

## Contexte de continuité & non-répétition

État de `main` au démarrage : dernière itération web mergée **70w** (#1088, i18n `PhoneResetFlow`).
PR web en vol au moment de l'analyse (vérifiées via `list_pull_requests`) — **toutes évitées** :
- a11y clavier : #1111 (details-sidebar 72w), #1110/#1095 (invite-user modal 70w),
  #1106/#1101/#1099 (AttachmentPreviewReply 69w), #1100 (agent-config badges **71w**),
  #1093 (video-call overlays 69w), #1092 (community GroupCard 69w), #1091 (audio-effects 69wb).
- i18n `t()||fallback` : #1108 (conversations résidu 72w), divers magic-link/verify-phone/tracked-links.
- `prefers-reduced-motion` : **réglé globalement** par 63wb/#862 → ne pas re-flagger.

Axe choisi **strictement orthogonal** : **dark-mode token parity** (ni a11y clavier, ni i18n, ni motion).
Surface **disjointe** de toutes les PR en vol : `components/conversations/conversation-item/message-formatting.tsx`
(formatage de l'aperçu du dernier message dans la liste de conversations). **N'apparaît dans aucune
analyse/plan antérieur.** Numérotée **71wb** pour éviter la collision avec le `71w` a11y (#1100).

### Doublons d'analyses
Aucun doublon introduit. La revue des analyses récentes (52i→70w) confirme que chacune documente son
propre « Contexte de continuité » et choisit une surface orthogonale ; `branch-tracking.md` reste le
registre append-only de référence avec ses annotations « NE PLUS re-flagger ». Aucune itération
antérieure n'a traité la parité dark-mode des icônes de pièce jointe de l'aperçu de conversation.

## Cible : `components/conversations/conversation-item/message-formatting.tsx`

Ce module formate l'**aperçu du dernier message** affiché dans **chaque ligne de la liste de
conversations** (surface vue à chaque session). Quand le dernier message est une pièce jointe sans
texte, une icône emoji colorée signale le type (image/vidéo/audio/PDF/markdown/code/générique).

### Défaut (réel, visible) — 7 couleurs catégorielles sans variante `dark:`

```tsx
<span className="inline-flex text-blue-500">📷</span>    // image   (l.39)
<span className="inline-flex text-red-500">🎥</span>     // vidéo   (l.53)
<span className="inline-flex text-purple-500">🎵</span>  // audio   (l.100)
<span className="inline-flex text-orange-500">📄</span>  // PDF     (l.123)
<span className="inline-flex text-blue-500">📝</span>    // markdown(l.137)
<span className="inline-flex text-green-500">💻</span>   // code    (l.151)
<span className="inline-flex text-gray-500">📎</span>    // autre   (l.163)
```

Les nuances `-500` sont calibrées pour fond clair. En **dark mode**, elles perdent du contraste sur le
fond sombre de la liste (les `-500` saturées « vibrent » et lisent moins bien que le pas `-400`
conventionnel). **Incohérence interne** : le composant frère `ExpandableMessageText` fournit DÉJÀ des
variantes `dark:text-gray-400` pour ses libellés — ce module est le seul de la chaîne d'aperçu à ne pas
suivre la convention.

### Correctif

Ajout de la variante `dark:` conventionnelle (pas `-400`) à chacune des 7 icônes :
`text-blue-500 dark:text-blue-400`, `text-red-500 dark:text-red-400`, `text-purple-500 dark:text-purple-400`,
`text-orange-500 dark:text-orange-400`, `text-green-500 dark:text-green-400`, `text-gray-500 dark:text-gray-400`.
Aucune nuance de fond/clair modifiée → zéro régression en light mode. Diff confiné : **1 composant
(7 lignes) + 1 nouveau fichier de test**.

## Vérifications
- TDD : nouveau `__tests__/message-formatting.test.tsx` (7 cas, un par type) — **RED** (7/7 échecs sur
  l'absence de `dark:`) puis **GREEN** (7/7) après correctif, via l'API publique `formatLastMessage`.
- Non-régression `components/conversations` : **543/543 tests verts** (2 suites en échec PRÉ-EXISTANT
  hors scope : `ConversationMessages.test.tsx` — erreur de résolution de mock liée au postinstall
  Prisma bloqué localement, résolu en CI par `prisma generate` ; sans rapport avec ce diff).

## Statut
✅ **Complète & corrigée** — diff appliqué, tests verts. Surface `message-formatting.tsx` (icônes de
type de pièce jointe de l'aperçu de conversation) → **NE PLUS re-flagger** pour la parité dark-mode.
