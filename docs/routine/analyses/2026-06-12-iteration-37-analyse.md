# Iteration 37 — Analyse d'optimisation (2026-06-12)

## Contexte
Suite iter 36 (présence unifiée sur la feuille `ParticipantPresenceIndicator` — header,
modal settings et sidebar désabonnés du tick, mergé via PR #586). Le plan iter 36 désignait
pour iter 37 : **F12+F13** — dernier foyer de présence FIGÉE du web : les pages contacts
(5 fichiers) et les pickers (2 fichiers). Audit mené sur l'intégralité des consommateurs
restants de `getUserStatus` hors feuille.

## Cartographie du foyer restant (Famille B — statut figé depuis les props)

Aucun de ces composants ne s'abonne au user store ni au tick : le statut affiché est celui
du payload REST au moment du fetch. Il ne reflète NI les events Socket.IO `user-status`
ultérieurs NI la décroissance temporelle online → away → offline. Un contact qui se
déconnecte reste « En ligne » tant que la page n'est pas re-fetchée — contradiction directe
avec la promesse de présence temps réel du produit (état de l'art concurrence : présence
live partout — WhatsApp Web, Telegram, Slack).

### F12 — pages contacts (5 fichiers)

| Composant | Rendus figés | Notes |
|-----------|--------------|-------|
| `contacts/ContactsList.tsx` | dot avatar (`OnlineIndicator`, l.94-99) + **Badge texte** statut (l.109-129) + dot inline près de `formatLastSeen` (l.186-194) | `getUserStatus(contact)` appelé **4×** par row |
| `tabs/ConnectedContactsTab.tsx` | dot avatar (l.92-97) + **dot + label texte** (l.140-152) | `getUserStatus` 3× par row |
| `tabs/AffiliatesTab.tsx` | dot avatar (l.71-76) + **dot + label texte** (l.92-104) | idem |
| `tabs/PendingRequestsTab.tsx` | dot avatar (l.80-85) | |
| `tabs/RefusedRequestsTab.tsx` | dot avatar (l.81-86) | |

Particularité vs iter 35/36 : au-delà du dot, ces vues affichent le statut en **texte**
(Badge « En ligne / Absent / Hors ligne », labels sous le nom). La feuille existante ne
couvre que le dot — il faut des feuilles sœurs pour le badge et le label, partageant la
même résolution de statut.

### F13 — pickers (2 fichiers)

| Composant | Rendu figé |
|-----------|------------|
| `common/user-selector.tsx` (l.87-89) | dot avatar (`OnlineIndicator` + `getUserStatus` 2×) |
| `conversations/steps/MemberSelectionStep.tsx` (l.119-121) | idem |

Montage court (résultats de recherche), mais le correctif est gratuit : même substitution
dot → feuille que partout ailleurs.

## Constat de duplication (pureté / single source of truth)

La logique « store prioritaire → fallback payload → décroissance au tick » vit aujourd'hui
UNIQUEMENT dans le corps de `ParticipantPresenceIndicator`. Pour rendre badge et labels
vivants, il faut soit la dupliquer (interdit), soit l'**extraire en hook**
`useLiveUserStatus(userId, fallbackUser)` — composable par toute feuille de présence
(dot, badge, label), abonnements granulaires identiques (`useUserById` + `useUserStatusTick`).

Le type `PresenceSource` est défini deux fois (privé dans `lib/user-status.ts`, exporté par
la feuille) — à unifier : export depuis `lib/user-status.ts`, ré-export par la feuille pour
ne pas casser `header/types.ts`.

## Décision iter 37

Traiter F12+F13 en entier (web uniquement, zéro changement de payload, correctif
d'affichage assumé — la présence contacts/pickers devient vivante) :

- **A1 — hook** : extraire `useLiveUserStatus(userId, fallbackUser): UserStatus` dans
  `hooks/use-live-user-status.ts` ; `ParticipantPresenceIndicator` le consomme (zéro
  changement de comportement) ; `PresenceSource` exporté depuis `lib/user-status.ts`.
- **A2 — feuilles texte** : `components/presence/UserPresenceBadge.tsx` (Badge couleurs +
  libellés par statut, ContactsList) et `components/presence/UserPresenceLabel.tsx`
  (dot + libellé statut, texte surchargeable via `children` pour la ligne `formatLastSeen`).
  Mémoïsées, seules abonnées — la row ne re-rend pas sur les ticks.
- **A3 — substitutions** : 7 fichiers — dots avatar → `ParticipantPresenceIndicator`,
  badge → `UserPresenceBadge`, lignes dot+label → `UserPresenceLabel` ; suppression de
  TOUS les imports `getUserStatus`/`OnlineIndicator` de ces composants.

## Constats consignés pour itérations futures (non traités ici)

| # | Constat | Localisation | Impact | Raison du report |
|---|---------|--------------|--------|------------------|
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | `MessageHandler.ts:580` | HAUT (~75 % BP multilingue) | Validation staging requise |
| F4 | Pollings admin → events Socket.IO | `components/admin/agent/*` | MOYEN (admin only) | Events gateway à créer |
| F10 | Dénormaliser `conversationId` scalaire + index sur `Notification` | `schema.prisma` Notification | FAIBLE | Utile seulement à fort volume |
| F14 | `formatLastSeen` texte (« Vu il y a X ») figé au fetch — vivifiable via hook retournant le user résolu | `app/contacts` page | FAIBLE | Texte relatif : nécessite décision produit sur la granularité de rafraîchissement |

## Gain estimé
- Présence ENFIN temps réel (events + décroissance) sur pages contacts et pickers —
  dernier foyer de présence figée du web éliminé : 100 % des rendus de présence web
  passent par la même résolution (`useLiveUserStatus`).
- `getUserStatus` appelé 1× par feuille au lieu de 2-4× par row au render parent.
- Re-render scopé au dot/badge/label (rows `React.memo` intactes sur les ticks).
- Déduplication : 6 blocs IIFE dotColors/labels supprimés, 1 seul mapping statut → UI.
