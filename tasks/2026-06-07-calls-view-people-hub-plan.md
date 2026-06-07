# Plan détaillé — Vue d'appels & Hub « Personnes » (2026-06-07)

> Décision produit (validée) :
> - **Header de conversation** : fusionner les 2 boutons (audio/vidéo) en **un seul bouton Liquid Glass** (iOS 26 ; style adapté par version sinon). Tap → propose *Audio* / *Vidéo* ; **le choix lance l'appel directement** (pas de composer intermédiaire).
> - **Liste des conversations** : un bouton ouvre un **hub** = `ContactsHub` **enrichi d'un onglet « Appels » (Récents)**.
> - **Unification** : les appels deviennent un **onglet du hub Contacts**. Le centre de **Notifications reste** un écran frère ; les appels manqués/refusés y restent (catégorie `.calls` déjà existante) et y pointent vers l'onglet Appels.
> - **Portée** : iOS **et** Web ensemble.
> - **Renommage** : « créer un lien de partage » → **« Inviter un ami à une conversation »** partout.

Ce chantier est la **couche vue/entrées + unification**. Il **réutilise** le moteur d'appel (WebRTC/CallKit/gateway) déjà en place et ses plans de fiabilité (`tasks/calls-sota-plan-2026-06-05.md`, `tasks/calls-fonctionnel-todo.md`). Il **ne réécrit pas** la signalisation.

---

## 0. État de l'existant (ne pas refaire)

**Moteur & vues d'appel — déjà là**
- iOS : `CallManager.startCall(conversationId:userId:displayName:isVideo:)` (`apps/ios/.../Services/CallManager.swift:336`), `IncomingCallView`, `CallView`, `FloatingCallPillView`, `CallWaitingBannerView`, CallKit/VoIP (`VoIPPushManager`).
- Web : `useVideoCall().startCall()` (`apps/web/hooks/conversations/use-video-call.ts`), `VideoCallInterface`, `CallNotification`, `OngoingCallBanner`, `call-store.ts`.
- Backend : `routes/calls.ts` (POST `/calls`, GET `/calls/:id`, DELETE, participants, GET `/calls/active`), `CallEventsHandler`, `CallService`, `CallCleanupService`.
- DB : `CallSession`, `CallParticipant`, `CallStatus {initiated…missed,rejected,failed}`, `CallEndReason`, `CallMode {p2p,sfu}` (`packages/shared/prisma/schema.prisma:1596+`).

**Boutons d'appel header — déjà là (à transformer)**
- iOS `HeaderCallButtonsView` (`ConversationView+Header.swift:182-257`) : 2 boutons (audio `phone.fill`, vidéo `video.fill`), **directs uniquement**, gate `canUseVideoCalls`. + indicateur « retour à l'appel ».
- Web `HeaderToolbar.tsx:82-103` : 1 bouton vidéo, directs + `canUseVideoCalls`.

**Hub Contacts — déjà là (à enrichir)**
- iOS `ContactsHubView` + `ContactsShared.swift` → `enum ContactsTab {contacts, requests, discover, blocked}` (à étendre). Route `Router.contacts(ContactsTab = .contacts)`.
- Web `components/contacts/*` (`ContactsList`, `ContactsSearch`, `ContactsStats`, tabs) + `components/v2/ContactCard.tsx` (a **déjà** une action `call`).

**Notifications — déjà là (à conserver)**
- iOS `NotificationListView` a **déjà** la catégorie `.calls` (missedCall, callDeclined, incomingCall, callEnded). `NotificationCoordinator`, toasts (`NotificationToastManager`).
- Web `components/notifications/*`.

**Recherche user / appel par numéro — briques présentes**
- iOS `useUserSearch`/`SmartSearch` (web), `UserService.getProfileByPhone` (SDK) → `GET /users/phone/{phone}`.
- Gateway `normalizePhoneWithCountry()` (`utils/normalize.ts`) ; web `resolveCountry`/`toE164` (posés au chantier précédent).

**Manques identifiés**
1. Pas de **GET historique d'appels** (liste). 2. Pas d'**onglet Appels** dans le hub. 3. Pas de **composer** (appel par username/numéro). 4. Pas de **bouton-hub** dans la liste de conversations. 5. Header : 2 boutons au lieu d'1 bouton Liquid Glass. 6. Libellés « lien de partage » à renommer.

---

## 1. Architecture UX cible (3 surfaces)

### Surface A — Header de conversation : 1 bouton Liquid Glass « Appeler »
- Remplace les 2 boutons par **un seul** `CallButton` (icône `phone.fill` / `phone.badge.waveform`).
- Tap → **Menu** (pas de sheet) avec 2 items : *Appel audio* (`phone.fill`), *Appel vidéo* (`video.fill`). Sélection → `startCall(..., isVideo:)` **immédiat**.
- Style : Liquid Glass iOS 26 (`.glassEffect`/`.buttonStyle(.glass)`), sinon style verre maison actuel par version (cf. §2).
- Conserve l'« indicateur retour à l'appel » quand un appel est actif (réutiliser l'existant).
- Directs : actif. Groupes : même bouton, branché plus tard sur SFU (laisser le menu, désactivé/`coming soon` tant que SFU pas prêt — ne pas bloquer le design).

### Surface B — Liste des conversations : bouton « Hub »
- Ajouter dans la barre de la liste un bouton (icône `phone.arrow.up.right` ou `person.2.badge.gearshape`) qui **ouvre le hub Contacts sur l'onglet Appels** : iOS `router.navigate(.contacts(.calls))` ; Web route `/contacts?tab=calls`.
- C'est le point d'entrée « appels + personnes » réclamé.

### Surface C — Hub Contacts + onglet « Appels » (Récents)
Le hub devient le **hub Personnes & Appels**. Onglets : `Appels` · `Contacts` · `Demandes` · `Découvrir` · `Bloqués` (Appels en tête ou en 2nd selon ouverture).

**Onglet Appels** =
1. **Composer** en haut : bouton « Nouvel appel » → champ unique qui accepte **username** *ou* **numéro** :
   - saisie type numéro (`+`, `00`, chiffres) → `resolveCountry`/`toE164` (présume l'indicatif de l'appelant si absent) → lookup `GET /users/phone/{e164}` → si trouvé : appeler ; sinon proposer « Inviter ».
   - sinon → recherche username (`useUserSearch` / `searchUsers`).
   - Sélection → choix Audio/Vidéo → `startCall`.
2. **Journal** : liste des `CallSession` de l'utilisateur, triée récente d'abord, avec : avatar, nom (Prisme : `displayName`/username), **direction** (entrant ↙ / sortant ↗ / manqué en rouge), badge audio/vidéo, durée/heure relative. Actions : tap = rappeler (réutilise le dernier média), swipe = supprimer, `info` = profil/contact card.
3. Filtres légers : *Tous* / *Manqués* (réutiliser le pattern de chips des notifs/contacts).

---

## 2. iOS 26 — Liquid Glass (stratégie + fallback)

Cible min = iOS 16. Adopter Liquid Glass **sans casser** les versions antérieures via un helper de style versionné.

- Créer `MeeshyUI/Theme/GlassStyle.swift` : `View.meeshyGlass(_ shape:)` qui applique
  - iOS 26+ : `.glassEffect(in: shape)` / conteneur `GlassEffectContainer` ; boutons `.buttonStyle(.glass)` quand dispo.
  - iOS < 26 : le verre maison actuel (`.ultraThinMaterial` teinté indigo + bordure, cf. `apps/ios/CLAUDE.md` Design System).
  - Gate via `if #available(iOS 26, *)`.
- Appliquer `meeshyGlass` au **CallButton** header, au **composer** et aux cartes du journal d'appels, pour une cohérence visuelle.
- Vérifier le rendu des écrans d'appel existants (`CallView`, `IncomingCallView`, `FloatingCallPillView`) sous iOS 26 (Liquid Glass peut changer overlays/barres) — passage de revue, pas de réécriture.
- Tab/segment du hub : utiliser le segmented control natif (compatible iOS 26) ; éviter `AnyView`.

> Règle : aucune API iOS 26 sans `#available` + fallback iOS 16. Respecter `MeeshyColors`/`brandGradient` (indigo).

---

## 3. Modèle de données & Backend

### 3.1 Endpoint historique d'appels (NOUVEAU)
`GET /api/v1/calls/history?limit=30&cursor=<id>&filter=all|missed` (auth) →
```
{ success, data: CallHistoryItem[], pagination }
CallHistoryItem = {
  callId, conversationId, mode, status, endReason,
  direction: 'incoming'|'outgoing'|'missed',   // dérivé: initiatorId == me ? outgoing : (answered ? incoming : missed)
  isVideo: boolean,                            // depuis metadata/participants
  startedAt, answeredAt, endedAt, durationSec,
  peer: { userId, username, displayName, avatar, phoneNumber, isOnline } // l'autre participant (P2P)
}
```
- Source : `CallSession` + `CallParticipant` filtrés par participation de l'utilisateur courant. Index déjà présents (`startedAt`, `status`).
- `peer` = pour P2P, l'autre participant ; pour SFU, le groupe/conversation.
- Implémentation : `routes/calls.ts` (nouveau handler) + `CallService.listHistory(userId, …)`.

### 3.2 Recherche pour le composer
- Réutiliser `GET /users/search?q=` (username) et `GET /users/phone/{e164}` (numéro).
- Côté client : router selon la nature de la saisie (numéro vs texte) ; numéro normalisé avec l'indicatif **présumé de l'appelant** (`user.phoneCountryCode`/locale) si pas de `+`.

### 3.3 Notifications appels (vérifier, pas recréer)
- S'assurer que gateway crée bien une notification `missedCall`/`callDeclined` à l'expiration sonnerie/refus (la catégorie `.calls` existe déjà côté client). Si absent → l'ajouter dans `CallService`/`CallCleanupService`.
- Deep link notif `.calls` → ouvrir `contacts(.calls)` (ou rappeler).

### 3.4 Cohérence vCard (groundwork, prépare la suite)
- Exposer dans `peer`/contact card les champs alignés vCard : `displayName`(FN), `username`, `phoneNumber`(TEL, E.164), `email`(EMAIL), `avatar`(PHOTO). Tous présents dans `MeeshyUser`/`User`. Centraliser un mapping `User → ContactCard` réutilisable (prépare la sync contacts locale & l'export vCard du futur).

---

## 4. Plan d'implémentation — iOS

| # | Tâche | Fichiers |
|---|------|----------|
| A1 | `enum ContactsTab` : ajouter `case calls = "Appels"` (icône `phone.fill`) | `apps/ios/Meeshy/Features/Contacts/ContactsShared.swift` |
| A2 | `ContactsHubView` : rendre l'onglet Appels + badge (nb manqués) | `apps/ios/Meeshy/Features/Contacts/ContactsHubView.swift` |
| A3 | Nouveau `CallsRecentsView` + `CallsRecentsViewModel` (cache-first : `CallHistoryStore`) | `apps/ios/Meeshy/Features/Contacts/Calls/*` |
| A4 | Nouveau `CallComposerView` (champ username/numéro, lookup, choix audio/vidéo) | `apps/ios/Meeshy/Features/Contacts/Calls/CallComposerView.swift` |
| A5 | SDK : `CallHistoryService` + models `CallHistoryItem` (Decodable + toDomain) | `packages/MeeshySDK/Sources/MeeshySDK/Services/CallHistoryService.swift`, `.../Models/CallModels.swift` |
| A6 | SDK : helper `User → ContactCard` (vCard-aligned) | `packages/MeeshySDK/Sources/MeeshySDK/Models/ContactCard.swift` |
| A7 | Header : remplacer `HeaderCallButtonsView` (2 boutons) par `CallButton` unique (Menu audio/vidéo, lance direct) | `apps/ios/.../Views/ConversationView+Header.swift` |
| A8 | `MeeshyUI/Theme/GlassStyle.swift` : `meeshyGlass()` versionné iOS 26/fallback | `packages/MeeshySDK/Sources/MeeshyUI/Theme/GlassStyle.swift` |
| A9 | Liste conversations : bouton-hub → `router.navigate(.contacts(.calls))` | `apps/ios/.../Views/ConversationListView.swift` |
| A10 | Deep link notif `.calls` → `contacts(.calls)` | `apps/ios/.../Navigation/DeepLinkRouter.swift` |
| A11 | Revue Liquid Glass des écrans d'appel existants sous iOS 26 | `CallView/IncomingCallView/FloatingCallPillView` |
| A12 | Tests : VM journal (cache→API, direction, manqués), composer (numéro→E164→lookup) | `apps/ios/MeeshyTests/...`, `packages/MeeshySDK/Tests/...` |

Règles iOS : protocole `…Providing` avant impl service (A5), injection `.shared` par défaut, leaf views sans `@ObservedObject` singleton, `./apps/ios/meeshy.sh test` vert avant commit.

---

## 5. Plan d'implémentation — Web

| # | Tâche | Fichiers |
|---|------|----------|
| W1 | Onglet « Appels » dans le hub contacts (+ route `/contacts?tab=calls`) | `apps/web/components/contacts/*`, page contacts |
| W2 | `CallsRecents` (journal) + `useCallHistory` (React Query, GET `/calls/history`) | `apps/web/components/calls/CallsRecents.tsx`, `apps/web/hooks/use-call-history.ts` |
| W3 | `CallComposer` (username via `useUserSearch` / numéro via `resolveCountry`+`toE164`+lookup) → choix audio/vidéo → `useVideoCall().startCall` | `apps/web/components/calls/CallComposer.tsx` |
| W4 | Header : `HeaderToolbar` → bouton unique avec menu audio/vidéo (lance direct), au lieu du seul vidéo | `apps/web/components/conversations/header/HeaderToolbar.tsx` |
| W5 | Liste conversations : bouton-hub → `/contacts?tab=calls` | `apps/web/components/conversations/ConversationList*.tsx` |
| W6 | (déjà présent) brancher l'action `call` de `components/v2/ContactCard.tsx` sur le composer | `apps/web/components/v2/ContactCard.tsx` |
| W7 | Lever/ajuster le gate `canUseVideoCalls` (cf. RC C1 du plan calls — décision produit : ouvrir aux users authentifiés) | `apps/web/components/conversations/header/use-permissions.ts` |
| W8 | Tests RTL : journal, composer (numéro/username) | `apps/web/__tests__/...` |

---

## 6. Renommage « Inviter un ami à une conversation »

Remplacer les libellés « créer un lien de partage » / « partager » (entrée d'invitation) par **« Inviter un ami à une conversation »** (clés i18n `en/fr/es/pt`) :
- iOS : `ConversationInfoSheet.swift` (label `Partager`, ~887), `ConversationListView.swift` titre sheet (`conversation.list.create_share_link.title`, :968) + `shareConversationLink`. (Note : `InviteFriendsSheet` existe déjà — aligner la sémantique.)
- Web : `create-link-button.tsx`, `details-sidebar/ShareLinksSection.tsx` (« Créer un lien »), `header/HeaderActions.tsx` (« Partager »).
- Garder l'icône d'invitation distincte du bouton Appel ; les deux **côte à côte** là où ils coexistent.

---

## 7. Unification : que deviennent Notifications & Contacts ?

- **Contacts hub → conservé et étendu** : devient le hub Personnes & Appels (onglet Appels = journal + composer). C'est le point d'entrée du bouton-hub de la liste.
- **Notifications → conservé** (écran frère, pas fusionné — éviter la surcharge). Les appels **manqués/refusés** y restent (catégorie `.calls` déjà là) ; un tap renvoie vers l'onglet Appels / rappelle.
- **Pas de méga-vue unique** : un hub Personnes (avec Appels) + un centre Notifications, reliés par deep links. Élégant, faible couplage, zéro nouvel onglet racine.
- Source unique du badge appels manqués : `NotificationCoordinator` (réutiliser), pas de compteur parallèle.

---

## 8. Phasage / jalons

1. **J1 — Backend** : `GET /calls/history` + `CallService.listHistory` + (si besoin) notif missed/declined. Déployable seul, testable via curl.
2. **J2 — SDK/shared** : models `CallHistoryItem`, `CallHistoryService`, helper `User→ContactCard`.
3. **J3 — iOS hub** : onglet Appels (journal cache-first) + composer + deep link.
4. **J4 — iOS header** : `CallButton` Liquid Glass unifié + `meeshyGlass()` + bouton-hub liste + revue iOS 26.
5. **J5 — Web** : onglet Appels + composer + header bouton unique + bouton-hub + gate.
6. **J6 — Renommage** i18n (4 langues) + cohérence vCard groundwork.
7. **J7 — QA matrice** (cf. `calls-fonctionnel-todo.md`) + polish Liquid Glass.

---

## 9. Tests & critères d'acceptation

- Header : 1 bouton ; menu audio/vidéo ; sélection **lance l'appel sans étape** ; style Liquid Glass iOS 26, fallback < 26.
- Liste conversations : bouton ouvre le hub sur l'onglet Appels.
- Onglet Appels : journal récents/manqués corrects (direction, vidéo, durée) ; cache-first (pas de spinner si cache) ; rappeler en 1 tap.
- Composer : numéro `06…` (sans `+`) avec compte FR → appelle le bon user via E.164 ; `+44…` résout GB ; username → résultat → appel.
- Manqué → notification `.calls` + badge ; tap → onglet Appels.
- Renommage présent dans les 4 langues, partout.
- iOS : `meeshy.sh test` + `meeshy.sh build` verts ; Web : `type-check` + jest verts.

---

## 10. Risques

- **Liquid Glass régressions** sur écrans d'appel existants → revue dédiée J4/J7, gating `#available`.
- **`canUseVideoCalls` (web)** : décision produit d'ouverture (RC C1) — confirmer avant W7.
- **Groupes/SFU** : le bouton header existe pour directs ; group call dépend de la fiabilité SFU (hors ce chantier) → menu désactivé proprement si non prêt.
- **Numéro ambigu** (+1 US/CA, +44 GB/GG) : lookup peut renvoyer plusieurs candidats → afficher le pays/flag dans le composer (réutilise `flagForCountry`).
- **Doublon compteurs** : passer par `NotificationCoordinator` uniquement.

---

## 11. Suites (hors scope, préparées par ce plan)

- **Sync contacts locale** (CNContact ↔ users Meeshy par E.164 normalisé, **sans amitié**, local d'abord).
- **Notifications d'ajout / demandes d'ami** à partir des contacts détectés.
- **Export/мport vCard** (le helper `User→ContactCard` aligné vCard est posé ici).
- **Appels de groupe (SFU)** : réutilisent `CallButton` + composer (sélection multi).
