# Cycle 26 — Réparer les liens déjà écrits, et rendre les réparateurs exécutables

Tête laissée par le cycle 25 :
« **Les `TrackingLink` déjà écrits portent des `Participant.id` dans `createdBy`.** Le correctif ne
vaut que pour les liens à venir ; les anciens restent invisibles pour leur auteur. Un script de
réparation est à écrire, sur le modèle de `repair-mention-user-ids.ts` — qui lui-même **n'a jamais
été exécuté**. »

Les deux moitiés de cette phrase se sont révélées liées : en écrivant le nouveau script, on
découvre pourquoi l'ancien n'a jamais tourné.

## D1 — `repair-tracking-link-created-by.ts`

Même forme que son aîné : classification par appartenance à `Participant` (les deux espaces d'ids
sont disjoints, donc le classement est déterministe et le script idempotent), résolution des
participants **par lots** de 500, et surtout **aucune écriture sans `--apply`** — un `--dry-run`
oublié sur un script qui écrit par défaut est irréversible ; l'inverse ne coûte qu'un second
lancement.

Une décision le sépare franchement de son aîné : **il ne supprime jamais rien.**

`repair-mention-user-ids.ts` supprime la ligne redondante quand une réécriture entre en collision
avec l'unicité — une ligne `Mention` en double ne porte aucune information que l'autre n'ait pas.
Un `TrackingLink`, si : son `token` **est une URL publique** (`/l/<token>`) possiblement déjà
partagée, et `TrackingLinkClick` référence la ligne. La détruire casserait un lien vivant et
perdrait son historique de clics. Une collision sur l'unicité applicative `(targetId, createdBy)`
est donc **signalée et la ligne laissée intacte** : un lien mal attribué reste préférable à un lien
mort.

Même retenue pour un participant **anonyme** (aucun `userId`) : remettre `createdBy` à `null` serait
plus fidèle au schéma, mais détruirait la seule trace de provenance que la ligne porte, pour un gain
nul — aucun `User.id` ne pouvant égaler un `Participant.id`, le lien est déjà sans propriétaire
effectif.

L'unicité `(targetId, createdBy)` n'est relevée que pour les liens à **cible interne** : l'index qui
la porte est PARTIEL (cf. `schema.prisma`), et les liens `EXTERNAL` — ceux que produit précisément
le chemin défectueux — ont `targetId: null`.

## D2 — aucun des deux scripts ne pouvait s'exécuter

```
$ npx tsx scripts/migrations/repair-mention-user-ids.ts
Error: Cannot find module 'mongodb'
```

`mongodb` est déclaré par `services/gateway`, pas par la racine. La résolution CommonJS remonte
depuis le FICHIER, pas depuis le répertoire courant : `scripts/migrations/` → `scripts/node_modules`
→ `node_modules` racine → introuvable. Aucun `cd` ne rattrape ça. Les deux scripts de réparation
échouaient donc à la première ligne, quel que soit l'environnement — ce qui explique sans mystère
pourquoi `repair-mention-user-ids.ts` « n'a jamais été exécuté ».

`mongodb: ^7.5.0` (la version que gateway déclare déjà, donc aucune empreinte nouvelle dans le
graphe) est ajouté aux devDependencies de la racine. Les deux scripts atteignent désormais leur
garde :

```
$ npx tsx scripts/migrations/repair-tracking-link-created-by.ts
No MongoDB URL found. Set MONGODB_URL or DATABASE_URL in .env
$ npx tsx scripts/migrations/repair-mention-user-ids.ts
No MongoDB URL found. Set MONGODB_URL or DATABASE_URL in .env
```

C'est exactement le comportement attendu sans base : le module se charge, le script démarre, et
s'arrête sur l'absence d'URL.

`bun.lock` est mis à jour (7 lignes : la dépendance, plus deux versions de workspace que le fichier
portait périmées). **`pnpm-lock.yaml` est laissé tel quel** : la CI installe pnpm avec
`--no-frozen-lockfile`, et régénérer ce fichier ici produirait un diff massif sans rapport avec le
changement, propice aux conflits avec les autres branches.

## Vérification

Aucun code de service n'est touché — le cycle livre un outil d'exploitation et une déclaration de
dépendance. Les deux scripts se chargent et s'arrêtent proprement sur l'absence d'URL ; le typecheck
gateway reste propre.

**Ce script n'a pas de test unitaire**, comme son aîné : sa logique n'existe qu'en présence d'un
MongoDB, et cette routine n'a aucun accès base. C'est un choix assumé, pas un oubli — la garde qui
en tient lieu est le refus d'écrire sans `--apply`, doublé d'un rapport de comptage à relire avant
de l'accorder.

## Reste ouvert après ce cycle

- **Les deux réparations attendent une exécution avec accès base.** À lancer SANS `--apply`
  d'abord, sur `MONGODB_URL`, et à relire : `Rewritten to User.id` donne l'ampleur, `Collisions` et
  `Anonymous` les cas laissés intacts. **Tête du prochain cycle si un accès base devient
  disponible ; sinon, c'est une action humaine.**
- **Le domaine social extrait encore avec `extractMentions`.** `routes/posts/core.ts` (création ET
  édition de post) et `routes/posts/comments.ts` : un `@John Doe` dans un post ou un commentaire ne
  nomme personne. **Tête du prochain cycle à défaut d'accès base** — cadrage affiné dans
  l'addendum ci-dessous : c'est un chantier de contrat multi-surface, pas un correctif gateway.
- **`getMentionsForMessage` et `getRecentMentionsForUser` n'ont aucun consommateur d'écran** —
  l'inbox `/mentions` reste une capacité backend sans écran.
- **`MeeshySocketIOManager.getConversationParticipantsForMention` est toujours un deuxième
  exemplaire du chargeur de participants** (cycle 21, inchangé).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
- **La suppression de la branche distante échoue depuis cette routine** : `git push --delete`
  répond « Everything up-to-date » sans agir (réessayé 4 fois). Les branches mergées des cycles
  s'accumulent côté remote — à supprimer depuis l'interface GitHub.

---

# Cycle 25b — Addendum d'une session parallèle

Deux sessions ont livré le cycle 25 en parallèle. Le refactor des liens ci-dessus (PR #2650) est
**strictement meilleur** : il a trouvé, en réunissant les deux copies, que `createdBy` recevait un
`Participant.id` là où la route `/tracking-links` attend un `User.id` pour AUTORISER l'accès. La
seconde session s'aligne dessus et n'apporte que ce qui manquait — appliqué par-dessus, pas à la
place. (Leçon d'intégration du cycle 23 : comparer défaut par défaut, jamais « qui est arrivé en
premier ».)

## Champ mort retiré — `MentionCreatedEventData.mentionedParticipantId`

Porté par le backlog depuis le cycle 24, vérifié et retiré. Les **trois** émetteurs de
`mention:created` — envoi WS (`MessageHandler`), envoi REST/ZMQ (`MeeshySocketIOManager`), édition
(`emitMentionCreated`) — l'omettent : il n'a jamais circulé sur le fil. Le SDK iOS le décodait dans
`MentionCreatedEvent`, et rien ne lisait la propriété.

Le test de décodage SDK garde la clé dans le JSON **et lui en ajoute une inconnue** : ce qui compte
désormais n'est plus la valeur du champ mais le fait qu'une clé inconnue ne casse pas le décodage —
donc qu'aucun client ne souffre d'une gateway qui l'enverrait encore.

À ne pas confondre avec la colonne physique `Mention.mentionedParticipantId` (Prisma/Mongo), bien
vivante et utilisée par les scripts de migration.

## Écarté après enquête — `getLatestMessageSummary` n'est pas un défaut

Le backlog le portait depuis le cycle 19 : « résume le DERNIER message de la conversation, pas
celui qu'on vient d'acquitter ». **Ce n'en est pas un, et le "corriger" serait une régression.**

iOS applique le `summary` via `bufferBatchDelivery(conversationId:event:)` — un lot au niveau
**conversation**, jamais par message (`ConversationSocketHandler.swift:801`). Le contrat client est
donc « état de livraison de la conversation, ancré sur son dernier message », ce que la méthode
calcule exactement.

Si le serveur résumait le message ACQUITTÉ, lire un vieux message #5 produirait un résumé « lu »
que le client appliquerait **en lot à tous les messages**, y compris #7 non lu. Passer au
par-message demanderait de plumber des reçus par message des deux côtés client : chantier de
contrat, pas correctif. Retiré du backlog comme défaut.

## Nuance sur le domaine social

`extractMentions` utilise bien la SSOT (`NAME_BOUNDARY_LEFT` + `MENTION_HANDLE_CHARS`) : la garde
e-mail (`john@example.com` ne nomme pas `example`) et le tiret sont couverts. Le seul manque réel
est le **display name à espaces** (`@John Doe`), qui exige un jeu de candidats — or un post n'a pas
de liste de participants et `CreatePostSchema` ne porte aucun champ de mentions. Le combler
demande que le composeur (web ET iOS) envoie les `userId` choisis à l'autocomplete :
**chantier de contrat multi-surface, pas un correctif gateway.**
