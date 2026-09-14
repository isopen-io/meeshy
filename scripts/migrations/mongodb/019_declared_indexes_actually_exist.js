/**
 * Migration 019 : les index DÉCLARÉS au schéma existent enfin en base (#6472)
 *
 * ## Ce que la mesure a établi, et que l'issue n'avait pas vu
 *
 * #6472 attribuait la disparition des paliers anciens au PLAFOND de
 * `/me/engagement` (« 216 »), et proposait deux hypothèses : `tiersOf` qui
 * sous-compterait, ou des paliers hors catalogue. **Les deux sont fausses.**
 *
 * Mesuré sur staging le 2026-09-14 : un compte porte 349 succès pour
 * **21 clés distinctes** — chacune répétée **26 fois**. Or `EngagementMilestone`
 * déclare `@@unique([userId, milestoneType, milestoneKey])`. La contrainte
 * n'est donc PAS appliquée, et la collection le confirme :
 *
 *     db.EngagementMilestone.getIndexes()  →  [ { key: { _id: 1 } } ]
 *
 * Seul `_id_` existe. `graveEtAnnonce` s'appuie sur `P2002` pour son anti-rejeu
 * (« un conflit signifie palier déjà servi : no-op silencieux ») — sans index,
 * ce conflit ne se produit jamais, et chaque balayage regrave tout. Le plafond
 * de 216 est JUSTE ; ce sont les doublons qui poussent les vrais paliers dehors.
 *
 * ## Ce n'est pas une collection, c'est la base
 *
 * Même mesure, même jour : **58 collections sur 75** en staging et **32 sur 102**
 * en production n'ont que `_id_`. Tout `@@unique` du schéma y est décoratif, et
 * tout `@@index` absent transforme chaque lecture en balayage de collection.
 * La production porte déjà **80 clés de paliers en double**.
 *
 * ## Ce que cette migration fait, dans cet ORDRE
 *
 *  1. COMPTE les doublons de `EngagementMilestone` ;
 *  2. les DÉDOUBLONNE en gardant le plus ANCIEN `reachedAt` — c'est la date du
 *     vrai franchissement ; garder le plus récent réécrirait l'histoire de
 *     l'utilisateur ;
 *  3. crée l'index UNIQUE, puis l'index de lecture.
 *
 * L'ordre est contraignant : créer l'unique avant de dédoublonner échoue.
 *
 * ## Usage
 *
 *   mongosh <uri> --file 019_declared_indexes_actually_exist.js         # SIMULATION
 *   mongosh <uri> --eval 'var APPLIQUER=true' --file 019_…js            # écriture
 *
 * Sans `APPLIQUER`, rien n'est écrit ni créé : le script COMPTE et montre des
 * exemples. Les lignes retirées sont sauvegardées dans
 * `EngagementMilestone_backup_019` avant suppression.
 */

const appliquer = typeof APPLIQUER !== 'undefined' && APPLIQUER === true;
const base = db.getSiblingDB('meeshy');

function dire(titre, valeur) {
  print(`\n=== ${titre} ===`);
  printjson(valeur);
}

// --- 1. L'ÉTAT -------------------------------------------------------------

const indexPresents = base.EngagementMilestone.getIndexes().map((i) => i.name);
dire('index présents sur EngagementMilestone', indexPresents);

const groupes = base.EngagementMilestone.aggregate([
  { $group: { _id: { u: '$userId', t: '$milestoneType', k: '$milestoneKey' }, n: { $sum: 1 }, ids: { $push: '$_id' } } },
  { $match: { n: { $gt: 1 } } },
]).toArray();

const lignesEnTrop = groupes.reduce((total, g) => total + (g.n - 1), 0);
dire('doublons', {
  clesDupliquees: groupes.length,
  lignesEnTrop,
  exemples: groupes.slice(0, 3).map((g) => ({ cle: g._id.k, occurrences: g.n })),
});

// --- 2. LE DÉDOUBLONNAGE ---------------------------------------------------

if (!appliquer) {
  print('\n[SIMULATION] rien n’a été écrit. Relancer avec --eval \'var APPLIQUER=true\' pour appliquer.');
} else if (groupes.length === 0) {
  print('\nAucun doublon — rien à retirer.');
} else {
  let retirees = 0;
  groupes.forEach(function (g) {
    // Le plus ANCIEN `reachedAt` est la date du vrai franchissement : c'est
    // celui qu'on garde. Les autres sont des regravages de balayage.
    const lignes = base.EngagementMilestone.find({ _id: { $in: g.ids } })
      .sort({ reachedAt: 1 })
      .toArray();
    const aRetirer = lignes.slice(1).map((l) => l._id);
    if (aRetirer.length === 0) return;
    base.EngagementMilestone_backup_019.insertMany(lignes.slice(1));
    retirees += base.EngagementMilestone.deleteMany({ _id: { $in: aRetirer } }).deletedCount;
  });
  dire('lignes retirées', { retirees, sauvegardeesDans: 'EngagementMilestone_backup_019' });
}

// --- 3. LES INDEX ----------------------------------------------------------

if (appliquer) {
  base.EngagementMilestone.createIndex(
    { userId: 1, milestoneType: 1, milestoneKey: 1 },
    { unique: true, name: 'EngagementMilestone_userId_milestoneType_milestoneKey_key' },
  );
  base.EngagementMilestone.createIndex(
    { userId: 1, milestoneType: 1 },
    { name: 'EngagementMilestone_userId_milestoneType_idx' },
  );
  dire('index après création', base.EngagementMilestone.getIndexes().map((i) => i.name));
} else {
  dire('index qui SERAIENT créés', [
    'EngagementMilestone_userId_milestoneType_milestoneKey_key (unique)',
    'EngagementMilestone_userId_milestoneType_idx',
  ]);
}

// --- 4. LE RESTE DE LA BASE ------------------------------------------------

const sansIndex = base
  .getCollectionNames()
  .filter((c) => base.getCollection(c).getIndexes().length <= 1);
dire('collections n’ayant QUE _id_ — la dette au-delà de cette migration', {
  nombre: sansIndex.length,
  total: base.getCollectionNames().length,
  exemples: sansIndex.slice(0, 10),
});
print('\nCette migration ne traite QUE EngagementMilestone. Le reste relève de `prisma db push`, et d’une décision.');
