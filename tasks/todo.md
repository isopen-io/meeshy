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
  nomme personne. **Tête du prochain cycle à défaut d'accès base.**
- **`MentionCreatedEventData.mentionedParticipantId` reste dans les types partagés** et n'est peuplé
  par aucun émetteur ; le SDK iOS le décode. Champ mort des deux côtés.
- **`getMentionsForMessage` et `getRecentMentionsForUser` n'ont aucun consommateur d'écran** —
  l'inbox `/mentions` reste une capacité backend sans écran.
- **`MeeshySocketIOManager.getConversationParticipantsForMention` est toujours un deuxième
  exemplaire du chargeur de participants** (cycle 21, inchangé).
- **`getLatestMessageSummary` résume le DERNIER message de la conversation, pas celui qu'on vient
  d'acquitter** (cycle 19, inchangé).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
- **La suppression de la branche distante échoue depuis cette routine** : `git push --delete`
  répond « Everything up-to-date » sans agir (réessayé 4 fois). Les branches mergées des cycles
  s'accumulent côté remote — à supprimer depuis l'interface GitHub.
