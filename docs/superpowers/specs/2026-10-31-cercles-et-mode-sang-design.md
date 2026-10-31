# Cercles de proximité et mode Sang — design (MVP iOS · web · Android natif)

> Date : 2026-10-31. Milestone : [#215 « Entre Proches et Sangs, on vit ensemble : présence, écoute, voix et Bring en direct »](https://github.com/isopen-io/meeshy/milestone/215).
> Source : `docs/specs/cercles/Meeshy_niveaux_features_regles.xlsx` (onglets Niveaux, Features — 118 features —, Règles RG-01…RG-31, Tests talkie TK-01…TK-18).
> **Cette spec fait foi ; le classeur en est la source.** L'ÉTAT des lots vit dans les issues du milestone, jamais ici.
> Workflow : `.claude/workflows/meeshy-cercles-et-sang.js`.

## 0. Règle d'or

Chaque lot commence par l'**inventaire de l'existant** (à étendre · à modifier · à ne pas toucher), écrit dans son issue. Créer un module, un modèle, une route, un événement ou un écran exige d'écrire **pourquoi l'existant ne suffit pas**. Une jumelle divergente est un défaut bloquant. Le relevé initial (2026-10-31, arbre `e002de57`) est au § 7. Chaque cadrage le recontrôle sur l'arbre vivant.

## 1. Décisions du porteur (2026-10-31) — prises

### 1.1 Les niveaux

| # | Code | Nom | Icône | Entrée |
|---|---|---|---|---|
| 0 | `PUBLIC` | Public | 🌐 | aucun lien |
| 1 | `COMMUNITY` | Communauté | 👥 | calculé : une communauté en commun (`doUsersShareCommunity`) |
| 2 | `ACQUAINTANCE` | Connaissance | 👋 | **automatique** (§ 1.2) ou demande de connexion acceptée |
| 3 | `FRIEND` | Ami | 🤝 | demande acceptée, **depuis Connaissance** |
| 4 | `CLOSE` | Proche | 🔥 | demande acceptée, depuis Ami, après 4 semaines actives d'affilée |
| 5 | `BLOOD` | Sang | 🩸 | demande + rituel synchronisé, depuis Proche, après **12** semaines actives d'affilée (décision du 2026-10-31 ; le classeur disait 1 an) |
| 6 | `ATOM` | Atome | ⚛️ | lien parent/tuteur vérifié — **hors MVP** (modèle prêt, aucune route) |

Règles de passage :
- **Cran par cran.** Le serveur refuse toute demande qui saute un niveau.
- **Pas de plafond** pour Proche ni pour Sang.
- **Libellés, icônes et seuils** viennent d'une config localisable (7 langues). Ils sont abaissables sur staging.
- **Niveau effectif** = minimum des niveaux accordés par chacun (RG-01). **Aucun accès à sens unique.**

### 1.2 Conditions

- **Connaissance automatique (REL-02, RG-02).**
  - Il faut, **dans chaque sens**, environ 10 interactions (messages, likes ou réactions, vues de posts), dont au moins 1 de chaque type sur le contenu de l'autre **et** au moins 1 message audio envoyé à l'autre.
  - Le lien apparaît chez les deux, avec une notification discrète.
  - Un blocage l'annule.
  - Il n'y a pas de création automatique entre un mineur et un majeur inconnu.
- **Interactions qualifiantes (RG-04)** : commentaire, like ou réaction, message privé, message audio, partage d'un post, réponse à une story ou à un mood, mention, appel.
- **Semaine active.** C'est une semaine ISO, en UTC, où chacun a interagi avec l'autre au moins une fois.
  - **Proche** = 4 semaines actives d'affilée. **Sang** = **12** semaines actives d'affilée depuis Proche (décision du 2026-10-31, qui remplace « 1 an » du classeur). La continuité sur plusieurs semaines est le garde-fou : une nouvelle connaissance ne peut pas entrer ainsi, et c'est ce qui permet d'ouvrir le Sang à tous les âges (§ 1.8).
  - Une semaine manquée remet la série à zéro. **Le niveau atteint est conservé.**
  - L'éligibilité **permet** la demande ; elle n'élève jamais.
- **Ami** : il suffit d'être Connaissance.
- **Calcul côté serveur**, avec un rattrapage idempotent et rejouable.
- **Fenêtre de la Connaissance automatique : une semaine glissante** (D-1, tranchée le 2026-10-31).
- **E2EE.** On compte le fait qu'un message est passé, jamais le clair. Le type « audio » d'un message chiffré n'est connu que par `Message.messageType`, une **déclaration** du client (`e2eePlaintextAdmission.ts:28`) : **on le compte** (D-2, tranchée le 2026-10-31), en le signalant comme déclaratif.

### 1.3 Ce que chaque cercle voit (RG-25)

| | Ami 🤝 | Proche 🔥 | Sang 🩸 |
|---|---|---|---|
| Présence | « en ligne » ou rien | détaillée (règle 1/3/5) | détaillée |
| Jeu | niveau, nomination (titres), rang | + étincelles, gloire | idem |
| Notifications de mes nouveaux posts, reels, stories, moods | non | oui | oui |
| Qui commente mes posts | non | oui | oui |
| Mes commentaires ailleurs | non | non | oui |
| Bring | non | oui, si autorisé par l'autre | oui, si autorisé |
| Ce que j'écoute ou regarde | non | catégorie seule | titre + origine |
| Talkie | non | oui | oui |
| Position | partage ponctuel (existant) | partage temporaire (existant) | continue + historique 30 j + proximité, **flag** |

Au-dessous d'Ami :
- **Connaissance** : message privé direct, sans boîte de demandes, et stories d'audience « Connaissances ». Ni présence, ni jeu au-delà du public.
- **Communauté et Public** : rien ne change.

**Jeu** : visibilité servie = `min(réglage du jeu, droits du cercle)`. Le réglage du jeu ne peut jamais ouvrir plus que le cercle (RG-28).

### 1.4 Mises à jour de l'existant (pas de créations)

- **Présence.**
  - La loi du 2026-08-25 reste : rien n'est servi sous Ami.
  - Le **viewer Ami** reçoit seulement `online: true` ou rien : pas de `lastActiveAt`, pas d'états intermédiaires.
  - **Proche et au-dessus** reçoivent la présence complète.
  - `contact_recently_active` (#8285) ne change pas.
  - Il faut une ADR, la mise à jour du § « User Presence » du CLAUDE.md racine, la garde étendue et les trois miroirs.
- **Notifications.**
  - `friend_new_post`, `friend_new_story`, `friend_new_mood` (reels compris) partent à **Proche et au-dessus**.
  - Le seau amis de `friend_story_comment` ne garde que **Sang**.
  - Le relais « qui commente mes posts » part à **Proche et au-dessus**.
  - Tout se fait dans les fan-outs existants, et leur miroir temps réel (`SocialEventsHandler.getVisibilityFilteredRecipients`) dans le même lot.
- **`PostVisibility`.**
  - On ajoute `ACQUAINTANCES`, `CLOSE` et `BLOOD`. `FRIENDS` garde le sens « Amis et au-dessus ». Aucune valeur n'est retirée.
  - Le filtre passe par `postAudience.ts` et `postVisibility.ts`, et le fil par `feedVisibility.ts`.
  - Le repartage ne vise jamais une audience plus large que l'origine. Un contenu `BLOOD` ne se repartage pas (RG-18).
- **Amitié.**
  - Toute `FriendRequest` acceptée se lit `FRIEND`, sans rétrogradation rétroactive.
  - **Pas de compatibilité pour les cercles** (D-5, tranchée le 2026-10-31 : quelques centaines d'utilisateurs). Un client sous le plancher de version reçoit `426 UPGRADE_REQUIRED` et l'invitation à se mettre à jour, via le plancher existant `MIN_APP_VERSION` (`utils/appVersion.ts`) appliqué partout (lot `version-minimale`, #13954). Il n'y a donc **aucune** exception à « aucun saut de phase ». Le risque qu'un ancien appareil affiche « Public » une audience nouvelle est **accepté** par le porteur et réglé par la mise à jour forcée.

### 1.5 – 1.7 Jalon 2

- **Écoute (PRE-04, RG-30).**
  - L'émetteur envoie une fois l'état courant ; le serveur **tronque** selon le niveau effectif du destinataire.
  - Proche : la catégorie (`music`, `video`, `browsing`). Sang : le titre et l'origine.
  - Le web reçoit sans transmettre. Ce qu'une plateforme ne permet pas de lire est **dit**, jamais simulé.
  - Pause et apps exclues sont possibles. Rien n'est stocké au-delà de l'état courant.
- **Talkie (CAL-03, RG-26).** Il est disponible dès Proche, avec ou sans PushToTalk.
  - App ouverte : lecture par socket.
  - iOS en arrière-plan : PushToTalk si l'entitlement est accordé (D-4). Sinon, la NSE écrit le segment dans `Library/Sounds` de l'App Group `group.me.meeshy.apps` et le joue comme son de la notification. Dernier recours : message vocal.
  - Android : FCM haute priorité et service au premier plan. Web : onglet ouvert, sinon repli vocal.
  - **Le son se lit dès sa réception** (D-4, tranchée le 2026-10-31).
    - Le serveur relaie chaque fragment audio (~200 à 500 ms, même encodage que le vocal) **à l'instant où il le reçoit**, par la socket ou le canal PushToTalk. Il n'attend ni la fin de l'enregistrement, ni un upload, ni une normalisation, ni une transcription.
    - La copie en message vocal (pipeline existant) se fait après, hors du chemin critique, et sert de repli.
    - Les **deux** chemins iOS sont livrés, avec et sans PushToTalk, et l'entitlement est demandé.
  - Garde-fous : coupé en appel, en Ne pas déranger et en heures calmes ; indicateur des deux côtés ; le blocage coupe ; débit limité ; refus serveur sous Proche.
  - **Hors E2EE au MVP**, l'interface le dit, avec une issue de suivi `crypto-e2ee`.
- **Bring (CAL-04, RG-29).**
  - C'est un son, pas une notification. Il est autorisé **par personne** côté destinataire, OFF par défaut.
  - 3 Bring par heure au maximum par expéditeur. Arrêt d'un geste. Les heures calmes sont respectées sauf autorisation explicite. Jamais d'un non-Proche.
  - iOS : time-sensitive (entitlement déjà présent). Passer outre le silencieux exige Critical Alerts (D-3).
  - Android : `USAGE_ALARM`. Web : onglet ouvert.
- **Position Sang (LOC-03/04/11, RG-12/13/14/16/27)**, **derrière un flag OFF**, sur liste blanche de comptes de test.
  - On étend `LocationHandler` ; il n'y a pas de second système.
  - Historique de 30 jours : index TTL et chiffrement au repos. Les périodes en fantôme ne sont jamais enregistrées, et chacun peut effacer le sien.
  - Fantôme global et ciblé, indétectables.
  - Journal des consultations visible du seul observé, avec un message discret en cas d'excès.
  - Proximité : une alerte aux deux, au plus une par paire toutes les 2 h, et rien si l'un est en fantôme.

### 1.8 Garde-fous transverses

- **Loi unique** `resolveRelationAccess` (§ 3), avec ses miroirs Swift et Kotlin.
- **Baisse, sortie et refus** sont silencieux (RG-07). Cool-down de 30 jours avant une nouvelle demande (RG-08).
- **Consentement** feature par feature :
  - à l'entrée en Proche : talkie, catégorie d'écoute, Bring ;
  - au rituel Sang : titre d'écoute, position, historique, proximité.
- **Mineurs** — décision du porteur du 2026-10-31, qui **remplace** la règle « pas de Sang entre un mineur et un majeur hors famille vérifiée ».
  - L'âge **déclaré** fait foi (`User.birthDate`, `isDeclaredMinor`), sans vérification préalable.
  - Le Sang, la position continue et le Bring sont **ouverts à tous, mineurs compris**, derrière un **écran de consentement** feature par feature. Il est **refusable**, avec un **dépliant** qui détaille ce que chaque partage montre, à qui et combien de temps. Les rappels de consentement restent.
  - Seule la Connaissance **automatique** reste désactivée entre un mineur et un majeur inconnu.
  - L'analyse `conformite-juridique` (RGPD art. 8, géolocalisation des mineurs, Age Appropriate Design Code) est d'autant plus requise avant la production.
- **Conformité AVANT la production.** L'agent `conformite-juridique` produit l'AIPD, les durées, les consentements et la politique de confidentialité, et dit ce qui exige un avis signé. **Aucune promotion sans elle.**

## 2. Modèles

Proposition, que le cadrage du lot `rel-modele` confirme ou corrige sur l'arbre vivant.

**Pourquoi un modèle de lien en plus de `FriendRequest`.** `FriendRequest` est un **journal de demandes** :
- une ligne par paire orientée, sans `@@unique` ;
- `status` en chaîne libre ;
- la ligne supprimée par `dismiss`.

Il ne peut pas porter un niveau **par direction**, ni une Connaissance née **sans demande**, ni un historique. Le lien vit donc dans un modèle, et la demande reste dans `FriendRequest`, **étendue** d'un niveau visé.

```prisma
model UserRelation {                       // une ligne par paire NON orientée
  id             String   @id @default(auto()) @map("_id") @db.ObjectId
  userLowId      String   @db.ObjectId     // le plus petit des deux ObjectId
  userHighId     String   @db.ObjectId
  grantedByLow   String   @default("PUBLIC") // niveau accordé par low à high
  grantedByHigh  String   @default("PUBLIC")
  levelSince     DateTime?                 // entrée au niveau effectif courant
  cooldownLowUntil  DateTime?              // low ne peut plus demander avant
  cooldownHighUntil DateTime?
  origin         String                    // "backfill-friend" | "auto-acquaintance" | "request"
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@unique([userLowId, userHighId])
  @@index([userLowId, grantedByLow])
  @@index([userHighId, grantedByHigh])
}

model UserRelationTransition {             // historique ; une baisse n'est jamais affichée
  id String @id @default(auto()) @map("_id") @db.ObjectId
  relationId String @db.ObjectId
  actorId String @db.ObjectId
  from String
  to String
  at DateTime @default(now())
  @@index([relationId, at])
}

model PairInteractionWeek {                // l'agrégat de rel-compteurs
  id String @id @default(auto()) @map("_id") @db.ObjectId
  userLowId String @db.ObjectId
  userHighId String @db.ObjectId
  isoWeek String                           // "2026-W44"
  lowToHigh Json                           // { message, reaction, postView, comment, share, storyReply, mention, call, audio }
  highToLow Json
  @@unique([userLowId, userHighId, isoWeek])
}

model RelationFeatureSetting {             // consentement et réglages par personne (CONF-03)
  id String @id @default(auto()) @map("_id") @db.ObjectId
  ownerId String @db.ObjectId              // qui règle
  otherId String @db.ObjectId              // pour qui
  talkieDirect Boolean @default(true)      // ON à l'entrée en Proche (CAL-03), désactivable
  bringAllowed Boolean @default(false)     // OFF par défaut (CAL-04)
  listeningShared Boolean @default(true)
  locationShared Boolean @default(false)
  ghost DateTime?                          // fantôme ciblé : non nul = actif depuis
  @@unique([ownerId, otherId])
}

model AtomLink {                           // RÉSERVÉ — aucune route au MVP
  id String @id @default(auto()) @map("_id") @db.ObjectId
  atomId String @db.ObjectId
  electronId String @db.ObjectId
  verifiedAt DateTime?
  @@unique([atomId, electronId])
}
```

Ce qui change dans `FriendRequest` : un champ `targetLevel String?`. `null` veut dire `FRIEND`, le sens historique, ce qui garde les anciens clients intacts. Les valeurs nouvelles sont `ACQUAINTANCE`, `CLOSE` et `BLOOD`. Les routes, notifications et événements de demande restent les existants (§ 4).

Le **backfill** est idempotent :
- chaque `FriendRequest` acceptée donne un `UserRelation` FRIEND/FRIEND, `origin = backfill-friend` ;
- deux passes donnent le même état ;
- il tourne sur staging dans le lot ; **en production, il attend le feu vert du porteur après une sauvegarde vérifiée**.

Pendant la transition, `services/friendship.ts` lit `UserRelation` et, à défaut, une `FriendRequest` acceptée, qui vaut FRIEND. Aucun ami n'est perdu entre le déploiement et le backfill.

Position (jalon 2, flag) : `LocationTrace { userId, at, lat/lng chiffrés (secret-at-rest), accuracy, expiresAt }`, TTL `expireAfterSeconds: 0` posé comme `socialEventIndexes.ts:55-72`, et `LocationConsultation { observedId, observerId, at, expiresAt }` (30 j).

## 3. La loi d'accès

`packages/shared/utils/relation-access.ts` :

```ts
type RelationLevel = 'PUBLIC' | 'COMMUNITY' | 'ACQUAINTANCE' | 'FRIEND' | 'CLOSE' | 'BLOOD'
type RelationFeature =
  | 'presence.online' | 'presence.detailed'
  | 'game.basic' | 'game.sparksGlory'
  | 'notify.newContent' | 'relay.commentersOnMyPosts' | 'relay.myCommentsElsewhere'
  | 'dm.direct' | 'audience.acquaintances' | 'audience.close' | 'audience.blood'
  | 'listening.category' | 'listening.title' | 'talkie' | 'bring'
  | 'location.live' | 'location.history' | 'location.proximity'

resolveRelationAccess({
  viewerId, targetId,
  grantedByViewer, grantedByTarget,          // niveaux accordés par chacun
  sharesCommunity,                           // pour COMMUNITY
  blockedEitherWay,
  viewerMinor, targetMinor,                  // 'minor' | 'adult' | 'unknown'
  viewerRole,                                // ADMIN/BIGBOSS : présence seulement, comme aujourd'hui
  feature,
}) → { allowed: boolean, effectiveLevel: RelationLevel, reason: 'level' | 'blocked' | 'minor' | 'self' | 'role' }
```

- **Niveau effectif** = `min(grantedByViewer, grantedByTarget)`, relevé à COMMUNITY si `sharesCommunity` et que le minimum est PUBLIC.
- **Matrice** dans `packages/shared/config/relation-levels.ts` : feature → niveau minimal, avec les clés i18n des libellés, les icônes et les seuils (`acquaintance.minInteractions = 10`, `close.activeWeeks = 4`, `blood.activeWeeks = 12`, `bring.perHour = 3`, `cooldownDays = 30`, `proximity.cooldownHours = 2`). Une surcharge par environnement abaisse les seuils sur staging.
- **Mineurs** : `BLOOD`, `location.*` et `bring` rendent `requiresConsent: true` pour tous les âges. Il n'y a pas de refus d'âge (§ 1.8, décision du 2026-10-31) ; la Connaissance automatique ne naît pas entre un mineur et un majeur inconnu.
- **Consentement** : la loi dit le **plafond**. `RelationFeatureSetting` dit si la personne l'active, et les deux sont requis.
- **Miroirs** (mêmes cas de témoins) : Swift `MeeshySDK/.../Relations/RelationAccess.swift`, Kotlin `apps/android/core/model/.../relation/RelationAccess.kt`. Le client ne décide jamais d'un accès : le miroir sert à **ne pas proposer** une action que le serveur refusera.
- **Projections.** `resolvePresenceVisibility` devient une projection de la loi (`areConnected: boolean` → niveau effectif). `services/friendship.ts` devient le site unique du niveau effectif, et ses six copies locales le consomment (§ 7).
- **Garde** (sur le modèle de `presence-visibility-viewer-aware-guard.test.ts`) : aucune comparaison de niveaux hors de `relation-access.ts` et `friendship.ts`.

## 4. Événements et routes

Les routes sont préfixées `/api/v1`, et leurs réponses passent par `sendSuccess`/`sendError`. Les événements suivent `entity:action-word` et sont déclarés dans `packages/shared/types/socketio-events/`.

| Quoi | Forme | Étend |
|---|---|---|
| Mes cercles | `GET /relations` → `[{ userId, effectiveLevel, grantedByMe, since, progress: { activeWeeks, needed, missing: ['audio', …] }, eligibleFor }]` | nouveau, justifié (aucune route ne lit un lien) |
| Un lien | `GET /relations/:userId` | idem |
| Config | `GET /relations/config` → niveaux, clés i18n, seuils servis | nouveau |
| Demander un cran | `POST /directory/friend-requests { receiverId, targetLevel? }` | **étend** `friend-requests.ts:289` (`targetLevel` absent = FRIEND) |
| Répondre | `PATCH /directory/friend-requests/:id { action }` | **inchangé** (`accept|reject|cancel|dismiss`) |
| Baisser, sortir | `POST /relations/:userId/level { level }` (≤ niveau accordé), silencieux | nouveau |
| Rituel Sang | `POST /relations/:userId/ritual { phase: 'start'|'hold'|'confirm', consents }`, plus les événements `relation:ritual-started` / `relation:ritual-progress` / `relation:ritual-completed` | nouveau |
| Réglages par personne | `PUT /relations/:userId/settings { talkieDirect, bringAllowed, listeningShared, locationShared, ghost }` | nouveau |
| Lien monté | `relation:level-raised` (aux deux) ; **aucun** événement de baisse vers celui qui est baissé | nouveau |
| Écoute | `now-playing:update` (c→s) → `now-playing:changed` (s→c, tronqué par destinataire), `now-playing:cleared` | nouveau, audience `user:<id>` comme `presence-audience.ts` |
| Talkie | segment par `POST /attachments/upload` (pipeline vocal), puis `talkie:send { toUserId, attachmentId }` → `talkie:incoming` / `talkie:ended` ; push alert (NSE) ou pushtotalk | étend le pipeline vocal |
| Bring | `POST /bring/:userId` → `bring:ring` ; `DELETE /bring/:id` → `bring:stopped` ; push time-sensitive / FCM data | nouveau, quota par `createCustomRateLimiter` |
| Position Sang | `location:live-*` existants avec `scope: 'blood'` (audience `user:<id>` des Sangs au lieu de la room de conversation), `GET /relations/:userId/location/history`, `DELETE /me/location/history`, `GET /me/location/consultations` | **étend** `LocationHandler.ts` |
| Flags | `GET /me/features` → `{ bloodLocation: boolean }` (env + liste blanche) | nouveau, justifié : aucun système de flag serveur |

## 5. États des écrans

Ces écrans sont **iOS-référence** ; web et Android sont iso.

| Écran | Vide | Chargement | Erreur | Hors-ligne |
|---|---|---|---|---|
| Mes cercles | « Tes liens apparaîtront ici à mesure que tu échanges » + action « trouver des contacts » | squelette **seulement** sur cache vide | bandeau discret + réessayer ; le cache reste affiché | cache affiché, actions de demande mises en file (OfflineQueue) |
| Fiche d'un lien | — | cache d'abord | idem | lecture seule |
| Progression | « Encore N semaines » / « il manque un message audio » | — | — | dernière valeur connue, datée |
| Rituel Sang | — | attente de l'autre : anneau qui pulse, « en attente de … » | l'autre a lâché : retour calme, rien n'est enregistré | indisponible, l'interface le dit |
| Réglages par personne | défauts du § 1.5 | optimiste | rollback + message | désactivé |
| Sélecteur d'audience | dernier choix | — | — | choix local, envoyé à la reconnexion |
| Écoute reçue | rien d'affiché | — | — | rien |
| Talkie | bouton « maintenir pour parler » | indicateur d'envoi | « non reçu, envoyé en vocal » | mis en vocal |
| Bring | « Bring » grisé si non autorisé, avec la raison | — | quota atteint : « réessaie dans N min » | indisponible |
| Carte (flag) | « Aucun Sang ne partage sa position » | dernière position connue | — | dernière position, datée |

## 6. Lots et matrice cas × plateforme

Chaque lot a **une** issue (milestone #215) : `rel-modele` #13926, `rel-loi-acces` #13927, `presence-ami-binaire` #13928, `notifs-cercles` #13929, `jeu-suit-le-cercle` #13930, `audiences-publications` #13931, `rel-compteurs` #13932, `rel-demandes` #13933, `proche-sang-ecoute` #13934, `proche-talkie` #13935, `proche-bring` #13936, `sang-position-historique` #13937, `ui-cercles` #13938, `ui-audience` #13939, `ui-profil-cercles` #13940, `sang-recette-reelle` #13941, `conformite-cercles` #13942. Un lot multi-plateforme a un sous-lot par chaîne, sous la forme `<clé>@<chaîne>` dans le workflow : iOS d'abord, web et Android ensuite (iso). Les clés ci-dessous sont celles du workflow.

**Jalon 1 — les cercles**

| Clé | Serveur | iOS | Web | Android |
|---|---|---|---|---|
| `rel-modele` | ● | — | — | — |
| `rel-loi-acces` | ● (shared + gateway) | miroir Swift | — (consomme shared) | miroir Kotlin |
| `rel-compteurs` | ● | — | — | — |
| `rel-demandes` | ● | — | — | — |
| `presence-ami-binaire` | ● | ● témoin | — (consomme shared) | ● témoin |
| `notifs-cercles` | ● | — | — | — |
| `jeu-suit-le-cercle` | ● | — | — | — |
| `audiences-publications` | ● | via `ui-audience` | via `ui-audience` | via `ui-audience` |
| `ui-cercles` | — | ● référence | ● iso | ● iso |
| `ui-audience` | — | ● | ● | ● |
| `ui-profil-cercles` | — | ● | ● | ● |

**Jalon 2 — Proche et Sang en direct**

| Clé | Serveur | iOS | Web | Android |
|---|---|---|---|---|
| `proche-sang-ecoute` | ● troncature | ● Meeshy, Apple Music, Spotify | reçoit | ● MediaSession |
| `proche-talkie` | ● relais + limites | ● avec / sans PTT | ● onglet + repli | ● service au premier plan |
| `proche-bring` | ● autorisation + quota | ● time-sensitive | ● onglet | ● USAGE_ALARM |
| `sang-position-historique` (flag) | ● | ● | ● lecture | ● |
| `sang-recette-reelle` | recette sur deux téléphones, résultats rendus par le porteur | | | |
| `conformite-cercles` | AIPD, **bloque la production** | | | |

**Matrice des cas** : chaque ligne est jouée par un témoin serveur et par la recette.

| Cas | Attendu |
|---|---|
| A accorde Sang, B accorde Ami | niveau effectif Ami des deux côtés |
| Ami, cible en ligne / hors ligne | `online: true` / rien, jamais `lastActiveAt` |
| Proche, cible absente depuis 2 min | `away` + `lastActiveAt` |
| Demande Proche sans 4 semaines actives | refus serveur, code `RELATION_NOT_ELIGIBLE` |
| Demande Connaissance → Proche | refus, `RELATION_PHASE_SKIP` |
| Refus d'une demande | aucune notification ; nouvelle demande refusée 30 j (`RELATION_COOLDOWN`) |
| Client sous le plancher de version | `426 UPGRADE_REQUIRED` + écran « Mettre à jour Meeshy » ; le web n'est jamais bloqué |
| Blocage pendant un talkie / un Bring / un partage | coupure immédiate, sockets et pushes en vol compris |
| Sang, position ou Bring sans consentement (tout âge) | refus, `RELATION_CONSENT_REQUIRED` ; le dépliant détaille chaque partage |
| Post `CLOSE` lu par un Ami | invisible (fil, détail, recherche, notification, repartage) |
| Ancien client (sous le plancher) | bloqué par la mise à jour forcée — risque d'affichage « Public » accepté |
| Proche reçoit l'écoute | `category` seule, aucun `title` ni `source`, ni dans un champ voisin |
| Flag position OFF | aucune route ni événement Sang ne répond |

Plateformes : iOS 16 → 26 et iPad, Android API cible, navigateurs courants, réseau lent, hors-ligne, clair et sombre, 7 langues, VoiceOver, TalkBack, lecteur d'écran.

## 7. Existant → modification (relevé du 2026-10-31)

| Besoin | Existant | Modification |
|---|---|---|
| Lien d'amitié | `FriendRequest` (schema:1956-1985 ; status String, pas d'unique de paire) | + `targetLevel String?` ; le lien vit dans `UserRelation` (§ 2) |
| « Amis acceptés » | `services/friendship.ts` `amitieAcceptee` (:16), `amisAcceptesParmi` (:41) | devient le site du niveau effectif ; **converger** les six copies `PostFeedService.getFriendIds` (:1036), `SocialEventsHandler.getFriendIds` (:115), `DuoService.areFriends` (:130), `contact-recently-active.ts` (:133), `contact-joined.ts` (:119), `profile-discoverability.ts` (:46) |
| Routes de demande | `routes/directory/friend-requests.ts` (:222/289/358), `friend-requests-core.ts` (`ACTIONS` :160, `envoyerDemande` :179, `repondreDemande` :308) | étendre : niveau visé, cran par cran, cool-down, éligibilité |
| Blocage | `User.blockedUserIds` (:180), `utils/blocking.ts` `isBlockedBetween` (:21) | lu par la loi |
| Communauté | `communityVisibility.ts` `doUsersShareCommunity` (:57) | lu par la loi ; index `CommunityMember` à justifier |
| Âge | `User.birthDate` (:426), `ageVerifiedAt` (:469), `utils/age.ts` `isDeclaredMinor` (:64) | l'âge déclaré fait foi ; il ne sert qu'à la Connaissance automatique |
| Plancher de version | `utils/appVersion.ts` (`MIN_APP_VERSION`, `isBelowFloor`), `utils/response.ts:213` (426), iOS `UpgradeGateController.swift`, Android `MeeshyError.kt:92` | appliqué à la session, au socket et aux routes de cercles (lot `version-minimale`) |
| Présence | `presence-visibility.ts:50/59`, `PresenceVisibilityService.ts` (:37/:64/:152/:178), `presence-gate.ts` (:39/:96/:154/:166), `participants-presence.ts` (:42-62), `presence-audience.ts` (:62, :113-120) | niveau au lieu de booléen ; Ami binaire ; la projection socket appelle la loi |
| Garde présence | `presence-visibility-viewer-aware-guard.test.ts` | + une clause interdisant `areConnected` brut hors de la loi |
| Miroirs présence | iOS `PresenceModels.swift` (:50/:64), `PresenceStyle.swift` (:68) ; Android `Presence.kt` (:57), `MeeshyAvatar.kt` (:95) | témoins de non-régression (un `lastActiveAt` nul rend déjà en ligne ou rien) |
| Notifications | `fanout/friend-content.ts` (:66-72, :82-90, :142-160), `fanout/story-comment.ts` (:149-158, :266-272, :402-418), `commentAddedNotifications.ts` (:129-145), `SocialEventsHandler.ts:347` | audience par niveau, miroir temps réel aligné |
| Préférences de notification | `type-preference.ts:51-55` | inchangé au MVP |
| Audiences | `PostVisibility` (schema:3971), `post.ts:15`, `repost-audience.ts:62-75`, `routes/posts/types.ts` (z.enum ×4), `postAudience.ts:87`, `postVisibility.ts:111-125/:165`, `feedVisibility.ts:28`, `PostService.ts:946/:268-289` | + trois valeurs, z.enum dédupliqué, garde d'édition des anciens clients |
| Audience côté clients | iOS `PostVisibility.swift` (`?? .public`), `FeedComposerSheet:84`, `EditPostSheet:404`, `StoryComposerView+TopBar:257`, `ComposerAudienceSheet.swift` ; Android `StoryVisibilityMenuResolver.kt:18`, `StatusComposerDraft.kt:31`, `StoryAudiencePickerPage.kt` ; web `publication-audience.ts:34`, `story-compose-audience*.tsx` | décodage fail-closed + crans du cercle |
| Jeu | `GameProfile` (:5891, String? everyone/friends/me), `trophies.ts:152-246`, `GameProfileService.ts:83/:155/:168` | minimum avec le cercle **côté serveur** ; aucune nouvelle valeur (iOS Codable strict, Android enum) |
| Compteurs | `PostView`, `PostReaction`, `PostComment`, `PostEngagement`, reposts, `PostMention`, `Message` (senderId = Participant), `Reaction`, `Mention`, `CallParticipant` | lus par l'agrégat `PairInteractionWeek` |
| Planification | `jobs/index.ts:100-205`, `utils/guarded-timer.ts`, patron `jobs/game-nightly.ts` | un job `relation-weekly`, rattrapage idempotent |
| Rate limit | `utils/rate-limiter.ts` (`RedisStore.increment` :171, `createCustomRateLimiter` :474), `CacheStore.setnx` (:186) | Bring, talkie, demandes ; **pas** `socket-rate-limiter.ts` (en mémoire par process) |
| DND | `notification-dnd.ts:53` `isWithinDnd`, `push-delivery-preferences.ts:62-74` | talkie et Bring les respectent |
| Push | `PushNotificationService.ts` (:545-556, :693-713 ; aucun `interruption-level`), `call-incoming-push.ts` | + `interruption-level` time-sensitive, push talkie |
| NSE | `MeeshyNotificationExtension/NotificationService.swift`, App Group `group.me.meeshy.apps`, `NSEPreferencesGate.swift` | segment talkie écrit dans `Library/Sounds` |
| Sonnerie | iOS `Ringtone.caf` (30 s), `RingbackTonePlayer.swift` ; Android `CallToneController.kt`, canal d'appel `IncomingCallNotificationPresenter.kt:50-71` | Bring : réutilisés ; Android : un canal `USAGE_ALARM` |
| Audio | `MessageHandler.ts:461`, `upload.ts:87`, `audio-normalization.ts`, `MediaSessionCoordinator.swift:576`, `CallAudioRouteService.swift`, `VoicePlaybackService.kt`, `mini-audio-player.tsx` | talkie réutilise ce pipeline |
| Écoute | iOS `ConversationAudioCoordinator+NowPlaying.swift` ; Android `VoicePlaybackSessionController.kt` ; web `web-now-playing.ts` | source Meeshy ; Apple Music, Spotify et MediaSession **à créer** (rien n'existe) |
| Position | `LocationHandler.ts` (registre mémoire, audience = room de conversation), iOS `LocationService.swift` (aucun appelant), Android `LiveLocation*` (émetteur complet, pas de background), web rien | étendre au scope Sang ; historique TTL ; émetteur iOS et lecture web à créer |
| Chiffrement au repos | `utils/secret-at-rest.ts` (`sealSecret` :97) | coordonnées de l'historique |
| Flags | aucun système serveur ; locaux `MeeshyFeatureFlags.swift`, `LentilleFeatureFlagsStore.kt` | `GET /me/features` (env + liste blanche), justifié |
| Nom « Cercles » | `CerclesAchievements.ts` (#5759) | le code dit `relation` ; l'interface peut dire « Mes cercles » |

## 8. Décisions

Tranchées par le porteur le 2026-10-31 (second passage) :

| # | Question | Décision |
|---|---|---|
| D-1 (#13943) | Seuils de la Connaissance automatique | ≥ 10 interactions par sens sur **une semaine glissante**, dont ≥ 1 message, ≥ 1 like ou réaction, ≥ 1 vue de post et ≥ 1 audio |
| D-2 (#13944) | En E2EE, compter l'audio par le `messageType` déclaré ? | **Oui**, signalé comme déclaratif ; jamais le clair |
| D-4 (#13946) | Entitlement PushToTalk ? | **Les deux chemins**, avec et sans PushToTalk, et **le son se lit dès sa réception** : relais fragment par fragment, la copie vocale après |
| D-5 (#13947) | Compatibilité des anciens clients | **Aucune** : mise à jour forcée par le plancher de version (#13954) |
| Mineurs (#13948) | Âge vérifié avant le Sang ? | **Non** : l'âge déclaré fait foi, et l'accès est ouvert à tous derrière un consentement refusable avec un dépliant |
| Anciens clients | Risque d'affichage « Public » d'une audience nouvelle | **Accepté**, réglé par la mise à jour forcée |

Encore ouverte :

| # | Question | Défaut appliqué en attendant |
|---|---|---|
| D-3 (#13945) | Demander l'entitlement Critical Alerts pour le Bring ? | non : time-sensitive seulement, la limite du silencieux est dite |
