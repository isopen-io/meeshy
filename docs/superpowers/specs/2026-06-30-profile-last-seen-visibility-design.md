# Visibilité conditionnelle de la présence (« dernière fois vu en ligne »)

- **Date** : 2026-06-30
- **Version** : v2 (révisée après double revue Opus — correction & sécurité)
- **Statut** : Design validé, prêt pour plan d'implémentation
- **Plateformes** : Gateway (`services/gateway`) + Shared (`packages/shared`) + Web (`apps/web`) + iOS (`apps/ios` + `packages/MeeshySDK`)

## 1. Objectif

Sur la fiche profil d'un utilisateur, afficher après le pseudo un libellé de présence et, sur l'avatar, une pastille en ligne/hors ligne — **uniquement si l'observateur est autorisé** à voir la présence de la cible :

1. la cible elle-même (`self`), ou
2. un observateur **≥ MODERATOR** (bypass des préférences), ou
3. un **contact** : ami accepté **ou** affilié (les deux sens), si les préférences de la cible l'autorisent.

La donnée (`User.lastActiveAt` + `User.isOnline`) existe déjà et est déjà chargée avec le profil. Le travail consiste à (a) **restreindre** la divulgation côté serveur — pas seulement sur le profil mais sur tous les canaux exploitables — et (b) **formater** l'affichage (pastille + texte coloré) côté clients.

### Constat de la revue (pourquoi le périmètre dépasse le profil)
La présence fuit aujourd'hui par ~12 canaux serveur. Gater le seul profil serait une **fausse sécurité** : la donnée masquée réapparaît via `GET /users/presence`, `/users/search`, `/links/:identifier` (sans authentification !), les payloads de demandes d'ami, et le snapshot socket. La décision produit retenue (**« confidentialité cohérente »**) ferme les contournements exploitables tout en **préservant la présence légitime entre co-participants d'une conversation**.

## 2. Décisions produit (validées)

| Sujet | Décision |
|---|---|
| Plateformes | Gateway + Web + iOS |
| « Contact » | Ami `FriendRequest.status='accepted'` **OU** affilié `AffiliateRelation.status='completed'` — **PAS** la simple co-participation à une conversation |
| Affiliation | Les **deux sens** (parrain ↔ filleul) |
| Bypass rôle | **≥ MODERATOR** (BIGBOSS, ADMIN, MODERATOR). AUDIT/ANALYST **ne bypassent pas** (hiérarchie : ils sont sous MODERATOR) |
| Préférences | **Respecter les deux**, en cascade : `showOnlineStatus` = interrupteur maître de présence ; `showLastSeen` = affine le détail temporel. Modérateur+/self bypassent |
| Pastille avatar | Online/offline, gouvernée par `showOnlineStatus` |
| Texte après pseudo | Détail temporel, gouverné par `showLastSeen`. « En ligne » affiché **seulement si** `age < 1 min` **et** `showLastSeen` actif (redondant avec la pastille mais assumé) |
| Périmètre serveur | **Confidentialité cohérente** : profil + fermeture des contournements arbitraires ; présence conversationnelle **préservée** (en respectant les préférences) |
| Compte cible désactivé | Présence masquée (en amont du gate) |
| Blocage | Si l'une des deux parties a bloqué l'autre (`User.blockedUserIds`) → présence masquée |

## 3. Deux niveaux d'autorisation selon le canal

La présence d'une **cible** est montrable à un **viewer** si l'une des conditions tient :

- **Critère STRICT** (profil + canaux de divulgation arbitraire) : `self` · `≥ MODERATOR` · `ami accepté` · `affilié completed`.
- **Critère CONTEXTUEL** (canaux conversationnels) : critère strict **OU** `co-participation active` (conversation / communauté commune).

Dans **tous** les cas (sauf `self` et `≥ MODERATOR`, qui bypassent) on applique ensuite les préférences en cascade :
```
si !showOnlineStatus      -> isOnline = null,  lastActiveAt = null   (présence entièrement masquée)
sinon                     -> isOnline conservé
                             lastActiveAt = showLastSeen ? lastActiveAt : null
```
Si le critère d'autorisation échoue → `isOnline = null` **et** `lastActiveAt = null`.

> **`isOnline` devient nullable dans les réponses concernées** : `null` = « non montrable » (→ pas de pastille), `false` = « hors ligne visible », `true` = « en ligne ». Lever cette ambiguïté est nécessaire pour la pastille.

Ce comportement reproduit la cascade déjà appliquée par le broadcast socket (`MeeshySocketIOManager._broadcastUserStatus`, `:1536` `showOnlineStatus`, `:1586` `showLastSeen`).

## 4. Composants serveur

### 4.1 Helper pur partagé (testable, sans I/O) — `packages/shared/utils/`

```ts
type PresenceVisibilityInput = {
  isSelf: boolean;
  viewerRole: GlobalUserRoleType;
  areConnected: boolean;          // ami OU affilié (critère strict)
  sharesConversation?: boolean;   // co-participation (critère contextuel), défaut false
  targetShowOnlineStatus: boolean;
  targetShowLastSeen: boolean;
  targetIsDeactivated: boolean;
  isBlockedEitherWay: boolean;
};

// Politique pure : deux drapeaux. La VRAIE valeur isOnline reste chez l'appelant.
type PresenceVisibility = { showOnline: boolean; showLastSeenTimestamp: boolean };

export const resolvePresenceVisibility = (i: PresenceVisibilityInput): PresenceVisibility => {
  if (i.targetIsDeactivated || i.isBlockedEitherWay) return { showOnline: false, showLastSeenTimestamp: false };
  const privileged = i.isSelf || isGlobalModerator(i.viewerRole);
  const allowed = privileged || i.areConnected || (i.sharesConversation ?? false);
  if (!allowed) return { showOnline: false, showLastSeenTimestamp: false };
  if (privileged) return { showOnline: true, showLastSeenTimestamp: true };          // bypass prefs
  if (!i.targetShowOnlineStatus) return { showOnline: false, showLastSeenTimestamp: false }; // maître OFF
  return { showOnline: true, showLastSeenTimestamp: i.targetShowLastSeen };
};
```
*(Le helper décide des drapeaux de politique ; l'appelant injecte la vraie valeur — voir 4.4. `showOnline:false` ⇒ `isOnline=null` côté réponse. Réutilise `isGlobalModerator` de `packages/shared/types/role-types.ts:291-293`.)*

### 4.2 Résolution serveur (gateway) — `services/gateway/src/services/PresenceVisibilityService.ts` (nouveau)

```
resolveForTarget(viewerCtx, target, { allowConversationContext }):
  isSelf  = viewerCtx.userId === target.id
  if isSelf || isGlobalModerator(viewerCtx.role): renvoyer drapeaux "privileged" (pas de requête)
  blocked = viewerCtx.userId ∈ target.blockedUserIds  ||  target.id ∈ viewer.blockedUserIds
  areConnected = isFriendAccepted(viewerCtx.userId, target.id)
              || isAffiliatedCompletedEitherWay(viewerCtx.userId, target.id)
  sharesConversation = allowConversationContext && hasActiveSharedConversation(viewerCtx.userId, target.id)
  prefs = privacyPreferencesService.getPreferences(target.id)   // cache 5 min déjà en place
  return resolvePresenceVisibility({ ... })
```
- `isFriendAccepted(a,b)` : `friendRequest.findFirst({ where:{ status:'accepted', OR:[{senderId:a,receiverId:b},{senderId:b,receiverId:a}] }, select:{id:true} })`. (Même critère que `getFriendIds`, `SocialEventsHandler.ts:67-75`.)
- `isAffiliatedCompletedEitherWay(a,b)` : `affiliateRelation.findFirst({ where:{ status:'completed', OR:[{affiliateUserId:a,referredUserId:b},{affiliateUserId:b,referredUserId:a}] }, select:{id:true} })`. (`schema.prisma:1440-1452`.)
- `hasActiveSharedConversation(a,b)` : participants actifs communs (réutiliser la logique `_emitPresenceSnapshot`, `MeeshySocketIOManager.ts:536-552`).
- **Batch** : exposer `resolveForTargets(viewerCtx, ids[])` pour `/users/presence` (une passe friend/affiliate/conversation + `getPreferences` par id), afin d'éviter N+1.

### 4.3 Câblage de l'authentification du viewer (BLOQUANT corrigé)

Les handlers profil sont **publics et ne lisent jamais `authContext`**. Il faut attacher le middleware optionnel existant :
- `optionalAuth = createUnifiedAuthMiddleware(prisma, { requireAuth:false, allowAnonymous:true })` (pattern `routes/posts/index.ts:22`) en `preValidation` des routes profil. Il attache `authContext` (`{ userId, role, isAuthenticated }`) même pour un visiteur anonyme (`middleware/auth.ts:486`, `:33`), sans rejeter.
- Viewer anonyme/non authentifié → traité comme **non autorisé** (présence masquée). Sûr par défaut.

### 4.4 Helper de masquage immuable + points d'injection (BLOQUANT corrigé)

Un seul helper pur applique le résultat de visibilité sur l'objet profil **sans mutation** :
```ts
const applyPresenceVisibility = <T extends { isOnline: boolean|null; lastActiveAt: Date|null }>(
  profile: T, v: PresenceVisibility,
): T => ({ ...profile,
  isOnline: v.showOnline ? profile.isOnline : null,
  lastActiveAt: v.showLastSeenTimestamp ? profile.lastActiveAt : null });
```
Points d'application (objet exact, juste avant `sendSuccess`) :
- `getUserById` → `publicUserProfile` (`profile.ts:936-947`).
- `getUserByUsername` → résultat `withVoiceFields(user)` (`profile.ts:820`). Le schéma de réponse déclare déjà `isOnline`/`lastActiveAt` nullable (`profile.ts:751-777`).
- `getUserByIdDedicated` / `getUserByEmail` / `getUserByPhone` → résultat `buildPublicProfile(user)` (`profile.ts:1031-1041`).

⚠️ Fastify **strippe les champs non déclarés** (`reference`/MEMORY `feedback_fastify_schema_strips_fields`) : muter un champ déjà déclaré est sûr ; rendre `isOnline` **nullable** exige de mettre à jour les schémas de réponse (`['boolean','null']`).

### 4.5 Refactor du select partagé (ferme la classe entière)

Retirer `isOnline`/`lastActiveAt` du **`publicUserSelect`** (`profile.ts:1009-1029`) et ne les réinjecter qu'après `resolveForTarget`. Objectif : défaut « masqué », tout futur endpoint hérite de la protection.

### 4.6 Périmètre des endpoints (décision « confidentialité cohérente »)

**A. Critère STRICT (self/modo/ami/affilié + prefs) :**
| Endpoint | Fichier:ligne | Action |
|---|---|---|
| `GET /users/:id` | `profile.ts:832` | gate (4.4) |
| `GET /u/:username` | `profile.ts:738` | gate |
| `GET /users/id/:id` | `profile.ts:1091` | gate |
| `GET /users/email/:email` (public) | `profile.ts:1076` | gate (via `publicUserSelect` refactoré) |
| `GET /users/phone/:phone` (public) | `profile.ts:1186` | gate |
| `GET /users/search` | `preferences.ts:481` (select `:606-607`) | masquer présence des non-contacts |
| `friend-requests` non acceptés | `friends.ts` (`/sent` `:331/345`, `/received` `:237`, `POST` `:106`, `PATCH` `:445`) | retirer `isOnline`/`lastActiveAt` des payloads `pending`/`rejected` |

**B. Critère CONTEXTUEL (strict OU co-participation + prefs) :**
| Endpoint | Fichier:ligne | Action |
|---|---|---|
| `GET /users/presence` | `presence.ts:88-106` | gate **batché** par id (critère contextuel) — **bloquant** : canal client principal |
| `GET /links/:identifier` (anonyme) | `links/retrieval.ts:18-25,255-256` | masquer présence aux visiteurs non-membres / non authentifiés |
| `presence:snapshot` (socket) | `MeeshySocketIOManager.ts:522-599` | passer par les prefs (+ critère contextuel) — actuellement **aucun** filtre |
| `GET /conversations`, `/conversations/:id/participants`, `/communities/:id/members`, `/communities/search`, messages | `conversations/core.ts`, `participants.ts:137-180`, `communities/members.ts:148`, `search.ts:144`, `messages.ts:1089` | **respecter les prefs** de chaque user listé (co-participation déjà gatée). Bonus : retirer `email` du payload participants (`participants.ts:175`, fuite PII) |
| `user:status` broadcast | `MeeshySocketIOManager.ts:1530-1610` | déjà conforme aux prefs ; documenter « présence live = co-participation OU contact » |

**Hors-scope confirmé non-fuite** : présence de soi-même (`PATCH me/avatar`…), endpoints `admin/*` (gatés par rôle, aligné au bypass modérateur+). Pas de mécanisme socket d'abonnement à un user arbitraire.

## 5. Présentation (web + iOS)

### 5.1 Contrat unique (constantes partagées de seuils)

`now − lastActiveAt = age`. Seuils en **constantes nommées** dupliquées TS/Swift à l'identique.

**Pastille avatar** : `isOnline === true` → en ligne (vert) ; `isOnline === false` → hors ligne (gris) ; `isOnline === null` → **pas de pastille**.

**Texte après pseudo** (`@username` + ` · ` + libellé) — rendu seulement si `lastActiveAt != null` :

| Condition | Libellé | Couleur |
|---|---|---|
| `age < 1 min` (ou `isOnline && age<1min`) | « En ligne » | vert |
| `age < 5 min` | « Vu il y a X » | vert |
| `age < 30 min` | « Vu il y a X » | orange |
| `age < 24 h` | « Vu il y a X » | gris |
| hier | « Vu hier à HH:mm » | gris |
| avant-hier | « Vu avant-hier à HH:mm » | gris |
| au-delà | « Vu le {date} à HH:mm » | gris |

**Edge-cases** : `age < 0` (horloges désync) → traité comme « En ligne » / vert. Heure exacte (`HH:mm`) sur **tous** les formats absolus (>24 h) ; relatif (<24 h) sans heure.

### 5.2 Web
- **Nouvelle** fonction (les helpers actuels n'ont ni branche hier/avant-hier ni heure) : étendre `usersService.formatLastSeenLabel` (`users.service.ts:275-301`) ou créer `formatPresenceLabel` utilisant `calendarDayDiff` (`packages/shared/utils/calendar-date.ts:27`) + `toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})`.
- `presenceColor(lastActiveAt, isOnline)` (util pur) → classes de thème.
- Rendu dans `apps/web/app/u/[id]/page.tsx` après `@{user.username}` (`:364-366`), via un composant dérivé de `ContactLastSeenLabel.tsx` (gère déjà `useUserStatusTick()`), enrichi couleur + formats absolus. Pastille sur l'avatar (`:344-349`).

### 5.3 iOS
- **Nouvelle** méthode SDK (net-new : `RelativeTimeFormatter` ne porte **jamais** d'heure — `longString` `:72-94`, `absoluteDate` `:121-126`) : `RelativeTimeFormatter.lastSeenString(for:now:calendar:)` réutilisant `RelativeTime.classify` + `Date.FormatStyle` pour `HH:mm` (pièges migration `FormatStyle` : `includingFractionalSeconds` est un Bool, `DateStyle.medium`→`.abbreviated` — MEMORY `reference_swift_date_formatstyle_migration_traps`).
- `presenceColor` → `MeeshyColors.success`/`warning`/secondaire.
- Rendu dans `UserProfileSheet+Header.swift` après `@username` (`:138` et barre compacte `:271`) + pastille sur `MeeshyAvatar`. `ProfileSheetUser.isOnline: Bool?` + `lastActiveAt: Date?` existent déjà (`ProfileSheetUser.swift:22-23`), hydratés via `UserProfileViewModel`→`/users/:id` (**pas d'appel réseau supplémentaire** ; `isOnline:null` décodé sans crash — `AuthModels.swift:206-207`).

## 6. Internationalisation

- **Web : 4 langues** — `apps/web/locales/{en,es,fr,pt}`.
- **iOS : 7 localisations** — `Localizable.xcstrings` (`ar, de, en, es, fr, pt, zh-Hans`, source `en`), via `String(localized:…, bundle:.main)`. Une clé incomplète rend la **clé brute** (MEMORY `feedback_ios_xcstrings_devregion_en_vs_source_fr`) → fournir **toutes** les langues.
- Clés : « En ligne », « Vu il y a {X} », « Vu hier à {h} », « Vu avant-hier à {h} », « Vu le {date} à {h} ».

## 7. Tests (TDD)

1. **Unitaire — `resolvePresenceVisibility`** (`packages/shared`) : self · modo (prefs off) · ami (prefs on/off, showOnlineStatus off) · affilié · co-participant (contextuel on/off) · étranger · bloqué · cible désactivée.
2. **Unitaire — format & couleur** : bornes 1/5/30 min, 24 h, hier/avant-hier/au-delà, `age<0`, présence d'heure sur formats absolus. Tableau de seuils partagé.
3. **Gateway (Jest, parité bun)** : masquage par viewer sur `/users/:id`, `/u/:username`, `/users/id/:id`, `/users/email`, `/users/phone` ; `/users/presence` batché ; `/users/search` ; friend-requests non acceptées ; `/links/:identifier` non-auth ; `nullable isOnline` non strippé par le schéma.
4. **Web** : pastille (null→absente) ; texte conditionnel + couleur par seuil.
5. **iOS (XCTest)** : `RelativeTimeFormatter.lastSeenString` (formats + heure) ; rendu conditionnel de la sheet.

## 8. Edge-cases & règles explicites

- **Affiliation** = `status='completed'` uniquement (un `pending`/`expired` n'est pas un contact). Décision assumée.
- **AUDIT/ANALYST** ne bypassent pas (`< MODERATOR` dans la hiérarchie `role-types.ts:60-62`). Conforme à « au moins modérateur ».
- **Blocage** (`User.blockedUserIds`, `schema.prisma:106`) dans un sens ou l'autre → présence masquée.
- **Compte désactivé** (`deactivatedAt != null`, exposé `profile.ts:921-922`) → présence masquée en amont.
- **Oracle de relation** : un `lastActiveAt` non-null révèle l'existence d'une relation — inhérent à la feature ; le masquage uniforme (`null`/`null`) ne crée pas de fuite de timing supplémentaire.

## 9. Ordre d'implémentation suggéré (par priorité de fuite)

1. **Fondations** : helper pur `resolvePresenceVisibility` + tests ; `PresenceVisibilityService` (friend/affiliate/conversation/prefs + batch) ; refactor `publicUserSelect`.
2. **Bloquants fuite** : `/users/presence` [C1] ; `/links/:identifier` [E2] ; `presence:snapshot` [E1].
3. **Profil** : `optionalAuth` + masquage immuable sur les 5 handlers profil.
4. **Hautes** : `/users/search` [E5] ; friend-requests non acceptées [E4].
5. **Cohérence prefs** sur listes conversations/participants/communautés + retrait `email` participants.
6. **Clients** : formatters + pastille/texte web & iOS + i18n.

## 10. Risques / migration

- `isOnline` nullable dans les réponses profil/présence : adapter les consommateurs (web lit `user.isOnline`, iOS déjà `Bool?`). Vérifier les schémas de réponse Fastify.
- Ne **pas** dégrader la pastille de présence légitime dans les conversations (régression UX) — d'où le critère contextuel.
- `main` actif : implémenter par lots commités/poussés indépendamment, `git pull` régulier, gate `tsc 0` + build + tests avant chaque push (MEMORY `feedback_deploy_via_push_main_ci`).
