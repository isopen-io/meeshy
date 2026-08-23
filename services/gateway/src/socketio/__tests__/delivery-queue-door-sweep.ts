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
 * L'unique enfilage LÉGITIME du dépôt : l'unité partagée elle-même.
 *
 * Elle n'est pas une exception au cliquet, elle en est le SUJET — c'est
 * l'endroit où le couple `(eventType, payload)` est tenu au contrat de fil
 * (`QueuedEventVariant`), où l'exclusion de l'acteur porte sur les DEUX
 * identités, où la clé de file suit `userId ?? id`, et où chaque échec est
 * rattrapé par entrée.
 */
const SHARED_UNIT = 'socketio/offlineParticipantQueue.ts';

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
    if (relative === SHARED_UNIT) continue;

    for (const line of stripComments(readFileSync(file, 'utf8')).split('\n')) {
      if (!DIRECT_ENQUEUE.test(line)) continue;
      found.push({ file: relative, call: line.trim() });
    }
  }

  return found;
}
