/**
 * Le BALAYAGE de #4642 : tout appelant de la descente de CADRAGE charge les
 * QUATRE colonnes du Prisme.
 *
 * ## Pourquoi il part de la DONNÉE et non du nom du helper
 *
 * `AuthService.resendVerificationEmail` appelait `recipientLanguage(user, 'fr')`
 * — la SSOT, importée, correctement appelée — sur un `user` projeté par
 *
 * ```ts
 * select: { id: true, email: true, …, systemLanguage: true, emailVerifiedAt: true }
 * ```
 *
 * Les trois autres rangs arrivaient `undefined`, donc « non réglés », donc tout
 * lecteur dont la langue applicative vit dans `regionalLanguage` (ou dans la
 * seule `deviceLocale`, rang 4) recevait son e-mail de vérification en `'fr'`.
 *
 * **Un `grep recipientLanguage` rend ce site CONFORME.** Un site converti à
 * moitié — l'appel adopté, la projection gardée — est indiscernable d'un site
 * conforme par tout balayage qui cherche le NOM. C'est la leçon 261 dans sa
 * forme la plus chère (une énumération porte deux affirmations, et seule la
 * première est vérifiable) et la leçon 276 mot pour mot : *c'est la projection
 * trop étroite, pas l'appel manquant, qui rend une descente impossible en aval
 * sans qu'aucun témoin ne rougisse*.
 *
 * Ce balayage part donc de chaque APPEL, remonte son premier argument jusqu'à
 * la REQUÊTE qui l'a chargé, et lit les colonnes de cette requête. Il porte sur
 * le COUPLE `select` / appel, jamais sur l'un des deux.
 *
 * ## Ce que « remonter jusqu'à la requête » sait suivre
 *
 * | forme | exemple du dépôt |
 * |---|---|
 * | liaison directe | `const user = await this.prisma.user.findUnique({ select })` |
 * | absence de `select` | `findUnique({ where })` — Prisma rend TOUS les scalaires ⇒ complet |
 * | itération | `for (const user of users)`, `users.map(deliverTo)` |
 * | relation | `const user = resetToken.user` avec `include: { user: { select } } }` |
 * | étalement | `...RECIPIENT_LANG_SELECT`, `...this.LANG_SELECT` |
 * | projection nommée | `select: this.LANG_SELECT` |
 * | paramètre de fonction LOCALE | `sendMagicLinkEmail(user, …)` — résolu par ses appels |
 *
 * Un étalement se résout sur sa DÉFINITION — dans le fichier, ou chez le voisin
 * importé à un saut. Reconnaître le seul nom `RECIPIENT_LANG_SELECT` comme
 * valant quatre colonnes referait le piège du helper un cran plus bas : ce
 * serait de nouveau un NOM qui atteste, et une jumelle privée qui perdrait une
 * colonne passerait au vert.
 *
 * ## Ce qu'il ne sait PAS suivre — et ce que ça coûte
 *
 * Une chaîne qu'il ne peut pas remonter rend `non-resolue`, **jamais
 * `complete`** : un balayage négatif doit se tromper du côté qui accuse. Un tel
 * site doit donc être EXEMPTÉ explicitement, avec sa raison — c'est le geste
 * qui force la question plutôt que de la laisser tomber dans un silence.
 * `EXEMPTIONS` porte l'unique cas du dépôt.
 *
 * Deux limites de mécanique, dites avec leur conséquence :
 *
 * - **L'équilibrage des délimiteurs ignore les littéraux de regex.** Les
 *   chaînes et les commentaires sont neutralisés (§ `squelette`), pas les
 *   `/…/`. Une accolade non appariée dans une regex allongerait une tranche
 *   lue : la résolution échouerait, donc rendrait `non-resolue` — du côté qui
 *   accuse.
 * - **La résolution est bornée à six sauts.** Au-delà, `non-resolue`.
 *
 * @see utils/recipient-language.ts — la SSOT dont ce balayage garde les appelants.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';

import { isHandWrittenSource, walk } from './helpers/file-size-sweep';

/** Les quatre rangs du Prisme, dans l'ordre — la forme de `RECIPIENT_LANG_SELECT`. */
export const COLONNES_DU_PRISME = [
  'systemLanguage',
  'regionalLanguage',
  'customDestinationLanguage',
  'deviceLocale',
] as const;

/** Les trois portes de `utils/recipient-language.ts`. */
export const HELPERS_DE_CADRAGE = [
  'recipientLanguage',
  'recipientLanguages',
  'recipientDateLocale',
] as const;

/**
 * Les sites LÉGITIMEMENT hors périmètre, avec leur raison.
 *
 * Un site qu'on ne sait pas résoudre n'entre PAS ici sans qu'on ait ouvert sa
 * chaîne : c'est la différence entre une exemption et un trou. Et le balayage
 * prend cette carte en PARAMÈTRE pour que le méta-témoin puisse la retirer et
 * vérifier que l'exemption PORTE quelque chose — une exemption qui ne cache
 * rien se relit comme une décision alors qu'elle n'en est plus une.
 */
export const EXEMPTIONS: Readonly<Record<string, string>> = {
  'utils/recipient-language.ts':
    "la SSOT elle-même : ses appels internes portent sur SES PROPRES paramètres, " +
    "dont la projection appartient à ses appelants — c'est-à-dire à tout ce que " +
    'ce balayage mesure par ailleurs.',
};

export type VerdictDeProjection = 'complete' | 'etroite' | 'non-resolue';

/** Un appel de cadrage, et ce que la requête qui l'alimente charge vraiment. */
export type AppelDeCadrage = {
  /** Chemin relatif à la racine balayée. */
  readonly fichier: string;
  readonly helper: string;
  /** Le premier argument, tel qu'il est écrit. */
  readonly receveur: string;
  readonly verdict: VerdictDeProjection;
  /** Les colonnes du Prisme que la projection porte, dans l'ordre des rangs. */
  readonly colonnes: readonly string[];
  /** Les colonnes qui manquent — vide quand `verdict` vaut `complete`. */
  readonly manquantes: readonly string[];
  /** Comment la chaîne a été remontée, ou pourquoi elle ne l'a pas été. */
  readonly trace: string;
};

const CHAINES_OU_COMMENTAIRES =
  /("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*')|(`(?:\\.|[^`\\])*`)|(\/\*[\s\S]*?\*\/)|(\/\/[^\n]*)/g;

/**
 * Le SQUELETTE d'un source : chaînes et commentaires vidés, sauts de ligne et
 * longueurs préservés.
 *
 * Vider les chaînes n'est pas une précaution de plus : c'est ce qui rend
 * l'appariement des délimiteurs fiable. Une accolade dans un message d'erreur
 * — `'Unexpected }'` — décalerait toutes les tranches lues après elle. Les
 * INDEX restent ceux du fichier, donc une position trouvée ici nomme la même
 * ligne que dans la source.
 */
export const squelette = (source: string): string =>
  source.replace(CHAINES_OU_COMMENTAIRES, (m) => m.replace(/[^\n]/g, ' '));

const OUVRANTS = '({[';
const FERMANTS = ')}]';

/** L'index du délimiteur fermant apparié à l'ouvrant posé en `debut`. */
const finDuBloc = (source: string, debut: number): number => {
  let profondeur = 0;
  for (let i = debut; i < source.length; i += 1) {
    const c = source[i] as string;
    if (OUVRANTS.includes(c)) profondeur += 1;
    else if (FERMANTS.includes(c)) {
      profondeur -= 1;
      if (profondeur === 0) return i;
    }
  }
  return source.length;
};

/** Les tranches de premier niveau d'une liste séparée par des virgules. */
const partiesDe = (texte: string): readonly string[] => {
  const parties: string[] = [];
  let profondeur = 0;
  let debut = 0;
  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i] as string;
    if (OUVRANTS.includes(c) || c === '<') profondeur += 1;
    else if (FERMANTS.includes(c) || c === '>') profondeur -= 1;
    else if (c === ',' && profondeur === 0) {
      parties.push(texte.slice(debut, i));
      debut = i + 1;
    }
  }
  parties.push(texte.slice(debut));
  return parties.map((p) => p.trim()).filter((p) => p.length > 0);
};

/** Le texte de la valeur portée par `cle` au PREMIER niveau d'un objet. */
const valeurDeCle = (corps: string, cle: string): string | undefined => {
  const jeton = new RegExp(`(^|[^\\w$.])${cle}\\s*:`, 'g');
  let trouve: RegExpExecArray | null;
  while ((trouve = jeton.exec(corps)) !== null) {
    const avant = corps.slice(0, trouve.index + trouve[0].length);
    let profondeur = 0;
    for (const c of avant) {
      if (OUVRANTS.includes(c)) profondeur += 1;
      else if (FERMANTS.includes(c)) profondeur -= 1;
    }
    if (profondeur !== 1) continue;
    const reste = corps.slice(trouve.index + trouve[0].length);
    const decalage = reste.length - reste.trimStart().length;
    const valeur = reste.slice(decalage);
    if (OUVRANTS.includes(valeur[0] as string)) {
      return valeur.slice(0, finDuBloc(valeur, 0) + 1);
    }
    return (partiesDe(valeur)[0] ?? '').replace(/[}\])].*$/s, '').trim();
  }
  return undefined;
};

/** Les clés et les étalements de PREMIER niveau d'un objet littéral. */
const clesEtEtalements = (corps: string): { cles: string[]; etalements: string[] } => {
  const cles: string[] = [];
  const etalements: string[] = [];
  let profondeur = 0;
  const jetons = /([A-Za-z_$][\w$]*)\s*:|\.\.\.\s*((?:this\.)?[A-Za-z_$][\w$]*)|[({[)}\]]/g;
  let trouve: RegExpExecArray | null;
  while ((trouve = jetons.exec(corps)) !== null) {
    const jeton = trouve[0];
    if (OUVRANTS.includes(jeton)) profondeur += 1;
    else if (FERMANTS.includes(jeton)) profondeur -= 1;
    else if (profondeur === 1) {
      if (trouve[1] !== undefined) cles.push(trouve[1]);
      if (trouve[2] !== undefined) etalements.push(trouve[2]);
    }
  }
  return { cles, etalements };
};

const IMPORT_RELATIF = /\bfrom\s*['"](\.[^'"]*)['"]/g;

const resoudreVoisin = (fichier: string, specificateur: string): string | undefined => {
  const base = join(dirname(fichier), specificateur);
  const candidats = base.endsWith('.js')
    ? [`${base.slice(0, -3)}.ts`]
    : [`${base}.ts`, join(base, 'index.ts')];
  return candidats.find((candidat) => existsSync(candidat));
};

type Contexte = {
  readonly fichier: string;
  readonly source: string;
  /** Le source BRUT — seuls les imports s'y relisent, pour trouver un voisin. */
  readonly brut: string;
};

/** L'objet littéral que porte `nom`, dans ce fichier ou chez un voisin importé. */
const objetLitteralNomme = (ctx: Contexte, nom: string): string | undefined => {
  const nu = nom.replace(/^this\./, '');
  const declaration = new RegExp(`\\b${nu}\\s*(?::[^=;]*)?=\\s*\\{`);
  const ici = declaration.exec(ctx.source);
  if (ici !== null) {
    const ouvrant = ici.index + ici[0].length - 1;
    return ctx.source.slice(ouvrant, finDuBloc(ctx.source, ouvrant) + 1);
  }
  for (const specificateur of [...ctx.brut.matchAll(IMPORT_RELATIF)].map((m) => m[1] as string)) {
    const voisin = resoudreVoisin(ctx.fichier, specificateur);
    if (voisin === undefined) continue;
    const source = squelette(readFileSync(voisin, 'utf8'));
    const trouve = declaration.exec(source);
    if (trouve === null) continue;
    const ouvrant = trouve.index + trouve[0].length - 1;
    return source.slice(ouvrant, finDuBloc(source, ouvrant) + 1);
  }
  return undefined;
};

/** Les colonnes du Prisme qu'une PROJECTION porte, étalements résolus. */
const colonnesDuneProjection = (
  ctx: Contexte,
  projection: string,
  profondeur: number,
): readonly string[] => {
  if (profondeur > 6) return [];
  const { cles, etalements } = clesEtEtalements(projection);
  const vues = new Set(cles);
  for (const etalement of etalements) {
    const objet = objetLitteralNomme(ctx, etalement);
    if (objet === undefined) continue;
    for (const c of colonnesDuneProjection(ctx, objet, profondeur + 1)) vues.add(c);
  }
  return COLONNES_DU_PRISME.filter((c) => vues.has(c));
};

type Resolution =
  | { readonly ok: true; readonly colonnes: readonly string[]; readonly trace: string }
  | { readonly ok: false; readonly trace: string };

/** Toutes les colonnes : une lecture sans `select` rend TOUS les scalaires. */
const TOUTES: Resolution = {
  ok: true,
  colonnes: COLONNES_DU_PRISME,
  trace: 'aucun select — Prisma rend tous les scalaires',
};

/**
 * Les colonnes qu'une requête Prisma charge au bout de `chemin`, `chemin` étant
 * la suite de relations traversées depuis la ligne (`['user']` pour un
 * `resetToken.user`).
 */
const colonnesAuChemin = (
  ctx: Contexte,
  options: string,
  chemin: readonly string[],
  profondeur: number,
): Resolution => {
  const select = valeurDeCle(options, 'select');
  const include = valeurDeCle(options, 'include');
  if (chemin.length === 0) {
    if (select === undefined) return TOUTES;
    const projection = select.startsWith('{') ? select : objetLitteralNomme(ctx, select);
    if (projection === undefined) return { ok: false, trace: `select non résolu : ${select}` };
    return {
      ok: true,
      colonnes: colonnesDuneProjection(ctx, projection, profondeur),
      trace: 'select de la requête',
    };
  }
  const [tete, ...reste] = chemin;
  const relation =
    (include !== undefined ? valeurDeCle(include, tete as string) : undefined) ??
    (select !== undefined ? valeurDeCle(select, tete as string) : undefined);
  if (relation === undefined) return { ok: false, trace: `relation \`${tete}\` absente du select` };
  if (!relation.startsWith('{')) return TOUTES;
  return colonnesAuChemin(ctx, relation, reste, profondeur + 1);
};

type Fonction = {
  readonly nom: string;
  readonly params: string;
  readonly debutCorps: number;
  readonly finCorps: number;
};

const DECLARATIONS: readonly RegExp[] = [
  /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]*)?=\s*(?:async\s*)?\(/g,
  /^[ \t]*(?:private|public|protected)\s+(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm,
];

/** L'expression initiale d'une liaison `const X = …`, sans son `await`. */
const initialiseurApres = (source: string, depuis: number): string => {
  let profondeur = 0;
  for (let i = depuis; i < source.length; i += 1) {
    const c = source[i] as string;
    if (OUVRANTS.includes(c)) profondeur += 1;
    else if (FERMANTS.includes(c)) profondeur -= 1;
    else if (c === ';' && profondeur === 0) return source.slice(depuis, i).trim();
  }
  return source.slice(depuis).trim();
};

/**
 * Le CORPS d'une fonction, à partir de la parenthèse fermante de ses
 * paramètres. Rend `undefined` quand ce qui suit n'est pas un corps : sans
 * cette borne, `const x = (a || b);` passerait pour une fonction dont le corps
 * commence à la PROCHAINE accolade du fichier — une portée fantôme qui
 * engloberait tout ce qui suit.
 *
 * Les deux formes d'un corps sont prises, et la seconde n'est pas un détail :
 * une flèche à corps CONCIS (`const f = (u) => recipientLanguage(u, 'fr')`) est
 * une portée aussi réelle qu'une autre, et ne pas en faire une rendait son
 * paramètre introuvable — donc `non-resolue` là où la chaîne se remonte.
 */
const corpsApres = (source: string, fermante: number): { debut: number; fin: number } | undefined => {
  const suite = /^(\s*(?::[^;{=]*)?)(=>)?\s*/.exec(source.slice(fermante + 1));
  if (suite === null) return undefined;
  const debut = fermante + 1 + suite[0].length;
  if (source[debut] === '{') return { debut, fin: finDuBloc(source, debut) };
  if (suite[2] === undefined) return undefined;
  return { debut, fin: debut + initialiseurApres(source, debut).length };
};

const fonctionsDe = (source: string): readonly Fonction[] =>
  DECLARATIONS.flatMap((motif) => {
    const trouvees: Fonction[] = [];
    const balayage = new RegExp(motif.source, motif.flags);
    let trouve: RegExpExecArray | null;
    while ((trouve = balayage.exec(source)) !== null) {
      const ouvrante = trouve.index + trouve[0].length - 1;
      const fermante = finDuBloc(source, ouvrante);
      const corps = corpsApres(source, fermante);
      if (corps === undefined) continue;
      trouvees.push({
        nom: trouve[1] as string,
        params: source.slice(ouvrante + 1, fermante),
        debutCorps: corps.debut,
        finCorps: corps.fin,
      });
    }
    return trouvees;
  });

/** La dernière occurrence de `motif` dans la tranche `[depuis, avant[`. */
const derniereEntre = (
  source: string,
  motif: RegExp,
  depuis: number,
  avant: number,
): RegExpExecArray | undefined => {
  const balayage = new RegExp(motif.source, motif.flags.includes('g') ? motif.flags : `${motif.flags}g`);
  let dernier: RegExpExecArray | undefined;
  let trouve: RegExpExecArray | null;
  while ((trouve = balayage.exec(source)) !== null) {
    if (trouve.index >= avant) break;
    if (trouve.index >= depuis) dernier = trouve;
  }
  return dernier;
};

/**
 * Les PORTÉES qui contiennent `index`, de la plus interne à la plus externe,
 * la dernière étant le module.
 *
 * Chercher la liaison d'un identifiant « la dernière avant l'appel » sans
 * portée est faux et le dépôt en donne le cas : `MagicLinkService` porte un
 * `const user = …` dans une méthode ET un appel de cadrage dans une AUTRE,
 * quatre cents lignes plus bas. Le balayage y résolvait la projection d'une
 * méthode voisine — un verdict crédible, rendu sur la mauvaise requête.
 */
const porteesDe = (source: string, index: number): readonly (Fonction | undefined)[] => [
  ...fonctionsDe(source)
    .filter((f) => f.debutCorps <= index && index <= f.finCorps)
    .sort((a, b) => b.debutCorps - a.debutCorps),
  undefined,
];

const PIRE: Readonly<Record<VerdictDeProjection, number>> = {
  complete: 0,
  etroite: 1,
  'non-resolue': 2,
};

const verdictDe = (resolution: Resolution): VerdictDeProjection =>
  !resolution.ok
    ? 'non-resolue'
    : COLONNES_DU_PRISME.every((c) => resolution.colonnes.includes(c))
      ? 'complete'
      : 'etroite';

/**
 * Remonte `ident` jusqu'à la projection qui l'a chargé, `chemin` portant les
 * relations déjà traversées.
 */
const resoudreIdentifiant = (
  ctx: Contexte,
  ident: string,
  avant: number,
  chemin: readonly string[],
  profondeur: number,
): Resolution => {
  if (profondeur > 6) return { ok: false, trace: 'chaîne de plus de six sauts' };
  const echappe = ident.replace(/[$]/g, '\\$&');
  const liaisons = new RegExp(`\\b(?:const|let|var)\\s+${echappe}\\s*(?::[^=;]*)?=`, 'g');
  const iterations = new RegExp(
    `\\bfor\\s*\\(\\s*(?:const|let|var)\\s+${echappe}\\s+of\\s+([^)]*)\\)`,
    'g',
  );

  for (const portee of porteesDe(ctx.source, avant)) {
    const depuis = portee?.debutCorps ?? 0;
    const liaison = derniereEntre(ctx.source, liaisons, depuis, avant);
    const iteration = derniereEntre(ctx.source, iterations, depuis, avant);

    if (liaison !== undefined && (iteration === undefined || iteration.index < liaison.index)) {
      return resoudreLiaison(ctx, liaison, chemin, profondeur);
    }
    if (iteration !== undefined) {
      const itere = (iteration[1] as string).trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(itere)) return { ok: false, trace: `itération sur ${itere}` };
      return resoudreIdentifiant(ctx, itere, iteration.index, chemin, profondeur + 1);
    }
    if (portee !== undefined && partiesDe(portee.params).some((p) => estLeParametre(p, ident))) {
      return resoudreParametre(ctx, portee, ident, chemin, profondeur);
    }
  }
  return { ok: false, trace: `\`${ident}\` sans liaison ni paramètre` };
};

const estLeParametre = (partie: string, ident: string): boolean =>
  new RegExp(`^(?:readonly\\s+)?${ident}\\b`).test(partie);

/** Ce qu'une liaison `const X = …` charge, selon la forme de son initialiseur. */
const resoudreLiaison = (
  ctx: Contexte,
  liaison: RegExpExecArray,
  chemin: readonly string[],
  profondeur: number,
): Resolution => {
  const init = initialiseurApres(ctx.source, liaison.index + liaison[0].length).replace(
    /^await\s+/,
    '',
  );
  const requete = /^[\w$.()\s]*\bprisma\b[\w$.]*\s*\(/.exec(init);
  if (requete !== null) {
    const ouvrante = init.indexOf('(', requete[0].length - 1);
    const args = partiesDe(init.slice(ouvrante + 1, finDuBloc(init, ouvrante)));
    const options = args.find((a) => a.startsWith('{'));
    if (options === undefined) return { ok: false, trace: 'requête sans objet d’options' };
    return colonnesAuChemin(ctx, options, chemin, profondeur + 1);
  }
  const propriete = /^([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)$/.exec(init);
  if (propriete !== null) {
    return resoudreIdentifiant(
      ctx,
      propriete[1] as string,
      liaison.index,
      [propriete[2] as string, ...chemin],
      profondeur + 1,
    );
  }
  if (/^[A-Za-z_$][\w$]*$/.test(init)) {
    return resoudreIdentifiant(ctx, init, liaison.index, chemin, profondeur + 1);
  }
  return { ok: false, trace: `liaison non résolue : ${init.slice(0, 60)}` };
};

/**
 * Le cas où le receveur est un PARAMÈTRE : la question remonte d'un cran — qui
 * appelle cette fonction, et avec quel objet ?
 *
 * Le PIRE des appels gagne. Une fonction locale appelée deux fois, une fois
 * depuis une projection complète et une fois depuis une projection étroite,
 * sert la moitié de ses destinataires dans la mauvaise langue.
 */
const resoudreParametre = (
  ctx: Contexte,
  porteuse: Fonction,
  ident: string,
  chemin: readonly string[],
  profondeur: number,
): Resolution => {
  const rang = partiesDe(porteuse.params).findIndex((p) => estLeParametre(p, ident));
  const resolutions: Resolution[] = [];

  const appels = new RegExp(`\\b${porteuse.nom}\\s*\\(`, 'g');
  let appel: RegExpExecArray | null;
  while ((appel = appels.exec(ctx.source)) !== null) {
    const ouvrante = appel.index + appel[0].length - 1;
    if (ouvrante >= porteuse.debutCorps && ouvrante <= porteuse.finCorps) continue;
    const args = partiesDe(ctx.source.slice(ouvrante + 1, finDuBloc(ctx.source, ouvrante)));
    const argument = args[rang];
    if (argument === undefined || !/^[A-Za-z_$][\w$]*$/.test(argument)) continue;
    resolutions.push(resoudreIdentifiant(ctx, argument, appel.index, chemin, profondeur + 1));
  }

  const pointLibre = new RegExp(
    `([A-Za-z_$][\\w$]*)\\s*\\.\\s*(?:map|forEach|flatMap|filter)\\s*\\(\\s*${porteuse.nom}\\s*\\)`,
    'g',
  );
  let itere: RegExpExecArray | null;
  while (rang === 0 && (itere = pointLibre.exec(ctx.source)) !== null) {
    resolutions.push(
      resoudreIdentifiant(ctx, itere[1] as string, itere.index, chemin, profondeur + 1),
    );
  }

  if (resolutions.length === 0) {
    return { ok: false, trace: `paramètre de \`${porteuse.nom}\`, aucun appel local` };
  }
  const pire = resolutions.sort((a, b) => PIRE[verdictDe(b)] - PIRE[verdictDe(a)])[0] as Resolution;
  return pire.ok
    ? { ...pire, trace: `paramètre de \`${porteuse.nom}\` — ${pire.trace}` }
    : { ok: false, trace: `paramètre de \`${porteuse.nom}\` — ${pire.trace}` };
};

const appelsDunFichier = (ctx: Contexte, relatif: string): readonly AppelDeCadrage[] => {
  const sites = new RegExp(`\\b(${HELPERS_DE_CADRAGE.join('|')})\\s*\\(`, 'g');
  const trouvailles: AppelDeCadrage[] = [];
  let trouve: RegExpExecArray | null;
  while ((trouve = sites.exec(ctx.source)) !== null) {
    if (/\b(?:function|type|interface)\s+$/.test(ctx.source.slice(0, trouve.index))) continue;
    const ouvrante = trouve.index + trouve[0].length - 1;
    const args = partiesDe(ctx.source.slice(ouvrante + 1, finDuBloc(ctx.source, ouvrante)));
    const receveur = (args[0] ?? '').trim();
    const resolution = /^[A-Za-z_$][\w$]*$/.test(receveur)
      ? resoudreIdentifiant(ctx, receveur, trouve.index, [], 0)
      : ({ ok: false, trace: `receveur non identifiant : ${receveur}` } as const);
    const colonnes = resolution.ok ? resolution.colonnes : [];
    trouvailles.push({
      fichier: relatif,
      helper: trouve[1] as string,
      receveur,
      verdict: verdictDe(resolution),
      colonnes,
      manquantes: resolution.ok ? COLONNES_DU_PRISME.filter((c) => !colonnes.includes(c)) : [],
      trace: resolution.trace,
    });
  }
  return trouvailles;
};

/**
 * Tous les appels de cadrage des sources de PRODUCTION d'une racine, avec le
 * verdict MESURÉ de la projection qui les alimente. Trié, pour que deux
 * exécutions rendent la même liste.
 */
export const balayerAppelsDeCadrage = (
  racine: string,
  exemptions: Readonly<Record<string, string>> = EXEMPTIONS,
): readonly AppelDeCadrage[] =>
  walk(racine, isHandWrittenSource)
    .map((fichier) => ({ fichier, relatif: relative(racine, fichier) }))
    .filter(({ relatif }) => exemptions[relatif] === undefined)
    .flatMap(({ fichier, relatif }) => {
      const brut = readFileSync(fichier, 'utf8');
      return appelsDunFichier({ fichier, brut, source: squelette(brut) }, relatif);
    })
    .sort((a, b) => a.fichier.localeCompare(b.fichier) || a.helper.localeCompare(b.helper));

/** Les appels alimentés par une projection ÉTROITE — l'inventaire gardé VIDE. */
export const projectionsEtroites = (
  racine: string,
  exemptions: Readonly<Record<string, string>> = EXEMPTIONS,
): readonly string[] =>
  balayerAppelsDeCadrage(racine, exemptions)
    .filter((appel) => appel.verdict === 'etroite')
    .map((appel) => `${appel.fichier} — ${appel.helper}(${appel.receveur}) sans ${appel.manquantes.join(', ')}`);

/** Les appels dont la chaîne n'a pas pu être remontée — à exempter ou à ouvrir. */
export const chainesNonRemontees = (
  racine: string,
  exemptions: Readonly<Record<string, string>> = EXEMPTIONS,
): readonly string[] =>
  balayerAppelsDeCadrage(racine, exemptions)
    .filter((appel) => appel.verdict === 'non-resolue')
    .map((appel) => `${appel.fichier} — ${appel.helper}(${appel.receveur}) : ${appel.trace}`);
