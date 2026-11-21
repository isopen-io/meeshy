import * as fs from 'fs';
import * as path from 'path';

import {
  AUDIENCE_SCOPE,
  assertRootExists,
  balancedBlock,
  balancedObjectBody,
  callArguments,
  namesAParticularMember,
  resolveLocalWhere,
  spellsTheLawForAudit,
  stripComments,
  unreadableForm
} from './conversation-audience-living-participation';

/**
 * **LES PORTES À CLÉ D'APPELANT — LE BALAYAGE FRÈRE** (#20155).
 *
 * ## La lacune que ce fichier ferme
 *
 * `sweepConversationAudiences` relève les AUDIENCES : « qui REÇOIT ». Son
 * discriminant écarte DÉLIBÉRÉMENT toute clause qui NOMME une personne
 * (#20100), et il a raison — une audience est un ENSEMBLE, et compter une
 * porte parmi les audiences noierait le signal que #20091/#20100 ont construit.
 *
 * La conséquence a été mesurée en livrant #20135 : **toute porte qui résout
 * l'appelant par son propre `userId` est hors de portée de ce cliquet par
 * construction.** Le relevé de `routes/links/management.ts` y est
 * littéralement vide — ni audience, ni publication d'illisibilité — et ce
 * fichier portait exactement le défaut que le cliquet existe pour empêcher.
 * Trois défauts de sécurité de cette famille ont été livrés en deux jours
 * (#20104, #20135, #20136) : le cliquet gardait les audiences, personne ne
 * gardait les portes.
 *
 * ## Pourquoi DEUX discriminants, et pas « l'opposé » d'un seul
 *
 * L'issue parlait d'un balayage « de discriminant opposé ». Mesuré sur les
 * trois correctifs de référence, **les trois ne sont pas de la même forme**, et
 * un discriminant unique n'en retrouve qu'un :
 *
 * | défaut | la clause | le genre |
 * |---|---|---|
 * | #20135 | `where: { userId, isActive: true }` | **CLAUSE** — la clé de l'appelant est DANS le `where` |
 * | #20104 | `where: { isActive: true, type: 'user' }` puis `.find(m => m.userId === inviterId)` | **PRÉDICAT** — la clause est d'allure AUDIENCE, c'est le CODE qui en fait une porte |
 * | #20136 | `participants: { select: … }`, AUCUN `where`, puis `.filter(p => p.userId === userId && …)` | **PRÉDICAT** sur une projection sans clause du tout |
 *
 * Le discriminant « opposé » (une clause qui nomme l'appelant) retrouve
 * #20135 et **manque les deux autres** : leur clause ne nomme personne, elle
 * est large. Chaque site relevé dit donc LEQUEL des deux l'a attrapé — sans
 * quoi « le balayage est vert » ne voudrait pas dire la même chose d'un site à
 * l'autre.
 *
 * ## Ce que ce balayage ne fait PAS
 *
 * Il n'écrit rien dans les inventaires des audiences, et ne touche pas au
 * discriminant de l'autre. Les deux répondent à deux questions ; les fondre
 * transformerait « pas encore instruit » en « décidé large ».
 */

/** Les deux discriminants, nommés, parce qu'un site relevé doit dire lequel l'a vu. */
export type GenreDePorte =
  /** La clé de l'appelant est DANS le `where` de la lecture. */
  | 'clause'
  /** L'identité est comparée en CODE, sur une liste que la clause n'a pas restreinte à l'appelant. */
  | 'prédicat';

export type PorteAClePorteuse = {
  readonly file: string;
  readonly line: number;
  readonly genre: GenreDePorte;
  /** Le `where` lu (genre `clause`) ou le corps du rappel (genre `prédicat`), dépouillé. */
  readonly forme: string;
  /** Vrai quand la loi de participation vivante est épelée là où ce site la juge. */
  readonly epelleLaLoi: boolean;
};

/**
 * Ce que le balayage ne sait pas juger, et qu'il PUBLIE plutôt que de taire
 * (leçon #20091 : « un inventaire vide et un balayage aveugle sont le même
 * vert »).
 */
export type PorteNonJugeable = {
  readonly file: string;
  readonly line: number;
  readonly genre: GenreDePorte;
  readonly raison: RaisonDIllisibilite;
};

export type RaisonDIllisibilite =
  /** Le `where` n'a pas de littéral à lire — appel, ternaire, paramètre, import. */
  | 'where-illisible'
  /** Un prédicat d'identité dont la liste ne se rattache à AUCUNE projection du fichier. */
  | 'source-introuvable'
  /**
   * Un prédicat dont la liste se rattache à PLUSIEURS projections du fichier
   * qui ne s'accordent pas sur la loi : le verdict dépendrait du choix, donc
   * le balayage ne choisit pas.
   */
  | 'source-ambigue';

/**
 * La loi jugée EN CODE, et ses orthographes admises.
 *
 * `participationEstVivante(p)` est la forme unique du dépôt — la loi jugée sur
 * une ligne déjà lue (#20136). Les deux colonnes épelées à la main comptent
 * aussi : le cliquet garde une PROPRIÉTÉ, pas un nom de fonction.
 *
 * **Et `p.isActive !== false` ne compte PAS**, c'est ce que #20136 a corrigé :
 * il admet une ligne dont `isActive` est ABSENT. Une orthographe valide non
 * prévue est comptée NUE — « une relecture de trop coûte moins qu'une fausse
 * certification » (§ cliquet des audiences).
 */
const LOI_EN_CODE = ['participationEstVivante'] as const;

function jugeLaLoiEnCode(corps: string): boolean {
  if (LOI_EN_CODE.some(nom => corps.includes(`${nom}(`))) return true;
  // Les deux colonnes à la main : la POLARITÉ compte autant que le mot.
  const actif = /\.isActive\s*===\s*true|\.isActive\s*&&/.test(corps);
  const banni = /\.bannedAt\s*(?:==|===)\s*null|!\s*\w+\.bannedAt/.test(corps);
  return actif && banni;
}

/**
 * Un rappel COMPARE-t-il une identité ?
 *
 * C'est ce qui distingue un prédicat qui ouvre une PORTE (« est-ce MOI ? ») de
 * n'importe quel autre `.some` sur une liste de membres. `#20135` le montre
 * par la négative : son `.some` ne compare aucune identité, parce que son
 * `where` l'a déjà fait — ce site est une porte de genre `clause`, et le
 * compter deux fois le ferait apparaître sous deux clés pour un seul défaut.
 */
function compareUneIdentite(corps: string): boolean {
  return /\.(?:userId|id)\s*===\s*[A-Za-z_$][\w$.]*/.test(corps);
}

/** `id: { in: […] }` / `userId: { in: […] }` — une PLURALITÉ, donc une audience. */
function nommeUnePluralite(where: string): boolean {
  return /\b(?:id|userId)\s*:\s*\{\s*in\s*:/.test(where);
}

const PREDICATS = ['some', 'findIndex', 'find', 'filter', 'every'] as const;

/**
 * Le corps d'un appel, PARENTHÈSES équilibrées.
 *
 * `callArguments` du balayage des audiences cherche la prochaine ACCOLADE : il
 * lit `findFirst({ where: … })` parfaitement et **ne peut pas** lire un rappel
 * en flèche sans accolades. Mesuré en écrivant ce fichier : sur
 * `participants.find(m => m.userId === inviterId)` il rendait le bloc `{ return
 * sendForbidden(…) }` du `if` SUIVANT — du code voisin, parfaitement plausible,
 * sous lequel le discriminant d'identité rendait `false`. Les deux défauts de
 * référence du genre `prédicat` étaient donc INVISIBLES, et le balayage
 * publiait « 0 prédicat » comme une propriété du dépôt.
 *
 * C'est la leçon du cycle 107 reprise à la racine : un instrument qui ne sait
 * pas lire une forme ne doit pas rendre un ZÉRO qui se lit comme une absence.
 * Et les guillemets sont traversés, sans quoi une parenthèse dans une chaîne
 * (`'Vous n\'êtes pas membre (encore)'`) déséquilibre le compte.
 */
export function balancedParens(source: string, parenIndex: number): string | null {
  if (source[parenIndex] !== '(') return null;
  let depth = 0;
  let quote: string | null = null;
  for (let i = parenIndex; i < source.length; i += 1) {
    const char = source[i];
    if (quote !== null) {
      if (char === '\\') { i += 1; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(parenIndex + 1, i);
    }
  }
  return null;
}

/** Les projections `participants: { … }` d'un fichier, avec leur `where` lu ou son absence. */
type Projection = {
  readonly line: number;
  /** `null` ⇒ la projection ne porte AUCUN `where` : strictement plus large qu'`isActive` nu. */
  readonly where: string | null;
  readonly illisible: boolean;
};

function projectionsDuFichier(src: string, lineOf: (i: number) => number): readonly Projection[] {
  const found: Projection[] = [];
  const projected = /\bparticipants:\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = projected.exec(src)) !== null) {
    const block = balancedBlock(src, match.index + match[0].length - 1);
    if (block === null) continue;
    const line = lineOf(match.index);
    const at = block.indexOf('where:');
    if (at < 0) {
      found.push({ line, where: null, illisible: false });
      continue;
    }
    const after = block.slice(at + 'where:'.length);
    const forme = unreadableForm(after);
    const local = forme === 'variable'
      ? resolveLocalWhere(src, (after.trimStart().match(/^[A-Za-z_$][\w$]*/) ?? [''])[0])
      : null;
    if (forme !== '' && local === null) {
      found.push({ line, where: null, illisible: true });
      continue;
    }
    const where = local ?? balancedObjectBody(block, block.indexOf('{', at) + 1);
    found.push({ line, where, illisible: where === null });
  }
  return found;
}

/**
 * Les lectures SINGULIÈRES, et c'est une décision de portée, pas un oubli.
 *
 * `count`, `aggregate` et `groupBy` sont des **MESURES**, et le dépôt a déjà
 * tranché leur régime (§ « Une audience de diffusion lit la participation
 * VIVANTE » du `CLAUDE.md` de la passerelle) : « dire ce que le nombre
 * alimente ; la troncature et le sur-comptage y sont des nombres FAUX, pas des
 * fuites ». Les compter parmi les portes mettrait 41 mesures dans un inventaire
 * de sécurité, où chacune se lirait comme une autorisation.
 *
 * `findMany` est ÉCARTÉ pour une raison différente et plus forte : une lecture
 * plurielle rend un ENSEMBLE, donc c'est une audience — et les audiences ont
 * déjà leur cliquet. Ce qui reste ici est ce que l'autre ne voit pas.
 */
const LECTURES_SINGULIERES = /participant\.(findFirst|findUnique)\(/g;

export function sweepCallerKeyedDoors(): PorteAClePorteuse[] {
  return walkCallerKeyedDoors().portes;
}

export function sweepUnjudgeableCallerKeyedDoors(): PorteNonJugeable[] {
  return walkCallerKeyedDoors().nonJugeables;
}

export type RacineDeBalayage = { readonly prefix: string; readonly dir: string };

/**
 * Le même balayage sur des racines DONNÉES — la preuve de ROUGE, et rien d'autre.
 *
 * Un cliquet neuf se livre avec sa preuve de ROUGE (leçon du 2026-11-20), et
 * celle-ci ne peut pas s'écrire sur l'arbre courant : les trois défauts de
 * référence y sont CORRIGÉS. Elle s'écrit donc sur l'arbre d'AVANT chacun, et
 * la seule façon honnête d'y arriver est d'extraire le fichier à son état
 * d'alors et de balayer ce dossier-là.
 *
 * Les racines ne sont pas devenues un paramètre du balayage de production :
 * `sweepCallerKeyedDoors()` garde les siennes, déclarées, et une racine
 * absente JETTE toujours. Un cliquet dont l'appelant choisit la portée se
 * désarme d'un argument.
 */
export function sweepCallerKeyedDoorsIn(
  racines: ReadonlyArray<RacineDeBalayage>
): { portes: PorteAClePorteuse[]; nonJugeables: PorteNonJugeable[] } {
  return walkCallerKeyedDoors(racines);
}

function walkCallerKeyedDoors(
  racines: ReadonlyArray<RacineDeBalayage> = AUDIENCE_SCOPE
): { portes: PorteAClePorteuse[]; nonJugeables: PorteNonJugeable[] } {
  const portes: PorteAClePorteuse[] = [];
  const nonJugeables: PorteNonJugeable[] = [];

  const walk = (dir: string, prefix: string, root: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full, prefix, root);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
      const src = stripComments(fs.readFileSync(full, 'utf8'));
      const file = `${prefix}${path.relative(root, full)}`;
      const lineOf = (index: number): number => src.slice(0, index).split('\n').length;

      releverLesClauses(src, file, lineOf, portes, nonJugeables);
      releverLesPredicats(src, file, lineOf, portes, nonJugeables);
    }
  };

  for (const { prefix, dir } of racines) {
    assertRootExists(dir);
    walk(dir, prefix, dir);
  }
  return { portes, nonJugeables };
}

/**
 * Discriminant A — le `where` NOMME une personne.
 *
 * C'est le COMPLÉMENT EXACT de `namesAParticularMember`, la fonction par
 * laquelle le balayage des audiences écarte ces sites. Partager la fonction
 * plutôt que la réécrire n'est pas une économie : deux copies d'un
 * discriminant dérivent, et les deux balayages se mettraient à ignorer le même
 * site chacun pour la raison de l'autre.
 */
function releverLesClauses(
  src: string,
  file: string,
  lineOf: (i: number) => number,
  portes: PorteAClePorteuse[],
  nonJugeables: PorteNonJugeable[]
): void {
  const lectures: Array<{ readonly index: number; readonly args: string | null }> = [];
  let match: RegExpExecArray | null;
  const called = new RegExp(LECTURES_SINGULIERES.source, 'g');
  while ((match = called.exec(src)) !== null) {
    lectures.push({ index: match.index, args: callArguments(src, match.index + match[0].length - 1) });
  }
  // Les projections imbriquées portent elles aussi des `where` qui nomment
  // l'appelant : `loadShareLinkForManagement` (#20135) est de cette forme.
  const projected = /\bparticipants:\s*\{/g;
  while ((match = projected.exec(src)) !== null) {
    lectures.push({ index: match.index, args: balancedBlock(src, match.index + match[0].length - 1) });
  }

  for (const { index, args } of lectures) {
    const line = lineOf(index);
    if (args === null) continue;
    const at = args.indexOf('where:');
    if (at < 0) continue;
    const after = args.slice(at + 'where:'.length);
    const forme = unreadableForm(after);
    const local = forme === 'variable'
      ? resolveLocalWhere(src, (after.trimStart().match(/^[A-Za-z_$][\w$]*/) ?? [''])[0])
      : null;
    if (forme !== '' && local === null) {
      // Publié SEULEMENT si la lecture est bien une porte — mais on ne peut pas
      // le savoir sans lire le `where`. Un illisible est donc publié tel quel :
      // c'est le prix de l'honnêteté, et il est petit.
      nonJugeables.push({ file, line, genre: 'clause', raison: 'where-illisible' });
      continue;
    }
    const where = local ?? balancedObjectBody(args, args.indexOf('{', at) + 1);
    if (where === null) {
      nonJugeables.push({ file, line, genre: 'clause', raison: 'where-illisible' });
      continue;
    }
    if (!namesAParticularMember(where)) continue;
    // Une identité PLURIELLE (`id: { in: […] }`) désigne un ENSEMBLE, donc une
    // audience : c'est l'affaire de l'autre cliquet, pas d'une porte. Sans
    // cette exclusion, 41 hydratations par lot entraient dans un inventaire de
    // sécurité où elles se liraient comme des autorisations.
    if (nommeUnePluralite(where)) continue;
    portes.push({ file, line, genre: 'clause', forme: condense(where), epelleLaLoi: spellsTheLawForAudit(where) });
  }
}

/**
 * Discriminant B — l'identité est comparée EN CODE.
 *
 * ## Pourquoi le verdict ne peut pas se lire sur le seul rappel
 *
 * #20104 le prouve : son correctif a mis la loi dans la CLAUSE, et son rappel
 * est resté `m => m.userId === inviterId` — sans loi. Un balayage qui ne
 * jugerait que le rappel rendrait donc ce site NU alors qu'il est juste, et un
 * cliquet qui rougit sur du code correct se désactive en une semaine.
 *
 * ## Et pourquoi le rattachement ne DEVINE jamais un verdict
 *
 * La liste prédiquée se rattache à la projection `participants:` la plus proche
 * EN AMONT du même fichier. C'est une heuristique — et elle est rendue SANS
 * CONSÉQUENCE sur le verdict : quand plusieurs projections la précèdent et que
 * **leurs verdicts de loi diffèrent**, le site est publié `source-ambigue`
 * plutôt que jugé. Le choix de la plus proche ne décide donc jamais à lui seul
 * d'un vert ou d'un rouge ; il ne tranche que les cas où toutes les candidates
 * disent la même chose.
 */
function releverLesPredicats(
  src: string,
  file: string,
  lineOf: (i: number) => number,
  portes: PorteAClePorteuse[],
  nonJugeables: PorteNonJugeable[]
): void {
  const projections = projectionsDuFichier(src, lineOf);
  const predicat = new RegExp(`\\bparticipants\\s*\\.\\s*(?:${PREDICATS.join('|')})\\s*\\(`, 'g');
  let match: RegExpExecArray | null;
  while ((match = predicat.exec(src)) !== null) {
    const corps = balancedParens(src, match.index + match[0].length - 1);
    if (corps === null) continue;
    if (!compareUneIdentite(corps)) continue;
    const line = lineOf(match.index);

    if (jugeLaLoiEnCode(corps)) {
      portes.push({ file, line, genre: 'prédicat', forme: condense(corps), epelleLaLoi: true });
      continue;
    }

    const amont = projections.filter(p => p.line <= line);
    if (amont.length === 0) {
      nonJugeables.push({ file, line, genre: 'prédicat', raison: 'source-introuvable' });
      continue;
    }
    if (amont.some(p => p.illisible)) {
      nonJugeables.push({ file, line, genre: 'prédicat', raison: 'source-ambigue' });
      continue;
    }
    const verdicts = new Set(amont.map(p => (p.where !== null && spellsTheLawForAudit(p.where))));
    if (verdicts.size > 1) {
      nonJugeables.push({ file, line, genre: 'prédicat', raison: 'source-ambigue' });
      continue;
    }
    portes.push({ file, line, genre: 'prédicat', forme: condense(corps), epelleLaLoi: verdicts.has(true) });
  }
}

/** Une forme lisible dans un message d'échec : espaces repliés, longueur bornée. */
function condense(texte: string): string {
  const plat = texte.replace(/\s+/g, ' ').trim();
  return plat.length > 160 ? `${plat.slice(0, 157)}…` : plat;
}

/**
 * La clé d'un site est `fichier#rang-du-genre`, **jamais le numéro de ligne**.
 *
 * Et le rang est compté PAR GENRE, ce qui est la troisième difficulté annoncée
 * par #20155 : une porte peut vivre dans une fonction partagée
 * (`loadShareLinkForManagement` sert trois routes), donc la clé désigne la
 * LECTURE et non la route. Compter les deux genres dans un rang commun
 * reclasserait l'inventaire entier dès qu'un prédicat apparaît avant une
 * clause dans un fichier qui porte les deux.
 */
export function porteKey(sites: readonly PorteAClePorteuse[], site: PorteAClePorteuse): string {
  const memeGenre = sites.filter(s => s.file === site.file && s.genre === site.genre);
  return `${site.file}#${site.genre}:${memeGenre.indexOf(site)}`;
}
