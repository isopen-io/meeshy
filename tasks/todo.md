# Cycle 17 — « Retrouver mes contacts » échouait, et ne gardait rien

Branche : `claude/meeshy-contacts-sync-8gexy1`, partie de `origin/main`.

## Point de départ

Rapport utilisateur : « Lorsque je fais retrouver mes contacts sur meeshy, j'ai
une erreur gateway », logs à l'appui —

```
[WARN] [GWY] [Normalize] {"msg":"normalizePhoneWithCountry parse error","data":{"name":"ParseError"}}
```

Et une demande de fond : pouvoir **synchroniser et CONSERVER** le carnet
d'adresses, puis **consulter ce répertoire** avec un bouton « Lui écrire »
quand le contact est sur Meeshy (rapproché par email, numéro, ou pseudo vCard).

## Défauts retenus

**D1 — un carnet d'adresses réel faisait rejeter le lot entier.** `POST
/users/me/contacts/match` validait le payload avec un Zod strict : `.max(50)`
numéros, `.max(64)` caractères par numéro, `.min(1)` contact, et surtout
`defaultCountry: z.string().length(2)`. Or `Locale.current.region?.identifier`
(iOS) peut rendre un identifiant UN M49 numérique — « 419 » pour l'Amérique
latine. Une seule de ces conditions ⇒ `400 Invalid contacts payload` pour
TOUT le carnet. Un carnet vide (permission accordée, aucun contact) partait
lui aussi en 400.

**D2 — chaque entrée illisible levait une exception et écrivait un WARN.**
`parsePhoneNumber` de libphonenumber-js **lève** une `ParseError` sur `*123#`,
`SOS`, une chaîne vide, un indicatif inconnu — tout ce dont un carnet réel est
plein. `normalizePhoneWithCountry` l'absorbait déjà (retour `null`), mais la
journalisait en WARN : des centaines de lignes et autant d'exceptions
levées/attrapées par synchronisation. C'est la ligne que l'utilisateur a
collée. La garde `looksLikePhoneNumber` existait déjà dans le module — la
route ne s'en servait pas.

**D3 — `normalizePhoneWithCountry` remontait une TypeError sur entrée
non-string.** `phoneNumber.trim()` était appelé AVANT le `try`, donc un
`42` ou un `null` glissé dans un tableau de numéros traversait la fonction et
finissait en 500.

**D4 — rien n'était conservé.** Le commentaire de tête l'assumait (« Les
contacts ne sont JAMAIS persistés »). Conséquence produit : le filtre
« Repertoire » de l'onglet Contacts était un bouton mort qui affichait
« Bientot disponible », et chaque consultation aurait imposé un re-scan du
carnet.

**D5 — le pseudo vCard n'était pas un identifiant de rapprochement.** Seuls
numéro et email étaient interrogés, alors que la fiche porte un `nickname` et
des profils sociaux.

## Ce qui a été fait

### Gateway
- `utils/contact-identifiers.ts` (neuf) — normalisation tolérante : pré-filtre
  `looksLikePhoneNumber` avant libphonenumber, emails/pseudos normalisés,
  entrées malformées écartées, lot surdimensionné TRONQUÉ (jamais rejeté),
  `contactKey` = SHA-256 des identifiants triés (clé d'upsert idempotente).
- `utils/normalize.ts` — `ParseError` en DEBUG (donnée, pas incident), WARN
  réservé à l'inattendu ; garde `typeof !== 'string'` avant `.trim()`.
- `services/ContactDirectoryService.ts` (neuf) — `match` (rapprochement pur,
  téléphone > email > pseudo, exclusion des blocages dans les deux sens),
  `sync` (upsert `(ownerId, contactKey)`, mode `merge`/`replace`), `list`,
  `clear`.
- `routes/users/contacts-match.ts` — réécrite sur ces briques ; plus aucun 400
  sur un carnet atypique ou vide ; `processedContacts` dit au client ce qui a
  réellement été traité.
- `routes/users/contacts-directory.ts` (neuf) — `POST /users/me/contacts/sync`,
  `GET /users/me/contacts`, `DELETE /users/me/contacts`.
- Prisma : modèle `UserContact` (+ relations `User`).

### SDK
- `ContactDirectoryModels.swift`, `ContactDirectoryService.swift`,
  `usernames` sur `ContactMatchEntry`, store de cache `phonebook` (chiffré).

### iOS
- `ContactSyncService` — lit `nickname` + profils sociaux, expose
  `syncDirectory(mode:)`.
- `PhonebookViewModel` + `PhonebookListView` (neufs) — répertoire cache-first,
  filtres Tous / Sur Meeshy / À inviter, recherche locale, **« Lui écrire »**
  (conversation directe) ou **« Inviter »** (SMS).
- `ContactsListTab` — le filtre « Repertoire » n'est plus un placeholder.
- `DiscoverViewModel.importContacts` — « Retrouver mes contacts » synchronise
  et CONSERVE désormais, puis relit le répertoire pour l'affichage.

## Deuxième passe (demande utilisateur en cours de cycle)

Synchronisation avec la PR #2996 (échelle du menu flottant → journal d'appels)
mergée dans cette branche, puis trois points :

**D6 — le sous-menu « Repertoire » n'affichait rien à l'ouverture.** Le
répertoire ne se remplit qu'à la synchronisation ; un onglet vide avec un
bouton était une impasse alors que la permission Contacts est souvent DÉJÀ
accordée (accordée depuis « Retrouver mes contacts »). `load()` déclenche
désormais un remplissage SILENCIEUX quand le répertoire est vide **et** que
l'autorisation existe déjà — jamais de demande de permission depuis cet écran,
et une seule tentative par cycle de vie du ViewModel.

**D7 — la recherche s'arrêtait au répertoire.** Elle cherche maintenant
d'abord dans le carnet (local, instantané) et RELAIE vers les utilisateurs de
la plateforme quand le carnet ne répond rien : requête ≥ 2 caractères, temps
mort de 300 ms, résultats sous un en-tête « Sur Meeshy, hors de ton
repertoire » pour qu'aucune ligne ne se fasse passer pour un contact du carnet.
Chaque ligne porte « Lui écrire ».

**D8 — « Affilies » était un autre bouton mort, et sa source de données était
vide.** `GET /affiliate/stats` déclarait `data` comme un objet SANS
`properties` : fast-json-stringify sérialisait `{}`. Compteurs, filleuls et
tokens étaient effacés à la sérialisation, silencieusement — le test existant
n'assertait que `success: true`. Corrigé (`additionalProperties: true`) et
verrouillé par un test sur le contenu. L'onglet liste maintenant les filleuls
avec « Lui écrire ».

## Vérification

- Suite gateway complète : **714 suites / 17 487 tests verts** (`npx jest`).
- `tsc --noEmit` gateway : propre.
- Nouveaux tests : 27 (`contact-identifiers`), 4 (`normalize-logging`),
  21 (`ContactDirectoryService`), 18 (`contacts-directory` routes),
  15 (`contacts-match` routes, dont 5 neufs sur la tolérance),
  1 (`affiliate` — la charge de stats survit à la sérialisation).
- iOS : tests écrits (`PhonebookViewModelTests` — 26,
  `AffiliatesViewModelTests` — 8, `DiscoverViewModelTests` mis à jour, mocks).
  **Non exécutés** — pas de toolchain Swift/Xcode sur l'hôte de ce cycle.
  `./apps/ios/meeshy.sh test` reste à passer sur une machine macOS.

## Reste ouvert

- `ContactSyncProviding.findFriendsFromContacts()` n'a plus d'appelant côté app
  (le chemin produit passe par `syncDirectory`). Conservé : c'est la façade du
  endpoint `/match`, toujours servi pour les versions déjà déployées.
- Le répertoire n'est pas encore paginé côté client (200 premières entrées) ;
  les affiliés non plus (tout ce que rend `/affiliate/stats`).
- Aucune préférence de découvrabilité (« ne pas me retrouver par numéro ») —
  parité avec le comportement d'avant ce cycle, à traiter séparément.

---

# Cycle 17 (2026-08-14) — les préférences de conversation ne traversaient ni le sérialiseur ni le socket web

Routine « amélioration continue temps réel », phases 2 / 3 / 11.
Base : `origin/main` @ `14c226e08` (le cycle 16 est mergé).

## Défauts retenus

**D1 — le compteur `version` n'a jamais quitté le serveur.**
`conversationPreferencesSchema` (le sérialiseur de réponse Fastify des trois
surfaces REST : `GET` unitaire, `GET` liste, `PUT`) n'énumère pas `version`.
Fastify retire toute propriété absente du schéma : le compteur monotone sur
lequel TOUS les clients sont censés arbitrer (`incoming.version <= local →
drop`) est effacé de chaque réponse. Côté iOS, `DefaultPreferenceWritingAdapter`
refait un GET APRÈS le PUT dans le seul but de récupérer ce `version` — et
reçoit `nil` à tous les coups, donc `authoritativeVersion` n'est jamais
appliqué et `userState.version` reste sur l'estimation optimiste locale.

**D2 — le web jette le scope conversation de `user:preferences-updated`.**
`use-socket-cache-sync.ts` discrimine l'union à trois branches et n'en traite
que deux (`category`, `communityId`) ; la branche `conversationId` sort de la
fonction sans rien faire. Le store Zustand `conversation-preferences-store`
n'a AUCUN câblage socket. Épingler / couper le son / archiver depuis un autre
appareil ne parvient donc jamais à un onglet web ouvert : la liste garde son
état périmé (et son tri) jusqu'à un rechargement.

**D3 — le type partagé n'a pas de `version`.**
`UserConversationPreferences` ne modélise pas le compteur, donc le web ne peut
pas arbitrer de manière typée même une fois D1 corrigé.

**D3 — `normalizePhoneWithCountry` remontait une TypeError sur entrée
non-string.** `phoneNumber.trim()` était appelé AVANT le `try`, donc un
`42` ou un `null` glissé dans un tableau de numéros traversait la fonction et
finissait en 500.

- `version` ajouté à `conversationPreferencesSchema` ; la branche « aucune
  ligne stockée » du GET unitaire répond `version: 0` explicitement.
- `readonly version?: number` sur `UserConversationPreferences`, porté par
  `transformPreferencesData` côté web.
- `applyRemotePreferences()` sur le store web : arbitrage par `version`,
  gestion de `reset`, création d'entrée absente.
- Branche `conversationId` câblée dans `use-socket-cache-sync.ts`.

### Gateway
- `utils/contact-identifiers.ts` (neuf) — normalisation tolérante : pré-filtre
  `looksLikePhoneNumber` avant libphonenumber, emails/pseudos normalisés,
  entrées malformées écartées, lot surdimensionné TRONQUÉ (jamais rejeté),
  `contactKey` = SHA-256 des identifiants triés (clé d'upsert idempotente).
- `utils/normalize.ts` — `ParseError` en DEBUG (donnée, pas incident), WARN
  réservé à l'inattendu ; garde `typeof !== 'string'` avant `.trim()`.
- `services/ContactDirectoryService.ts` (neuf) — `match` (rapprochement pur,
  téléphone > email > pseudo, exclusion des blocages dans les deux sens),
  `sync` (upsert `(ownerId, contactKey)`, mode `merge`/`replace`), `list`,
  `clear`.
- `routes/users/contacts-match.ts` — réécrite sur ces briques ; plus aucun 400
  sur un carnet atypique ou vide ; `processedContacts` dit au client ce qui a
  réellement été traité.
- `routes/users/contacts-directory.ts` (neuf) — `POST /users/me/contacts/sync`,
  `GET /users/me/contacts`, `DELETE /users/me/contacts`.
- Prisma : modèle `UserContact` (+ relations `User`).

- Tests vus ROUGES avant correctifs, verts après.
- Suite gateway + suite web complètes.

## Revue

Les trois correctifs sont livrés. Détail complet et surfaces vérifiées correctes :
`tasks/realtime-sync-audit-2026-07-11.md` § Cycle 17.

### Fichiers touchés

- `services/gateway/src/routes/conversation-preferences.ts` (schéma + branche defaults)
- `packages/shared/types/user-preferences.ts` (`version?: number`)
- `apps/web/services/user-preferences.service.ts` (`transformPreferencesData`)
- `apps/web/stores/conversation-preferences-store.ts` (`applyRemotePreferences`)
- `apps/web/hooks/queries/use-socket-cache-sync.ts` (branche `conversationId`)
- 4 fichiers de tests (+13 tests neufs, 1 suite neuve)
- `CHANGELOG.md`, `tasks/lessons.md` (leçon 249), journal du cycle

### Gates

- 13 tests vus ROUGES avant correctifs, verts après.
- passerelle **711 suites / 17 420 tests** · web **572 suites / 12 251 tests**
  · shared **54 fichiers / 1 542 tests** — tous verts.
- `tsc --noEmit` : passerelle 0 erreur ; web 1229 avant ET après (base
  pré-existante inchangée, rien sur les fichiers touchés).
- iOS hors périmètre : aucun fichier Swift touché, et le correctif D1 lui
  profite sans changement.

### Prochains candidats

- `clear-history` sans client, et le faux succès local d'iOS sur
  `.setClearHistoryBefore` (dimension vie privée le jour où une UI l'appelle).
- `deletedForUserAt` / `clearHistoryBefore` absents du même sérialiseur REST.
- Restes des cycles 14/16 : validation ObjectId de `categoryId`, scope
  communauté de `user:preferences-updated` non routé côté iOS,
  `visibilitychange` → `connect()` côté web.
