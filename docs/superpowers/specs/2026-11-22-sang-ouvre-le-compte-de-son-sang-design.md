# Un Sang ouvre le compte de son Sang — conception (#20360)

> Brouillon de conception du 2026-11-22, écrit avant toute ligne de code. Lot d'AUTHENTIFICATION et de CONFIDENTIALITÉ. Relu par `auditeur-adversarial`, `crypto-e2ee` et `conformite-juridique` (§ 12). L'état des tâches vit dans les issues du milestone 290, jamais dans ce document.
>
> Sources : directive porteur du 2026-11-22 (#13925, dernier commentaire), décision porteur du même jour (#20360, commentaire). Mesures faites sur `origin/dev` à `9ed1cde81c` (inventaire) et `f9d48cc41e` (relectures).

## 0. Ce que le porteur a tranché (ne se repose pas)

Verbatim : « De Sang à Sang rien ne doit être impossible sauf descendre le Sang ! La seule option permise par Sang est de pouvoir ou non se connecter à son compte à sa place, et par défaut c'est OUI. La connexion ne crée qu'une session temporaire, sans indiquer qu'il est en ligne ni capturer ses notifications, impossible de changer ses paramètres de configuration ; juste écrire, configurer ses liens, publier etc. à sa place ; la batterie et la position ne sont pas envoyées à sa place (pour cela il faut une vraie connexion avec ses identifiants). »

| Point | Tranché |
|---|---|
| Autorisation | par Sang, **activée par défaut**, désactivable à tout moment par le titulaire |
| Session | **temporaire** ; la session du Sang sur son appareil n'est pas déconnectée |
| Présence | **aucune** émise au nom du titulaire |
| Notifications | **aucune capturée** : aucun jeton push enregistré pour le titulaire |
| Paramètres du compte | **interdits** |
| Permis | écrire, configurer ses liens, publier… à sa place |
| Télémétrie | batterie, position, joignabilité, chute, inactivité, appel d'appareil : **jamais** émises par la session déléguée |
| Retour | « Revenir à mon compte » sur le FAB droit ferme la session déléguée et efface de l'appareil toutes les données de l'autre |

## 1. Vocabulaire

- **Titulaire** (T) : le compte ouvert.
- **Délégué** (D) : le Sang qui ouvre le compte de T, sur SON appareil.
- **Session parente** : la `UserSession` de D sur cet appareil.
- **Session déléguée** : une `UserSession` NOUVELLE, au nom de T, fille de la session parente.

## 2. État des lieux mesuré (origin/dev 9ed1cde81c)

### 2.1 Passerelle

| Sujet | Ce qui existe | Conséquence |
|---|---|---|
| JWT | `services/auth/session-jwt.ts:179-197` signe `{userId, username, role, sid}` HS256, TTL 24 h ; aucun `jti`, aucun `deviceId` | le `sid` est le seul ancrage : la session déléguée a SON `sid` |
| Admission | `middleware/auth.ts:236-281` : `jwt.verify` (cache Redis 55 s) puis `sessionAdmissionRefusal` (`services/auth/session-admission.ts:67-102`) À CHAQUE requête et au handshake socket (`socketio/handlers/AuthHandler.ts:282`) | la révocation d'une session est effective à la requête suivante ; c'est là que la session déléguée se vérifie |
| Rafraîchissement | `POST /auth/refresh` (`routes/auth/magic-link.ts:104-340`) accepte un JWT expiré si le `sid` est valide et non expiré, re-signe avec le même `sid` | il faut une borne DURE `UserSession.expiresAt` que le refresh ne prolonge jamais |
| Sessions | `UserSession` (schema:3694-3764) : `isValid`, `invalidatedAt`, `loginMethod`, `isTrusted`, `adoptedExpiresAt` ; `SessionService.ts` (10 sessions max, éviction :661) ; **38 sites** lisent `userSession.findMany/count/findFirst` (téléphone suivi, éviction, liste, export…) | la session déléguée vit dans une collection À PART (§ 4) pour qu.aucun de ces sites ne la voie par accident |
| Révocation | DB `isValid=false`, `disconnectSession.ts:86` par `sid`, `revoke-all-sessions.ts` | réutilisés tels quels |
| Usurpation existante | aucune entre utilisateurs. Seuls modèles voisins : `asUserId` de l'agent IA (`ZmqAgentClient.ts:13`), lecture souveraine BIGBOSS avec motif et `withAudit` (`middleware/authorize.ts:123-195`) | nouvelle primitive ; on reprend le motif « motif + audit » |
| Journal | `SecurityEvent` (schema:3663) + `GET /me/security-events` filtré par `security-event-view.ts:34-84` (liste FERMÉE de types) | ajout de types `DELEGATED_SESSION_*` |
| Alerte nouvel appareil | `routes/auth/notify-new-device.ts:97` + `builders/account-security.ts:71-190` (notification `login_new_device`, push + e-mail avec lien « tout révoquer ») | on s'aligne : même canal, nouveau type |
| Pas de « step-up » | seules la suppression de compte, le mot de passe et le changement de contact redemandent le mot de passe | la session déléguée ne connaît pas le mot de passe de T : ces routes se ferment d'elles-mêmes, mais on ne compte PAS sur ça (§ 6) |
| Jetons push | `PushToken` (schema:4475) ; **un jeton appartient au dernier compte qui l'enregistre** (`push-tokens.ts:209-216`) | si la session déléguée enregistrait le jeton de l'appareil, **D perdrait ses propres notifications** et capterait celles de T : l'interdiction tranchée par le porteur est aussi une nécessité technique |
| Cercles | `RelationLevel` `PUBLIC<…<CLOSE<BLOOD` (+ `ATOM` réservé), loi unique `resolveRelationAccess` (`packages/shared/utils/relation-access.ts`), table `RELATION_FEATURE_MIN_LEVEL` (`relation-levels.ts:63`), réglages par personne `RelationFeatureSetting` (schema:2286), arrivée au Sang par le rituel (`services/relations/bloodRitual.ts`), descente `POST /relations/:userId/level` (`routes/relations/lower.ts:40-104`, silencieuse, cooldown 30 j) | la permission devient UNE feature de la loi (`account.open`) ; elle ne se lit nulle part ailleurs |
| Équipe | entre deux comptes de l'équipe, TOUTE feature de cercle vaut Sang sans lien (`teamOpens`, `relation-access.ts:175-180`) | **danger** : sans exclusion, un ANALYST ouvrirait le compte d'un MODERATOR sans lien. `account.open` entre dans `RELATION_TEAM_CLOSED_FEATURES` |
| E2EE serveur | `E2EEDevice` (schema:3835) lié à une `sessionId` qui seule écrit ses clés et lit ses enveloppes ; routes `e2ee.ts` exigent compte + `sid` | une session déléguée n'enrôle aucun appareil et ne lit aucune enveloppe (§ 7) |

### 2.2 Clients

| | iOS (`apps/ios`, `MeeshySDK`) | Web (`apps/web`) | Android (`apps/android`) |
|---|---|---|---|
| Multi-compte | oui : jetons de plusieurs comptes au Keychain, `AuthManager.switchAccount(to:)` (`AuthManager+Accounts.swift:117-153`), `switchToProvenAccount` (`+EmailAccess.swift:203-241`, ouverture par lien) | oui : coffre `meeshy.accounts` en localStorage (`lib/api/accounts.ts`), `createAccountSwitcher`, `provenSessions` (`device-accounts.ts:85-90`) | **non** : les jetons dormants sont stockés (`EncryptedTokenStore.keepDormant`) mais rien ne les reprend ; toucher un compte pré-remplit son identifiant |
| Jetons | Keychain `me.meeshy.app`, clés `meeshy_token_<id>`, `AfterFirstUnlockThisDeviceOnly`, partagés avec l'extension de partage | **localStorage en clair** (`session.ts:259`), aucun stockage sécurisé | `EncryptedSharedPreferences` (Keystore) + **copie Block Store** des comptes gardés (`KeptAccountsBackup.kt`) qui survit à la réinstallation |
| Données par compte | base GRDB par compte (`meeshy_messages_acct_<sha>`), cache vivant à propriétaire unique archivé/effacé (`CacheCoordinator+Accounts.swift:99-134`), médias effacés à tout changement de propriétaire | cache de requêtes par étagère `u_<id>` (3 max), IndexedDB partiellement par compte, **une douzaine de clés localStorage par compte hors de la purge** (`shared-location.roster`, `gallery.saved`, `captureOutbox`, `afterRead`, `e2ee-sealed`, …), Cache Storage du service worker | **rien n'est par compte** (`SessionTeardown.kt:22-42` le dit) : une seule `meeshy.db` SQLCipher, préférences et fichiers partagés ; la purge efface TOUT l'appareil |
| Restes après déconnexion | récents CallKit (`includesCallsInRecents = true`), photos enregistrées, presse-papiers, notifications livrées (sur bascule gardée), coffre E2EE | carnet du jeu, coffre E2EE, `meeshy-gallery`, `meeshy-device-translation`, `meeshy-share`, `meeshy-push`, clés non listées | comptes gardés, jetons dormants et Block Store, coffre E2EE, préférences non enregistrées comme `PerAccountCache` |
| E2EE local | **UNE identité Signal par installation** ; `E2EEDeviceRegistrar.ensureEnrolled(userId:)` (`:75-89`) appelle `reset()` si l'utilisateur change, ce qui **efface le coffre et l'identité de D** | non câblé (aucun écran n'appelle `loadLibsignalBridge`) | coffre unique `noBackupFilesDir/e2ee/vault.db`, lignes étiquetées par propriétaire, survit à la déconnexion |
| Purge au lancement | `forgetAccountsNoLongerOnDevice` (`DependencyContainer.swift:215-249`) balaie bases et archives des comptes absents de `savedAccounts` — **pas les jetons Keychain** | aucune | aucune |
| FAB droit | `RootFloatingChrome.swift:13`, échelle `RootMenuLadderEntry` (`:26-123`) | `components/floating-menus.tsx:179`, `lib/view/floating-menu.ts:154` | `RootFloatingChrome.kt:62`, `RootMenuLadderEntry` (`FloatingChrome.kt:28`) |
| Fiche du Sang | page Actions : `ProfileActionsSection.order` (`ProfileActionsParts.swift:62`), section « Son téléphone » gardée par `offersInactivity/Fall/PhoneCall` (`ProfileCircleViewModel.swift:137-159`) | fiche de lien | fiche de lien |

**Trois constats qui commandent la conception :**
1. **L'E2EE iOS casse en premier** : réutiliser la bascule de compte existante enrôlerait T sur l'appareil de D et effacerait l'identité de D. La session déléguée doit court-circuiter tout le pont E2EE (§ 7).
2. **La bascule de compte existante n'est PAS le bon véhicule** : elle range T dans `savedAccounts`, garde ses jetons, archive son cache et, sur Android, le pousse au Block Store. La session déléguée est un **mode à part**, jamais un compte enregistré.
3. **Aucune plateforme n'isole parfaitement les données d'un compte** : la seule garantie d'effacement complet est un **conteneur dédié** à la session déléguée (§ 8), effacé en bloc.

## 3. Modèle d'autorisation

> On parle d'**autorisation**, jamais de « consentement » : un défaut à OUI ne vaut pas consentement au sens du RGPD (considérant 32, CJUE *Planet49* C-673/17). La délégation est une **fonction du palier Sang**, prévue par les CGU ; sa base légale (contrat 6(1)(b) ou intérêt légitime 6(1)(f)) relève d'un juriste (§ 12.3).

- **Feature de la loi unique** : `account.open`, ajoutée à `RELATION_FEATURES` (`packages/shared/utils/relation-levels.ts`) ; minimum `BLOOD` ; **dirigée** (D vers T) ; à autorisation de l'émetteur (T), **accordée par défaut au palier Sang** (`RELATION_EMITTER_CONSENT_DEFAULT_LEVEL['account.open'] = 'BLOOD'`, décision porteur). Elle ne se lit nulle part ailleurs que dans `resolveRelationAccess`.
- **Fermetures de la loi, sans interrupteur** (fail-closed) :
  - **équipe** : `account.open` entre dans `RELATION_TEAM_CLOSED_FEATURES` (un rôle ne crée aucun lien) ; ET refus si **T a un rôle ANALYST ou supérieur** — sinon D hériterait de la console d'administration, des lectures souveraines et du privilège d'équipe de T (`middleware/authorize.ts:49-56` lit le rôle de la ligne `User` de T). En plus, le contexte délégué porte toujours `role: USER` et tout `/admin/**` est refusé ;
  - **âge** : refus dès que T ou D est mineur déclaré, ou que leurs classes d'âge diffèrent — un majeur dans le compte d'un mineur écrirait à d'autres mineurs « en mineur » et échapperait au bouclier (`relation-access.ts:149-177`). Le cas « deux mineurs entre eux » est la décision #D5 ;
  - blocage, compte désactivé, en suppression ou verrouillé.
- **Stockage** : `RelationFeatureSetting` (ownerId = T, otherId = D) reçoit le tri-état des colonnes voisines, `accountOpenShared Boolean?` + `accountOpenWithdrawnAt DateTime?` (null = défaut du palier). Plus, sur `UserPreferences.privacy`, un interrupteur global « Personne ne peut ouvrir mon compte » (`accountOpenDisabledAt DateTime?`).
- **L'autorisation n'est effective qu'après avoir été MONTRÉE à T** (audit 17, conformité 2) : la passerelle garde `accountOpenNoticeSeenAt` (par T) et refuse `account.open` tant qu'il est nul. La notice est une feuille unique : « Nouveau : tes Sangs peuvent ouvrir ton compte, sans ton mot de passe — Garder / Choisir », avec la liste des Sangs et un interrupteur par Sang déjà sur OUI. Elle s'affiche :
  - au rituel du Sang (écran des partages, ligne de plus) ;
  - à la première ouverture d'un client compatible pour les Sangs **déjà scellés** avant la feature (le défaut ne devient pas rétroactif en silence).
  Ce mécanisme sert aussi la rétrocompatibilité : un T dont aucun client ne sait afficher la notice n'est jamais ouvrable.
- **Révocable à tout moment** (par Sang ou globalement) ; la révocation ferme dans la seconde toute session déléguée de D sur T.
- **Changement de palier** : toute sortie du Sang (descente par l'un ou l'autre, blocage, suppression, désactivation, changement de rôle ou d'âge déclaré) ferme les sessions en cours. Une remontée au Sang rouvre le défaut, et **T est prévenu** à la remontée.

## 4. La session déléguée

### 4.1 Une collection à part

Les sessions déléguées vivent dans un modèle **`DelegatedSession`**, jamais dans `UserSession` : les 38 sites qui lisent les sessions de T (téléphone suivi de la batterie et de l'inactivité — `services/battery/batteryDeps.ts:84-108` —, éviction des 10, liste des sessions, `revoke-all`, export, « a-t-il un appareil actif ») ne peuvent pas la voir par accident. Une session déléguée dans `UserSession` détournerait la télémétrie de sécurité de T : la session de D, la plus récente, deviendrait « le téléphone suivi » et éteindrait l'alerte d'inactivité de T (audit 4).

```
model DelegatedSession {
  id               String   @id @default(auto()) @map("_id") @db.ObjectId
  holderId         String   @db.ObjectId   // T
  delegateId       String   @db.ObjectId   // D
  parentSessionId  String   @db.ObjectId   // UserSession de D sur cet appareil
  tokenHash        String   @unique        // SHA-256 du secret de session
  popKeyThumbprint String                  // clé de preuve de possession (§ 4.4)
  expiresAt        DateTime
  endedAt          DateTime?
  endedReason      String?
  createdAt        DateTime @default(now())
  @@index([holderId, endedAt])
  @@index([delegateId, endedAt])
}
```

### 4.2 Ouverture

`POST /auth/delegated-sessions { holderId, popPublicKey }`, appelé par D avec SA session. Conditions, toutes serveur, fail-closed :
1. session parente valide, **`isTrusted`**, ouverte depuis plus de 24 h, **non déléguée** (pas de chaîne) ; une seule session déléguée ouverte par session parente ;
2. **ré-authentification locale de D** juste avant l'appel (Face ID / Touch ID / code via `LAContext` ; `BiometricPrompt` ; WebAuthn ou mot de passe sur le web) : un vol de la session de D ne donne pas, d'un coup, les comptes de tous ses Sangs (conformité 3, audit 11) ;
3. `resolveRelationAccess(D → T, 'account.open')` rend `allowed` (palier réciproque, autorisation non retirée, notice vue, fermetures du § 3) ;
4. limites : 3 ouvertures par heure et 10 par jour par paire (Redis `INCR EX`), `429` au-delà ;
5. clients de D et de T à la version plancher ;
6. après l'insertion, **la permission est relue** : une ouverture concurrente d'un retrait est fermée aussitôt (audit 16).

Effet : la ligne `DelegatedSession`, un JWT `{ userId: T, dsid, act: { sub: D } }` (claim d'acteur, RFC 8693 § 4.1) signé **une fois**, durée de vie = `expiresAt` ; `SecurityEvent DELEGATED_SESSION_OPENED` chez T et chez D ; notification temps réel à T (§ 9).

### 4.3 Durée — jamais rafraîchie

- 1 h par défaut, plafond 4 h, inactivité 15 min (valeurs : #D3).
- **`POST /auth/refresh` refuse toute session déléguée** (`401 DELEGATED_SESSION_EXPIRED`) : la route actuelle re-signe par `generateToken(user, sid)` (`routes/auth/magic-link.ts:323`) qui ne connaît pas `act` — un refresh rendrait un jeton ordinaire de T de 24 h (audit 1).
- **La délégation se lit dans la LIGNE, jamais dans le jeton** : un JWT qui porte `dsid` n'est admis que si la ligne `DelegatedSession` existe ; un JWT sans `dsid` n'est jamais une session déléguée.
- Inactivité : horloge Redis dédiée `delegation:idle:<dsid>` `EX 900`, glissée à chaque requête (`lastActivityAt` n'est écrit qu'une fois par quart d'heure — audit 15) ; côté socket, un minuteur armé sur `min(expiresAt, inactivité)`.

### 4.4 Admission et liaison à l'appareil

- **Hook global `onRequest`** (pas un `preValidation` par route) qui reconnaît un jeton délégué AVANT toute logique de route, plus la même vérification dans le téléverseur tus (`routes/uploads/tus-handler.ts:278-310`, hors Fastify) et un `socket.use()` au handshake et sur chaque événement.
- Admis seulement si : ligne `DelegatedSession` non terminée et non expirée ; session parente valide ; `act.sub == delegateId` ; permission encore ouverte — lue par jointure à chaque requête, **sans cache de permission** (ou un cache indexé par une version de paire incrémentée à chaque changement de lien) ; horloge d'inactivité vivante.
- **Preuve de possession** (modèle DPoP, RFC 9449) : à l'ouverture, le client génère une clé non exportable (Secure Enclave, Android Keystore, WebCrypto non extractible) ; chaque requête porte un en-tête signé (méthode, URL, horodatage, nonce). Un jeton volé ne se rejoue pas depuis un autre appareil.
- Refus ⇒ `401 { code: 'DELEGATED_SESSION_ENDED', reason }`, socket coupée. Côté client, ce code est routé **vers le seul conteneur délégué**, jamais vers le chemin `sessionInvalidated` / `RevokedSessionPurge` de D (crypto 6).

### 4.5 Révocation immédiate

Ferment la session (`endedAt`, `endedReason`, socket coupée) : D touche « Revenir à mon compte » (`DELETE /auth/delegated-sessions/current`) ; T touche « Fermer sa session » (notification, journal) ; T retire l'autorisation (par Sang ou globale), descend ou bloque D ; D descend T, est bloqué, change de rôle ou d'âge déclaré, supprime son compte ; T change son mot de passe, active la 2FA, utilise « tout révoquer », supprime son compte ; expiration, inactivité, session parente révoquée.

## 5. Ce que la session déléguée PEUT faire (porteur : écrire, configurer ses liens, publier…)

- Lire et écrire dans les conversations `server` et `hybrid` de T : messages texte, réactions, pièces jointes, vocaux (sous § 6.3), réponses, éditions et suppressions **de ce que la session a écrit** (#D6 pour le reste).
- Publier : posts, stories, statuts, commentaires, réactions, reposts.
- Configurer ses liens, dans les bornes du § 5.1.
- Lire le fil, les profils (sans la télémétrie des autres, § 6.2), les communautés ; rejoindre ou quitter une communauté.

### 5.1 « Configurer ses liens » : le risque et sa mitigation

**Risque.** Avec le OUI par défaut, toute personne élevée au Sang au nom de T **pourrait aussitôt ouvrir le compte de T** : D donnerait le compte de T à un tiers (complice, second compte de D). Les réglages de lien portent en outre les **partages** de T (écoute, batterie, position, inactivité — `routes/relations/settings.ts:174-219`) : D pourrait accorder l'écoute de T à un complice, ou couper en silence la position et la batterie de T envers ses autres Sangs, c'est-à-dire lui retirer son filet de sécurité (audit 5). Enfin, des artefacts durables survivraient à la session : lien d'invitation vers une conversation privée de T, D ou un complice ajouté à un groupe de T — dans un groupe chiffré, les vrais appareils de T chiffreraient ensuite vers lui (audit 10).

**Mitigation retenue (les liens se configurent, comme le veut la décision) :**
- **Sang et Atome restent hors de portée** : l'entrée au Sang passe par le rituel à deux appareils en présence (`services/relations/bloodRitual.ts`), que la session déléguée ne peut pas tenir ; elle n'envoie pas de demande visant `BLOOD`/`ATOM` ; elle ne change, ne descend, ne bloque aucun lien Sang/Atome de T (« rien n'est impossible sauf descendre le Sang ») ;
- **le lien T ↔ D est intouchable** depuis la session (pas d'auto-promotion, pas de levée de cooldown) ;
- **aucun réglage de partage** : toute la route `/relations/:id/settings` et les routes de partage (`battery`, `fall`, `inactivity`, `phone-call`, `phone-reachability`) sont fermées ;
- **aucun artefact d'accès durable** : gestion des participants et des rôles de conversation et de communauté, liens d'invitation et de partage, `contact-exchange` : fermés ;
- permis : envoyer, accepter, refuser des demandes jusqu'au palier fixé par **#D1**, descendre un lien non-Sang, catégories de contacts ;
- chaque changement de lien part au journal de T et au récapitulatif de fin (§ 9).

## 6. Ce qu'elle ne peut PAS faire — refus par défaut

**Principe.** Chaque route et chaque événement socket se classe `allowed | read-only | forbidden` ; non classé ⇒ **`forbidden`**. Une garde de test énumère les routes Fastify **et** les handlers bruts (tus) **et** les 83 `socket.on`, et rougit sur tout élément non classé. La garde par route ne suffit pas seule : les familles sensibles (E2EE, `/signal/*`, sessions, admin) refusent aussi dans leur handler (`callerOf`/`guarded`), indépendamment du classement (crypto 2).

### 6.1 Routes fermées

| Famille | Routes (mesurées) |
|---|---|
| Identifiants | `PATCH /users/me/password`, `PATCH /users/me/username`, `contact-change*.ts`, vérification et transfert de téléphone |
| Sécurité | 2FA (7 routes), sessions (`/auth/sessions*`, `revoke-all-sessions`), confiance d'appareil, `/me/security-events` |
| Compte | suppression (`delete-account.ts`, `account-deletion.ts`), export (`/me/export*` et les sept `export-*`), consentements, CGU, `me/birth-date` (contournerait la fermeture d'âge) |
| Paramètres (porteur) | `profile-updates.ts`, `/me/preferences/*`, confidentialité, notifications, langues, apparence, `profile-decor`, préférences de conversation et de communauté |
| Argent | `pack-routes.ts:236`, `packs-shop.ts`, `/me/meesh/mint`, affiliation |
| Appareil et télémétrie (porteur) | `push-tokens.ts` et `users/register-device-token`, `live-activity-tokens`, `me/device-*`, `me/health-fall`, `me/blood-location`, `me/location-ghost`, `location-settings-read`, `me/wellness` (« tout va bien » au nom de T éteindrait une alerte), pièces jointes et partages de position |
| Lecture de la télémétrie des AUTRES | `GET /relations/locations`, batterie, chutes (`relations/fall.ts:37`, donnée de santé), `now-playing`, `talkie/*`, `bring/*`, événements `location:live-*` : les Sangs de T ont partagé avec T, pas avec D |
| Liens | voir § 5.1 |
| Chiffrement | `e2ee.ts`, `e2ee-device-trust.ts`, `e2ee-signals.ts`, `signal-protocol.ts` (`POST /signal/keys` remplacerait la clé d'identité de T — crypto 3), `conversation-encryption.ts` (activation E2EE **irréversible**, ou retrait du chiffrement au repos — crypto 4), création de conversation en mode `e2ee` |
| Contacts | `contacts/resolve` (le carnet de D partirait sous le compte de T, contre #9225) |
| Voix | `voice-profile`, `voice-analysis` |
| Modération | `reports/*` (aucun signalement au nom de T) |
| Notifications (porteur) | centre de notifications de T : ni liste, ni lu, ni suppression |
| Appels | passer ou recevoir un appel au nom de T (#D4) |
| Administration | tout `/admin/**` |

### 6.2 Aucun effet de présence, ni REST ni socket

- REST : le middleware saute `updateUserLastSeen(T)` (`middleware/auth.ts:432`) — sinon chaque requête montrerait T en ligne et pourrait déclencher `contact_recently_active`.
- Socket : la socket déléguée **ne s'inscrit pas dans `connectedUsers` sous T**, ne rejoint ni `ROOMS.user(T)` ni `feed(T)` (`AuthHandler.ts:401-402`) — elle n'y recevrait que `notification:new` (y compris `login_new_device` avec IP et lieu), `user:status` des amis de T, positions et batteries relayées ; elle rejoint `delegated:<dsid>` et les salons des conversations non chiffrées. Elle saute `markConnected`, `updateUserOnlineStatus`, `noteBatteryAlive`, `notePhoneSignOfLife`, `noteInactivitySignOfActivity` (`AuthHandler.ts:428-473`) et les instantanés de présence.
- Pas de `typing:*`, pas d'accusés de lecture ni de réception, pas d'avance du curseur de lecture.
- **Les accusés posés par le serveur** sont court-circuités : livraison automatique aux présents (`MessageHandler.ts:1779-1812`), « reçu » au `GET` des messages (`messages-list.ts:827`), **vidage de la file hors ligne de T** à la connexion (`MeeshySocketIOManager.ts:682`) — qui priverait les vrais appareils de T de leur arriéré, une perte silencieuse (#9223). La file de T continue d'être alimentée pendant la session (`offlineParticipantQueue.ts:485` ne voit pas la socket déléguée).
- Témoins : `User.lastActiveAt` inchangé après N requêtes déléguées ; aucun `user:status` émis ; file hors ligne de T intacte ; aucun `deliveredAt` posé.

### 6.3 Ce qui part au nom de T doit venir de T

- **Voix** : un vocal enregistré par D ne crée, ne lit ni ne met à jour aucun profil vocal (`MessageTranslationService.ts:1205`, `ZmqRequestSender.ts:213-255`) ; la traduction audio se fait **sans clonage**, voix neutre — sinon les correspondants entendraient la voix clonée de T dire les mots de D, et la voix de D (donnée biométrique) atterrirait chez T.
- **Position** : EXIF GPS retiré à coup sûr des photos et vidéos ; aucune pièce jointe de position.
- **Traçabilité** : tout objet créé ou modifié porte `actedById: D` côté serveur (`Message`, `Post`, `Comment`, `Reaction`, transitions de lien), servi aux modérateurs et à T, et aux correspondants selon **#D2**.
- `Cache-Control: no-store, private` sur toute réponse déléguée.

## 7. E2EE

**Un contexte typé, pas une convention.** Le mode délégué ne passe JAMAIS par `AuthManager.switchAccount`, `isAuthenticated`, `currentUser` (iOS), `session.currentUserId` (Android) ni par la session du web. Sinon, l'identité E2EE de D est effacée **localement, avant tout appel réseau** : iOS `SessionTransitionPlan.swift:47` → `EndToEndSessionBridge.swift:72-80` → `E2EEDeviceRegistrar.swift:80` (`reset()` si l'utilisateur change) ; Android `EndToEndEnvelopeBinding.kt:52-62` → `E2eeDeviceRegistrar.kt:46` (aucune garde de compte) — crypto 1. Le délégué a son propre type (`DelegatedSessionContext`) que le pont E2EE ne connaît pas ; le runtime E2EE de D est **gelé, jamais fermé** ; `ensureEnrolled` refuse par construction tout `userId` qui n'est pas le titulaire de l'installation. Aucune étape de `SessionTransitionPlan` ne s'exécute à l'entrée ni au retour (`.clearE2EESessions`, `.unregisterVoIP`, `.reRegisterPushTokens` abîmeraient la session de D).

**Côté serveur, refus au plus bas niveau** (`callerOf`/`guarded` de `e2ee.ts`, `e2ee-device-trust.ts`, `e2ee-signals.ts`, handlers `/signal/*`) : sans quoi une session déléguée pourrait enrôler un appareil au nom de T (`e2ee.ts:176-184`) — et les correspondants chiffrent vers **tous** les appareils actifs de T (`E2EEMessageSealer.swift:105`) — ou retirer un vrai appareil de T.

**Ce que voit la session déléguée d'une conversation `e2ee` de T** : son nom et une ligne fixe « Chiffrée de bout en bout — visible seulement sur ses appareils ». La projection sert **sans aucun champ de dernier message** (type, durée, taille du média, `encryptedContent` hérité) ; les routes messages, recherche et pièces jointes d'une conversation `e2ee` répondent `403` — ce qui ferme aussi **l'historique en clair d'avant l'activation**, encore lisible serveur. Toute écriture déléguée dans une conversation `e2ee`, même d'apparence chiffrée, est refusée serveur. Le simple fait que la conversation existe révèle une partie du graphe social de T : #D7 dit si on la montre ou si on la cache.

**`server` et `hybrid`** : chiffrés au repos, lisibles par le serveur, donc **lisibles par D** en entier (texte, pièces jointes, traductions, transcriptions — `EncryptionService.ts:10`). L'écran de l'autorisation le dit en clair : le libellé « Hybride » ou le cadenas ne protègent pas de D.

**Les clés privées de T ne quittent jamais ses appareils.** Les colonnes serveur héritées `User.signalIdentityKeyPrivate` et `SignalPreKeyBundle.identityKeyPrivate` (schema:457, :3781 — module DMA non monté) : témoin qu'elles sont nulles et jamais sélectionnées par une route `allowed`.

**Lire un jour les conversations chiffrées de T** (#D8) : la seule conception défendable est un **appareil lié de T hébergé sur le matériel de D** — identité d'appareil distincte dans un coffre séparé, enrôlement approuvé sur un appareil de T, borné dans le temps, annoncé aux correspondants (liste d'appareils / numéro de sécurité, modèle Sesame), sans historique, retiré et effacé cryptographiquement à la fin. Elle contredit « les clés de T ne quittent jamais ses appareils », change ce que voient les tiers et touche au protocole : lot crypto séparé avec audit tiers, hors de ce lot.

## 8. Effacement complet

### 8.1 Le conteneur délégué

- Jamais un compte enregistré : pas de `savedAccounts`, `meeshy.accounts`, `SavedAccountsStore`, Block Store, `PersistedActiveUser`, App Group.
- **Jeton en mémoire seulement** — y compris sur le web (`sessionStorage` est restauré par la restauration de session et copié par « Dupliquer l'onglet ») ; un shim de stockage redirige en mémoire tout `localStorage`/`sessionStorage` écrit en mode délégué. Conséquence assumée : un kill de l'app ou la fermeture de l'onglet termine la session.
- **Effacement cryptographique** (NIST SP 800-88 Rev. 1 § 2.6 : sur flash, l'écrasement n'est pas fiable, la destruction de clé l'est) : une clé aléatoire de 256 bits par session, **en mémoire seulement**, chiffre tout ce que le conteneur écrit — iOS base GRDB et cache média (la clé GRDB actuelle est commune à l'appareil, `DatabaseEncryption.swift:29`), fichiers en `NSFileProtectionComplete` ; Android Room `meeshy-delegated.db` SQLCipher ; web valeurs IndexedDB scellées AES-GCM WebCrypto non extractible ; `PRAGMA temp_store=MEMORY` partout.
- **Son propre client API sans cache disque**, sa propre file hors ligne en mémoire, sa propre identité courante : `URLCache.shared` / `meeshy_http_cache` (`APIClient.swift:245-250`), caches OkHttp / Coil / ExoPlayer, base WorkManager, seau `api` du service worker (`lib/net/api-runtime-cache.ts`, qui ignore `Authorization`) ne voient pas les requêtes déléguées (préfixe d'URL reconnaissable exclu par le service worker).
- **Les observateurs du compte courant** (29 sites iOS : `VoIPPushManager`, `WidgetDataManager`, `SharedLocationSharingCenter`, Live Activities, E2EE…) ne voient pas le délégué ; une garde énumère ces observateurs.
- **Extensions** : la NSE et l'extension de partage restent celles de **D** (les pushes de D continuent d'arriver sur le jeton de D, ce qui est juste). Rien du délégué n'entre dans l'App Group.
- Fermés pendant la session : Spotlight, donations Siri / `INSendMessageIntent`, CallKit, widgets, « Enregistrer dans Photos » / galerie, export vers Fichiers, presse-papiers (ou local et expirant à 60 s), traduction sur l'appareil persistée, étiquetage des journaux de crash par T.

### 8.2 Retour

« Revenir à mon compte », ou toute fin reçue du serveur : appel `DELETE` (non bloquant) ; socket coupée ; **oubli de la clé**, fermeture des pools, puis suppression des fichiers (`-wal`, `-shm`, `tmp/` compris ; `deleteDatabase` web avec gestion de `onblocked`) ; purge des notifications locales du conteneur et des états mémoire ; retour à la session de D, jamais fermée — son cache, son socket, son E2EE sont intacts.

### 8.3 Plantage, kill, redémarrage

Un marqueur `delegatedSessionActive = <dsid>` (sans contenu de T) est écrit avant l'ouverture. Au lancement, avant toute interface et tout restore de session (la purge attend le déverrouillage si les données protégées sont indisponibles), et au retour au premier plan : marqueur présent ⇒ suppression des fichiers résiduels (illisibles : leur clé est morte avec le processus) + fin serveur + effacement du marqueur. Côté serveur, expiration (≤ 4 h) et inactivité (15 min) ferment la session même si l'appareil ne revient jamais. **Une session déléguée ne survit jamais à un redémarrage.**

### 8.4 Ce qui ne s'efface pas

Ce que D a lu ; les captures d'écran (iOS ne peut pas les bloquer : détection et journal chez T ; Android `FLAG_SECURE` — #D9) ; le dictionnaire d'apprentissage du clavier ; un appareil jailbreaké ou rooté. La notice de T le dit.

## 9. Traces et information

- **Notification temps réel à T à CHAQUE ouverture**, sans regroupement, **hors de ses préférences de notification** : « X a ouvert ton compte » + action « Fermer sa session » (push haute priorité vers les appareils de T, in-app, e-mail si T n'a aucun appareil actif). C'est la contrepartie du OUI par défaut (conformité 3).
- **Journal de T** : `SecurityEvent` `DELEGATED_SESSION_OPENED`, `…_CLOSED` (raison), `…_EXPIRED`, `…_SUMMARY` ; acteur `third_party` nommé. Contenu minimal : nom de D, horodatages, compteurs, changements de liens — jamais le contenu des messages, ni l'IP ou l'appareil de D dans la vue de T (art. 5(1)(c), 15(4)). Section « Qui a ouvert ton compte » (Sécurité) et « Ouvertures de ton compte » sur la fiche de lien de D. Rétention : 12 mois, borne existante (`retention-bounds.ts`).
- **Récapitulatif de fin** à T : durée, nombre de messages et de publications, changements de liens.
- **Journal de D** : sa propre ligne.
- **`actedById`** : vit autant que l'objet, anonymisé à la suppression de l'un ou l'autre compte ; marqué dans l'export de T (art. 20).
- **Modération (DSA)** : les modérateurs voient `actedById` ; la décision motivée (art. 17) part à T et à D ; la sanction d'un abus vise D, et la suspension de D ferme ses délégations ; un signalement aux autorités identifie D.

## 10. Rétrocompatibilité

- Serveur d'abord, sous drapeau `DELEGATED_SESSIONS_ENABLED` OFF + liste blanche staging ; production : feu vert porteur (avec l'avis juridique du § 12.3).
- Nouveaux modèles et champs optionnels (`DelegatedSession`, colonnes d'autorisation, `actedById`) : aucune migration destructive, aucun ancien client ne les lit.
- Un ancien client de D ne voit pas l'entrée ; la route exige la version plancher.
- Un ancien client de T ne sait pas afficher la notice : **la notice non vue ferme l'autorisation** (§ 3).
- Les nouvelles notifications ont un corps texte complet (affichage générique sur un ancien client).
- `RelationFeature` étendue : un ancien miroir Swift/Kotlin ignore `account.open` et ne propose rien.
- Les anciennes routes `/signal/*` n'exigent de `sid` pour personne (constat crypto 3) : issue séparée, hors de ce lot ; ici, elles refusent les sessions déléguées dans leur handler.

## 11. UX

- **Entrée** : fiche du Sang, page Actions, section « Son téléphone » (iOS `ProfileActionsPartContent.swift:157-233`), ligne « Ouvrir son compte », présente seulement si la loi l'ouvre (rien de non actionnable). Feuille de confirmation : « Tu vas entrer dans le compte de X. X en sera prévenu. Ta session reste ouverte. » → « Entrer » → Face ID. Deux gestes + la biométrie.
- **Pendant** : bandeau persistant, couleur d'avertissement fixe (jamais l'accent de conversation) : « Tu es dans le compte de X · 52 min ». Avatar du FAB droit = X, cerclé d'avertissement. Les fonctions fermées sont **absentes**, pas grisées.
- **FAB droit** : au toucher, l'échelle s'ouvre avec en tête « Revenir à mon compte » (flèche retour + avatar de D) ; un toucher, sans confirmation. Nouveau cas `RootMenuLadderEntry.returnToOwnAccount` (iOS `RootMenuLadderEntry.swift`, Android `FloatingChrome.kt:28`, web `lib/view/floating-menu.ts`), présent seulement en mode délégué.
- **Fin forcée** : retour automatique + toast (« X a fermé la session », « Session terminée »).
- **Chez T** : notice (§ 3) ; fiche de lien de chaque Sang : « Peut ouvrir mon compte » (OUI par défaut), (i) : « sans ton mot de passe, sans tes réglages, sans tes conversations chiffrées de bout en bout ; il voit tes conversations ordinaires et hybrides ; tu es prévenu à chaque fois » ; Réglages > Confidentialité : « Personne ne peut ouvrir mon compte ».
- **États** : démarrage à froid assumé (squelette, le conteneur est vide par nature) ; erreur traduite ; hors ligne : ouverture impossible, écritures en file en mémoire, perdues au retour si le réseau ne revient pas (le toast le dit).
- **Accessibilité** : bandeau annoncé par VoiceOver/TalkBack ; « Revenir à mon compte » au clavier (web) et par le geste d'échappement (iOS `accessibilityPerformEscape`).

## 12. Relectures (2026-11-22, sur `f9d48cc41e`)

### 12.1 auditeur-adversarial — « bloquant en l'état, implémentable une fois les corrections 1 à 14 intégrées »

| # | Sév. | Constat | Intégré |
|---|---|---|---|
| 1 | critique | le refresh re-signe sans `act` et rend un jeton ordinaire de 24 h | § 4.3 (refresh refusé, délégation lue dans la ligne) |
| 2 | critique | la session hérite du rôle de plateforme de T | § 3 (refus si T ≥ ANALYST, `role: USER`, `/admin/**`) |
| 3 | critique | bouclier des mineurs contourné par usurpation | § 3 (fermeture d'âge) |
| 4 | critique | la session déléguée devient « le téléphone suivi » et éteint l'inactivité de T ; `/me/wellness` | § 4.1 (collection à part), § 6.1 |
| 5 | critique | forger ou couper les partages de T via `/relations/:id/settings` | § 5.1, § 6.1 |
| 6 | critique | accusés serveur et vidage de la file hors ligne de T | § 6.2 |
| 7 | élevée | `updateUserLastSeen` au REST, effets de présence au handshake | § 6.2 |
| 8 | élevée | salon `user:T` : notifications, statuts, télémétrie relayée | § 6.2 |
| 9 | élevée | politique par route trouée (tus, sockets, routes oubliées) | § 4.4, § 6 |
| 10 | élevée | artefacts d'accès durables (invitations, participants, demandes Sang) | § 5.1 |
| 11 | élevée | jeton non lié à l'appareil ; compromission de D ⇒ N comptes | § 4.2 (ré-auth, parente ancienne et approuvée), § 4.4 (preuve de possession) |
| 12 | élevée | caches HTTP disque iOS, service worker, Android | § 8.1, § 6.3 |
| 13 | élevée | observateurs du compte courant, file hors ligne partagée | § 7, § 8.1 |
| 14 | élevée | voix clonée de T, position de D attribuée à T | § 6.3 |
| 15 | moyenne | inactivité non mesurable avec `lastActivityAt` | § 4.3 |
| 16 | moyenne | cache de permission et course ouverture/retrait | § 4.2, § 4.4 |
| 17 | moyenne | défaut jamais vu ; stockage tri-état ; interrupteur global | § 3 |
| 18 | moyenne | écriture serveur en conversation E2EE | § 7 |
| 19 | moyenne | `sessionStorage` copié par duplication d'onglet | § 8.1 |
| 20 | basse | notification hors préférences ; `actedById` et effacement ; index du récapitulatif | § 9 |

Non vérifié par l'audit, à couvrir par les lots : `disconnectSession` multi-instance, acquittement `emitWithSeq` d'une socket déléguée, journalisation des en-têtes `Authorization`, observateurs Android et web.

### 12.2 crypto-e2ee

| # | Sév. | Constat | Intégré |
|---|---|---|---|
| 1 | critique | l'identité E2EE de D effacée localement par la bascule (iOS et Android) | § 7 (contexte typé, runtime gelé) |
| 2 | critique | enrôlement d'un appareil au nom de T ; retrait d'un vrai appareil | § 7 (refus dans les handlers) |
| 3 | élevée | substitution de clé par `POST /signal/keys` | § 6.1, § 7 ; issue hors lot (`sid` absent pour tous) |
| 4 | élevée | `conversation-encryption.ts` absent de la liste (activation irréversible) | § 6.1 |
| 5 | élevée | extensions iOS lisant T comme compte actif | § 8.1 |
| 6 | moyenne | le plan de fermeture abîme la session de D | § 4.4, § 7 |
| 7 | moyenne | métadonnées et historique d'avant activation servis | § 7, #D7 |
| 8 | faible | `hybrid` = lisible par D en entier | § 7, § 11 |
| 9 | faible | clés privées héritées détenues par le serveur | § 7 (témoin) |
| 10 | élevée | effacement par suppression de fichiers insuffisant ; jeton persisté contradictoire | § 8.1–8.3 (effacement cryptographique, jeton en mémoire) |

Références : Signal Sesame / multi-appareil, RFC 8693 § 4.1 et § 4.4, RFC 9449 (DPoP), NIST SP 800-88 Rev. 1 § 2.6, Apple Platform Security « Data Protection », Android File-Based Encryption. Hors modèle de menace : ce que D voit de ses yeux, appareil compromis, serveur compromis.

### 12.3 conformite-juridique — analyse sourcée, pas un avis juridique

| # | Risque | Mitigation intégrée | Juriste requis |
|---|---|---|---|
| 0 | la politique de confidentialité ne décrit ni les cercles ni la télémétrie, ni aucune base légale (`apps/web/src/institutional/privacy.ts`) ; âge minimum 13 ans | issue séparée | — |
| 1 | un défaut OUI ne vaut pas consentement (cons. 32, *Planet49*) | « autorisation », fonction du palier prévue aux CGU | **oui** (base 6(1)(b) ou (f)) |
| 2 | art. 25(2) : défaut rétroactif pour les Sangs déjà scellés | notice vue obligatoire (§ 3) | — |
| 3 | art. 32 : un compte compromis en ouvre N | ré-auth biométrique, notification à chaque ouverture | — |
| 4 | AIPD requise (WP248 : tiers, communications, mineurs, usage innovant) | rattachée à l'AIPD des cercles #13942, registre art. 30 | **oui** (validation) |
| 5 | correspondants : Meeshy reste responsable (cons. 18, *Lindqvist*, *Ryneš*) | politique : « les Sangs autorisés de votre correspondant peuvent lire et écrire dans vos conversations non chiffrées » ; opposition = conversation E2EE | — |
| 6 | secret des correspondances (ePrivacy art. 5(1), CP 226-15) | — | **oui, bloquant pour la production** |
| 7 | usurpation d'identité (CP 226-4-1), accès frauduleux (323-1) envers les correspondants | marqueur « via X » recommandé (#D2) | **oui** |
| 8 | mineurs (art. 8 ; 15 ans en France ; 13-14 ans admis par l'arbre) | fermeture d'âge (§ 3), `birth-date` fermé | **oui** (13-14 ans) |
| 9 | voix : biométrie de D chez T, voix clonée de T | § 6.3 | — |
| 10 | lecture de la télémétrie et de la santé des autres Sangs | § 6.1 | — |
| 11 | journalisation : minimisation, durée, portabilité | § 9 | — |
| 12 | DSA : contenu de D sanctionné chez T | § 9 | **oui** (destinataire de la décision art. 17, art. 19) |
| 13 | `hybrid` lisible par D | § 7, § 11 | — |
| 14 | App Store 5.1.1, 5.1.2, 1.2 : démo du mode délégué aux notes de revue | lot C1 | — |
| 15 | Google Play : Prominent Disclosure, Data safety (transfert non initié), Deceptive Behavior | notice, « via X », lot C1 | — |
| 16 | politique, CGU (D responsable, interdiction d'usage contre T ou pour tromper, sanction visant D), fiches stores | lot C1 | **oui** (CGU) |

## 13. Décisions ouvertes au porteur

Les points tranchés au § 0 ne se reposent pas. Restent :

| # | Question | Recommandation | Défaut appliqué en attendant |
|---|---|---|---|
| D1 | « Configurer ses liens » au nom de T : jusqu'à quel palier la session peut-elle envoyer ou accepter une demande ? (Sang, Atome, partages et artefacts d'accès durables restent fermés — § 5.1) | jusqu'à Proche, chaque changement notifié à T | jusqu'à Ami |
| D2 | Les correspondants voient-ils qu'un message ou une publication a été écrit par X dans le compte de T ? | oui, discret : « via X » dans le détail du message et sur la publication | pas de mention ; `actedById` servi à T et aux modérateurs seulement |
| D3 | Durée : défaut / plafond / inactivité | 1 h / 4 h / 15 min | 1 h / 4 h / 15 min |
| D4 | Appels au nom de T | exclus | exclus |
| D5 | Deux mineurs déclarés entre eux (majeur ↔ mineur est fermé par la loi) | fermé | fermé |
| D6 | Éditer ou supprimer les messages et publications de T antérieurs à la session | non | non |
| D7 | Les conversations E2EE de T apparaissent-elles dans la liste de la session déléguée ? | cachées | cachées |
| D8 | Lire un jour les conversations E2EE de T (appareil lié, lot crypto + audit tiers) | non dans ce chantier | non |
| D9 | Captures d'écran pendant la session | journalisées chez T (iOS) / bloquées (Android) | idem |

## 14. Plan de lots

Ordre : serveur, puis iOS, Android, web. TDD ; chaque lot serveur relu par `auditeur-adversarial` avant fusion ; constats critiques d'abord en témoin rouge.

| Lot | Plateforme | Contenu |
|---|---|---|
| S1 | shared + gateway | `account.open` dans la loi (Sang, dirigée, défaut au Sang, fermetures équipe/rôle/âge), stockage tri-état, interrupteur global, notice vue obligatoire, miroirs Swift/Kotlin |
| S2 | gateway | `DelegatedSession`, ouverture (ré-auth, parente approuvée et ancienne, limites, relecture post-insert), JWT `act` non rafraîchissable, admission par hook global + tus + `socket.use`, preuve de possession, inactivité Redis, toutes les révocations |
| S3 | gateway | politique de refus par défaut (routes, handlers bruts, sockets) + garde d'énumération ; refus dans les handlers E2EE, `/signal/*`, sessions, admin ; fermetures des § 5.1 et § 6.1 |
| S4 | gateway | aucun effet de présence (REST, handshake), salons, accusés serveur, file hors ligne de T intacte ; `no-store` |
| S5 | gateway + translator | voix sans profil ni clonage, EXIF retiré, `actedById` |
| S6 | gateway | journal, notification à chaque ouverture hors préférences, récapitulatif, modération (`actedById`, décisions vers T et D) |
| I1 | iOS + SDK | `DelegatedSessionContext` hors `AuthManager`, client API sans cache, effacement cryptographique, extensions et observateurs hors délégué, E2EE de D gelé intact, marqueur et purge au lancement |
| I2 | iOS | entrée sur la fiche du Sang + Face ID, bandeau, FAB « Revenir à mon compte », notice et réglages chez T, journal |
| A1 | Android | contexte délégué hors `session.currentUserId`, Room SQLCipher à clé éphémère, caches dédiés, jamais Block Store, `FLAG_SECURE`, purge au lancement |
| A2 | Android | UX iso iOS |
| W1 | web | jeton en mémoire, shim de stockage, IndexedDB scellée, exclusion du service worker, purge au chargement + UX |
| C1 | conformité | AIPD (#13942), registre, politique, CGU, fiches stores, notes de revue ; avis juridique signé avant production |
| R1 | recette | staging à deux comptes Sang (`talkieun` / `talkiedeux`), puis deux téléphones réels |
