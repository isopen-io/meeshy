## 2026-11-06 — Une règle qui OBLIGE LES AUTRES FICHIERS n'a personne qui l'énumère (#16558)

`messageProtectionProjection.ts` énonce, dans son propre doc-comment : « **Toute
route qui sert `Message.content` doit ce bloc**, ou dire pourquoi non (#4885
critère 4). » La phrase est juste, datée, motivée par un défaut mesuré — et elle
oblige des fichiers qui ne la contiennent pas.

`GET /mentions/me` sert `Message.content` et ne devait rien : son `select` ne
lisait aucune des quatre familles de protection. Un message à vue unique ou flouté
qui mentionnait quelqu'un lui arrivait en clair, **sans un seul drapeau**, donc ni
voilé ni protégé du transfert — la garde cliente lisant `isViewOnce`, absent de la
réponse.

> **Une règle écrite chez le FOURNISSEUR ne se propage pas à ses CONSOMMATEURS
> POSSIBLES.** Elle vit là où quelqu'un l'a récitée (leçon 307, les promesses
> détachées : quatorze contre-exemples dont deux à cinquante lignes du commentaire
> qui énonçait la règle). La chercher par les appelants de la constante est
> circulaire : par construction, un site fautif ne l'importe pas. **Le relevé juste
> énumère les SERVEURS DE LA DONNÉE** — ici `grep` sur ce qui sert
> `Message.content` — puis confronte cette liste aux importateurs du bloc. Les sept
> conformes se trouvent par la constante ; le huitième ne se trouve que par la
> donnée.

### Corollaire — importer une constante d'un BARREL en tire les dépendances, et ça casse au CHARGEMENT

Le premier jet importait `MESSAGE_PROTECTION_SELECT` depuis `messages-list-query`,
le barrel qui le ré-exporte. Ce module tire `attachmentIncludes`, donc
`Prisma.validator` — et `MentionService.test.ts`, dont le double de
`@meeshy/shared/prisma/client` est PARTIEL, a cessé de se charger :

```
TypeError: Cannot read properties of undefined (reading 'validator')
  at src/services/attachments/attachmentIncludes.ts:74
  at src/routes/conversations/messages-list-query.ts:34
  at src/services/MentionService.ts:16
```

Le symptôme ne ressemble pas à la cause : une suite SANS RAPPORT tombe, à 0 test
exécuté, en nommant un fichier que le lot n'a pas touché. C'est la famille « un
double partiel perd en silence tout ce que le module GAGNE » (cycles 91, 93, 104)
vue depuis l'autre bout : ce n'est pas le double qui a changé, c'est la **chaîne
d'imports du module doublé** qui s'est allongée d'un cran.

> **Importer du module DÉFINISSANT, jamais du barrel**, quand on n'a besoin que
> d'une constante. Le barrel est un relais de commodité ; sa valeur pour le lecteur
> ne vaut pas la surface transitive qu'il ajoute à tout fichier qui le touche. Et
> la question à poser devant une suite qui tombe à 0 test : *qu'est-ce que je viens
> d'ajouter à sa chaîne d'imports ?*

### Et le témoin d'un `select` assert sur la REQUÊTE

Déjà écrit dans `services/gateway/CLAUDE.md` (« un mock Prisma rend ce qu'on lui
dit quel que soit le `select` »), appliqué ici : le lot porte DEUX témoins, un sur
l'argument de `prisma.mention.findMany` et un sur la charge servie à travers
`app.inject`. Ils ne sont pas redondants — le premier seul laisserait la projection
muette, le second seul passerait au vert sur une requête qui ne ramène rien.

Les deux lisent les clés attendues **depuis la constante partagée** : une liste
réécrite dans le témoin dériverait d'elle en silence, et une cinquième famille de
protection ajoutée demain ne ferait tomber personne.

### Note de pilotage — un numéro d'issue se VÉRIFIE après création

Les commentaires de ce lot citaient `#16555`, le numéro attendu au moment de
l'écriture. L'issue a reçu `#16558` : trois autres sessions en avaient créé entre
temps. Sur un dépôt à sessions parallèles, **le numéro n'est connu qu'après la
création** — l'écrire d'avance est une supposition à relire, jamais un acquis.
