# Plan — Itération 56w (web)

## Contexte
Base : `main` HEAD post-merge iter-55w (#769, micro-surfaces FR : fallbacks
Suspense + ReplyPreview). Toutes les analyses/plans web antérieurs sont soldés
et annotés dans `branch-tracking.md`. Cette itération poursuit le **cluster
i18n « micro-surfaces FR restantes »** (deferred carry-over 53w), en soldant la
première cible bornée identifiée en 55w : la boîte de dialogue de confirmation
de suppression de pièce jointe.

## Périmètre (web only)
i18n de `components/attachments/AttachmentDeleteDialog.tsx` — 5 chaînes **FR
dures** affichées en TOUTES langues (rupture Prisme UI sur une surface
destructive critique) :

| Chaîne FR figée | Correctif |
|-----------------|-----------|
| `Confirmer la suppression` (titre) | `t('contextMenu.confirmDeleteTitle')` |
| `Êtes-vous sûr de vouloir supprimer ce fichier ? Cette action est irréversible.` | `t('contextMenu.confirmDeleteDescription')` |
| `Le fichier sera définitivement supprimé du serveur.` (encart) | `t('contextMenu.confirmDeleteIrreversible')` |
| `Annuler` (bouton) | `t('contextMenu.cancel')` |
| `Suppression...` / `Supprimer` (bouton destructif) | `t('contextMenu.deleting')` / `t('contextMenu.delete')` |

## Approche — ZÉRO nouvelle clé
- Le namespace `attachments.json` possède **déjà** une section `contextMenu`
  avec exactement les clés requises (`confirmDeleteTitle`,
  `confirmDeleteDescription`, `confirmDeleteIrreversible`, `cancel`, `deleting`,
  `delete`) — créées pour le menu contextuel de pièce jointe, même domaine
  sémantique. Vérifiées à **parité ×4 locales** (en/es/fr/pt).
- Le composant est déjà `'use client'` → `useI18n('attachments')` utilisable
  directement (même import `@/hooks/useI18n` que `MessageAttachments.tsx`, son
  unique appelant, qui utilise déjà le hook i18n).
- Fallbacks EN passés en **2e argument** de `t()` (signature native
  `t(key, fallback)`, anti-flash — leçon 50w).
- Légère consolidation de wording : la description fusionnée FR
  (« … ? Cette action est irréversible. ») est scindée selon les clés
  existantes — l'irréversibilité passe dans l'encart d'avertissement
  (`confirmDeleteIrreversible`), cohérent avec le flow `contextMenu`.

## Clés ajoutées
**Aucune.** Réutilisation stricte de `attachments.contextMenu.*`. Aucun fichier
locale touché → aucun risque de divergence de parité.

## Validation
- node_modules absent dans le container routine → typecheck/build délégués au CI.
- Pattern identique au seul appelant (`MessageAttachments.tsx`, `useI18n`).
- Toutes les clés réutilisées vérifiées présentes dans en/es/fr/pt.

## Hors périmètre (reste du cluster 53w → 57w+)
- `PhoneExistsModal.tsx` (~8 chaînes FR + flow SMS)
- `ReelPlayer.tsx` + surface feed globale (large, passe dédiée)
- `app/settings/loading.tsx` = server component (exclusion 54w, i18n server-side)
