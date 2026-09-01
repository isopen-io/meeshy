/**
 * Le BALAYAGE de #4662 : toute écriture Prisma qui pose `Participant.language`
 * tient sa valeur du SITE UNIQUE (`utils/recipient-language.ts`).
 *
 * ## Pourquoi il part de la DONNÉE et non du nom de la fonction
 *
 * `Participant.language` avait quatre producteurs annoncés et deux règles. Un
 * seul descendait le Prisme ; les autres écrivaient `systemLanguage` NU, donc
 * le repli du site pour tout compte dont la langue vit au rang 2, 3 ou 4. Aucun
 * de ces sites ne partage un nom, une couche ni un helper : ils n'ont en commun
 * que la COLONNE qu'ils écrivent. Un balayage qui chercherait « qui appelle
 * `recipientLanguage` ? » ne pourrait, par construction, voir aucun des trois
 * sites en défaut — ils ne l'appelaient pas.
 *
 * C'est la leçon 261 dans sa forme la plus chère : **une énumération porte deux
 * affirmations — « ces sites appliquent la règle » (vérifiable) et « ce sont
 * les sites où la règle s'applique » (presque jamais vérifiée)**. Ce balayage
 * ne vérifie que la seconde, et il la vérifie en partant de l'écriture.
 *
 * ## Les quatre verdicts, et ce que chacun engage
 *
 * | verdict | ce que le site fait | ce que le cliquet en exige |
 * |---|---|---|
 * | `conforme` | `language` vient du site unique | rien — c'est le cas nominal |
 * | `hors-site` | `language` vient d'ailleurs | l'inventaire est VIDE, ou une exemption écrite |
 * | `non-resolue` | la chaîne n'a pas pu être remontée | l'inventaire est VIDE : le silence n'est pas un verdict |
 * | `sans-langue` | aucune clé `language` | inventaire GELÉ — la ligne prend le défaut `"en"` du schéma |
 *
 * Le quatrième n'est pas une commodité de classement, c'est le constat le plus
 * coûteux du lot et il est mesuré : `Participant.language` est déclaré
 * `String @default("en")` (`packages/shared/prisma/schema.prisma`). **Une
 * création qui n'écrit pas la colonne n'est donc pas neutre — elle écrit
 * `"en"`**, pour un francophone comme pour un autre. C'est la forme du cycle
 * 125 (« une protection se mesure sur tout ce que la charge TRANSPORTE ») :
 * la question à poser à un correctif de Prisme n'est pas seulement « les sites
 * qui écrivent la colonne l'écrivent-ils juste ? » mais **« qui la laisse
 * s'écrire toute seule ? »**. Ces sites vivent hors du périmètre de #4662 ; ils
 * sont GELÉS ici pour qu'un cinquième ne rejoigne pas la liste en silence.
 *
 * ## Ce que « remonter jusqu'à la valeur » sait suivre
 *
 * | forme | exemple du dépôt |
 * |---|---|
 * | littéral | `create({ data: { language: recipientLanguage(u, 'fr') } })` |
 * | étalement local | `data: { ...addedMemberFields }` |
 * | étalement importé | `data: { ...REJOIN_PARTICIPANT_STATE }` — un saut chez le voisin |
 * | `data` nommé | `createMany({ data: membersData })` |
 * | tableau | `createMany({ data: [ {…}, {…} ] })` |
 * | projection d'une liste | `const membersData = ids.map((id) => ({ … }))` |
 * | `upsert` | ses deux branches `create:` et `update:` |
 *
 * Une chaîne qu'il ne sait pas remonter rend `non-resolue`, **jamais
 * `conforme`** : un balayage négatif doit se tromper du côté qui accuse.
 *
 * @see utils/recipient-language.ts — le site unique dont ce balayage garde les producteurs.
 * @see recipient-language-projection-sweep.ts — son jumeau de #4642, qui garde la PROJECTION
 *      des appelants du cadrage là où celui-ci garde les ÉCRITURES de la colonne.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';

import { isHandWrittenSource, walk } from './helpers/file-size-sweep';
import { squelette } from './recipient-language-projection-sweep';

/** Les opérations Prisma qui peuvent poser une valeur sur une ligne `Participant`. */
export const OPERATIONS_DECRITURE = [
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
] as const;

/**
 * Les portes du site unique. `recipientDateLocale` n'en est pas : elle rend une
 * étiquette pour `Intl`, jamais un code de langue à persister.
 */
export const SITE_UNIQUE = ['recipientLanguage', 'recipientLanguages'] as const;

/**
 * Les valeurs LÉGITIMEMENT hors du site unique, avec leur raison.
 *
 * Une valeur qu'on ne sait pas classer n'entre PAS ici sans qu'on ait ouvert sa
 * question : c'est le geste qui force l'arbitrage plutôt que de le laisser
 * tomber dans un silence.
 */
export const EXEMPTIONS: Readonly<Record<string, string>> = {
  'routes/conversations/link-admission.ts': [
    "l'invité de lien partagé n'a AUCUNE ligne `User` — il n'existe donc aucun",
    "prisme à descendre. `profile.language` vient du CORPS de la requête, seul",
    'signal de langue que cette porte possède, et le schéma Zod le normalise',
    "(`normalizeLanguageForDedup`, repli `'fr'`). Y appeler le site unique",
    "n'aurait rien à lire.",
  ].join(' '),
};

/**
 * Les écritures dont le `data` est OPAQUE au balayage, avec leur raison.
 *
 * `data: ban.data` remet un objet composé par une fonction d'un AUTRE module
 * (`resolveBanWrite` / `resolveUnbanWrite`, `services/conversations/conversationBanState.ts`),
 * dont les deux retours sont des littéraux de transition d'état — `bannedAt`,
 * `isActive`, `leftAt`. Remonter deux sauts jusqu'à ces littéraux serait de la
 * mécanique pour un site qui, par nature, ne pose pas de langue.
 *
 * L'inventaire est GELÉ plutôt que la mécanique étendue : une écriture opaque
 * NEUVE fait tomber le cliquet et pose la question à qui l'écrit, ce qui est
 * exactement l'effet recherché.
 */
export const ECRITURES_OPAQUES: Readonly<Record<string, string>> = {
  // #4713 a extrait le NOYAU des deux gestes hors de `routes/conversations/ban.ts` :
  // les deux ecritures opaques ont suivi TELLES QUELLES dans
  // `participant-ban-core.ts`. Seule la CLE change — l'inventaire est indexe par
  // FICHIER, et rien de ce qu'il gele n'a bouge.
  'routes/conversations/participant-ban-core.ts': [
    '`data: ban.data` / `data: unban.data` — une transition d’état composée par',
    '`conversationBanState.ts`, à deux sauts. Ses deux littéraux ne portent que',
    '`bannedAt`, `isActive` et `leftAt`.',
  ].join(' '),
};

/**
 * Les créations qui n'écrivent PAS la colonne, et prennent donc le défaut
 * `"en"` du schéma — l'inventaire GELÉ, avec la raison de chacune.
 *
 * Hors périmètre de #4662, qui corrige les sites qui écrivent MAL et non ceux
 * qui n'écrivent PAS. Gelées pour qu'aucune sixième ne rejoigne la liste sans
 * qu'on le voie.
 */
export const CREATIONS_SANS_LANGUE: Readonly<Record<string, string>> = {
  'routes/conversations/sharing.ts': [
    '`POST /conversations/:id/invite` — un inscrit ajouté par un tiers. Son',
    'prisme est lisible (la ligne `User` existe) : le site est mûr pour la',
    "descente, mais l'ouvrir ici déborderait le périmètre de #4662.",
  ].join(' '),
  'routes/conversations/link-admission.ts': [
    '`joinAsRegistered` — un inscrit qui rejoint par lien. `performLinkJoin` ne',
    "lui remet PAS son `profile`, si bien que la langue calculée par l'appelant",
    "ne l'atteint jamais : la ligne prend `\"en\"`.",
  ].join(' '),
  'services/conversations/ensureGlobalConversationMembership.ts': [
    "l'entrée au salon global, cinquième porte d'entrée du dépôt. Le prisme du",
    'compte est lisible et la descente y serait la même que partout ailleurs.',
  ].join(' '),
  'services/InitService.ts': [
    'le SEED de développement — des comptes fabriqués, jamais un lecteur réel.',
  ].join(' '),
};

/** Ce qu'une écriture de participant fait de la colonne `language`. */
export type VerdictDecriture = 'conforme' | 'hors-site' | 'non-resolue' | 'sans-langue';

export type EcritureDeParticipant = {
  /** Le chemin du fichier, relatif à la racine balayée. */
  readonly fichier: string;
  /** L'opération Prisma — `create`, `update`, … */
  readonly operation: string;
  /** La ligne du fichier où l'écriture commence. */
  readonly ligne: number;
  readonly verdict: VerdictDecriture;
  /** L'expression trouvée à droite de `language:`, quand il y en a une. */
  readonly valeur: string;
  /** Comment la valeur a été remontée, ou pourquoi elle ne l'a pas été. */
  readonly trace: string;
};

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
    if (OUVRANTS.includes(c)) profondeur += 1;
    else if (FERMANTS.includes(c)) profondeur -= 1;
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

/** Les étalements de PREMIER niveau d'un objet littéral. */
const etalementsDe = (corps: string): readonly string[] => {
  const etalements: string[] = [];
  let profondeur = 0;
  const jetons = /\.\.\.\s*((?:this\.)?[A-Za-z_$][\w$]*)|[({[)}\]]/g;
  let trouve: RegExpExecArray | null;
  while ((trouve = jetons.exec(corps)) !== null) {
    const jeton = trouve[0];
    if (OUVRANTS.includes(jeton)) profondeur += 1;
    else if (FERMANTS.includes(jeton)) profondeur -= 1;
    else if (profondeur === 1 && trouve[1] !== undefined) etalements.push(trouve[1]);
  }
  return etalements;
};

/**
 * Le contexte d'un fichier : sa source BRUTE et son squelette.
 *
 * Les deux sont nécessaires et pour des raisons opposées. Le squelette rend
 * l'appariement des délimiteurs fiable (une accolade dans un message d'erreur
 * décalerait toutes les tranches lues), mais il VIDE les chaînes — donc les
 * chemins d'import avec. Chercher un voisin dans le squelette ne rend jamais
 * rien : le spécificateur y est devenu des espaces. Les imports se lisent donc
 * sur le brut, et les index restent communs aux deux.
 */
type Contexte = {
  readonly fichier: string;
  readonly brut: string;
  readonly source: string;
};

const IMPORT_RELATIF = /\bfrom\s*['"](\.[^'"]*)['"]/g;

/** Le fichier voisin qu'un spécificateur relatif désigne, s'il existe. */
const resoudreVoisin = (fichier: string, specificateur: string): string | undefined => {
  const base = join(dirname(fichier), specificateur.replace(/\.js$/, ''));
  for (const candidat of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidat)) return candidat;
  }
  return undefined;
};

/**
 * L'objet littéral qu'un identifiant désigne — dans le fichier, ou chez le
 * voisin importé à UN saut.
 *
 * Trois formes sont reconnues, et toutes trois vivent dans le dépôt : le
 * littéral nu (`const X = { … }`), le tableau (`const X = [ … ]`, dont les
 * éléments sont rendus concaténés — la question posée est « la colonne
 * apparaît-elle ? », jamais « dans quel élément ? »), et la PROJECTION d'une
 * liste (`const X = ids.map((id) => ({ … }))`), qui est la forme de
 * `InitService.membersData`.
 */
const objetLitteralNomme = (ctx: Contexte, nom: string): string | undefined => {
  const echappe = nom.replace(/[$]/g, '\\$&');
  const liaison = new RegExp(`\\b(?:const|let|var)\\s+${echappe}\\s*(?::[^=]*?)?=\\s*`, 'g');
  const trouve = liaison.exec(ctx.source);
  if (trouve !== null) {
    const debut = trouve.index + trouve[0].length;
    const reste = ctx.source.slice(debut);
    if (reste.startsWith('{') || reste.startsWith('[')) {
      return reste.slice(0, finDuBloc(reste, 0) + 1);
    }
    const projection = /^[\s\S]{0,200}?\.\s*(?:map|flatMap)\s*\(/.exec(reste);
    if (projection !== null) {
      const apres = reste.slice(projection[0].length - 1);
      const corps = apres.slice(0, finDuBloc(apres, 0) + 1);
      const litteral = /=>\s*\(?\s*\{/.exec(corps);
      if (litteral !== null) {
        const ouvrante = litteral.index + litteral[0].length - 1;
        return corps.slice(ouvrante, finDuBloc(corps, ouvrante) + 1);
      }
    }
    return undefined;
  }

  let importe: RegExpExecArray | null;
  const imports = new RegExp(IMPORT_RELATIF.source, 'g');
  while ((importe = imports.exec(ctx.brut)) !== null) {
    const debutClause = ctx.brut.lastIndexOf('import', importe.index);
    if (debutClause < 0) continue;
    if (!new RegExp(`\\b${echappe}\\b`).test(ctx.brut.slice(debutClause, importe.index))) continue;
    const voisin = resoudreVoisin(ctx.fichier, importe[1] as string);
    if (voisin === undefined) continue;
    const brut = readFileSync(voisin, 'utf8');
    return objetLitteralNomme({ fichier: voisin, brut, source: squelette(brut) }, nom);
  }
  return undefined;
};

type Trouvaille = { readonly valeur: string; readonly trace: string } | 'absente' | 'non-resolue';

/**
 * La valeur de `language` portée par un objet de données, étalements résolus.
 *
 * Rend `'non-resolue'` dès qu'un étalement ne se remonte pas : une clé peut
 * vivre dedans, et la conclure absente serait se tromper du côté qui absout.
 */
const langueDe = (ctx: Contexte, corps: string, profondeur: number): Trouvaille => {
  if (profondeur > 6) return 'non-resolue';
  const directe = valeurDeCle(corps, 'language');
  if (directe !== undefined) return { valeur: directe, trace: 'clé directe' };

  for (const etalement of etalementsDe(corps)) {
    const objet = objetLitteralNomme(ctx, etalement);
    if (objet === undefined) return 'non-resolue';
    const dedans = langueDe(ctx, objet, profondeur + 1);
    if (dedans === 'non-resolue') return 'non-resolue';
    if (dedans !== 'absente') return { valeur: dedans.valeur, trace: `étalement \`${etalement}\`` };
  }
  return 'absente';
};

/** Les objets de données qu'une opération remet — `data`, ou les deux branches d'un `upsert`. */
const objetsDeDonnees = (ctx: Contexte, options: string, operation: string): readonly string[] | undefined => {
  const cles = operation === 'upsert' ? ['create', 'update'] : ['data'];
  const objets: string[] = [];
  for (const cle of cles) {
    const brut = valeurDeCle(options, cle);
    if (brut === undefined) continue;
    const resolu = brut.startsWith('{') || brut.startsWith('[')
      ? brut
      : /^[A-Za-z_$][\w$]*$/.test(brut)
        ? objetLitteralNomme(ctx, brut)
        : undefined;
    if (resolu === undefined) return undefined;
    objets.push(resolu);
  }
  return objets;
};

const estDuSiteUnique = (valeur: string): boolean =>
  SITE_UNIQUE.some((porte) => new RegExp(`\\b${porte}\\s*\\(`).test(valeur));

const ecrituresDunFichier = (ctx: Contexte, relatif: string): readonly EcritureDeParticipant[] => {
  const sites = new RegExp(
    `\\bparticipant\\s*\\.\\s*(${OPERATIONS_DECRITURE.join('|')})\\s*\\(`,
    'g',
  );
  const trouvailles: EcritureDeParticipant[] = [];
  let trouve: RegExpExecArray | null;
  while ((trouve = sites.exec(ctx.source)) !== null) {
    const operation = trouve[1] as string;
    const ouvrante = trouve.index + trouve[0].length - 1;
    const args = partiesDe(ctx.source.slice(ouvrante + 1, finDuBloc(ctx.source, ouvrante)));
    const litteral = args.find((a) => a.startsWith('{'));
    const nomme = litteral === undefined && args[0] !== undefined && /^[A-Za-z_$][\w$]*$/.test(args[0])
      ? objetLitteralNomme(ctx, args[0])
      : undefined;
    const options = litteral ?? nomme;
    const ligne = ctx.source.slice(0, trouve.index).split('\n').length;
    const base = { fichier: relatif, operation, ligne };

    if (options === undefined) {
      trouvailles.push({ ...base, verdict: 'non-resolue', valeur: '', trace: `options non remontées : ${args[0] ?? '—'}` });
      continue;
    }
    const objets = objetsDeDonnees(ctx, options, operation);
    if (objets === undefined) {
      trouvailles.push({ ...base, verdict: 'non-resolue', valeur: '', trace: '`data` non remonté' });
      continue;
    }
    if (objets.length === 0) {
      trouvailles.push({ ...base, verdict: 'sans-langue', valeur: '', trace: 'aucun objet de données' });
      continue;
    }

    for (const objet of objets) {
      const langue = langueDe(ctx, objet, 0);
      if (langue === 'non-resolue') {
        trouvailles.push({ ...base, verdict: 'non-resolue', valeur: '', trace: 'étalement non remonté' });
      } else if (langue === 'absente') {
        trouvailles.push({ ...base, verdict: 'sans-langue', valeur: '', trace: 'aucune clé `language`' });
      } else {
        trouvailles.push({
          ...base,
          verdict: estDuSiteUnique(langue.valeur) ? 'conforme' : 'hors-site',
          valeur: langue.valeur,
          trace: langue.trace,
        });
      }
    }
  }
  return trouvailles;
};

/**
 * Toutes les écritures Prisma vers `Participant` des sources de PRODUCTION
 * d'une racine, avec le verdict MESURÉ de ce qu'elles font de `language`.
 * Trié, pour que deux exécutions rendent la même liste.
 */
export const balayerEcrituresDeParticipant = (
  racine: string,
): readonly EcritureDeParticipant[] =>
  walk(racine, isHandWrittenSource)
    .map((fichier) => ({ fichier, relatif: relative(racine, fichier) }))
    .flatMap(({ fichier, relatif }) => {
      const brut = readFileSync(fichier, 'utf8');
      return ecrituresDunFichier({ fichier, brut, source: squelette(brut) }, relatif);
    })
    .sort((a, b) => a.fichier.localeCompare(b.fichier) || a.ligne - b.ligne);

const inventaire = (
  racine: string,
  verdict: VerdictDecriture,
  exemptions: Readonly<Record<string, string>>,
): readonly string[] =>
  balayerEcrituresDeParticipant(racine)
    .filter((e) => e.verdict === verdict && exemptions[e.fichier] === undefined)
    .map((e) => `${e.fichier}:${e.ligne} — ${e.operation} pose \`language\` depuis ${e.valeur || e.trace}`);

/** Les écritures qui posent `language` HORS du site unique — l'inventaire gardé VIDE. */
export const producteursHorsSite = (
  racine: string,
  exemptions: Readonly<Record<string, string>> = EXEMPTIONS,
): readonly string[] => inventaire(racine, 'hors-site', exemptions);

/**
 * Les écritures dont la valeur n'a pas pu être remontée, HORS inventaire gelé
 * — gardé VIDE. Le silence n'est pas un verdict : une chaîne qu'on ne sait pas
 * suivre est OUVERTE ou GELÉE avec sa raison, jamais laissée sans nom.
 */
export const ecrituresNonResolues = (
  racine: string,
  opaques: Readonly<Record<string, string>> = ECRITURES_OPAQUES,
): readonly string[] => inventaire(racine, 'non-resolue', opaques);

/**
 * Les FICHIERS dont une écriture ne pose aucune `language` — la ligne prend
 * alors le défaut `"en"` du schéma. Inventaire GELÉ, pas vide.
 */
export const fichiersSansLangue = (racine: string): readonly string[] =>
  [
    ...new Set(
      balayerEcrituresDeParticipant(racine)
        .filter((e) => e.verdict === 'sans-langue' && /create/i.test(e.operation))
        .map((e) => e.fichier),
    ),
  ].sort();
