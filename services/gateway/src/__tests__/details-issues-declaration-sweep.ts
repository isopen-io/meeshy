/**
 * Le BALAYAGE de #4648, critère 4 : aucun site ne sert `details: { issues }`
 * sans DÉCLARER la forme de ces issues dans un schéma de réponse.
 *
 * ## Pourquoi il part de la DONNÉE et non du helper
 *
 * Le lot #4487 a fermé quatre sites, et le cinquième — `routes/posts/core.ts`
 * — est resté ouvert un an. Il n'a été trouvé par aucun balayage, et la raison
 * tient en une phrase : **il n'appelait pas `issuesServies`.** Il écrivait
 * `parsedCanvas.error.issues.slice(0, 5)`. Un balayage nommé d'après le helper
 * partagé rend donc exactement les sites DÉJÀ conformes, et manque par
 * construction ceux qu'on cherche — c'est la leçon 261 dans sa forme la plus
 * chère : une énumération porte deux affirmations, et seule la première est
 * vérifiable.
 *
 * Ce balayage cherche donc la DONNÉE SERVIE (`details: { … issues … }`, quelle
 * que soit la façon dont elle est calculée), puis demande au fichier s'il
 * DÉCLARE — jamais l'inverse.
 *
 * ## Ce que « déclarer » veut dire, et pourquoi ce n'est pas « importer »
 *
 * Le témoin est `items: zodIssueSchema` — une déclaration de schéma qui pose
 * la forme partagée (#4487, site unique `utils/zod-issue-schema.ts`). Ce n'est
 * PAS l'import de `zodIssueSchema` : `core.ts` importe déjà `issuesServies`
 * depuis ce module, donc un test de présence du seul identifiant le
 * déclarerait conforme sans qu'aucun schéma n'existe. Chercher l'import
 * refabriquerait le piège du helper, un cran plus bas.
 *
 * La déclaration est acceptée dans le fichier LUI-MÊME ou dans l'un de ses
 * imports relatifs à UN saut. Le budget de taille (#4284, 1000 lignes sous
 * `routes/`, sans exemption) force l'extraction : `core.ts` était à 970 lignes,
 * et son schéma vit chez le voisin qu'il importe (`write-refusal-schema.ts`).
 * Une garde qui n'accepterait que la déclaration en ligne interdirait la seule
 * forme que le cliquet voisin autorise.
 *
 * ## Les commentaires sont DÉPOUILLÉS, et ce n'est pas une précaution
 *
 * `utils/response.ts` porte, dans le doc-comment de `sendBadRequest`, la
 * phrase « `details: { issues }` — étalé à la RACINE, non déclaré au schéma ».
 * Sans dépouillement, le balayage nommerait ce fichier — qui ne sert rien — et
 * un faux positif dans une garde négative coûte plus cher qu'un trou : on
 * apprend à ne plus la lire.
 *
 * ## Ses limites, avec leur TAILLE
 *
 * - **Il est à grain FICHIER, pas à grain ROUTE.** Un fichier qui déclare la
 *   forme sur une route et sert `issues` depuis une autre sans schéma passe.
 *   Les cinq sites servants du dépôt sont dans ce cas : la déclaration et le
 *   service y sont à quelques dizaines de lignes l'un de l'autre, dans la même
 *   unité. Un grain ROUTE demanderait de résoudre l'objet d'options de chaque
 *   `fastify.<verbe>` — un outil d'un autre ordre.
 * - **Il ne voit que la forme LITTÉRALE `details: { … }`.** Un handler qui
 *   composerait ses détails ailleurs lui échappe, et cette limite a une TAILLE,
 *   mesurée le 2026-09-01 sur les sources de production du gateway : **douze**
 *   charges passent `details` autrement qu'en littéral, et **les douze** vivent
 *   dans `socketio/CallEventsHandler.ts`, sous la forme
 *   `details: d ? { issues: d } : undefined`.
 *
 *   Ces douze-là sont **hors périmètre par NATURE, pas par oubli** : elles
 *   partent sur `socket.emit(CALL_EVENTS.ERROR, …)`, et une diffusion
 *   Socket.IO n'a AUCUN sérialiseur (§ « La porte d'ÉMISSION se DÉRIVE du
 *   contrat »). Rien ne peut y retirer `issues`, donc rien n'y est à déclarer
 *   — le contrat de ces charges est un problème de TYPE (`CallError`), pas de
 *   schéma de réponse. Le seul site HTTP restant est
 *   `middleware/validation.ts`, qui n'emploie ni `sendError` ni la clé
 *   `issues` : il imbrique `details` SOUS `error`, une troisième forme dont ce
 *   balayage n'a rien à dire.
 * - **L'équilibrage des accolades ignore les littéraux de chaîne.** Une
 *   accolade dans une chaîne, à l'intérieur d'un `details`, allongerait la
 *   tranche lue — donc ferait trouver PLUS de sites, jamais moins. Un balayage
 *   négatif doit se tromper de ce côté-là.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';

import { isHandWrittenSource, walk } from './helpers/file-size-sweep';

/** Un site qui SERT `details: { issues }`, et ce que son fichier déclare. */
export type SiteQuiSertDesIssues = {
  /** Chemin relatif à la racine balayée. */
  readonly fichier: string;
  /** Le fichier, ou l'un de ses imports relatifs à un saut, porte `items: zodIssueSchema`. */
  readonly declare: boolean;
};

const CHAINES_OU_COMMENTAIRES =
  /("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*')|(`(?:\\.|[^`\\])*`)|(\/\*[\s\S]*?\*\/)|(\/\/[^\n]*)/g;

/**
 * Remplace le contenu des commentaires par des espaces, en préservant les
 * sauts de ligne — les chaînes, elles, sont rendues telles quelles.
 */
const sansCommentaires = (source: string): string =>
  source.replace(CHAINES_OU_COMMENTAIRES, (match, dq, sq, tpl) =>
    dq !== undefined || sq !== undefined || tpl !== undefined
      ? match
      : match.replace(/[^\n]/g, ' '),
  );

/** Les tranches d'un source comprises entre `details: {` et son accolade fermante. */
const objetsDetails = (source: string): readonly string[] => {
  const debut = /\bdetails\s*:\s*\{/g;
  const tranches: string[] = [];
  let trouve: RegExpExecArray | null;
  while ((trouve = debut.exec(source)) !== null) {
    let profondeur = 1;
    let i = trouve.index + trouve[0].length;
    const ouverture = i;
    while (i < source.length && profondeur > 0) {
      if (source[i] === '{') profondeur += 1;
      else if (source[i] === '}') profondeur -= 1;
      i += 1;
    }
    tranches.push(source.slice(ouverture, Math.max(ouverture, i - 1)));
  }
  return tranches;
};

/** `issues` est-il une clé de PREMIER niveau de cette tranche ? */
const porteUneCleIssues = (tranche: string): boolean => {
  let profondeur = 0;
  const cle = /\bissues\s*[:,}]|\{|\}|\[|\]|\(|\)/g;
  let trouve: RegExpExecArray | null;
  while ((trouve = cle.exec(tranche)) !== null) {
    const jeton = trouve[0];
    if (jeton === '{' || jeton === '[' || jeton === '(') profondeur += 1;
    else if (jeton === '}' || jeton === ']' || jeton === ')') profondeur -= 1;
    else if (profondeur === 0) return true;
  }
  return false;
};

const DECLARE = /\bitems\s*:\s*zodIssueSchema\b/;

const IMPORT_RELATIF = /\bfrom\s*['"](\.[^'"]*)['"]/g;

/** Le chemin `.ts` d'un spécificateur relatif, quand il en existe un. */
const resoudre = (fichier: string, specificateur: string): string | undefined => {
  const base = join(dirname(fichier), specificateur);
  const candidats = base.endsWith('.js')
    ? [`${base.slice(0, -3)}.ts`]
    : [`${base}.ts`, join(base, 'index.ts')];
  return candidats.find((candidat) => existsSync(candidat));
};

const declareLaForme = (fichier: string, sourceNue: string): boolean => {
  if (DECLARE.test(sourceNue)) return true;
  const specificateurs = [...sourceNue.matchAll(IMPORT_RELATIF)].map((m) => m[1] as string);
  return specificateurs.some((specificateur) => {
    const voisin = resoudre(fichier, specificateur);
    return voisin !== undefined && DECLARE.test(sansCommentaires(readFileSync(voisin, 'utf8')));
  });
};

/**
 * Tous les fichiers de PRODUCTION d'une racine qui servent `details: { issues }`,
 * avec le verdict de déclaration de chacun. Trié, pour que deux exécutions
 * rendent la même liste.
 */
export const balayerServicesDIssues = (racine: string): readonly SiteQuiSertDesIssues[] =>
  walk(racine, isHandWrittenSource)
    .map((fichier) => ({ fichier, source: sansCommentaires(readFileSync(fichier, 'utf8')) }))
    .filter(({ source }) => objetsDetails(source).some(porteUneCleIssues))
    .map(({ fichier, source }) => ({
      fichier: relative(racine, fichier),
      declare: declareLaForme(fichier, source),
    }))
    .sort((a, b) => a.fichier.localeCompare(b.fichier));

/** Les sites qui servent SANS déclarer — l'inventaire que le cliquet garde VIDE. */
export const sitesNonDeclares = (racine: string): readonly string[] =>
  balayerServicesDIssues(racine)
    .filter((site) => !site.declare)
    .map((site) => site.fichier);
