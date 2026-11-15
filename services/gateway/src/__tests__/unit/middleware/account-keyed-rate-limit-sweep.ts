/**
 * Balayage : toute config de débit qui compte l'APPELANT pose-t-elle son hook ?
 *
 * @fastify/rate-limit évalue `config.rateLimit` au hook `onRequest`
 * (`defaultHook`, index.js), qui court AVANT `preValidation` — donc avant que
 * `unifiedAuth` ne pose `authContext`. Un `keyGenerator` qui lit l'identité de
 * l'appelant y reçoit `undefined` et retombe sur l'adresse, silencieusement :
 * le code dit « par compte », le commentaire dit « par compte », le
 * comportement est « par adresse », et rien ne rougit.
 *
 * ── Pourquoi un BALAYAGE et pas une liste ────────────────────────────────
 *
 * Le cliquet voisin (`rate-limit-key-reaches-account.test.ts`) ÉNUMÈRE les
 * fabriques de `middleware/rate-limiter.ts`. Il a déclaré la dette soldée en
 * disant vrai — de ce fichier-là. `middleware/rate-limit.ts`, à un caractère
 * du premier, portait le même défaut intact, et son doc-comment NOMMAIT les
 * trois fabriques corrigées en affirmant suivre leur patron. Un balayage qui
 * cherche dans UN fichier mesure ce fichier.
 *
 * ── Ce que le détecteur reconnaît, et pourquoi il doit résoudre ──────────
 *
 * Ni « lit l'appelant » ni « pose le hook » ne s'écrivent au même endroit
 * dans le dépôt : `GARDES_DE_CLE` pose le hook par ÉPANDAGE,
 * `withUserKeyedFailClosed()` par ENVELOPPE, `resolveCallerKey()` lit
 * l'appelant par APPEL. Un détecteur qui ne chercherait que les jetons
 * littéraux mesurerait la popularité d'une écriture, pas une propriété —
 * c'est l'erreur du cycle 107, dont le balayage avait rendu sept faux
 * positifs et fut JETÉ plutôt que gelé. Les identifiants du même fichier
 * sont donc RÉSOLUS, dans les deux sens.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const RACINE_GATEWAY = join(__dirname, '..', '..', '..');

export type ConfigDeDebit = {
  readonly fichier: string;
  /**
   * `fichier#<préfixe de seau>` — l'espace de noms que le générateur écrit
   * (`msg:`, `calls:`, `posts:`…), qui NOMME ce que la config compte. Deux
   * configs d'un même fichier ne se confondent donc pas, y compris quand
   * elles partagent leur plafond — `rate-limiter.ts` en a deux à 20/min. Et
   * la clé ne dérive pas à la première édition, contrairement à un numéro de
   * ligne (précédent du cliquet de schémas de réponse).
   */
  readonly cle: string;
  readonly litteral: string;
  readonly compteLAppelant: boolean;
  readonly posePreHandler: boolean;
  readonly declareSkipOnError: boolean;
};

const REPERTOIRES_IGNORES = new Set(['node_modules', '__tests__', 'dist', '__stubs__']);

export function listerSources(racine: string): string[] {
  const trouves: string[] = [];
  const descendre = (repertoire: string): void => {
    for (const entree of readdirSync(repertoire)) {
      const chemin = join(repertoire, entree);
      if (statSync(chemin).isDirectory()) {
        if (REPERTOIRES_IGNORES.has(entree) === false) descendre(chemin);
        continue;
      }
      if (entree.endsWith('.ts') && entree.endsWith('.d.ts') === false) trouves.push(chemin);
    }
  };
  descendre(racine);
  return trouves;
}

/**
 * Remplace commentaires et chaînes par des espaces SANS changer la longueur.
 *
 * L'appariement d'accolades doit ignorer les `{` d'un commentaire et les
 * `${…}` d'un gabarit ; conserver les indices permet en revanche de découper
 * le littéral dans la source D'ORIGINE, seule lisible dans un rapport.
 *
 * **Ce masque sert à APPARIER, jamais à LIRE** — et la distinction a été
 * mesurée sur ce balayage même, qui donnait trois faux « non conforme ». Il
 * efface `'preHandler'` (une chaîne) et `${resolveCallerKey(request)}` (du
 * CODE, dans un gabarit) : chercher dedans revient à demander à un texte
 * amputé s'il contient ce qu'on vient d'en retirer. Les tests de CONTENU
 * lisent `masquerCommentaires`, qui n'ôte que ce qui n'est pas du programme.
 */
export function masquerCommentairesEtChaines(source: string): string {
  const sortie = source.split('');
  const n = source.length;
  let i = 0;
  const effacer = (position: number): void => {
    if (source[position] !== '\n') sortie[position] = ' ';
  };

  while (i < n) {
    if (source[i] === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') { effacer(i); i += 1; }
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      while (i < n && (source[i] !== '*' || source[i + 1] !== '/')) { effacer(i); i += 1; }
      effacer(i); effacer(i + 1); i += 2;
      continue;
    }
    if (source[i] === '"' || source[i] === "'" || source[i] === '`') {
      const guillemet = source[i];
      effacer(i); i += 1;
      while (i < n) {
        if (source[i] === '\\') { effacer(i); effacer(i + 1); i += 2; continue; }
        if (source[i] === guillemet) { effacer(i); i += 1; break; }
        effacer(i); i += 1;
      }
      continue;
    }
    i += 1;
  }
  return sortie.join('');
}

/** N'ôte que les commentaires : tout ce qui reste est du programme. */
export function masquerCommentaires(source: string): string {
  const sortie = source.split('');
  const n = source.length;
  let i = 0;
  const effacer = (position: number): void => {
    if (source[position] !== '\n') sortie[position] = ' ';
  };

  while (i < n) {
    if (source[i] === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') { effacer(i); i += 1; }
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      while (i < n && (source[i] !== '*' || source[i + 1] !== '/')) { effacer(i); i += 1; }
      effacer(i); effacer(i + 1); i += 2;
      continue;
    }
    if (source[i] === '"' || source[i] === "'" || source[i] === '`') {
      const guillemet = source[i];
      i += 1;
      while (i < n) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === guillemet) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return sortie.join('');
}

function litteralEnglobant(masquee: string, position: number): { debut: number; fin: number } | null {
  let profondeur = 0;
  let debut = -1;
  for (let i = position; i >= 0; i -= 1) {
    if (masquee[i] === '}') profondeur += 1;
    else if (masquee[i] === '{') {
      if (profondeur === 0) { debut = i; break; }
      profondeur -= 1;
    }
  }
  if (debut < 0) return null;

  profondeur = 0;
  for (let i = debut; i < masquee.length; i += 1) {
    if (masquee[i] === '{') profondeur += 1;
    else if (masquee[i] === '}') {
      profondeur -= 1;
      if (profondeur === 0) return { debut, fin: i + 1 };
    }
  }
  return null;
}

/** Corps d'une définition de même fichier, apparié sur ses accolades. */
function corpsDeLIdentifiant(masquee: string, lisible: string, nom: string): string {
  const declaration = new RegExp(`(?:const|let|function)\\s+${nom}\\b`).exec(masquee);
  if (declaration === null) return '';
  const ouverture = masquee.indexOf('{', declaration.index);
  if (ouverture < 0) return '';
  let profondeur = 0;
  for (let i = ouverture; i < masquee.length; i += 1) {
    if (masquee[i] === '{') profondeur += 1;
    else if (masquee[i] === '}') {
      profondeur -= 1;
      if (profondeur === 0) return lisible.slice(declaration.index, i + 1);
    }
  }
  return '';
}

const LIT_LAPPELANT = /authContext|request\.auth|req\.auth/;
const POSE_LE_HOOK = /hook\s*:\s*['"]preHandler['"]/;
const DECLARE_SKIP = /skipOnError\s*:/;

/**
 * `timeWindow` sépare les DEUX limiteurs du dépôt, et il faut le faire.
 *
 * @fastify/rate-limit prend `timeWindow` ; le limiteur MAISON
 * (`utils/rate-limiter.ts`, monté par les routes `directory/*`, `sync` et
 * `reports`) prend `windowMs` + `keyPrefix`. Ce dernier est un `preHandler`
 * PAR CONSTRUCTION — il n'a pas de hook à choisir, donc pas de défaut de la
 * classe balayée ici. Les confondre ferait rougir ce cliquet sur sept sites
 * corrects, et un cliquet qui accuse à tort se fait désarmer.
 */
function estUneConfigDuPlugin(litteral: string): boolean {
  return /\btimeWindow\b/.test(litteral) && /\bkeyPrefix\b/.test(litteral) === false;
}

function identifiantsCites(litteral: string): string[] {
  return Array.from(litteral.matchAll(/[A-Za-z_$][\w$]*/g)).map((m) => m[0]);
}

/**
 * Une propriété portée par un identifiant du même fichier — épandue
 * (`...GARDES_DE_CLE`), appelée (`resolveCallerKey(request)`) ou posée par une
 * enveloppe (`withUserKeyedFailClosed({…})`) — vaut portée par le littéral.
 */
function corpsResolus(
  litteral: string,
  avantLeLitteral: string,
  masquee: string,
  lisible: string
): string[] {
  const candidats = new Set(identifiantsCites(litteral));
  const enveloppe = /([A-Za-z_$][\w$]*)\s*\(\s*$/.exec(avantLeLitteral);
  if (enveloppe !== null) candidats.add(enveloppe[1]);

  return Array.from(candidats)
    .map((nom) => corpsDeLIdentifiant(masquee, lisible, nom))
    .filter((corps) => corps !== '');
}

/**
 * Nom du SEAU que la config alimente — `posts:`, `calls:`, `signal:session:`.
 *
 * Le repli `ip:` est ÉCARTÉ : il apparaît en premier dans la plupart des
 * générateurs (`authContext?.userId ?? \`ip:…\``), et le retenir donnerait la
 * même clé à des configs qui ne comptent pas la même chose.
 */
function nomDuSeau(textes: readonly string[]): string | null {
  for (const texte of textes) {
    for (const trouve of texte.matchAll(/['"`]([A-Za-z][\w-]*(?::[\w-]*)+)/g)) {
      if (trouve[1] !== 'ip:') return trouve[1];
    }
  }
  return null;
}

export function relever(fichier: string, source: string, racine: string): ConfigDeDebit[] {
  const pourApparier = masquerCommentairesEtChaines(source);
  const lisible = masquerCommentaires(source);
  const releves: ConfigDeDebit[] = [];
  const vus = new Set<number>();

  for (const occurrence of pourApparier.matchAll(/\bkeyGenerator\b/g)) {
    const bornes = litteralEnglobant(pourApparier, occurrence.index);
    if (bornes === null || vus.has(bornes.debut)) continue;
    vus.add(bornes.debut);

    const litteral = lisible.slice(bornes.debut, bornes.fin);
    const avant = pourApparier.slice(Math.max(0, bornes.debut - 120), bornes.debut);
    if (estUneConfigDuPlugin(litteral) === false) continue;

    const textes = [litteral, ...corpsResolus(litteral, avant, pourApparier, lisible)];
    const porte = (motif: RegExp): boolean => textes.some((texte) => motif.test(texte));

    if (porte(LIT_LAPPELANT) === false) continue;

    const chemin = relative(racine, fichier).split(sep).join('/');
    const seau = nomDuSeau(textes.map((t) => t.slice(t.indexOf('keyGenerator') + 1)));
    const plafond = /\bmax\s*:?\s*([^,\n]*)/.exec(litteral);
    releves.push({
      fichier: chemin,
      cle: `${chemin}#${seau ?? (plafond === null ? '?' : plafond[1].trim())}`,
      litteral,
      compteLAppelant: true,
      posePreHandler: porte(POSE_LE_HOOK),
      declareSkipOnError: porte(DECLARE_SKIP),
    });
  }

  return releves;
}

export type ResultatBalayage = {
  readonly fichiersVisites: number;
  readonly configs: readonly ConfigDeDebit[];
};

export function balayerConfigsDeDebit(racine: string = RACINE_GATEWAY): ResultatBalayage {
  const sources = listerSources(racine);
  const configs = sources.flatMap((fichier) =>
    relever(fichier, readFileSync(fichier, 'utf8'), racine)
  );
  return { fichiersVisites: sources.length, configs };
}
