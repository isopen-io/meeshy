// Recense les posts STORY ayant un storyEffects.mediaObjects[].mediaURL
// commençant par "file://" (path local d'auteur fuité). Ne modifie rien.
// Pour chaque mediaObject pollué, lookup le PostMedia correspondant et
// affiche l'URL CDN qui devrait remplacer le file:// local.

const pollutedPosts = db.Post.find({
  type: "STORY",
  "storyEffects.mediaObjects": { $elemMatch: { mediaURL: /^file:\/\//i } }
}).toArray();

print("=== posts impactés: " + pollutedPosts.length + " ===");

let fixableCount = 0;
let unfixableCount = 0;
const samples = [];

for (const post of pollutedPosts) {
  const dirty = (post.storyEffects && post.storyEffects.mediaObjects || [])
    .filter(o => o.mediaURL && /^file:\/\//i.test(o.mediaURL));
  for (const obj of dirty) {
    let media = null;
    try {
      media = db.PostMedia.findOne({ _id: ObjectId(obj.postMediaId) });
    } catch (e) {
      // ObjectId invalide
    }
    if (media && media.fileUrl) {
      fixableCount++;
    } else {
      unfixableCount++;
    }
    if (samples.length < 10) {
      samples.push({
        postId: post._id.toString(),
        authorId: post.authorId ? post.authorId.toString() : null,
        createdAt: post.createdAt,
        mediaObjectId: obj.id,
        postMediaId: obj.postMediaId,
        localMediaURL: obj.mediaURL.substring(0, 100),
        cdnFileUrl: media ? media.fileUrl : "<<PostMedia introuvable>>"
      });
    }
  }
}

print("=== mediaObjects fixables (PostMedia trouvé): " + fixableCount + " ===");
print("=== mediaObjects NON fixables (PostMedia manquant → nullify): " + unfixableCount + " ===");
print("=== échantillon (max 10) ===");
printjson(samples);
