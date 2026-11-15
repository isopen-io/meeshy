import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Un appel DIRECT à la file de remise hors ligne — c'est-à-dire un enfilage qui
 * ne passe pas par `socketio/offlineParticipantQueue.ts`.
 */
export interface DirectEnqueueCall {
  /** Chemin relatif à `src/`, pour que la clé ne dérive pas avec le dépôt. */
  readonly file: string;
  /** La ligne SOURCE, dépouillée — jamais un numéro de ligne (règle du cycle 87 bis). */
  readonly call: string;
}

/**
 * Le discriminant est l'APPEL, pas le nom du receveur.
 *
 * Chercher `deliveryQueue.enqueue` mesurerait la popularité d'un nom de
 * variable : la copie inline du chemin REST/ZMQ s'appelait bien
 * `this.deliveryQueue`, mais rien n'oblige la prochaine à le faire. `.enqueue(`
 * est le seul point de contact avec `RedisDeliveryQueue`, et la définition
 * elle-même (`async enqueue(`) n'est pas précédée d'un point — elle sort donc
 * par construction.
 */
const DIRECT_ENQUEUE = /\.\s*enqueue\s*\(/;

/** Les commentaires citent la forme fautive pour l'expliquer — c'est leur rôle. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      walk(full, out);
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/**
 * Les enfilages LÉGITIMES du dépôt : les PORTES PARTAGÉES elles-mêmes.
 *
 * Elles ne sont pas des exceptions au cliquet, elles en sont le SUJET. Ce que
 * ce balayage interdit est qu'un TRANSPORT enfile pour son compte ; une porte
 * partagée est l'inverse d'un transport — c'est l'unité où le couple
 * `(eventType, payload)` est tenu au contrat de fil, où la clé de file suit
 * `userId ?? id`, et où chaque échec est rattrapé par entrée.
 *
 * **Il y en a DEUX, et la seconde ne pouvait pas passer par la première**
 * (#16688). Le discriminant n'est pas le nom de l'unité mais l'AUDIENCE dont
 * elle décide :
 *
 * | porte | audience | comment elle la décide |
 * |---|---|---|
 * | `offlineParticipantQueue.ts` | les participants d'une CONVERSATION | `connectedUsers.has(queueKey)` — qui, des membres, est absent |
 * | `enqueuePersonalMessageMark.ts` | les autres APPAREILS d'un compte | inconditionnel : l'acteur EST le compte, donc la joignabilité ne dit rien |
 *
 * Faire passer la seconde par la première n'aurait pas été une délégation mais
 * un défaut : le prédicat de joignabilité reçoit toujours OUI quand c'est
 * l'appareil acteur qui le renseigne, si bien qu'aucune entrée n'était jamais
 * écrite pour l'appareil resté éteint. C'est la raison d'être de la seconde
 * porte, et elle est écrite dans son préambule.
 *
 * **Ajouter une TROISIÈME entrée ici est une DÉCISION**, et le témoin
 * `delivery-queue-door-sweep.test.ts` l'exige en figeant cet ensemble : une
 * porte de plus doit nommer l'audience qu'aucune des deux ne sait servir. Ce
 * qui n'est pas une audience neuve est un transport, et un transport délègue.
 */
export const SHARED_UNITS: ReadonlyArray<string> = [
  'socketio/offlineParticipantQueue.ts',
  'socketio/enqueuePersonalMessageMark.ts',
];

/**
 * Balaye `src/` ENTIER — pas seulement `src/socketio/`.
 *
 * La copie qui a motivé ce balayage vivait dans `MeeshySocketIOManager`, mais
 * les cinq qu'elle a suivies étaient réparties entre le handler de message, le
 * manager, la file de réactions et celle des réactions de pièce jointe. Borner
 * le balayage au répertoire qui a l'air concerné, c'est déclarer l'inventaire
 * vide en en laissant une vivante (même leçon que la huitième porte d'émission,
 * cycle 105).
 */
export function sweepDirectEnqueueCalls(srcDir: string): DirectEnqueueCall[] {
  const found: DirectEnqueueCall[] = [];

  for (const file of walk(srcDir)) {
    const relative = file.slice(srcDir.length + 1).split('\\').join('/');
    // Les témoins ont le droit d'appeler la file directement : ils DOUBLENT le
    // collaborateur. Ce qu'on garde ici, c'est la PRODUCTION.
    if (relative.includes('__tests__') || relative.endsWith('.test.ts')) continue;
    if (SHARED_UNITS.includes(relative)) continue;

    for (const line of stripComments(readFileSync(file, 'utf8')).split('\n')) {
      if (!DIRECT_ENQUEUE.test(line)) continue;
      found.push({ file: relative, call: line.trim() });
    }
  }

  return found;
}

/**
 * Une CONSTRUCTION de `RedisDeliveryQueue` — c'est-à-dire une instance de plus,
 * donc une TRANCHE MÉMOIRE de plus.
 */
export interface DeliveryQueueConstruction {
  /** Chemin relatif à `src/`, pour que la clé ne dérive pas avec le dépôt. */
  readonly file: string;
  /** La ligne SOURCE, dépouillée — jamais un numéro de ligne (règle du cycle 87 bis). */
  readonly call: string;
}

const QUEUE_CONSTRUCTION = /new\s+RedisDeliveryQueue\s*\(/;

/**
 * Le SEUL site de production qui a le droit de construire la file.
 *
 * `server.ts` la construit et l'ENREGISTRE aussitôt
 * (`setSharedDeliveryQueue`) : c'est ce couple — construire ET enregistrer —
 * qui fait de cette instance « la file du processus », et non la construction
 * seule. Un second site qui construirait puis enregistrerait écraserait le
 * registre ; un second site qui construit SANS enregistrer est ce que ce
 * balayage interdit.
 */
export const QUEUE_CONSTRUCTION_SITES: ReadonlyArray<string> = ['server.ts'];

/**
 * Pourquoi l'UNICITÉ d'instance demande son propre cliquet (#18616).
 *
 * `delivery-queue-door-sweep` ci-dessus garde l'ENFILAGE : il interdit qu'un
 * transport écrive lui-même dans la file. Il ne peut pas voir une seconde
 * INSTANCE — celle-ci passe par l'unité partagée, respecte le contrat de fil,
 * et serait donc verte à tous les cliquets existants.
 *
 * Ce qu'une seconde instance coûte est invisible au code qui l'emploie : la
 * tranche REDIS est partagée, et rien n'y casse. La tranche MÉMOIRE — le repli
 * qu'emprunte toute entrée écrite pendant un hoquet Redis — est PAR INSTANCE,
 * et les trois unités qui la traversent ne connaissent que l'instance
 * ENREGISTRÉE :
 *
 * | unité | comment elle trouve la file | ce qu'une seconde instance lui cache |
 * |---|---|---|
 * | le drain (`_drainPendingMessages`) | `this.deliveryQueue` du manager | une entrée tombée en mémoire n'est JAMAIS livrée |
 * | la purge (`applyMessageRemovalEffects`, vue unique) | `getSharedDeliveryQueue()` | le texte d'un message brûlé SURVIT dans ce tas |
 * | le balayage de TTL (`DeliveryQueueCleanupJob`) | l'instance de `server.ts` | aucune expiration sur cette tranche |
 *
 * **Quand ce témoin tombe** : la réparation est de RÉSOUDRE la file par le
 * registre (`getSharedDeliveryQueue`, `getSharedOfflineEnqueuer`), jamais
 * d'ajouter une ligne à l'inventaire — il n'y a pas de seconde file légitime
 * dans un processus, et les deux doc-comments qui AFFIRMAIENT l'unicité
 * (`server.ts`, `delivery-queue-registry.ts`) disaient faux pendant qu'elle
 * existait.
 */
export function sweepDeliveryQueueConstructions(srcDir: string): DeliveryQueueConstruction[] {
  const found: DeliveryQueueConstruction[] = [];

  for (const file of walk(srcDir)) {
    const relative = file.slice(srcDir.length + 1).split('\\').join('/');
    // Un témoin construit la file pour l'EXERCER — c'est son rôle. Ce que ce
    // balayage garde, c'est la PRODUCTION.
    if (relative.includes('__tests__') || relative.endsWith('.test.ts')) continue;
    if (QUEUE_CONSTRUCTION_SITES.includes(relative)) continue;

    for (const line of stripComments(readFileSync(file, 'utf8')).split('\n')) {
      if (!QUEUE_CONSTRUCTION.test(line)) continue;
      found.push({ file: relative, call: line.trim() });
    }
  }

  return found;
}
