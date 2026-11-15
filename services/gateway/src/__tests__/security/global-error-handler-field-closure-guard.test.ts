/**
 * Le CLIQUET qui relie ce que le gestionnaire d'erreurs global POSE à ce que
 * `errorResponseSchema` DÉCLARE (#4689, critère 4).
 *
 * ## Le défaut que ce cliquet ferme — et pourquoi il fallait un cliquet
 *
 * `fast-json-stringify` ne supprime que là où un schéma EXISTE. Un champ posé
 * par le gestionnaire global mais absent du superset d'erreur voyage donc
 * intact sur une route qui ne déclare pas son 4xx, et DISPARAÎT sur une route
 * qui le déclare :
 *
 *   429 **déclaré** `...errorResponseSchema` → `{success, error, message, code, retryAfter}`
 *   429 **non déclaré**                      → `… + statusCode + timestamp`
 *
 * > **Le geste vertueux — déclarer son schéma — était celui qui faisait perdre
 * > des champs**, sur 595 déclarations de statut 4xx/5xx dans 112 modules de
 * > routes. C'est la SEPTIÈME fois que cette classe se paie (#4487 §2, #4535,
 * > #3736, #4641, #4648, #3909) ; les six premières étaient un champ sur une
 * > route, celle-ci était deux champs sur toute la surface d'erreur.
 *
 * Retirer `timestamp` et `statusCode` ferme ces deux champs-ci. **Ça ne ferme
 * pas la classe** : le huitième cas viendra du champ suivant qu'on posera sans
 * le déclarer, et il se trouvera à la lecture, comme les sept précédents. Ce
 * fichier est le livrable qui manque à ce remède.
 *
 * ## Ce que la garde mesure, en trois règles
 *
 * 1. **Ce que le gestionnaire écrit LUI-MÊME** — toute clé posée dans un
 *    `reply.…send({ … })` du gestionnaire, y compris à l'intérieur d'un
 *    étalement conditionnel (`...(config.isDev && { stack: … })`, la forme
 *    exacte que ce lot vient de retirer) — doit être DÉCLARÉE.
 * 2. **Ce qu'il étale** — un `...corps` sortant d'une fabrique — doit venir
 *    d'un producteur CONNU de cette garde, qui l'exerce pour de vrai et lit
 *    les clés qu'il rend. Un étalement neuf rougit tant qu'on ne lui a pas
 *    appris d'où il vient.
 * 3. **Ce que le gestionnaire RETIRE d'un étalement** (`const { statusCode,
 *    ...corps } = typed`) est lu DANS LE FICHIER, jamais recopié ici. Sans
 *    cela, la garde retirerait `statusCode` de son côté et resterait verte le
 *    jour où le gestionnaire cesserait de le faire — elle prouverait sa propre
 *    copie au lieu du code servi.
 *
 * La règle ne dit pas « ne pose pas `timestamp` » : elle dit « ce qui PART est
 * DÉCLARÉ ». Elle se satisfait donc des deux côtés — retirer le champ du
 * gestionnaire (remède 2, retenu) ou le déclarer dans le schéma (remède 1) —
 * ce qui est exactement ce qu'on attend d'une garde : elle interdit la
 * DIVERGENCE, pas un choix de remède.
 *
 * ## Ce que la garde ne sait pas voir
 *
 * Une clé calculée (`[cle]: v`) et un étalement dont la source n'est pas un
 * identifiant simple ne sont pas résolus : ils sont signalés comme sources
 * INCONNUES et rougissent. C'est le bon sens de l'échec — la garde refuse de
 * conclure sur ce qu'elle ne sait pas lire, plutôt que de l'ignorer.
 *
 * Patron repris de `unbounded-findmany-guard.test.ts` (inventaire comme
 * DONNÉE, non-vacuité prouvée, `stripComments` IMPORTÉ et non recopié) et de
 * `route-file-size-budget.test.ts` (le balayage prouve d'abord qu'il voit son
 * terrain). Le cas POSITIF — la garde rougit-elle vraiment ? — est prouvé par
 * le bloc « Ce que le balayage sait discriminer » en fin de fichier, sur des
 * sources synthétiques portant les défauts que ce lot vient de retirer.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import { errorResponseSchema } from '@meeshy/shared/types';

import { stripComments } from '../../routes/__tests__/response-schema-sweep';
import { schemaValidationErrorResponse } from '../../utils/schema-validation-error';
import * as Erreurs from '../../errors/custom-errors';

const SERVEUR = join(__dirname, '../../server.ts');

// =============================================================================
// Mécanique de balayage — accolades appariées, insensible aux commentaires ET
// au contenu des chaînes. Un `grep` de clés ne sait pas dire si `timestamp:`
// est au PREMIER niveau de l'objet envoyé ou enfoui dans un `details`, ni si
// la virgule qu'il vient de franchir vivait dans un message d'erreur.
// =============================================================================

/** Fin (inclusive) du groupe ouvert en `debut` — chaînes ignorées. */
function finDuGroupe(source: string, debut: number): number {
  const ouvrant = source[debut];
  const fermant = ouvrant === '(' ? ')' : ouvrant === '{' ? '}' : ']';
  let profondeur = 0;
  let chaine: string | null = null;

  for (let i = debut; i < source.length; i++) {
    const c = source[i];
    if (chaine !== null) {
      if (c === '\\') i++;
      else if (c === chaine) chaine = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') chaine = c;
    else if (c === ouvrant) profondeur++;
    else if (c === fermant) {
      profondeur--;
      if (profondeur === 0) return i;
    }
  }
  return source.length - 1;
}

/** Les morceaux séparés par les virgules du PREMIER niveau de `{ … }`. */
function segmentsDeNiveau1(objet: string): readonly string[] {
  const corps = objet.slice(1, -1);
  const morceaux: string[] = [];
  let profondeur = 0;
  let debut = 0;
  let chaine: string | null = null;

  for (let i = 0; i < corps.length; i++) {
    const c = corps[i];
    if (chaine !== null) {
      if (c === '\\') i++;
      else if (c === chaine) chaine = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') chaine = c;
    else if (c === '{' || c === '[' || c === '(') profondeur++;
    else if (c === '}' || c === ']' || c === ')') profondeur--;
    else if (c === ',' && profondeur === 0) {
      morceaux.push(corps.slice(debut, i));
      debut = i + 1;
    }
  }

  return [...morceaux, corps.slice(debut)].map((m) => m.trim()).filter((m) => m.length > 0);
}

/** Ce qu'UN `send(…)` met dans le corps : des clés écrites ici, des étalements. */
export type Envoi = {
  /** Clés posées DANS le fichier — celles que la règle 1 confronte au schéma. */
  readonly litteraux: readonly string[];
  /** Étalements à résoudre — `...corpsType`, ou toute forme non reconnue. */
  readonly sources: readonly string[];
};

const VIDE: Envoi = { litteraux: [], sources: [] };

function fusionner(a: Envoi, b: Envoi): Envoi {
  return {
    litteraux: [...a.litteraux, ...b.litteraux],
    sources: [...a.sources, ...b.sources],
  };
}

function classerSegment(segment: string): Envoi {
  if (!segment.startsWith('...')) {
    const cle = /^(?:['"`]([^'"`]+)['"`]|([A-Za-z_$][\w$]*))\s*(?::|$)/.exec(segment);
    const nom = cle?.[1] ?? cle?.[2];
    return nom ? { litteraux: [nom], sources: [] } : { litteraux: [], sources: [segment] };
  }

  const reste = segment.slice(3).trim();
  const accolade = reste.indexOf('{');
  // Un étalement CONDITIONNEL pose ses clés ICI — `...(config.isDev && { stack:
  // … })` était l'un des quatre champs non déclarés de ce gestionnaire. Le
  // traiter comme une source opaque l'aurait rendu invisible à la règle 1.
  if (accolade < 0) return { litteraux: [], sources: [reste] };
  return envoiDepuisArgument(reste.slice(accolade, finDuGroupe(reste, accolade) + 1));
}

export function envoiDepuisArgument(argument: string): Envoi {
  const texte = argument.trim();
  if (!texte.startsWith('{')) return { litteraux: [], sources: [texte] };
  return segmentsDeNiveau1(texte).map(classerSegment).reduce(fusionner, VIDE);
}

/** Le corps de la fonction passée à `setErrorHandler(…)`. */
export function corpsDuGestionnaire(source: string): string {
  const code = stripComments(source);
  const appel = code.indexOf('setErrorHandler(');
  if (appel < 0) return '';
  const ouvre = code.indexOf('(', appel);
  return code.slice(ouvre, finDuGroupe(code, ouvre) + 1);
}

export function envoisDuGestionnaire(corps: string): readonly Envoi[] {
  const re = /\.send\s*\(/g;
  const envois: Envoi[] = [];
  let trouve: RegExpExecArray | null;

  while ((trouve = re.exec(corps)) !== null) {
    const ouvre = corps.indexOf('(', trouve.index);
    envois.push(envoiDepuisArgument(corps.slice(ouvre + 1, finDuGroupe(corps, ouvre))));
  }

  return envois;
}

/** `const { statusCode: x, ...corps } = typed;` — ce qui est RETIRÉ d'un étalement. */
export type Extraction = {
  readonly variable: string;
  readonly producteur: string;
  readonly omis: readonly string[];
};

export function extractionsDuGestionnaire(corps: string): readonly Extraction[] {
  const re = /const\s*\{/g;
  const extractions: Extraction[] = [];
  let trouve: RegExpExecArray | null;

  while ((trouve = re.exec(corps)) !== null) {
    const ouvre = corps.indexOf('{', trouve.index);
    const ferme = finDuGroupe(corps, ouvre);
    const suite = /^\s*=\s*([A-Za-z_$][\w$]*)\s*;/.exec(corps.slice(ferme + 1));
    if (!suite) continue;

    const morceaux = segmentsDeNiveau1(corps.slice(ouvre, ferme + 1));
    const reste = morceaux.find((m) => m.startsWith('...'));
    if (!reste) continue;

    extractions.push({
      variable: reste.slice(3).trim(),
      producteur: suite[1],
      omis: morceaux
        .filter((m) => !m.startsWith('...'))
        .map((m) => m.split(':')[0].trim()),
    });
  }

  return extractions;
}

// =============================================================================
// Les PRODUCTEURS que le gestionnaire étale, exercés pour de vrai.
//
// L'inventaire est une DONNÉE, et les clés qu'il rend ne sont pas écrites ici :
// elles sont LUES sur les fonctions de production. Un champ ajouté demain à
// `TypedErrorBody` apparaît donc dans cette union sans que personne ne pense à
// l'y mettre — c'est la seule forme d'inventaire qui ne ment pas en vieillissant.
// =============================================================================

/** Un refus Ajv tel que Fastify l'attache — le discriminant est `validation`. */
function refusAjv(): unknown {
  return Object.assign(new Error('body/password must NOT have fewer than 6 characters'), {
    statusCode: 400,
    validation: [{ instancePath: '/password', message: 'must NOT have fewer than 6 characters' }],
  });
}

/**
 * Toutes les sous-classes exportées, construites SANS argument, plus les trois
 * qui portent un champ propre construites AVEC — sans quoi `errors`,
 * `retryAfter` et `lockedUntil` resteraient absents de l'union (le corps typé
 * ne les pose que si la valeur existe).
 *
 * Le prédicat de type porte sa justification : les constructeurs ont des arités
 * différentes, et `Object.values` d'un import de module ne les distingue pas.
 * Construits sans argument, ils rendent tous une instance valide — les champs
 * optionnels restent simplement absents.
 */
function instancesTypees(): readonly Erreurs.BaseAppError[] {
  const estSousClasse = (valeur: unknown): valeur is new () => Erreurs.BaseAppError =>
    typeof valeur === 'function' && valeur.prototype instanceof Erreurs.BaseAppError;

  // Typé `unknown[]` pour que le prédicat NARROW : sur l'union des exports du
  // module, `new () => BaseAppError` n'est constituant d'aucun membre, et
  // `filter` retombe alors sur sa surcharge qui ne restreint rien.
  const exportsDuModule: readonly unknown[] = Object.values(Erreurs);

  return [
    ...exportsDuModule.filter(estSousClasse).map((Classe) => new Classe()),
    new Erreurs.ValidationError('champ invalide', { email: 'Requis' }),
    new Erreurs.RateLimitError(30),
    new Erreurs.UserLockedError(new Date('2026-09-01T12:00:00.000Z')),
  ];
}

const PRODUCTEURS: Readonly<Record<string, () => readonly Readonly<Record<string, unknown>>[]>> = {
  schemaRefusal: () => {
    const refus = schemaValidationErrorResponse(refusAjv());
    return refus ? [refus] : [];
  },
  typed: () =>
    instancesTypees()
      .map((erreur) => Erreurs.typedErrorResponse(erreur))
      .filter((corps): corps is Erreurs.TypedErrorBody => corps !== null),
};

// =============================================================================
// L'inventaire GELÉ des champs qui partent ENCORE hors du superset.
//
// Geler documente qu'ils sont VUS, pas qu'ils sont bons. Chaque entrée dit OÙ
// le champ est déclaré — et les deux qui ne le sont nulle part le disent aussi,
// parce que c'est exactement ce que #4689 avait trouvé en creux : la protection
// de #4138 ne tient que parce qu'AUCUNE route ne déclare son 423 (mesuré : zéro
// occurrence de `423:` dans `src/routes/`).
// =============================================================================
const HORS_SUPERSET_GELE: Readonly<Record<string, string>> = {
  details:
    "déclaré par `validationErrorResponseSchema` — les routes qui servent un refus de schéma l'ont sur leur 400",
  retryAfter:
    'déclaré PAR ROUTE sur son 429, en plus du superset (cinq déclarations, dont `auth/login.ts`)',
  errors:
    "déclaré NULLE PART : `ValidationError` rend `errors` quand le superset déclare `violations` — une ValidationError LEVÉE perd donc sa carte par champ sur toute route qui déclare son 400 (dette nommée, hors périmètre de #4689)",
  lockedUntil:
    "déclaré NULLE PART : la protection de #4138 ne survit que parce qu'aucune route ne déclare son 423 — la déclarer sans déclarer ce champ la reperdrait",
};

const declarees: readonly string[] = Object.keys(errorResponseSchema.properties);

function trier(valeurs: Iterable<string>): readonly string[] {
  return [...new Set(valeurs)].sort();
}

/** Tout ce qui peut apparaître dans un corps servi par le gestionnaire global. */
export function champsQuiPartent(
  corps: string,
  producteurs: Readonly<Record<string, () => readonly Readonly<Record<string, unknown>>[]>>
): readonly string[] {
  const envois = envoisDuGestionnaire(corps);
  const extractions = extractionsDuGestionnaire(corps);

  const parEtalement = envois
    .flatMap((envoi) => envoi.sources)
    .flatMap((source) => {
      const extraction = extractions.find((e) => e.variable === source);
      const producteur = extraction ? producteurs[extraction.producteur] : producteurs[source];
      if (!producteur) return [`⚠ source non résolue : ${source}`];
      const omis = extraction?.omis ?? [];
      return producteur().flatMap((exemple) => Object.keys(exemple).filter((c) => !omis.includes(c)));
    });

  return trier([...envois.flatMap((envoi) => envoi.litteraux), ...parEtalement]);
}

const source = readFileSync(SERVEUR, 'utf8');
const corps = corpsDuGestionnaire(source);

describe('Le gestionnaire global ne sert que des champs DÉCLARÉS (#4689 critère 4)', () => {
  it('le balayage LIT le gestionnaire — sans quoi il serait vert à vide', () => {
    expect(source.length).toBeGreaterThan(10000);
    expect(corps.length).toBeGreaterThan(1500);
    expect(envoisDuGestionnaire(corps).length).toBeGreaterThanOrEqual(6);
    expect(declarees).toEqual(expect.arrayContaining(['success', 'error', 'message', 'code']));
  });

  it('les clés qu’il écrit LUI-MÊME sont toutes déclarées par le superset', () => {
    const posees = trier(envoisDuGestionnaire(corps).flatMap((envoi) => envoi.litteraux));

    // Non-vacuité de CETTE règle : un balayage qui ne trouverait plus une seule
    // clé littérale passerait au vert sans rien mesurer.
    expect(posees.length).toBeGreaterThanOrEqual(2);
    expect(posees.filter((cle) => !declarees.includes(cle))).toEqual([]);
  });

  it('chaque ÉTALEMENT vient d’un producteur connu, et ce qu’il en retire est lu dans le fichier', () => {
    const etalees = trier(envoisDuGestionnaire(corps).flatMap((envoi) => envoi.sources));
    const extractions = extractionsDuGestionnaire(corps);

    expect(etalees.length).toBeGreaterThanOrEqual(2);
    expect(
      etalees.filter((nom) => {
        const extraction = extractions.find((e) => e.variable === nom);
        return !(extraction ? PRODUCTEURS[extraction.producteur] : PRODUCTEURS[nom]);
      })
    ).toEqual([]);

    // Le RETRAIT est lu, jamais recopié : c'est lui qui fait tomber la garde le
    // jour où le gestionnaire cesse de retirer `statusCode` de son étalement.
    expect(extractions.flatMap((e) => e.omis)).toContain('statusCode');
  });

  it('ce qui PART est déclaré, à l’inventaire gelé près — et l’inventaire n’a pas de ligne morte', () => {
    const partants = champsQuiPartent(corps, PRODUCTEURS);

    expect(partants.length).toBeGreaterThanOrEqual(4);
    expect(partants.filter((cle) => !declarees.includes(cle))).toEqual(
      Object.keys(HORS_SUPERSET_GELE).sort()
    );
  });

  it('`timestamp` et `statusCode` ne partent plus — les deux champs de #4689', () => {
    const partants = champsQuiPartent(corps, PRODUCTEURS);

    expect(partants).not.toContain('timestamp');
    expect(partants).not.toContain('statusCode');
  });

  it('les producteurs rendent bien quelque chose — une union vide validerait n’importe quoi', () => {
    expect(PRODUCTEURS.schemaRefusal()).toHaveLength(1);
    expect(PRODUCTEURS.typed().length).toBeGreaterThanOrEqual(19);
    expect(trier(PRODUCTEURS.typed().flatMap(Object.keys))).toEqual(
      ['code', 'errors', 'lockedUntil', 'message', 'retryAfter', 'statusCode', 'success', 'error'].sort()
    );
  });
});

describe('Ce que le balayage sait discriminer', () => {
  const gestionnaire = (envoi: string) => `this.server.setErrorHandler(async (error, request, reply) => {
    ${envoi}
  });`;

  it('signale un champ non déclaré posé littéralement — la forme exacte de #4689', () => {
    const avecTimestamp = gestionnaire(`return reply.code(500).send({
      error: 'Internal Server Error',
      statusCode: 500,
      timestamp: new Date().toISOString()
    });`);

    const posees = envoisDuGestionnaire(corpsDuGestionnaire(avecTimestamp)).flatMap((e) => e.litteraux);

    expect(posees).toEqual(['error', 'statusCode', 'timestamp']);
    expect(posees.filter((cle) => !declarees.includes(cle))).toEqual(['statusCode', 'timestamp']);
  });

  it('voit les clés d’un étalement CONDITIONNEL — `...(config.isDev && { stack })`', () => {
    const avecStack = gestionnaire(`return reply.code(500).send({
      error: 'Internal Server Error',
      ...(config.isDev && { stack: err && err.stack })
    });`);

    expect(envoisDuGestionnaire(corpsDuGestionnaire(avecStack)).flatMap((e) => e.litteraux))
      .toEqual(['error', 'stack']);
  });

  it('ne confond pas une virgule vivant DANS un message avec un séparateur de clés', () => {
    const avecVirgule = gestionnaire(
      "return reply.code(413).send({ error: 'Too Many Files', message: `Trop, vraiment trop de fichiers.` });"
    );

    expect(envoisDuGestionnaire(corpsDuGestionnaire(avecVirgule)).flatMap((e) => e.litteraux))
      .toEqual(['error', 'message']);
  });

  it('ne prend pas une clé ENFOUIE dans un objet imbriqué pour une clé du corps', () => {
    const avecDetails = gestionnaire(
      "return reply.code(413).send({ error: 'Too Many Files', details: { maxFiles: 30, timestamp: 'x' } });"
    );

    expect(envoisDuGestionnaire(corpsDuGestionnaire(avecDetails)).flatMap((e) => e.litteraux))
      .toEqual(['error', 'details']);
  });

  it('rougit sur un étalement dont il ne sait pas d’où il vient', () => {
    const inconnu = gestionnaire('return reply.code(500).send({ ...corpsMystere });');

    expect(champsQuiPartent(corpsDuGestionnaire(inconnu), PRODUCTEURS))
      .toEqual(['⚠ source non résolue : corpsMystere']);
  });

  it('rend `statusCode` PARTANT si le gestionnaire cesse de le retirer de son étalement', () => {
    // La règle 3, prouvée : la garde lit le RETRAIT dans le fichier. Sans le
    // `const { statusCode, ...corps }`, la mutation ci-dessous refait partir le
    // champ, et le témoin précédent (« ne partent plus ») tombe.
    const sansRetrait = gestionnaire('return reply.code(500).send(typed);');

    expect(champsQuiPartent(corpsDuGestionnaire(sansRetrait), PRODUCTEURS)).toContain('statusCode');
  });

  it('trouve les extractions du gestionnaire réel, avec leur producteur', () => {
    expect(extractionsDuGestionnaire(corps)).toEqual(
      expect.arrayContaining([
        { variable: 'corpsType', producteur: 'typed', omis: ['statusCode'] },
        { variable: 'corpsRefus', producteur: 'schemaRefusal', omis: ['statusCode'] },
      ])
    );
  });
});
