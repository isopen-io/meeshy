import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Une porte d'ACQUITTEMENT écrite à la main.
 *
 * Le jumeau exact, dans le sens ENTRANT, des portes d'émission que garde
 * `server-emit-door-sweep.ts`. Là-bas : une signature `emit` qui redéclare ce
 * que `ServerToClientEvents` déclare déjà. Ici : un handler qui redéclare la
 * signature de rappel que `ClientToServerEvents` déclare déjà.
 *
 * ```ts
 * // ✗ deux déclarations du même accusé, libres de diverger
 * callback?: (response: SocketIOResponse<unknown>) => void
 *
 * // ✓ une seule, LUE sur le contrat
 * callback?: AckOf<'reaction:add'>
 * ```
 *
 * **Ce n'est pas une préférence de style, et le coût est mesuré.** Les trois
 * familles de réactions portaient `SocketIOResponse<unknown>` — qui accepte
 * TOUT — pendant que le contrat promettait une charge précise. Aucune des deux
 * moitiés du fil ne vérifiait l'autre, et le désaccord a coûté trois incidents
 * de décodage à l'iOS avant le cycle 109 :
 *
 * 1. REST `POST /reactions` — `DecodingError` sur une réponse 2xx, contourné en
 *    ignorant le corps (`DiscardedReactionResponse`) ;
 * 2. accusé `post:reaction-*` — `malformedResponse`, corrigé en « ACK ==
 *    broadcast » ;
 * 3. accusé `comment:reaction-*` — le même, corrigé de la même façon.
 *
 * Le QUATRIÈME site (`reaction:add` / `reaction:remove`) n'a jamais été corrigé
 * parce que rien ne le nommait : il acquittait une ligne brute sur l'ajout et
 * deux phrases anglaises non localisées sur le retrait
 * (`{ message: 'Reaction already absent' }`), sous un contrat qui promettait un
 * `ReactionUpdateEventData`.
 *
 * Et lorsque la porte typée a été posée, le compilateur en a nommé **deux de
 * plus** que la lecture du code avait manqués : le chemin idempotent
 * « déjà absente » des familles COMMENTAIRE et POST portait la même phrase
 * anglaise, recopiée du site message avec le commentaire qui le dit
 * (« Mirrors ReactionHandler.handleReactionRemove »). C'est le chemin que
 * déclenche exactement le double-tap qu'un accusé idempotent existe pour
 * absorber.
 *
 * > Une famille qui repousse à chaque itération se ferme par une GARDE, pas par
 * > un correctif. Trois corrections successives ont chacune réparé ce qu'elles
 * > voyaient ; aucune n'a empêché la suivante. Le geste qui termine n'est pas le
 * > quatrième correctif, c'est la porte qui interdit le cinquième.
 */
export interface HandWrittenAckDoor {
  /** Chemin relatif à `src/`, pour que la clé ne dérive pas avec le dépôt. */
  readonly file: string;
  /** La ligne SOURCE, dépouillée — jamais un numéro de ligne (règle du cycle 87 bis). */
  readonly declaration: string;
}

/**
 * Un paramètre de rappel dont le type est écrit à la main plutôt que lu sur le
 * contrat.
 *
 * Le discriminant est la RÉDACTION du type — `(response: SocketIOResponse…)` —
 * et non le nom du paramètre : `callback`, `ack` et `cb` sont tous employés
 * dans le dépôt. Un rappel typé `AckOf<…>` est par construction rattaché à
 * `ClientToServerEvents` et n'est pas vu ici.
 *
 * Volontairement borné à `SocketIOResponse` : c'est l'enveloppe unique des
 * accusés Socket.IO (`utils/response.ts` gouverne l'enveloppe REST, qui est un
 * autre sujet). Un rappel qui ne la mentionne pas n'est pas un accusé.
 */
const HAND_WRITTEN_ACK =
  /\b[A-Za-z_$][\w$]*\??\s*:\s*\(\s*[A-Za-z_$][\w$]*\s*:\s*SocketIOResponse\b/;

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
 * Balaye `src/` ENTIER — pas seulement `src/socketio/`.
 *
 * Même raison que son jumeau sortant : la huitième porte d'émission vivait dans
 * `utils/socket-broadcast.ts`, à deux répertoires de la septième. Un balayage
 * borné au répertoire qui a l'air concerné déclare l'inventaire vide en en
 * laissant une vivante.
 */
export function sweepHandWrittenAckDoors(srcDir: string): HandWrittenAckDoor[] {
  const found: HandWrittenAckDoor[] = [];

  for (const file of walk(srcDir)) {
    const relative = file.slice(srcDir.length + 1);
    // Les témoins construisent des doubles, et un double a le droit d'être
    // permissif : ce qu'on garde ici, c'est la PRODUCTION.
    if (relative.includes('__tests__') || relative.endsWith('.test.ts')) continue;

    for (const line of stripComments(readFileSync(file, 'utf8')).split('\n')) {
      if (!HAND_WRITTEN_ACK.test(line)) continue;
      found.push({ file: relative, declaration: line.trim() });
    }
  }

  return found;
}
