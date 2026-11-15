/**
 * Migration MongoDB — World Wide reçoit son avatar et sa bannière (#10204).
 *
 * L'application web sert les deux images à des chemins FIXES :
 *   /brand/world-wide/avatar.png   et   /brand/world-wide/banner.png
 * et la conversation les porte en adresses ABSOLUES (un client natif ne connaît
 * pas l'origine du site). Le seed (`services/gateway/src/services/world/
 * worldBranding.ts`) les pose sur une base qu'il sème ; ce script les pose UNE
 * fois sur une base déjà semée, sans attendre un démarrage `WORLD_SEED_ENABLED`.
 *
 *   Conversation `world`, `avatar` absent, null ou vide  ⇒  `$set avatar: <origine>/brand/world-wide/avatar.png`
 *   Conversation `world`, `banner` absent, null ou vide  ⇒  `$set banner: <origine>/brand/world-wide/banner.png`
 *
 * Une image déjà posée (à la main, par un administrateur) n'est JAMAIS
 * remplacée. Rien d'autre n'est lu ni écrit : aucune autre conversation, aucun
 * autre champ, aucune suppression.
 *
 * L'origine est OBLIGATOIRE (`APP_ORIGIN`) : le conteneur de la base ne connaît
 * pas `FRONTEND_URL`, et une origine devinée poserait l'image d'un environnement
 * sur l'autre. Sans origine valide (https, ou http://localhost), le script
 * n'écrit RIEN et le dit.
 *
 * Régime (celui de #9035, jamais `prisma db push`) :
 * - À BLANC par défaut : dit ce qui serait posé, n'écrit rien. `APPLY=1` écrit.
 * - Idempotent : une seconde exécution n'a plus rien à poser (attendu : 0).
 * - Compteurs passés par `Number()` (pas de concaténation d'un `Long`).
 *
 * Exécution — staging d'abord, production ensuite (feu vert porteur pour la
 * production). La base est AUTHENTIFIÉE : chaque commande passe le compte
 * d'écriture (`ops`, mot de passe par l'environnement de l'hôte, jamais en
 * clair dans un historique). Depuis la racine du dépôt :
 *
 *   F=packages/shared/prisma/migrations/2026-10-11-world-wide-avatar-banner.mongodb.js
 *   B=/opt/meeshy/backups/2026-10-11-world-wide-avatar-banner
 *   A='-u ops -p "${MONGO_OPS_PASSWORD:?MONGO_OPS_PASSWORD absente sur l hote}" --authenticationDatabase admin'
 *   # ${…:?} fait ÉCHOUER la commande distante si la variable manque : sans lui,
 *   # mongosh demanderait le mot de passe sur stdin — qui est ce script.
 *
 *   # 0. Les deux images répondent 200 sur l'origine visée (sinon : ne pas appliquer)
 *   curl -fsSI https://staging.meeshy.me/brand/world-wide/avatar.png && curl -fsSI https://staging.meeshy.me/brand/world-wide/banner.png
 *
 *   # 1. Sauvegarde VÉRIFIÉE (l'archive doit compter autant de documents que la collection)
 *   ssh root@meeshy.me "mkdir -p $B && docker exec meeshy-database-staging mongodump $A --db meeshy --collection Conversation --archive --gzip > $B/staging-Conversation.archive.gz"
 *   ssh root@meeshy.me "docker exec -i meeshy-database-staging mongorestore $A --dryRun --archive --gzip --nsInclude meeshy.Conversation -v < $B/staging-Conversation.archive.gz 2>&1 | grep -i 'document'"
 *   ssh root@meeshy.me "docker exec meeshy-database-staging mongosh $A meeshy --quiet --eval 'db.Conversation.countDocuments()'"
 *
 *   # 2. À blanc, écriture, contrôle (attendu : 0 à poser)
 *   ssh root@meeshy.me "docker exec -i -e APP_ORIGIN=https://staging.meeshy.me meeshy-database-staging mongosh $A meeshy --quiet" < $F
 *   ssh root@meeshy.me "docker exec -i -e APP_ORIGIN=https://staging.meeshy.me -e APPLY=1 meeshy-database-staging mongosh $A meeshy --quiet" < $F
 *   ssh root@meeshy.me "docker exec -i -e APP_ORIGIN=https://staging.meeshy.me meeshy-database-staging mongosh $A meeshy --quiet" < $F
 *
 *   # production : mêmes étapes avec le conteneur `meeshy-database`, les
 *   # sauvegardes `production-…` et APP_ORIGIN=https://meeshy.me — JAMAIS
 *   # l'origine staging sur la base de production (le script ne peut pas le
 *   # deviner : l'origine imprimée en tête du rapport à blanc se relit avant APPLY=1).
 *
 * Témoin : `services/gateway/src/__tests__/unit/migrations/world-wide-avatar-banner-migration.test.ts`.
 */

const WORLD_BRANDING_CONVERSATION_IDENTIFIER = 'world';
const WORLD_BRANDING_PATHS = { avatar: '/brand/world-wide/avatar.png', banner: '/brand/world-wide/banner.png' };
const WORLD_BRANDING_UNSET = [null, ''];

function worldBrandingOrigin(raw) {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(trimmed)) return trimmed;
  if (/^http:\/\/localhost(:\d+)?$/i.test(trimmed)) return trimmed;
  return null;
}

function runWorldWideBranding(database, options) {
  const report = { origin: options.origin, world: false, toPose: [], posed: [], kept: [] };
  if (!options.origin) return report;

  const conversations = database.getCollection('Conversation');
  const world = conversations.findOne(
    { identifier: WORLD_BRANDING_CONVERSATION_IDENTIFIER },
    { _id: 1, avatar: 1, banner: 1 },
  );
  if (!world) return report;
  report.world = true;

  Object.keys(WORLD_BRANDING_PATHS).forEach((field) => {
    const current = world[field];
    if (current !== undefined && !WORLD_BRANDING_UNSET.includes(current)) {
      report.kept.push(field);
      return;
    }
    report.toPose.push(field);
    if (!options.apply) return;
    const result = conversations.updateOne(
      { _id: world._id, [field]: { $in: WORLD_BRANDING_UNSET } },
      { $set: { [field]: `${options.origin}${WORLD_BRANDING_PATHS[field]}` } },
    );
    if (Number(result.modifiedCount) === 1) report.posed.push(field);
  });

  return report;
}

function printWorldWideBrandingReport(report, options) {
  print(options.apply
    ? '===== Avatar et bannière de World Wide (#10204) — ÉCRITURE ====='
    : '===== Avatar et bannière de World Wide (#10204) — À BLANC, rien n’est écrit =====');
  if (!report.origin) {
    print('APP_ORIGIN absente ou invalide (https://…, ou http://localhost) : rien n’est lu ni écrit.');
    return;
  }
  print(`Origine : ${report.origin}`);
  if (!report.world) {
    print('World Wide absente : rien à faire.');
    return;
  }
  print(`Images à poser : ${report.toPose.length}${report.toPose.length ? ` (${report.toPose.join(', ')})` : ''}`);
  print(`Images posées : ${report.posed.length}`);
  print(`Images déjà choisies, laissées : ${report.kept.length}${report.kept.length ? ` (${report.kept.join(', ')})` : ''}`);
  if (!options.apply) print('Relancer avec APPLY=1 pour écrire.');
}

const worldWideBrandingOptions = {
  apply: process.env.APPLY === '1',
  origin: worldBrandingOrigin(process.env.APP_ORIGIN),
};
const worldWideBrandingReport = runWorldWideBranding(db, worldWideBrandingOptions);
printWorldWideBrandingReport(worldWideBrandingReport, worldWideBrandingOptions);
