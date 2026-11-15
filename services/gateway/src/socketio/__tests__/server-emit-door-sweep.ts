import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Une porte d'émission écrite à la main : une signature `emit` dont le nom
 * d'événement est un `string` NU et/ou la charge un `unknown` / `any` /
 * `Record<string, unknown>` NU.
 */
export interface UntypedEmitDoor {
  /** Chemin relatif à `src/`, pour que la clé ne dérive pas avec le dépôt. */
  readonly file: string;
  /** La ligne SOURCE, dépouillée — jamais un numéro de ligne (cf. ci-dessous). */
  readonly declaration: string;
}

/**
 * `emit` suivi d'un premier paramètre `string` — la marque d'une porte qui ne
 * dérive pas de `ServerToClientEvents`.
 *
 * Le discriminant est le TYPE du premier paramètre, pas son nom : `event`,
 * `ev`, `eventName` et `type` ont tous été employés dans le dépôt. Un `emit`
 * dont le premier paramètre est autre chose qu'un `string` nu — un
 * `ServerEventName`, un `E extends ServerEventName`, un `...args:
 * ServerEmitArgs` — est par construction rattaché au contrat.
 *
 * **DEUX formes, parce qu'une porte ne s'ouvre pas que par déclaration**
 * (cycle 105). La première rédaction ne connaissait que la méthode abrégée
 * — `emit(event: string, …)`, celle des huit interfaces du cycle 104 — et une
 * NEUVIÈME porte lui a échappé pour cette seule raison : le rejeu hors ligne
 * l'ouvrait par ASSERTION DE TYPE, en forme de propriété-flèche.
 *
 * ```ts
 * const userRoom = this.io.to(ROOMS.user(userId)) as unknown as {
 *   emit: (event: string, payload: unknown) => void;   // ← invisible au balayage
 * };
 * ```
 *
 * Un cast est une porte : il produit exactement la même liberté que la
 * déclaration, sur exactement le même appel, et il est plus discret puisqu'il
 * ne crée pas de type nommé qu'on puisse chercher. Le balayage voit désormais
 * `emit(ev: string` ET `emit: (ev: string`.
 */
const UNTYPED_EMIT =
  /\bemit\s*(?::\s*)?(?:<[^>]*>)?\s*\(\s*(?:readonly\s+)?[A-Za-z_$][\w$]*\s*:\s*string\b/;

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
 * Balaye `src/` — pas seulement `src/socketio/`.
 *
 * `utils/socket-broadcast.ts` portait la huitième copie, à deux répertoires de
 * la septième. Un balayage borné au répertoire qui a l'air concerné aurait
 * déclaré l'inventaire vide en en laissant une vivante.
 */
export function sweepUntypedEmitDoors(srcDir: string): UntypedEmitDoor[] {
  const found: UntypedEmitDoor[] = [];

  for (const file of walk(srcDir)) {
    const relative = file.slice(srcDir.length + 1);
    // Les témoins construisent des doubles, et un double a le droit d'être
    // permissif : ce qu'on garde ici, c'est la PRODUCTION.
    if (relative.includes('__tests__') || relative.endsWith('.test.ts')) continue;

    for (const line of stripComments(readFileSync(file, 'utf8')).split('\n')) {
      if (!UNTYPED_EMIT.test(line)) continue;
      found.push({ file: relative, declaration: line.trim() });
    }
  }

  return found;
}

/* ------------------------------------------------------------------------- *
 * La TROISIÈME forme — le `Server` NU pris pour émettre [cycle 108]
 * ------------------------------------------------------------------------- */

/**
 * Un émetteur qui détient le `Server` de socket.io TEL QUEL.
 *
 * Les deux balayages ci-dessus cherchent une porte RÉÉCRITE — une signature
 * `emit` trop libre, déclarée ou castée. Aucun ne voit la forme la plus simple
 * et la plus fréquente : ne rien réécrire du tout, et prendre le type nu de la
 * dépendance.
 *
 * ```ts
 * import type { Server } from 'socket.io';
 * constructor(private io: Server) {}
 * this.io.to(room).emit(SERVER_EVENTS.X, payload);   // ← vérifié par RIEN
 * ```
 *
 * **Ce n'est pas un défaut de style, c'est une absence totale de contrat.**
 * `Server` sans paramètres de type retombe sur `DefaultEventsMap`, dont la
 * signature est `emit(ev: string, ...args: any[])`. Mesuré au cycle 108 sous le
 * `tsconfig` de production : un nom d'événement INVENTÉ (`"totally:invented-event"`)
 * et une charge de forme FAUSSE compilent tous les deux à **zéro erreur**. C'est
 * la forme exacte du défaut du cycle 101 — `message:edited` servi sans
 * `senderId`/`messageType`/`createdAt`, rejeté en silence par tous les décodeurs
 * iOS pendant des mois.
 *
 * Quatre porteurs au moment où ce balayage est écrit, tous corrigés dans le même
 * lot : `NotificationService` (12 émissions, dont les quatre familles de demande
 * d'ami et `user:updated`), `CallCleanupService` (`call:ended` vers l'audience de
 * terminaison complète), `StoryTextObjectTranslationService` (2), `AgentAdminRelay`
 * (1) — plus le helper partagé `emitWithSeq`, qui prenait le `Server` nu pour le
 * compte de tous ses appelants.
 */
export interface RawServerEmitter {
  readonly file: string;
  readonly declaration: string;
}

/**
 * Le discriminant est l'import TYPE-ONLY, et il est étroit par DÉCISION.
 *
 * `MeeshySocketIOManager` importe `Server` en VALEUR parce qu'il le CONSTRUIT
 * (`new SocketIOServer(httpServer, …)`) — c'est le seul endroit du dépôt qui le
 * peut, et lui interdire l'import n'aurait aucun sens. Un `import type` ne peut,
 * lui, servir qu'à DÉCLARER : c'est exactement la population visée.
 *
 * Le cycle 107 a rendu sept faux positifs en cherchant un IDIOME plutôt qu'une
 * propriété, et son balayage a été JETÉ plutôt que gelé — geler un inventaire
 * faux transforme une erreur de mesure en vérité de dépôt. D'où l'étroitesse
 * assumée ici : le fichier doit à la fois importer le type NU et ÉMETTRE. Un
 * fichier qui détient un `Server` sans jamais émettre (câblage, cycle de vie)
 * sort par construction, pas par exemption — l'inventaire n'a aucune liste
 * d'exceptions, et ne doit jamais en acquérir.
 */
const TYPE_ONLY_SOCKETIO_IMPORT =
  /import\s+type\s*\{([^}]*)\}\s*from\s*['"]socket\.io['"]/g;

/**
 * TOUS les imports du fichier, jamais le premier.
 *
 * Écrit d'abord avec un `exec` simple, et pris en défaut par sa propre fixture :
 * un fichier qui importe `Server` puis `Server as SocketIOServer` sur deux
 * lignes n'aurait rendu que le premier alias, et le second aurait traversé le
 * cliquet en silence. C'est la règle du cycle 104 appliquée à l'outil lui-même —
 * une erreur commise en écrivant un cliquet est le meilleur cas de test qu'il
 * aura jamais, et la fixture porte les deux formes pour cette raison.
 */
function rawServerAliases(source: string): string[] {
  const aliases: string[] = [];
  for (const match of source.matchAll(TYPE_ONLY_SOCKETIO_IMPORT)) {
    for (const binding of match[1].split(',')) {
      const trimmed = binding.trim();
      if (!/^Server\b/.test(trimmed)) continue;
      const aliased = /^Server\s+as\s+([A-Za-z_$][\w$]*)$/.exec(trimmed);
      aliases.push(aliased ? aliased[1] : 'Server');
    }
  }
  return aliases;
}

export function sweepRawServerEmitters(srcDir: string): RawServerEmitter[] {
  const found: RawServerEmitter[] = [];

  for (const file of walk(srcDir)) {
    const relative = file.slice(srcDir.length + 1);
    if (relative.includes('__tests__') || relative.endsWith('.test.ts')) continue;

    const source = stripComments(readFileSync(file, 'utf8'));
    const aliases = rawServerAliases(source);
    if (aliases.length === 0) continue;
    // Détenir n'est pas ÉMETTRE. Sans cette seconde condition, le balayage
    // mesurerait la popularité d'un import au lieu d'une propriété.
    if (!source.includes('.emit(')) continue;

    for (const line of source.split('\n')) {
      for (const alias of aliases) {
        // Une DÉCLARATION : `io: Server`, `io?: Server`, `io: Server | null`.
        if (!new RegExp(`:\\s*${alias}\\b`).test(line)) continue;
        found.push({ file: relative, declaration: line.trim() });
        break;
      }
    }
  }

  return found;
}

/**
 * Un couple `(événement, charge)` remis à `.emit(` sous un cast qui EFFACE.
 *
 * ## La TROISIÈME façon de contourner la porte — celle qui ne la touche pas
 *
 * Les deux balayages ci-dessus cherchent une porte MAL DÉCLARÉE : une signature
 * `emit` réécrite à la main, ou le `Server` NU de socket.io pris pour émettre.
 * **Leurs deux discriminants portent sur le RECEVEUR** — l'objet sur lequel
 * `.emit(` est appelé. Aucun ne regarde ce qu'on lui PASSE.
 *
 * Mesuré le 2026-11-15 (#18649) : deux sites de production importaient la BONNE
 * porte — `ServerEmitIO`, dérivée de `ServerToClientEvents` — et neutralisaient
 * la vérification par un cast sur l'ARGUMENT.
 *
 * ```ts
 * io?.to(ROOMS.user(userId)).emit(event as never, data as never);   // togetherRelay
 * emitter.emit(event as keyof ServerToClientEvents, data as any);   // MeeshySocketIOManager
 * ```
 *
 * `as never` est assignable à TOUT : ni le nom ni la forme ne sont confrontés au
 * contrat. C'est exactement la liberté du `Server` nu du cycle 108, obtenue
 * autrement — donc invisible aux deux cliquets, **qui étaient verts**. C'est la
 * règle du cycle 105 (« chercher une forme fautive par son NOM de déclaration,
 * c'est manquer tous les sites qui l'obtiennent autrement ») déplacée d'un cran :
 * elle vaut de l'argument comme elle valait du porteur.
 *
 * ## Pourquoi seuls les casts qui EFFACENT, et pas tous les casts
 *
 * Premier relevé, sur « un `as` au premier niveau d'un argument » : **44 sites**,
 * dont 40 de la forme `{ code, message } as CallError` — un littéral casté vers
 * le type que le canal DÉCLARE. Celui-là ne décorrèle rien : `as` exige que les
 * deux types soient comparables, et la porte vérifie ensuite le couple. Les
 * compter aurait mesuré la POPULARITÉ d'un idiome au lieu d'une propriété —
 * l'erreur du cycle 107, dont le balayage fut JETÉ plutôt que gelé.
 *
 * Le discriminant ne retient donc que les cibles qui EFFACENT :
 *
 * | cast | ce qu'il détruit |
 * |---|---|
 * | `as never` | tout : `never` est assignable à n'importe quel paramètre |
 * | `as any` | la FORME de la charge |
 * | `as unknown` | idem, par le haut |
 * | `as keyof ServerToClientEvents` | la CORRÉLATION — un nom en union admet la charge de n'importe quel membre (cycle 104) |
 *
 * **Quand il tombe** : la réparation est de NARROWER le type jusqu'au site
 * d'appel (un paramètre générique `E extends ServerEventName` porte la
 * corrélation ; un rappel qui n'émet qu'un canal le DÉCLARE), jamais de déplacer
 * le cast ni d'ajouter une ligne à un inventaire — il n'y a pas de couple non
 * vérifié légitime à porter. L'unique effacement sanctionné du dépôt vit dans
 * `emitServerEvent`, **une fois**, et il est documenté sur place.
 */
export interface ErasingEmitArgumentCast {
  readonly file: string;
  readonly argument: string;
}

/**
 * Les cibles de cast qui EFFACENT, ancrées en FIN d'argument.
 *
 * L'ancre `$` est ce qui distingue un cast portant sur l'argument ENTIER d'un
 * cast niché dans une sous-expression (`{ x: y as any }`) : le second est une
 * question de CHAMP, pas de canal, et la poser ici mélangerait deux propriétés.
 */
const ERASING_CAST = /\bas\s+(never|any|unknown|keyof\s+ServerToClientEvents)\s*$/;

/**
 * Les arguments de PREMIER NIVEAU d'un appel, lus en équilibrant les délimiteurs.
 *
 * Une expression régulière ne peut pas le faire : une charge littérale porte ses
 * propres virgules, et c'est la forme NORMALE du second argument. Rend `null`
 * quand l'appel n'est pas refermé dans le fichier (source tronquée) — se taire
 * plutôt que deviner.
 */
function topLevelArguments(source: string, openIndex: number): string[] | null {
  let depth = 0;
  let current = '';
  const args: string[] = [];

  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if ('([{'.includes(char)) {
      depth += 1;
      if (depth === 1) continue;
    } else if (')]}'.includes(char)) {
      depth -= 1;
      if (depth === 0) {
        args.push(current);
        return args;
      }
    }
    if (depth === 1 && char === ',') {
      args.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  return null;
}

export function sweepErasingEmitArgumentCasts(srcDir: string): ErasingEmitArgumentCast[] {
  const found: ErasingEmitArgumentCast[] = [];

  for (const file of walk(srcDir)) {
    const relative = file.slice(srcDir.length + 1);
    if (relative.includes('__tests__') || relative.endsWith('.test.ts')) continue;

    const source = stripComments(readFileSync(file, 'utf8'));
    let index = source.indexOf('.emit(');

    while (index !== -1) {
      const open = index + '.emit'.length;
      const args = topLevelArguments(source, open);
      index = source.indexOf('.emit(', open);
      if (args === null) continue;

      // Seuls le CANAL et la CHARGE : un troisième argument est un ack, dont la
      // forme est une autre question que celle de ce balayage.
      for (const argument of args.slice(0, 2)) {
        const trimmed = argument.trim();
        if (ERASING_CAST.test(trimmed)) found.push({ file: relative, argument: trimmed });
      }
    }
  }

  return found;
}
