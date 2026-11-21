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
 *
 * ## Ce qu'il NE VOIT PAS — à dire, parce qu'un zéro TU se lit comme une absence
 *
 * Mesuré par l'audit adversarial du lot. Aucune de ces formes n'existe
 * aujourd'hui dans la portée, mais le balayage y rend un ZÉRO et non un « je
 * ne sais pas » — ce que ce fichier reproche justement à `callArguments` :
 *
 * | forme | exemple |
 * |---|---|
 * | la liste passe par un ALIAS | `const m = conv.participants; m.find(p => p.userId === userId)` |
 * | une boucle au lieu d'un prédicat | `for (const p of conv.participants) if (p.userId === userId)` |
 * | un `where` keyé APRÈS un `where` imbriqué du même appel | le balayage lit le PREMIER `where:` des arguments |
 *
 * Suivi : #20263. La comparaison INVERSÉE (`userId === p.userId`) était de
 * cette liste ; elle est vue depuis que `compareUneIdentite` lit les deux sens.
 *
 * ## Le QUATRIÈME genre est hors de ce balayage, et PAS couvert par lui
 *
 * `conversation.findX({ where: { participants: { some: { userId, isActive: true } } } })`
 * — un FILTRE DE RELATION — décide de ce que l'appelant a le droit d'OUVRIR.
 * `releverLesClauses` lit le `where:` À L'INTÉRIEUR d'un bloc
 * `participants: { … }` ; un `{ some: { … } }` n'en porte aucun, donc le site
 * sort sans publication.
 *
 * Ce genre est DÉJÀ nommé sur `dev` —
 * `__tests__/unit/routes/conversations/caller-relation-filter-living-participation.test.ts`
 * (#20209) l'appelle « le quatrième genre de porte keyée sur l'appelant » et
 * mesure 30 filtres keyés dont aucun n'épelait la loi — mais il n'en resserre
 * que quatre, par un témoin de COMPORTEMENT, SANS cliquet d'inventaire.
 * Prouvé par l'audit du lot : remettre `list-viewer-scope.ts` sur `isActive`
 * nu laisse les QUATRE cliquets d'inventaire VERTS. Suivi : #20262.
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
  // Les DEUX sens. `userId === p.userId` est la même porte que
  // `p.userId === userId`, et l'audit du lot a mesuré que seul le second
  // était vu — une porte ne change pas de nature avec l'ordre de ses
  // opérandes (règle du cycle 105 : chercher une forme par UNE de ses
  // écritures, c'est manquer les autres).
  return /\.(?:userId|id)\s*===\s*[A-Za-z_$][\w$.]*/.test(corps)
    || /[A-Za-z_$][\w$.]*\s*===\s*[A-Za-z_$][\w$.]*\.(?:userId|id)\b/.test(corps);
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

/**
 * Une CANDIDATE : une lecture du fichier qui pourrait avoir produit la liste
 * qu'un prédicat parcourt. Projection `participants: { … }` ou lecture
 * PLURIELLE de `Participant` — les deux rendent une liste.
 */
type Candidate = {
  readonly line: number;
  /** `null` ⇒ aucune clause : strictement plus large qu'`isActive` nu. */
  readonly where: string | null;
  readonly illisible: boolean;
};

/**
 * Toutes les candidates du fichier — **sans aucune notion de position.**
 *
 * La première version élisait « la projection la plus proche EN AMONT » et
 * déclarait l'heuristique sans conséquence sur le verdict, au motif qu'un
 * désaccord entre candidates publie `source-ambigue`. **Mesuré faux** par
 * l'audit adversarial du lot : la précaution ne couvrait que le désaccord
 * entre DEUX candidates ou plus, et le cas à UNE candidate — le plus
 * fréquent — était tranché par la position, sans garde. Deux contre-exemples
 * rendaient un VERT sur une porte nue : une liste venue d'un `findMany` nu du
 * même fichier, et une projection nue déclarée EN AVAL du prédicat (fonction
 * hissée). « Un cliquet qui se trompe dans le sens rassurant » est nommément
 * interdit par le `CLAUDE.md` de la passerelle.
 *
 * Le balayage ne sait pas suivre un flot de données, et il ne le prétend plus.
 * Il ne conclut au VERT que si **TOUTE** candidate du fichier épelle la loi —
 * la position ne décide plus de rien, donc elle n'est plus lue. Un fichier qui
 * mélange une projection conforme et une lecture nue est `source-ambigue` :
 * publié, jamais vert.
 */
function candidatesDuFichier(src: string, lineOf: (i: number) => number): readonly Candidate[] {
  const found: Candidate[] = [];
  const lire = (bloc: string, line: number, cherchePremierWhere: boolean): void => {
    const at = bloc.indexOf('where:');
    if (at < 0) {
      found.push({ line, where: null, illisible: false });
      return;
    }
    const after = bloc.slice(at + 'where:'.length);
    const forme = unreadableForm(after);
    const local = forme === 'variable'
      ? resolveLocalWhere(src, (after.trimStart().match(/^[A-Za-z_$][\w$]*/) ?? [''])[0])
      : null;
    if (forme !== '' && local === null) {
      found.push({ line, where: null, illisible: true });
      return;
    }
    const where = local ?? balancedObjectBody(bloc, bloc.indexOf('{', at) + 1);
    found.push({ line, where, illisible: where === null || !cherchePremierWhere });
  };

  let match: RegExpExecArray | null;
  const projected = /\bparticipants:\s*\{/g;
  while ((match = projected.exec(src)) !== null) {
    const block = balancedBlock(src, match.index + match[0].length - 1);
    if (block !== null) lire(block, lineOf(match.index), true);
  }
  // Les lectures PLURIELLES rendent une liste elles aussi. Elles sont hors du
  // relevé des PORTES (une liste est une audience), mais elles sont des
  // candidates : ignorer celle-ci était le premier des deux faux verts.
  const plurielles = /participant\.findMany\(/g;
  while ((match = plurielles.exec(src)) !== null) {
    const args = callArguments(src, match.index + match[0].length - 1);
    if (args !== null) lire(args, lineOf(match.index), true);
  }
  return found;
}

/**
 * Les lectures SINGULIÈRES — une décision de portée, et sa DETTE, mesurée.
 *
 * `count`, `aggregate` et `groupBy` sont ÉCARTÉS parce que le dépôt a tranché
 * le régime des MESURES (§ « Une audience de diffusion lit la participation
 * VIVANTE » du `CLAUDE.md` de la passerelle) : « dire ce que le nombre
 * alimente ; la troncature et le sur-comptage y sont des nombres FAUX, pas des
 * fuites ». `findMany` est écarté parce qu'une lecture plurielle rend un
 * ENSEMBLE, c'est-à-dire une audience.
 *
 * **Et il ne faut PAS en conclure que ces quatre méthodes sont couvertes
 * ailleurs.** La première version de ce commentaire écrivait « `findMany` rend
 * un ensemble, donc une audience, QUI A DÉJÀ SON CLIQUET » — mesuré FAUX par
 * l'audit adversarial du lot. Le cliquet des audiences écarte toute clause qui
 * NOMME une personne (`namesAParticularMember`) : une lecture plurielle ou une
 * mesure dont le `where` nomme l'APPELANT n'est donc vue par AUCUN des deux
 * balayages — la lacune exacte que ce fichier existe pour fermer, rouverte
 * pour quatre méthodes Prisma. Mesuré : 44 sites, dont 41 nus (#20260).
 *
 * Et « ce sont des mesures » est faux d'au moins un site :
 * `socketio/call-preview-events.ts` fait d'un `count(…) > 0` le SEUL contrôle
 * d'appartenance de l'aperçu AVANT décroché. Là, le nombre EST l'autorisation,
 * et la troncature n'y est pas un nombre faux, c'est un laissez-passer
 * (#20261).
 *
 * > **Une exclusion de portée est une AFFIRMATION, comme un compte ou un
 * > tri.** Celle-ci disait deux choses : « ces sites sont hors de MA portée »
 * > (vrai, c'est une décision) et « ils sont couverts » (faux, c'est une
 * > dette). Un cliquet qui annonce la seconde endort la question même qu'il
 * > devait poser.
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
    // audience : l'affaire de l'autre cliquet, pas d'une porte.
    //
    // **Elle n'écarte RIEN dans la portée de ce balayage — mesuré 0 site**, et
    // la première version de ce commentaire annonçait « 41 hydratations par
    // lot ». Ce 41 est le compte de la portée `findMany`, où cette exclusion
    // ne s'applique pas : un chiffre hérité d'un AUTRE discriminant, recopié
    // pour justifier un no-op. « Un compte est une AFFIRMATION » (cycle 93),
    // appliqué au lot qui cite la leçon. GARDÉE malgré cela : rien n'empêche
    // qu'un `findFirst({ where: { id: { in: … } } })` apparaisse demain.
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
  const candidates = candidatesDuFichier(src, lineOf);
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

    if (candidates.length === 0) {
      nonJugeables.push({ file, line, genre: 'prédicat', raison: 'source-introuvable' });
      continue;
    }
    // Le verdict exige l'UNANIMITÉ des candidates du fichier, et il est
    // SYMÉTRIQUE : toutes épellent la loi ⇒ VERT ; aucune ne l'épelle ⇒ NU.
    // Un MÉLANGE, ou une candidate illisible, ne permet aucune conclusion —
    // c'est là, et seulement là, que la provenance de la liste déciderait.
    //
    // La symétrie n'est pas une commodité : sans elle, un fichier dont la
    // SEULE candidate est nue sortait du relevé des portes pour aller dans les
    // publications, alors que c'est le cas où la conclusion est la plus sûre.
    // Le resserrement qui a fermé les faux verts avait d'abord emporté ce
    // cas-là, et avec lui le constat le plus sérieux du balayage.
    // Une candidate SANS clause (`where === null`) n'est pas illisible : elle
    // est knowablement plus large qu'`isActive` nu, donc elle n'épelle pas la
    // loi — c'est une conclusion, pas une incertitude. Seule une candidate
    // qu'on n'a pas su LIRE interdit de conclure.
    if (candidates.some(c => c.illisible)) {
      nonJugeables.push({ file, line, genre: 'prédicat', raison: 'source-ambigue' });
      continue;
    }
    const epellent = candidates.map(c => c.where !== null && spellsTheLawForAudit(c.where));
    if (new Set(epellent).size > 1) {
      nonJugeables.push({ file, line, genre: 'prédicat', raison: 'source-ambigue' });
      continue;
    }
    portes.push({ file, line, genre: 'prédicat', forme: condense(corps), epelleLaLoi: epellent[0] });
  }
}

/** Une forme lisible dans un message d'échec : espaces repliés, longueur bornée. */
function condense(texte: string): string {
  const plat = texte.replace(/\s+/g, ' ').trim();
  return plat.length > 160 ? `${plat.slice(0, 157)}…` : plat;
}

/**
 * La clé d'une PUBLICATION, rang compris.
 *
 * Sans rang, sept paires de publications du relevé portaient la même chaîne
 * (deux `where-illisible` dans un même fichier, par exemple) — et deux
 * chaînes identiques dans une comparaison de tableaux s'annulent : un
 * illisible RÉPARÉ et un illisible NEUF dans le même fichier laissaient le
 * cliquet VERT. Un cliquet qui ne sait pas compter ses propres aveux
 * d'ignorance en perd la moitié sans le dire.
 */
export function publicationKey(
  publications: readonly PorteNonJugeable[],
  publication: PorteNonJugeable
): string {
  const memes = publications.filter(
    p => p.file === publication.file && p.genre === publication.genre && p.raison === publication.raison
  );
  return `${publication.file}#${publication.genre}/${publication.raison}:${memes.indexOf(publication)}`;
}

/**
 * La clé d'un site est `fichier#genre:FORME`, **et surtout pas son rang.**
 *
 * La première version keyait par rang d'apparition (`fichier#clause:0`), en
 * annonçant la clé « stable à l'édition ». Elle ne l'était que contre les
 * éditions qui n'ajoutent ni ne retirent de porte — et l'audit adversarial du
 * lot a mesuré ce que coûtait le reste : insérer une porte nue EN TÊTE de
 * `target-participant.ts`, qui porte les DEUX clés instruites de
 * `PORTES_DELIBEREMENT_LARGES`, faisait rougir le cliquet en nommant
 * `#clause:2` — alors que la porte NEUVE est la première, les deux anciennes
 * ayant glissé d'un rang.
 *
 * Le mainteneur qui suit l'instruction du témoin (« ENTRANTE = une porte
 * NEUVE : instruire sa loi ») resserrait alors la lecture de #10465, rendant un
 * banni INTROUVABLE donc indébannissable. **Le cliquet envoyait réparer ce qui
 * tient**, et son message ne contenait rien qui permette de s'en apercevoir.
 * Afficher la ligne ne suffisait pas : la ligne affichée était celle de la
 * VOISINE qui avait glissé, pas celle de la porte neuve.
 *
 * La FORME est donc la clé. Elle ne bouge pas quand une porte apparaît
 * ailleurs dans le fichier, et elle change exactement quand la clause change —
 * c'est-à-dire quand on VEUT une reclassification. Deux portes de forme
 * identique dans un même fichier se départagent par un rang, qui ne concerne
 * alors qu'elles deux.
 */
export function porteKey(sites: readonly PorteAClePorteuse[], site: PorteAClePorteuse): string {
  const forme = site.forme.length > 72 ? `${site.forme.slice(0, 69)}...` : site.forme;
  const base = `${site.file}#${site.genre}:${forme}`;
  const memeForme = sites.filter(
    s => s.file === site.file && s.genre === site.genre && s.forme === site.forme
  );
  return memeForme.length > 1 ? `${base} [${memeForme.indexOf(site)}]` : base;
}
