// Migration prod : remplace tout storyEffects.mediaObjects[].mediaURL
// commençant par "file://" par le fileUrl CDN du PostMedia correspondant.
// Si le PostMedia est introuvable, on nullify le mediaURL (l'asset reste
// résoluble via postMediaId si le lecteur sait fetch /posts/:id et lire
// data.media[]).

const cursor = db.Post.find({
  type: "STORY",
  "storyEffects.mediaObjects": { $elemMatch: { mediaURL: /^file:\/\//i } }
});

let postsTouched = 0;
let mediaFlipped = 0;
let mediaNullified = 0;
const report = [];

cursor.forEach(post => {
  let dirty = false;
  const newMediaObjects = (post.storyEffects.mediaObjects || []).map(obj => {
    if (!obj.mediaURL || !/^file:\/\//i.test(obj.mediaURL)) return obj;
    let media = null;
    try { media = db.PostMedia.findOne({ _id: ObjectId(obj.postMediaId) }); } catch (e) {}
    if (media && media.fileUrl) {
      dirty = true;
      mediaFlipped++;
      const copy = Object.assign({}, obj);
      copy.mediaURL = media.fileUrl;
      return copy;
    }
    dirty = true;
    mediaNullified++;
    const copy = Object.assign({}, obj);
    copy.mediaURL = null;
    return copy;
  });
  if (dirty) {
    postsTouched++;
    db.Post.updateOne(
      { _id: post._id },
      { $set: { "storyEffects.mediaObjects": newMediaObjects, updatedAt: new Date() } }
    );
    report.push({ postId: post._id.toString(), authorId: post.authorId.toString() });
  }
});

print("=== Migration appliquée ===");
print("postsTouched=" + postsTouched);
print("mediaFlipped (file:// → CDN URL)=" + mediaFlipped);
print("mediaNullified (PostMedia introuvable)=" + mediaNullified);
print("--- liste posts modifiés ---");
report.forEach(r => print(r.postId + " (author=" + r.authorId + ")"));
