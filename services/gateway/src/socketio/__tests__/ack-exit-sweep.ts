import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Une porte d'acquittement DÉCLARÉE et NON RENDUE.
 *
 * `ack-door-sweep.ts` garde la FORME d'une porte d'acquittement — lue sur le
 * contrat plutôt que réécrite. Celui-ci garde qu'elle soit OUVERTE : un handler
 * qui déclare `ack` / `callback` et rend la main sans l'appeler.
 *
 * ```ts
 * // ✗ le refus part sur call:error, et le rappel déclaré n'est jamais rendu
 * if (!participant) { socket.emit(CALL_EVENTS.ERROR, { … }); return; }
 *
 * // ✓ la sortie rend son acquittement
 * if (!participant) { ack?.({ success: false, error: { code, message } }); return; }
 * ```
 *
 * **Le coût est mesuré, et il est pire qu'une valeur manquante.** Un acquittement
 * absent et un acquittement de REFUS ne se distinguent pas chez l'appelant qui
 * attend : `SocketAck.parse` (`packages/MeeshySDK/…/SocketAck.swift`) rend
 * `.timedOut` quand rien n'arrive, `.refused(…)` quand un `{ success: false }`
 * arrive. **La passerelle collapse donc un refus DÉFINITIF en panne de réseau.**
 *
 * Sur `call:signal` — la poignée de main WebRTC, le chemin le plus sensible du
 * produit — six sorties sur neuf étaient muettes, et c'étaient exactement les
 * refus (`NOT_AUTHENTICATED`, `INVALID_SIGNAL`, `NOT_A_PARTICIPANT`,
 * `SIGNAL_SENDER_MISMATCH`, `TARGET_NOT_FOUND`, et le `catch`). Côté iOS,
 * `CallSdpSignaler.emitOfferWithRetry` / `emitAnswerRetry` REJOUENT en backoff
 * exponentiel sur un acquittement absent : un refus définitif était donc rejoué
 * à l'identique, 3 s d'attente par tentative, chaque rejeu consommant le budget
 * de débit — dont le refus, lui, acquitte, si bien que la boucle abandonnait sur
 * une raison fausse. Sur l'ANSWER, la fenêtre de `CXAnswerCallAction.fulfill()`
 * était tenue 3 s pour un refus connu immédiatement (#18632).
 *
 * > C'est le jumeau MONTANT du cycle 122 (« qui AFFICHE ce que le résolveur
 * > élit ? ») : la valeur existe, le canal existe, et personne ne la remet. Et
 * > il échoue par le mécanisme le plus discret du dépôt — une attente qui
 * > expire, donc un diagnostic de RÉSEAU pour un refus d'AUTORISATION.
 *
 * **Aucun des six cliquets du contrat socket ne pouvait le voir.** Ils
 * énumèrent des NOMS (déclarés, émis, lus, parités) et des FORMES de
 * déclaration ; celui-ci est le premier à regarder un CHEMIN D'EXÉCUTION.
 *
 * **Quand ce témoin tombe :**
 *
 * - une entrée EN TROP = une sortie neuve ne rend pas son acquittement. La
 *   réparation est de l'appeler, jamais de l'ajouter à l'inventaire — une
 *   sortie muette n'est légitime que si AUCUN appelant n'attend, et cela se
 *   mesure sur les trois clients, pas au site ;
 * - une entrée EN MOINS = une sortie a été acquittée. Retirer sa ligne fait
 *   partie du correctif.
 *
 * L'inventaire est clé par FICHIER + HANDLER + LIGNE SOURCE de la sortie,
 * jamais par numéro de ligne (règle du cycle 87 bis).
 */
export interface SilentAckExit {
  /** Chemin relatif à `src/`, pour que la clé ne dérive pas avec le dépôt. */
  readonly file: string;
  /** La ligne qui DÉCLARE le rappel, dépouillée — identifie le handler. */
  readonly handler: string;
  /** La sortie muette : la ligne source, dépouillée, ou `catch` pour un bloc d'erreur. */
  readonly exit: string;
}

/**
 * Le nom d'un paramètre d'acquittement, et rien d'autre.
 *
 * Les trois noms employés dans le dépôt (`ack`, `callback`, `cb`), et le
 * discriminant est le TYPE FONCTION qui suit : un `callback: string` n'est pas
 * une porte. `AckOf<…>` (la forme lue sur le contrat) compte autant qu'une
 * rédaction manuelle — ce cliquet-ci ne juge pas la forme, c'est le travail de
 * son jumeau.
 */
const ACK_PARAM = /\b(ack|callback|cb)\s*\??\s*:\s*(\(|AckOf\b)/;

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

function depthDelta(line: string): number {
  let delta = 0;
  for (const ch of line) {
    if (ch === '{') delta += 1;
    else if (ch === '}') delta -= 1;
  }
  return delta;
}

/**
 * La ligne où s'ouvre le corps du handler, et celle où il se referme.
 *
 * La signature peut tenir sur une ligne ou sur douze (un paramètre par ligne,
 * la forme de `MessageHandler`) : on cherche donc la première accolade
 * ouvrante qui termine une ligne APRÈS la déclaration du rappel.
 */
function bodyRange(lines: readonly string[], declaredAt: number): { start: number; end: number } | null {
  let start = -1;
  for (let i = declaredAt; i < Math.min(lines.length, declaredAt + 14); i += 1) {
    if (/\{\s*$/.test(lines[i])) { start = i; break; }
  }
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < lines.length; i += 1) {
    depth += depthDelta(lines[i]);
    if (depth <= 0 && i > start) return { start, end: i };
  }
  return { start, end: lines.length - 1 };
}

/**
 * Le rappel est-il RENDU par cette ligne — appelé, ou remis à un callee qui
 * l'appellera ?
 *
 * **Nommer n'est pas rendre, et c'est la mesure qui a corrigé ce cliquet.** Sa
 * première version cherchait le NOM, et `relayTranscriptionSegment` ouvre par
 * `const { userId, data, ack } = request;` : une DÉSTRUCTURATION, à la
 * profondeur qui domine tout le corps, qui déclarait acquittées les sorties
 * d'une unité dont le refus `NOT_A_PARTICIPANT` ne rend rien. Un balayage qui
 * cherche un idiome mesure sa popularité (cycle 107) ; celui qui cherche un
 * NOM mesure sa portée lexicale.
 *
 * Deux formes rendent, et il faut les deux :
 *
 * - l'APPEL — `ack?.({ success: false })`, `callback(response)` ;
 * - la REMISE — `this._sendError(callback, …)`,
 *   `admitCallCaptions(…, { … ack })` : le callee est alors le site qui rend,
 *   et c'est la forme majoritaire du dépôt. Elle compte aussi quand l'argument
 *   tient sa propre ligne (`_sendError(\n  callback,\n  …)`, la forme de
 *   `MessageHandler`) : une ligne qui ne porte QUE le nom, dans un appel ouvert
 *   plus haut, est une position d'argument et rien d'autre.
 *
 * Une DÉCLARATION — `const`, `let`, un paramètre, un champ `readonly` — ne rend
 * jamais. Le reste est admis, et c'est volontaire : **ce cliquet préfère un
 * faux positif, qui fait OUVRIR le site, à un faux négatif, qui le tait.**
 */
function rendersAck(line: string, renderers: readonly string[]): boolean {
  if (/^\s*(const|let|var|readonly|public|private|protected|function)\b/.test(line)) return false;
  return renderers.some((name) => {
    if (new RegExp(`\\b${name}\\s*(\\?\\.)?\\(`).test(line)) return true;
    if (new RegExp(`^\\s*${name}\\s*,?\\s*$`).test(line)) return true;
    return new RegExp(`\\w\\s*\\([^;]*\\b${name}\\b`).test(line);
  });
}

/**
 * Les FERMETURES LOCALES qui rendent l'acquittement — leur nom rend autant que
 * le rappel lui-même.
 *
 * Sans cela, le cliquet punirait le correctif juste. Six sorties de
 * `call:signal` répétaient `socket.emit(CALL_EVENTS.ERROR, …); return;`, et la
 * réparation élégante n'est pas de recopier `ack?.(…)` six fois — c'est UN
 * `refuse(code, message)` qui dit le refus sur les DEUX canaux, de sorte qu'ils
 * ne puissent plus diverger. Une règle qu'il faut retaper à chaque site est une
 * règle qu'un site finira par ne pas avoir.
 *
 * Une fermeture locale EST un callee : la forme « remise » s'y applique
 * telle quelle, à ceci près qu'on peut VÉRIFIER qu'elle rend — ce qu'on ne peut
 * pas faire d'un callee d'un autre module. Le balayage ne l'admet donc que si
 * son propre corps rend l'acquittement.
 */
function localRenderers(lines: readonly string[], body: { start: number; end: number }, ackName: string): string[] {
  const names: string[] = [];

  for (let i = body.start + 1; i <= body.end; i += 1) {
    const declared = lines[i].match(/^\s*const\s+([A-Za-z_$][\w$]*)\s*=/);
    if (!declared) continue;

    let depth = 0;
    let end = i;
    for (let k = i; k <= body.end; k += 1) {
      depth += depthDelta(lines[k]);
      end = k;
      if (depth <= 0 && k > i) break;
      if (depth === 0 && /;\s*$/.test(lines[k])) break;
    }
    const closure = lines.slice(i, end + 1);
    if (closure.some((l) => rendersAck(l, [ackName]))) names.push(declared[1]);
  }

  return names;
}

/**
 * Une sortie est ACQUITTÉE si le rappel est nommé sur sa propre ligne, ou plus
 * haut sur un chemin qui la DOMINE — jamais dans un bloc frère.
 *
 * Les trois moitiés sont nécessaires, et chacune a son cas réel :
 *
 * - la MÊME LIGNE attrape la garde qui DÉLÈGUE —
 *   `if (!(await admitCallCaptions(…, { … ack }))) return;` — où le callee rend
 *   l'acquittement et où il n'y a pas de bloc du tout ;
 * - le BLOC attrape la forme nominale — `if (…) { this._sendError(callback, …);
 *   return; }` ;
 * - les blocs ANCÊTRES attrapent l'acquittement rendu AVANT d'entrer dans le
 *   bloc qui sort. `CommentReactionHandler` acquitte son succès, puis sort d'un
 *   `if (reaction.unchanged) { return; }` quelques lignes plus bas : le rappel
 *   est rendu, et un balayage borné au bloc intérieur le déclarait muet.
 *
 * Un bloc FRÈRE, lui, ne compte jamais : son acquittement n'est pas sur le
 * chemin qui mène à cette sortie. C'est la différence entre « le rappel est
 * nommé quelque part dans ce handler » — ce que mesurerait un balayage naïf, et
 * qui rendrait le cliquet aveugle à `call:signal` — et « il est rendu AVANT
 * cette sortie ».
 */
function exitIsAcknowledged(
  lines: readonly string[],
  body: { start: number; end: number },
  at: number,
  renderers: readonly string[]
): boolean {
  const named = (line: string): boolean => rendersAck(line, renderers);
  if (named(lines[at])) return true;

  const depthAt = (index: number): number => {
    let depth = 0;
    for (let i = body.start + 1; i <= index; i += 1) depth += depthDelta(lines[i]);
    return depth;
  };

  let level = depthAt(at - 1);

  for (let i = at - 1; i > body.start; i -= 1) {
    const before = depthAt(i - 1);
    const inside = Math.min(before, depthAt(i));
    if (inside > level) continue;
    level = Math.min(level, inside);
    if (named(lines[i])) return true;
  }
  return false;
}

/** L'inventaire est un ENSEMBLE : une clé ne se compte qu'une fois. */
function push(found: SilentAckExit[], exit: SilentAckExit): void {
  const already = found.some(
    (e) => e.file === exit.file && e.handler === exit.handler && e.exit === exit.exit
  );
  if (!already) found.push(exit);
}

/**
 * Balaye `src/` ENTIER — pas seulement `src/socketio/`.
 *
 * Même raison que ses deux jumeaux : la sortie muette de
 * `call:transcription-segment` ne vit pas dans le handler, mais dans
 * `relayTranscriptionSegment` (`socketio/call-transcription-segment.ts`), à qui
 * le handler PASSE son `ack`. Un balayage borné aux `socket.on` déclarerait
 * l'inventaire vide en en laissant une vivante.
 */
export function sweepSilentAckExits(srcDir: string): SilentAckExit[] {
  const found: SilentAckExit[] = [];

  for (const file of walk(srcDir)) {
    const relative = file.slice(srcDir.length + 1);
    // Les témoins construisent des doubles, et un double a le droit d'être
    // permissif : ce qu'on garde ici, c'est la PRODUCTION.
    if (relative.includes('__tests__') || relative.endsWith('.test.ts')) continue;

    const lines = stripComments(readFileSync(file, 'utf8')).split('\n');

    for (let i = 0; i < lines.length; i += 1) {
      const declaration = lines[i].match(ACK_PARAM);
      if (!declaration) continue;
      const ackName = declaration[1];

      const body = bodyRange(lines, i);
      if (!body) continue;

      const handler = lines[i].trim();
      const renderers = [ackName, ...localRenderers(lines, body, ackName)];

      // La PROFONDEUR relative au corps distingue le `catch` DU HANDLER de
      // celui d'un sous-appel : un `catch` imbriqué absorbe l'échec d'une
      // opération best-effort et le corps CONTINUE — ce n'est pas une sortie.
      // Seul le `catch` de profondeur 1 rend la main à l'appelant.
      let depth = 0;

      for (let k = body.start + 1; k <= body.end; k += 1) {
        const line = lines[k];
        const opensAtDepth = depth;
        depth += depthDelta(line);

        if (/(^|[^\w.])return\s*;/.test(line) && !exitIsAcknowledged(lines, body, k, renderers)) {
          push(found, { file: relative, handler, exit: line.trim() });
          continue;
        }

        // `.catch(` est une promesse, pas un bloc d'erreur : l'exclure est ce
        // qui sépare ce cliquet d'un compteur d'occurrences du mot.
        if (!/(^|[^.\w])catch\s*(\(|\{)/.test(line) || opensAtDepth !== 1) continue;

        const close = (() => {
          let d = 0;
          for (let c = k; c <= body.end; c += 1) {
            d += depthDelta(c === k ? lines[c].slice(lines[c].indexOf('catch')) : lines[c]);
            if (d <= 0 && c > k) return c;
          }
          return body.end;
        })();
        const renders = lines.slice(k, close + 1).some((l) => rendersAck(l, renderers));
        if (!renders) {
          push(found, { file: relative, handler, exit: 'catch' });
        }
      }
    }
  }

  return found;
}
