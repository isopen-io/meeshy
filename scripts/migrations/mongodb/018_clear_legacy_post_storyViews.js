/**
 * Migration 018 : vider `Post.storyViews` hérité (#4791)
 *
 * ## Pourquoi
 *
 * `GET /posts/:id/views` réserve la liste des spectateurs d'une story à son
 * auteur (403 pour tout autre lecteur, `routes/posts/interactions.ts`). Avant
 * ce lot, `postInclude` était un `Prisma.PostInclude` — et Prisma renvoie TOUS
 * les scalaires d'un modèle sous `include`, donc `Post.storyViews` (la même
 * donnée, embarquée) partait vers CHAQUE lecteur autorisé à voir le post :
 * fil, recherche par hashtag, à proximité, reposts, aperçu de commentaires —
 * partout où `postInclude` sert un post. `postInclude` est désormais un
 * `Prisma.PostSelect` qui omet `storyViews` explicitement
 * (`services/gateway/src/services/posts/postIncludes.ts`) — la fuite est
 * fermée pour toute lecture FUTURE.
 *
 * Cette migration traite le passé : les documents Post qui portent encore un
 * `storyViews` non vide (écrit avant que les vues ne migrent vers la table
 * `PostView` dédiée). Sans elle, la donnée reste en base et le prochain
 * `select`/`include` qui la nomme la ressort.
 *
 * ## Ce que cette migration fait, et ne fait pas
 *
 * Elle ne retire PAS le champ (`schema.prisma` le déclare toujours, avec sa
 * valeur par défaut `[]`, et `PostService` continue de le remettre à `[]` à
 * la republication d'une story — voir `republishStory`). Elle VIDE son
 * contenu hérité par un `$set: { storyViews: [] }`, jamais un `$unset` :
 * la colonne reste une liste vide déclarée, cohérente avec tout nouveau post.
 *
 * SANS RISQUE et IDEMPOTENTE : un document déjà à `[]` n'est pas touché
 * (le filtre exclut `$ne: []`), et rejouer ne change plus rien.
 *
 * ## Usage
 *
 *   mongosh <uri> --file 018_clear_legacy_post_storyViews.js                 # SIMULATION
 *   mongosh <uri> --eval 'var APPLIQUER=true' --file 018_…js                 # écriture
 *
 * Sans `APPLIQUER`, rien n'est écrit : le script COMPTE les documents Post
 * portant encore un `storyViews` non vide — le chiffre à consigner dans le
 * commentaire de clôture de #4791 (critère de fin, point 1).
 */

const APPLIQUER_ECRITURE = typeof APPLIQUER !== 'undefined' && APPLIQUER === true;

print('=== Migration 018 : vidage de Post.storyViews hérité (#4791) ===');
print('');
print(APPLIQUER_ECRITURE ? 'Mode : ÉCRITURE' : 'Mode : SIMULATION (rien ne sera écrit)');
print('');

const collection = db.getCollection('Post');

const filtreNonVide = { storyViews: { $exists: true, $ne: [] } };

const portantEncoreDesVues = collection.countDocuments(filtreNonVide);
const totalPosts = collection.countDocuments({});

print(`Documents Post au total                       : ${totalPosts}`);
print(`… dont storyViews non vide (à purger)          : ${portantEncoreDesVues}`);
print('');

if (portantEncoreDesVues === 0) {
  print('Rien à purger — aucun document ne porte de storyViews hérité non vide.');
  print('');
  print('=== Migration 018 terminée (rien à faire) ===');
  quit(0);
}

collection
  .find(filtreNonVide, { authorId: 1, type: 1, storyViews: 1 })
  .limit(10)
  .forEach((doc) => {
    const n = Array.isArray(doc.storyViews) ? doc.storyViews.length : 'non-array';
    print(`  _id=${doc._id} authorId=${doc.authorId} type=${doc.type} storyViews.length=${n}`);
  });
print('');

if (!APPLIQUER_ECRITURE) {
  print("Simulation terminée — rien n'a été écrit. Relancer avec APPLIQUER=true pour purger.");
  print('');
  print('=== Migration 018 terminée (simulation) ===');
} else {
  const resultat = collection.updateMany(filtreNonVide, { $set: { storyViews: [] } });
  print(`Purge appliquée sur ${resultat.modifiedCount} document(s).`);
  const reste = collection.countDocuments(filtreNonVide);
  print(`Documents portant encore un storyViews non vide : ${reste} ${reste === 0 ? '(OK)' : '(INATTENDU)'}`);
  print('');
  print('=== Migration 018 terminée ===');
}
