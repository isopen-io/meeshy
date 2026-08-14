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

## Vérification

- Suite gateway complète : **714 suites / 17 487 tests verts** (`npx jest`).
- `tsc --noEmit` gateway : propre.
- Nouveaux tests : 27 (`contact-identifiers`), 4 (`normalize-logging`),
  21 (`ContactDirectoryService`), 18 (`contacts-directory` routes),
  15 (`contacts-match` routes, dont 5 neufs sur la tolérance).
- iOS : tests écrits (`PhonebookViewModelTests`, `DiscoverViewModelTests` mis à
  jour, mocks). **Non exécutés** — pas de toolchain Swift/Xcode sur l'hôte de
  ce cycle. `./apps/ios/meeshy.sh test` reste à passer sur une machine macOS.

## Reste ouvert

- `ContactSyncProviding.findFriendsFromContacts()` n'a plus d'appelant côté app
  (le chemin produit passe par `syncDirectory`). Conservé : c'est la façade du
  endpoint `/match`, toujours servi pour les versions déjà déployées.
- Le répertoire n'est pas encore paginé côté client (200 premières entrées).
- Aucune préférence de découvrabilité (« ne pas me retrouver par numéro ») —
  parité avec le comportement d'avant ce cycle, à traiter séparément.
