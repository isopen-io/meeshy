/**
 * Le balayage des BOUCHONS DE SCHÉMA DE RÉPONSE dans les suites du gateway (#4649).
 *
 * ## Ce qu'un bouchon de schéma remplace
 *
 * Une route Fastify déclare son contrat de sortie dans `schema.response`, et
 * `fast-json-stringify` le fait RESPECTER : tout champ que le schéma ne déclare
 * pas est SUPPRIMÉ de la réponse, en silence. Le dépôt a corrigé six fois en
 * deux jours un champ calculé puis effacé faute d'être déclaré (#4487 §2,
 * #4535, #3736, #4641, #4648, `currentUserConsumption` de #3909) — et les six
 * ont été trouvés en LISANT du code, jamais par un témoin.
 *
 * La raison est mesurée : 85 suites du gateway posaient
 *
 * ```ts
 * jest.mock('@meeshy/shared/types/api-schemas', () => ({
 *   errorResponseSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
 * }));
 * ```
 *
 * une propriété là où le vrai schéma en déclare cinq.
 *
 * > **Un bouchon de schéma n'isole pas une dépendance : il remplace l'objet
 * > TESTÉ.** Pour une route dont le contrat EST le schéma, mocker le schéma
 * > revient à mocker la conclusion.
 *
 * Et la substitution n'a pas de direction sûre. Mesuré sur ce dépôt avec
 * `fast-json-stringify@7`, la même charge `{success,error,message,code,retryAfter}` :
 *
 * | forme du bouchon | ce qui sort |
 * |---|---|
 * | le vrai schéma | `{success,error,message,code}` — `retryAfter` supprimé |
 * | `{ type:'object', properties:{} }` | `{}` — plus STRICT que la production |
 * | `{ type:'object' }` | `{}` |
 * | `{}` / `{ additionalProperties:true }` | TOUT passe — plus PERMISSIF |
 *
 * Un bouchon strict rend un témoin AVEUGLE (il n'assert plus rien du corps) ;
 * un bouchon permissif le rend MENTEUR (il atteste un champ que la production
 * supprime). Aucun ne mesure le contrat.
 *
 * ## Ce que ce module NE dit pas
 *
 * Il ne parle que des schémas de RÉPONSE. Bouchonner un schéma de REQUÊTE
 * (`registerRequestSchema`, `establishSessionRequestSchema`, un schéma Zod avec
 * son `.parse`) est un risque AUTRE — un bouchon permissif y masque un REFUS
 * attendu au lieu d'un champ supprimé — et il se traite dans son propre lot. Le
 * classement se fait donc sur la PRODUCTION : est identifiant de réponse ce que
 * les routes citent dans un bloc `response:`, jamais ce dont le nom y ressemble.
 *
 * @module schema-stub-sweep
 */
import { readFileSync } from 'fs';
import { relative } from 'path';

import { walk, isHandWrittenTest } from './file-size-sweep';

/** Un `.ts` de production du gateway : ni suite, ni déclaration. */
const estSourceDeProduction = (path: string): boolean =>
  path.endsWith('.ts') && !path.endsWith('.d.ts') && !path.split(/[\\/]/).includes('__tests__');

/**
 * Avance d'un caractère en sautant les chaînes ENTIÈRES.
 *
 * Sans ce saut, une accolade ou une parenthèse dans un littéral de chaîne
 * (`'{'`, `"}"`, un gabarit) déséquilibre le compteur et le balayage rend des
 * blocs tronqués — silencieusement, puisqu'un bloc tronqué contient encore des
 * identifiants plausibles.
 */
const finDeChaine = (source: string, depart: number): number => {
  const guillemet = source[depart];
  let i = depart + 1;
  while (i < source.length && source[i] !== guillemet) {
    if (source[i] === '\\') i += 1;
    i += 1;
  }
  return i + 1;
};

/** Le bloc équilibré qui commence à `depart` (un `{` ou un `(`), fin EXCLUE. */
const finDuBloc = (source: string, depart: number): number => {
  const ouvrants = '{(['; const fermants = '})]';
  let profondeur = 0;
  let i = depart;
  while (i < source.length) {
    const c = source[i];
    if (c === "'" || c === '"' || c === '`') { i = finDeChaine(source, i); continue; }
    if (ouvrants.includes(c)) profondeur += 1;
    else if (fermants.includes(c)) { profondeur -= 1; if (profondeur === 0) return i + 1; }
    i += 1;
  }
  return source.length;
};

/**
 * Retire les COMMENTAIRES avant toute analyse.
 *
 * Sans cette passe, le doc-comment de ce module — qui MONTRE un bouchon en
 * exemple — se dénonce lui-même, et tout `jest.mock` commenté au-dessus d'un
 * correctif compterait comme un bouchon vivant. Un cliquet qui rougit sur une
 * phrase cesse d'être lu.
 */
const sansCommentaires = (source: string): string => {
  let sortie = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "'" || c === '"' || c === '`') {
      const fin = finDeChaine(source, i);
      sortie += source.slice(i, fin);
      i = fin;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      const fin = source.indexOf('\n', i);
      i = fin < 0 ? source.length : fin;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const fin = source.indexOf('*/', i + 2);
      i = fin < 0 ? source.length : fin + 2;
      continue;
    }
    sortie += c;
    i += 1;
  }
  return sortie;
};

const IDENTIFIANT_DE_SCHEMA = /\b([A-Za-z][A-Za-z0-9_]*Schema)\b/g;

/**
 * Les identifiants de schéma cités dans un bloc `response:` d'une route.
 *
 * On lit la PRODUCTION plutôt qu'un inventaire écrit à la main : une liste de
 * noms périme au premier schéma ajouté, et personne ne relit une liste qui ne
 * rougit jamais.
 */
export const identifiantsDeReponse = (texte: string): ReadonlySet<string> => {
  const source = sansCommentaires(texte);
  const trouves = new Set<string>();
  const re = /\bresponse\s*:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const debut = m.index + m[0].length - 1;
    const bloc = source.slice(debut, finDuBloc(source, debut));
    for (const id of bloc.matchAll(IDENTIFIANT_DE_SCHEMA)) trouves.add(id[1]);
    re.lastIndex = debut;
  }
  return trouves;
};

export type CleReecrite = {
  readonly spec: string;
  readonly cle: string;
};

/**
 * Les clés `*Schema` RÉÉCRITES À LA MAIN dans une fabrique `jest.mock` d'un
 * module de types partagés.
 *
 * « Réécrite » veut dire : la valeur est un littéral d'objet. Une clé servie par
 * `jest.requireActual` — directement ou par un étalement — n'est pas un
 * bouchon : c'est le vrai schéma, importé plutôt que retapé, ce qui est
 * précisément la forme que #4649 demande.
 */
export const clesReecrites = (texte: string): readonly CleReecrite[] => {
  const source = sansCommentaires(texte);
  const sorties: CleReecrite[] = [];
  const re = /jest\.mock\(\s*'(@meeshy\/shared\/types[^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const spec = m[1];
    const parenthese = source.indexOf('(', m.index);
    const corps = source.slice(parenthese, finDuBloc(source, parenthese));
    const litteral = corps.indexOf('=>');
    if (litteral < 0) continue;
    const accolade = corps.indexOf('{', litteral);
    if (accolade < 0) continue;
    const interieur = corps.slice(accolade + 1, finDuBloc(corps, accolade) - 1);
    let i = 0;
    let profondeur = 0;
    while (i < interieur.length) {
      const c = interieur[i];
      if (c === "'" || c === '"' || c === '`') { i = finDeChaine(interieur, i); continue; }
      if ('{(['.includes(c)) { profondeur += 1; i += 1; continue; }
      if ('})]'.includes(c)) { profondeur -= 1; i += 1; continue; }
      if (profondeur === 0) {
        const paire = interieur.slice(i).match(/^([A-Za-z][A-Za-z0-9_]*Schema)\s*:\s*/);
        if (paire !== null) {
          const valeur = interieur.slice(i + paire[0].length).trimStart();
          if (valeur.startsWith('{')) sorties.push({ spec, cle: paire[1] });
          i += paire[0].length;
          continue;
        }
      }
      i += 1;
    }
  }
  return sorties;
};

export type BouchonDeReponse = {
  readonly fichier: string;
  readonly spec: string;
  readonly cle: string;
};

export type Balayage = {
  /** Les suites lues — la borne de non-vacuité du cliquet. */
  readonly suitesLues: number;
  /** Les identifiants qu'un bloc `response:` de production cite. */
  readonly identifiantsDeReponse: ReadonlySet<string>;
  /** Un bouchon par couple (fichier, clé). */
  readonly bouchons: readonly BouchonDeReponse[];
};

/**
 * Le balayage complet : les schémas de RÉPONSE réécrits à la main dans les
 * suites, classés d'après ce que la production déclare.
 */
export const balayerBouchonsDeReponse = (racineSrc: string): Balayage => {
  const production = walk(racineSrc, estSourceDeProduction);
  const identifiants = new Set<string>();
  for (const fichier of production) {
    for (const id of identifiantsDeReponse(readFileSync(fichier, 'utf8'))) identifiants.add(id);
  }

  const suites = walk(racineSrc, isHandWrittenTest);
  const bouchons: BouchonDeReponse[] = [];
  for (const fichier of suites) {
    const source = readFileSync(fichier, 'utf8');
    if (!source.includes("jest.mock('@meeshy/shared/types")) continue;
    for (const { spec, cle } of clesReecrites(source)) {
      if (!identifiants.has(cle)) continue;
      bouchons.push({ fichier: relative(racineSrc, fichier), spec, cle });
    }
  }

  return { suitesLues: suites.length, identifiantsDeReponse: identifiants, bouchons };
};
