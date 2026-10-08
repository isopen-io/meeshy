// La garde anti-production. Elle se prononce AVANT toute connexion, sur ce que
// l'appelant a fourni (URI, environnement, drapeaux), et elle ÉCHOUE FERMÉ :
// une cible qu'elle ne sait pas reconnaître comme non-production est refusée.
//
// Trois niveaux, tous requis :
//  1. aucun signal de production — `MEESHY_ENV`/`NODE_ENV` à `production`/`prod`,
//     un hôte ou un nom de base qui contient `prod` ;
//  2. un hôte RECONNU comme non-production : son nom contient `staging`, `test`
//     ou `anon`, ou c'est une boucle locale (tunnel SSH, base jetable) — et
//     dans ce dernier cas `MEESHY_ENV` doit DIRE l'environnement (staging, test,
//     development, local), puisqu'un tunnel peut aussi mener à la production ;
//     `--allow-host` ajoute un hôte précis, jamais un motif ;
//  3. pour ÉCRIRE, le drapeau `--i-know-this-is-not-production`, absent par
//     défaut. Le mode `--dry-run` et le contrôle seul ne l'exigent pas.
//
// Puis, UNE FOIS CONNECTÉ et avant toute lecture ou écriture : le serveur doit
// se présenter (`hello`) comme le replica set de staging — `setName` et
// `hosts` égaux à ceux du compose (`rs.initiate` de mongo-init-staging). Un
// tunnel, un port ou un nom d'hôte trompeur mène à un serveur qui se nomme
// autrement : il est refusé. `--expect-replica-set` / `--expect-host` changent
// la cible attendue, pour une base jetable de test seulement.

const PRODUCTION_ENV = new Set(['production', 'prod']);
const NON_PRODUCTION_ENV = new Set(['staging', 'test', 'development', 'local']);
const HOST_MARKERS = ['staging', 'test', 'anon'];
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export class ProductionGuardError extends Error {}

export function parseMongoTarget(uri) {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)(?:\/([^?]*))?/.exec(uri ?? '');
  if (!match) throw new ProductionGuardError('URI MongoDB illisible : attendu mongodb://hôte[:port]/base');
  const hosts = match[1].split(',').map((h) => h.replace(/:\d+$/, '').toLowerCase());
  return { hosts, database: decodeURIComponent(match[2] ?? '') };
}

export function redactUri(uri) {
  return String(uri).replace(/\/\/[^@/]*@/, '//***@');
}

export function assertNotProduction({ uri, env = process.env, confirmed = false, write = true, allowHosts = [] }) {
  const { hosts, database } = parseMongoTarget(uri);
  const declared = [env.MEESHY_ENV, env.NODE_ENV].filter(Boolean).map((v) => v.toLowerCase());
  const refuse = (reason) => {
    throw new ProductionGuardError(`REFUS — la cible ressemble à la production ou n'est pas reconnue : ${reason}`);
  };

  if (declared.some((v) => PRODUCTION_ENV.has(v))) refuse('MEESHY_ENV/NODE_ENV désigne la production');
  if (!database) refuse("l'URI ne nomme pas de base");
  if (/prod/i.test(database)) refuse(`le nom de base « ${database} » évoque la production`);
  if (hosts.some((h) => /prod/.test(h))) refuse("un hôte de l'URI évoque la production");

  const allowed = new Set(allowHosts.map((h) => h.toLowerCase()));
  const meeshyEnv = (env.MEESHY_ENV ?? '').toLowerCase();
  const recognized = (host) =>
    allowed.has(host) ||
    HOST_MARKERS.some((m) => host.includes(m)) ||
    (LOOPBACK.has(host) && NON_PRODUCTION_ENV.has(meeshyEnv));
  const unknown = hosts.filter((h) => !recognized(h));
  if (unknown.length > 0) {
    refuse(
      `hôte(s) non reconnu(s) comme non-production : ${unknown.join(', ')} ` +
        '(attendu : un nom contenant staging/test/anon, une boucle locale avec MEESHY_ENV=staging|test|development|local, ou --allow-host)',
    );
  }

  if (write && !confirmed) {
    throw new ProductionGuardError(
      'REFUS — écriture sans --i-know-this-is-not-production. Lancer d\'abord --dry-run, puis relancer avec ce drapeau.',
    );
  }
  return { hosts, database };
}

/** La cible attendue par défaut : le replica set du compose de staging. */
export const STAGING_TARGET = Object.freeze({ setName: 'rs0', hosts: Object.freeze(['database-staging:27017']) });

/** Refuse un serveur dont `hello` ne rend pas exactement le `setName` et les `hosts` attendus. */
export function assertExpectedTarget(hello, expected = STAGING_TARGET) {
  const served = { setName: hello?.setName ?? null, hosts: [...(hello?.hosts ?? [])].map((h) => h.toLowerCase()).sort() };
  const wanted = { setName: expected.setName, hosts: [...expected.hosts].map((h) => h.toLowerCase()).sort() };
  const same = served.setName === wanted.setName && served.hosts.length === wanted.hosts.length && served.hosts.every((h, i) => h === wanted.hosts[i]);
  if (!same) {
    throw new ProductionGuardError(
      `REFUS — le serveur joint n'est pas la cible attendue : il se présente comme ${served.setName ?? '(sans replica set)'} ` +
        `[${served.hosts.join(', ')}], attendu ${wanted.setName} [${wanted.hosts.join(', ')}]. Rien n'a été lu ni écrit.`,
    );
  }
  return served;
}
