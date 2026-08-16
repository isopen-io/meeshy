# Cycle 48 — la remise à zéro : muette pour les autres appareils, fatale pour le compte neuf

Reprise des trois pistes nommées par le cycle 47. Deux se sont révélées être
**la même route vue sous deux angles**, et l'enquête pour les corriger a mis au
jour un quatrième site de résolution Socket.IO.

## 1. Ce que le cycle 47 laissait ouvert

1. `DELETE /me/preferences/:category` n'émet aucun `preferences:updated`.
2. Supprimer `services/preferences/PreferencesService.ts`, orphelin.
3. Verrouiller `allowAnonymous: false` par un témoin.

## 2. Défaut A — la remise à zéro ne se diffuse pas

`PUT` et `PATCH` appellent `emitPreferencesUpdated`. Les DEUX `DELETE` —
celui d'une catégorie (`preference-router-factory.ts`) et le global
(`routes/me/preferences/index.ts`) — ne l'appellent pas.

Le consommateur existe et il est bien branché : `use-socket-cache-sync.ts`
invalide `queryKeys.preferences.category(data.category)` sur réception. Or
`usePreferences()` pose `staleTime: Infinity` — sans invalidation, la valeur
lue reste celle d'avant la remise à zéro.

Portée : le scope catégorie n'est consommé QUE par le web. iOS route
`user:preferences-updated` sur deux publishers selon la présence de
`conversationId`, et son handler de scope catégorie sort immédiatement
(`guard let convId = event.conversationId else { return }`) — la remise à zéro
d'une catégorie n'y a jamais eu d'effet temps réel, avant comme après.

## 3. Défaut B — la remise à zéro échoue pour qui est déjà aux valeurs par défaut

Les deux `DELETE` appellent `prisma.userPreferences.update({ where: { userId } })`.
Rien ne crée la ligne `UserPreferences` à l'inscription : ses SEULS créateurs
sont les `upsert` de `PUT`/`PATCH`. Un utilisateur qui n'a jamais écrit de
préférence n'a pas de ligne — `update` lève `P2025`, attrapé, rendu en **500**.

« Remettre à zéro » échoue donc exactement pour celui qui EST déjà à zéro.

Invisible parce que les doubles de test posent
`update: jest.fn().mockResolvedValue({})` — la ligne existe toujours dans le
test. Quatrième cycle consécutif où un double ne modélise qu'un seul état du
rangement.

## 4. Défaut C — un quatrième site de résolution Socket.IO

`utils/socket-broadcast.ts` est le point unique déclaré, et il connaît deux
formes : `socketIOHandler.getManager().io` et `socketIOHandler.io`. Le facteur
de préférences en réimplémente une troisième, `getManager().getIO()`.

Les deux marchent aujourd'hui, mais pas pour la même raison : `getIO()` est
l'accesseur **public** du manager, tandis que `manager.io` est un champ
**privé** (`MeeshySocketIOManager:146`) que seul l'effacement des types à
l'exécution rend lisible. Renommer ce champ privé — un geste interne, sans
appelant TypeScript à casser — dégraderait silencieusement `broadcastToUser`
en `warn` + no-op pour TOUS ses appelants, dont la synchronisation temps réel
pin/mute/archive (`conversationPreferencesSync.ts`).

## 5. Correctifs

- [x] `resolveSocketIO` consulte d'abord l'accesseur PUBLIC `getManager().getIO()`
- [x] Le facteur cesse de réimplémenter : `broadcastToUser` pour les 4 verbes
- [x] `services/preferences/preferences-broadcast.ts` — la règle « qui apprend
      quoi » descend à côté du résolveur et du cache de la même donnée
- [x] Les deux `DELETE` diffusent, comme `PUT`/`PATCH` ; le global émet une fois
      par catégorie (contrat client déjà per-catégorie, aucun changement client)
- [x] Les deux `DELETE` passent à `updateMany` : pas de ligne → `count: 0`,
      pas d'exception, et aucune ligne vide créée pour rien
- [x] `services/preferences/PreferencesService.ts` supprimé (dette 46+47)
- [x] Témoin verrouillant `allowAnonymous: false` (dette 46+47)

## 6. Vérifié plutôt que supposé

L'hypothèse de départ sur le défaut B était que `data: { [category]: null }`
était lui-même rejeté par Prisma sur un champ `Json?` — le folklore
`Prisma.DbNull`. Sondé contre un client Prisma 6.19.3 généré sur ce schéma :

| Forme | Résultat |
|---|---|
| `update({ data: { privacy: null } })` | **valide** (n'échoue qu'à la connexion) |
| `update({ data: { privacy: Prisma.DbNull } })` | **`PrismaClientValidationError`** |
| `updateMany({ data: { [c]: null } })` | **valide** |

C'est l'inverse du folklore : sur MongoDB, l'input généré est
`JsonNullValueInput` et `DbNull` n'en fait pas partie. Le `null` brut en place
est correct et le reste ; seul le choix `update` → `updateMany` change.

## 7. Le double qui rendait vert un chemin rouge

Deux témoins écrits pour « compte sans ligne » sont passés DU PREMIER COUP,
contre un défaut bien présent : `update: jest.fn().mockResolvedValue({})` — la
ligne existait toujours en test. Le double a été rendu honnête (`rowExists`
pilote les DEUX verbes : `update` lève `P2025`, `updateMany` rend `{ count: 0 }`)
et les deux témoins sont alors passés au rouge, en 500, confirmant le défaut.

De même, `utils/socket-broadcast` était doublé dans la suite des routes de
préférences : toute diffusion y devenait invisible, « ce verbe émet » y étant
indiscernable de « ce verbe n'émet pas ». Le double est retiré et les émissions
sont observées au bout de la chaîne, sur une couche Socket.IO factice.

## 8. Écarté délibérément

**Un seul événement « toutes catégories » pour la remise à zéro globale.** Le
client ne discrimine que sur `conversationId`, `communityId` et `category` : un
événement sans `category` ne tomberait dans aucune branche et serait perdu en
silence. Sept émissions sur une action rare valent mieux qu'une émission inerte.

**`upsert` au lieu de `updateMany`.** Aligné sur `PUT`/`PATCH`, mais il CRÉE une
ligne pour dire qu'il n'y a rien à stocker — une ligne par compte qui touche
« réinitialiser » sans avoir jamais rien réglé.

**Attraper `P2025` et rendre 200.** Reconnaître une erreur à son code pour la
déclarer normale, là où `updateMany` exprime directement l'intention.

**Faire consommer le scope catégorie par iOS.** Son handler sort sur
`guard let convId = event.conversationId else { return }`. Lui faire invalider
un cache de préférences est un vrai sujet — mais c'est une tranche iOS, avec ses
propres témoins, pas un ajout en marge d'un correctif gateway.

## 9. Gates

- [x] 13 témoins discriminants vus ROUGES avant correctif
- [x] Gardes : une remise à zéro qui ÉCHOUE ne diffuse pas (les deux routes) ;
      la remise à zéro d'une catégorie ne touche que la sienne ; aucune ligne
      créée pour un compte qui n'en a pas
- [x] `bunx tsc --noEmit` gateway : 0
- [x] Suite gateway complète verte — 729 suites / 17 812 témoins
- [x] CHANGELOG + ADR `services/gateway/decisions.md` + leçon 205

## 10. Le même motif ailleurs — cherché, rien trouvé

Le défaut B est un motif, pas un accident : `update({ where: { userId } })` sur
une table dont rien ne garantit la ligne. Balayage de tout `services/gateway/src`
(hors tests) pour cette forme — **deux** autres sites, tous deux
`signalPreKeyBundle.update` dans `SignalKeyManager`. Vérifiés : l'étape 1 de
`initialize()` fait l'`upsert` du bundle avant que les étapes 2 et 3 ne
l'`update`, et les deux sites sont sous cette séquence. **Pas de défaut ici** —
noté pour que le prochain cycle n'ait pas à refaire le balayage.

## 11. Pistes pour le cycle 49 — repérées, NON livrées

1. **`resolveSocketIO` lit encore un champ privé en repli.** Le repli
   `manager.io` n'existe plus que pour les doubles qui modèlent le manager
   ainsi. Les migrer vers `getIO()` permettrait de retirer la branche — et avec
   elle la dernière dépendance à l'effacement des modificateurs TypeScript.
2. **iOS ne consomme pas le scope catégorie de `user:preferences-updated`.**
   Un réglage changé sur le web n'atteint pas l'app avant son prochain fetch.
3. **Les deux `GET` ne passent pas par le résolveur du cycle 46.** `GET /me/preferences`
   comme `GET /me/preferences/privacy` lisent `prefs?.privacy || DEFAULTS` en
   direct, sans le repli vers le rangement clé/valeur hérité que
   `loadStoredPrivacyPreferences` applique pour les utilisateurs SANS document.
   Les deux écrans s'accordent donc entre eux — et contredisent les portes de
   diffusion : un opt-out posé pendant la fenêtre de janvier est honoré par le
   serveur (le résolveur le lit) mais invisible à l'écran, qui affiche le défaut
   `true`. C'est la symétrie exacte du cycle 46, dans l'autre sens : là l'écran
   disait vrai et le serveur ignorait ; ici le serveur honore et l'écran ignore.
   Population bornée (six jours de janvier, aucun document écrit depuis), ce qui
   justifie de la traiter comme une tranche à part plutôt qu'en marge.
