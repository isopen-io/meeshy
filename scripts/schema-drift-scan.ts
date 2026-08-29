/**
 * Balayage de DÉRIVE DE TYPAGE (#4243) — « aucune ligne ne porte un type que le
 * schéma ne déclare pas ».
 *
 * ## Pourquoi ce script existe en plus de la sonde
 *
 * La sonde (`services/gateway/src/services/schema-drift.service.ts`) tourne DANS
 * le gateway : elle constate et journalise. Ce script sert les deux gestes
 * qu'elle ne fait pas — MESURER une base qu'on n'a pas encore redéployée, et
 * CORRIGER les lignes trouvées.
 *
 * Il ne réimplémente RIEN : les filtres, les pipelines et le recensement des
 * colonnes viennent de la sonde. Une liste de colonnes écrite ici dériverait au
 * premier `@map` ajouté, et rendrait « 0 dérive » sur une colonne qu'elle ne
 * regarde plus.
 *
 * ## Deux modes, parce que la base n'est pas toujours joignable
 *
 * ```bash
 * # 1) directement, quand DATABASE_URL pointe sur la base (poste de dev, conteneur gateway)
 * npx tsx scripts/schema-drift-scan.ts
 *
 * # 2) via mongosh, quand la base ne se joint que par `docker exec` (intégration, production)
 * npx tsx scripts/schema-drift-scan.ts --mongosh > /tmp/schema-drift.js
 * scp /tmp/schema-drift.js root@meeshy.me:/tmp/ && ssh root@meeshy.me \
 *   'docker cp /tmp/schema-drift.js meeshy-database-staging:/tmp/ && \
 *    docker exec meeshy-database-staging mongosh meeshy --quiet --file /tmp/schema-drift.js'
 * ```
 *
 * `--corriger` (mode mongosh uniquement) retype les valeurs scalaires fautives
 * en chaîne, APRÈS avoir écrit la valeur d'origine dans `_schemaDriftBackup`.
 * Sans sauvegarde préalable, l'écriture ne part pas : une correction qui perd
 * l'original n'est pas une correction, c'est une seconde perte de données.
 * Trois formes ne sont JAMAIS corrigées automatiquement, faute de valeur de
 * remplacement évidente — un `null` sur une colonne requise, un élément de
 * liste, un document embarqué : elles sont listées pour décision humaine.
 */

import {
  colonnesChaineDuSchema,
  commandeDeComptage,
  commandeDeDetail,
  sonderLeTypage,
  type CollectionSondee,
  type ModeleDatamodel,
} from '../services/gateway/src/services/schema-drift.service';

const arguments_ = process.argv.slice(2);
const veutMongosh = arguments_.includes('--mongosh');
const veutCorriger = arguments_.includes('--corriger');
const echantillon = Number(arguments_.find((a) => a.startsWith('--echantillon='))?.split('=')[1] ?? 50);
const maxTimeMS = Number(arguments_.find((a) => a.startsWith('--max-time-ms='))?.split('=')[1] ?? 60_000);

/**
 * Le client généré est atteint par son CHEMIN, pas par son alias de workspace :
 * `@meeshy/shared` n'est lié que sous `services/gateway/node_modules` (bun
 * installe en mode isolé), et un script lancé depuis la racine ne le résout
 * pas. Le chemin, lui, ne dépend pas du gestionnaire de paquets.
 */
const CLIENT_PRISMA = '../packages/shared/prisma/client';

function datamodel(): readonly ModeleDatamodel[] {
  const { Prisma } = require(CLIENT_PRISMA) as {
    Prisma: { dmmf?: { datamodel?: { models?: readonly ModeleDatamodel[] } } };
  };
  const modeles = Prisma?.dmmf?.datamodel?.models ?? [];
  if (modeles.length === 0) {
    throw new Error('datamodel Prisma illisible — lancer `npx prisma generate` dans packages/shared avant ce script');
  }
  return modeles;
}

/**
 * Le programme mongosh est ENTIÈREMENT dérivé : il ne porte que les commandes
 * JSON produites par la sonde, jamais une règle réécrite. Ce qu'il ajoute est
 * uniquement ce que `mongosh` sait faire et que la sonde ne fait pas : lire la
 * valeur d'origine, la sauvegarder, la retyper.
 */
function programmeMongosh(collections: readonly CollectionSondee[]): string {
  const plan = collections.map((collection) => ({
    collection: collection.collection,
    scalaires: collection.colonnes.filter((c) => !c.liste).map((c) => c.colonne),
    comptage: commandeDeComptage(collection, maxTimeMS),
    detail: commandeDeDetail(collection, echantillon, maxTimeMS),
  }));

  return `// Généré par scripts/schema-drift-scan.ts — ne pas éditer à la main (#4243).
const PLAN = ${JSON.stringify(plan)};
const CORRIGER = ${veutCorriger ? 'true' : 'false'};
const SAUVEGARDE = '_schemaDriftBackup';
const horodatage = new Date();
let lignesEnDerive = 0;
let corrigees = 0;
const aDecider = [];
const nonSondees = [];

function typeLisible(v) { return Array.isArray(v) ? 'array<' + v.join('|') + '>' : String(v); }

for (const etape of PLAN) {
  let compte = 0;
  try {
    const r = db.runCommand(etape.comptage);
    compte = (r.cursor.firstBatch[0] || {}).n || 0;
  } catch (e) {
    nonSondees.push(etape.collection + ' : ' + e.message);
    continue;
  }
  if (!compte) continue;
  lignesEnDerive += compte;
  const detail = db.runCommand(etape.detail).cursor.firstBatch;
  for (const doc of detail) {
    for (const colonne of Object.keys(doc.types || {})) {
      const rencontre = typeLisible(doc.types[colonne]);
      if (rencontre === 'string' || rencontre === 'null' || rencontre === 'missing') continue;
      if (rencontre === 'array<>' || rencontre === 'array<string>') continue;
      const scalaire = etape.scalaires.indexOf(colonne) !== -1;
      print('DERIVE ' + etape.collection + '.' + colonne + ' type=' + rencontre + ' _id=' + doc._id);
      if (!CORRIGER) continue;
      if (!scalaire || rencontre === 'null' || rencontre === 'object') {
        aDecider.push(etape.collection + '.' + colonne + ' (' + rencontre + ') _id=' + doc._id);
        continue;
      }
      // Sauvegarde AVANT écriture. Si elle échoue, on ne touche pas la ligne.
      const ligne = db.getCollection(etape.collection).findOne({ _id: doc._id });
      const valeur = ligne[colonne];
      const sauvegarde = db.getCollection(SAUVEGARDE).insertOne({
        issue: 4243, at: horodatage, collection: etape.collection, colonne: colonne,
        cible: doc._id, typeOrigine: rencontre, valeurOrigine: valeur
      });
      if (!sauvegarde.acknowledged) {
        aDecider.push('SAUVEGARDE REFUSEE ' + etape.collection + '.' + colonne + ' _id=' + doc._id);
        continue;
      }
      const ecriture = {};
      ecriture[colonne] = String(valeur);
      db.getCollection(etape.collection).updateOne({ _id: doc._id }, { $set: ecriture });
      corrigees++;
      print('CORRIGEE ' + etape.collection + '.' + colonne + ' -> "' + String(valeur) + '"');
    }
  }
}

print('---');
print('collections sondees : ' + (PLAN.length - nonSondees.length) + '/' + PLAN.length);
print('lignes en derive    : ' + lignesEnDerive);
print('corrigees           : ' + corrigees);
for (const d of aDecider) print('A DECIDER : ' + d);
for (const n of nonSondees) print('NON SONDEE : ' + n);
`;
}

async function principal(): Promise<void> {
  const collections = colonnesChaineDuSchema(datamodel());
  if (veutMongosh) {
    process.stdout.write(programmeMongosh(collections));
    return;
  }
  if (veutCorriger) {
    throw new Error('--corriger n\'existe qu\'en mode --mongosh : la correction se fait là où la base est joignable');
  }
  const { PrismaClient } = require(CLIENT_PRISMA) as { PrismaClient: new () => never };
  const prisma = new PrismaClient() as unknown as {
    $runCommandRaw(c: Record<string, unknown>): Promise<unknown>;
    $disconnect(): Promise<void>;
  };
  try {
    const rapport = await sonderLeTypage(prisma, { echantillon, maxTimeMS });
    process.stdout.write(`${JSON.stringify(rapport, null, 2)}\n`);
    process.exitCode = rapport.lignesEnDerive > 0 || rapport.collectionsNonSondees.length > 0 ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

void principal().catch((erreur: unknown) => {
  process.stderr.write(`${erreur instanceof Error ? erreur.message : String(erreur)}\n`);
  process.exitCode = 1;
});
