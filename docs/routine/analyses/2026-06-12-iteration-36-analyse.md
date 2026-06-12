# Iteration 36 — Analyse d'optimisation (2026-06-12)

## Contexte
Suite iter 35 (auto-marquage notifications 1 requête Mongo + select participants détail +
feuille de présence `ParticipantPresenceIndicator` — mergé via PR #584). Le plan iter 35
désignait pour iter 36 : **F11** — réutilisation de la feuille de présence là où le statut
est figé ou re-rendu trop large. Audit mené sur TOUS les consommateurs de présence du web
(`getUserStatus` / `OnlineIndicator` / abonnements user-store).

## Cartographie des consommateurs de présence (web)

Deux familles de défauts, symétriques :

### Famille A — abonnement tick au niveau CONTENEUR (sur-rendu)
Le composant entier re-rend à chaque event `user-status` et à chaque tick de décroissance,
alors que seul un dot en dépend :

| Composant | Abonnement | Surface re-rendue par tick |
|-----------|------------|---------------------------|
| `header/use-participant-info.ts:22` | `useUserStatusTick()` + `getUserById` | **ConversationHeader ENTIER** (avatar, titre, toolbar, ParticipantsDisplay, banner d'appel) |
| `ConversationSettingsModal.tsx:140-141` | `useUserStatusTick()` + `getUserById` | **Modal settings ENTIER** (tabs, stats, sections) tant qu'il est monté |

C'est exactement l'anti-pattern corrigé en iter 35 sur `ConversationItem` (F9). Le statut
calculé (`participantInfo.status`, `otherUserStatus`) n'alimente dans les deux cas qu'UN
`OnlineIndicator` :
- `participantInfo.status` n'est lu QUE par `HeaderAvatar.tsx:65-70` (vérifié :
  `ParticipantsDisplay` reçoit `participantInfo` mais ne lit que `.name`) ;
- `otherUserStatus` n'est lu QUE par l'`OnlineIndicator` de l'en-tête direct du modal
  (`ConversationSettingsModal.tsx:531`).

### Famille B — statut FIGÉ depuis les props (sous-rendu, bug d'affichage F11)
Aucun abonnement store ni tick : le dot affiche l'état du payload API au moment du fetch,
ne reflète ni les events Socket.IO ultérieurs ni la décroissance online → away → offline :

| Composant | Source figée | Contexte |
|-----------|--------------|----------|
| `details-sidebar/ActiveUsersSection.tsx:56-60` | `getUserStatus(user)` sur prop (appelé 2× par row) | Sidebar détails conversation — vue « qui est actif » par excellence |
| `contacts/ContactsList.tsx`, `tabs/ConnectedContactsTab.tsx`, `tabs/PendingRequestsTab.tsx`, `tabs/AffiliatesTab.tsx`, `tabs/RefusedRequestsTab.tsx` | `getUserStatus(contact)` sur payload REST | Pages contacts |
| `common/user-selector.tsx:87`, `steps/MemberSelectionStep.tsx:119` | idem | Pickers (résultats de recherche, montage court) |

### Conformes (référence)
- `conversation-item/ParticipantPresenceIndicator.tsx` — la feuille iter 35 : seule
  abonnée (`useUserById` + `useUserStatusTick`), fallback payload, mémoïsée.
- `conversation-participants.tsx` / `conversation-participants-drawer.tsx` — le tick y est
  structurel : le PARTITIONNEMENT online/offline des listes en dépend (le conteneur doit
  re-render pour re-grouper). Hors périmètre.

## Constats retenus pour iter 36

### 1. ConversationHeader re-rendu entier à chaque tick de présence (Famille A, ÉLEVÉ)
`useParticipantInfo` s'abonne au tick et recalcule `getOtherParticipantStatus()` pour
produire `participantInfo.status` — consommé par le seul `HeaderAvatar`. Le header (zone
la plus visible de l'écran de conversation : avatar, titre, toolbar ~10 boutons, indicateur
de frappe) re-rend à CHAQUE event de présence de N'IMPORTE QUEL utilisateur et à chaque
tick périodique, pendant toute la durée d'une conversation ouverte.
État de l'art (iter 35) : remplacer `status` par `otherUserId` + source de fallback dans
`ParticipantInfo`, et rendre la feuille `ParticipantPresenceIndicator` DANS `HeaderAvatar`.
Le hook n'a alors PLUS AUCUN abonnement user-store (la résolution d'`otherUserId` est pure,
dérivée des props). Bonus : supprime le cast `status as unknown` de `HeaderAvatar:67`.

### 2. ConversationSettingsModal re-rendu entier à chaque tick (Famille A, MOYEN)
Même schéma : `statusTick` + `getUserById` au niveau modal pour UN dot dans l'en-tête de
profil direct. Le modal porte tabs, stats de langues, listes — re-render intégral par tick
tant qu'il est ouvert. Même remède : feuille avec `userId={otherUser.id}`,
`fallbackUser={otherUser}` ; suppression des deux abonnements et du `useMemo` dépendant.

### 3. ActiveUsersSection : présence figée et double calcul (Famille B = F11, MOYEN)
La section « utilisateurs actifs » de la sidebar affiche un statut mort : capturé au fetch,
jamais mis à jour (ni events ni décroissance) — contradiction directe avec sa raison d'être.
`getUserStatus(user)` y est de plus appelé deux fois par row. Remède : feuille par row
(`userId={user.id}`, `fallbackUser={user}`, `size="sm"`) — présence live + décroissance,
re-render limité au dot.

## Constats consignés pour itérations futures (non traités ici)

| # | Constat | Localisation | Impact | Raison du report |
|---|---------|--------------|--------|------------------|
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | `MessageHandler.ts:580` | HAUT (~75 % BP multilingue) | Validation staging requise |
| F4 | Pollings admin → events Socket.IO | `components/admin/agent/*` | MOYEN (admin only) | Events gateway à créer |
| F10 | Dénormaliser `conversationId` scalaire + index sur `Notification` | `schema.prisma` Notification | FAIBLE | Utile seulement à fort volume de non-lues |
| F12 | Présence figée pages contacts (5 fichiers : `ContactsList`, 4 tabs) + statut TEXTUEL figé (labels « En ligne/Inactif ») | `components/contacts/*` | FAIBLE-MOYEN | Au-delà du dot : labels texte + tri — mérite son propre lot avec tests contacts |
| F13 | Pickers à statut figé (`user-selector`, `MemberSelectionStep`) | `components/common`, `conversations/steps` | FAIBLE (montage court) | Grouper avec F12 |

## Décision iter 36
Traiter 1+2+3 (web uniquement, zéro changement de payload, un correctif d'affichage assumé —
la présence devient vivante là où elle était figée) :
- **A1** : `ParticipantInfo.status` → `otherUserId` + `presenceFallback` ;
  `useParticipantInfo` désabonné du user store (hook 100 % dérivé des props) ;
  `HeaderAvatar` rend `ParticipantPresenceIndicator`.
- **A2** : `ConversationSettingsModal` — drop `statusTick`/`getUserById`/`otherUserStatus`,
  feuille dans l'en-tête profil direct.
- **A3** : `ActiveUsersSection` — feuille par row.

**Gain estimé** : conversation ouverte — header + modal settings ne re-rendent PLUS JAMAIS
sur les events/ticks de présence (surface : un dot au lieu de l'arbre entier, dans les deux
composants les plus lourds de l'écran) ; sidebar détails — présence enfin temps réel avec
décroissance (correctif F11) ; 3 consommateurs de plus unifiés sur la MÊME feuille
(single source of truth du rendu de présence).
