// Reclasse les POST existants en REEL selon leur contenu média.
//
// Critère REEL (produit 2026-06-13) : vidéo OU audio (seul/avec photo) OU
// >= 2 photos. Restent POST : texte seul, document seul, ou UNE seule photo.
// Ne touche que type=POST non supprimés ; STORY/STATUS/REEL intacts.
//
// Mode via variable d'env APPLY :
//   docker exec -e APPLY=false meeshy-database mongosh meeshy --quiet --file /tmp/reel.js   (dry-run)
//   docker exec -e APPLY=true  meeshy-database mongosh meeshy --quiet --file /tmp/reel.js   (écrit)

const APPLY = (typeof process !== 'undefined' && process.env && process.env.APPLY === 'true');
print('Mode : ' + (APPLY ? '🔴 APPLY (écriture)' : '🟢 DRY-RUN (lecture seule)'));

function kindCount(field, prefix) {
  return {
    $size: {
      $filter: {
        input: '$media',
        as: 'm',
        cond: { $regexMatch: { input: { $toLower: { $ifNull: ['$$m.mimeType', ''] } }, regex: prefix } }
      }
    }
  };
}

const pipeline = [
  { $match: { type: 'POST', deletedAt: null } },
  { $lookup: { from: 'PostMedia', localField: '_id', foreignField: 'postId', as: 'media' } },
  { $project: {
      v: kindCount('media', '^video/'),
      a: kindCount('media', '^audio/'),
      i: kindCount('media', '^image/'),
      n: { $size: '$media' }
  } }
];

const rows = db.Post.aggregate(pipeline).toArray();

let video = 0, audioOnly = 0, audioPhoto = 0, multiPhoto = 0, single = 0, doc = 0, text = 0;
const ids = [];
for (const r of rows) {
  if (r.v > 0) { video++; ids.push(r._id); }
  else if (r.a > 0) { (r.i > 0 ? audioPhoto++ : audioOnly++); ids.push(r._id); }
  else if (r.i >= 2) { multiPhoto++; ids.push(r._id); }
  else if (r.i === 1) { single++; }
  else if (r.n > 0) { doc++; }
  else { text++; }
}

print('Posts type=POST (non supprimés) examinés : ' + rows.length);
print('→ REEL : ' + ids.length + '  (vidéo=' + video + ', audio=' + audioOnly + ', audio+photo=' + audioPhoto + ', multi-photo=' + multiPhoto + ')');
print('  restent POST : 1-photo=' + single + ', document=' + doc + ', texte=' + text);

if (APPLY) {
  if (ids.length === 0) {
    print('Rien à appliquer.');
  } else {
    const res = db.Post.updateMany({ _id: { $in: ids } }, { $set: { type: 'REEL', updatedAt: new Date() } });
    print('✅ Reclassés POST → REEL : ' + res.modifiedCount);
    print('Vérif — REEL : ' + db.Post.countDocuments({ type: 'REEL', deletedAt: null }) +
          ' | POST restants : ' + db.Post.countDocuments({ type: 'POST', deletedAt: null }));
  }
} else {
  print('🟢 DRY-RUN — aucune écriture. Relancer avec APPLY=true pour appliquer.');
}
