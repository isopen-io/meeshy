/**
 * Dénombrement des adresses en sursis, et de celles qui l'ANNONCENT (#4274).
 *
 * La question utile n'est pas « cet alias-ci pose-t-il ses en-têtes ? » — un
 * exemple y répond toujours oui. C'est : **combien d'adresses se déclarent
 * alias, et combien le disent au client ?** Le dépôt en sert quinze ; avant ce
 * lot, ZÉRO le disait. Un client — un binaire iOS déjà installé, un
 * intégrateur tiers — ne pouvait apprendre l'obsolescence qu'en lisant le code
 * du serveur, ce qu'il ne peut pas faire.
 *
 * ## Ce que la garde attrape
 *
 *   - un NOUVEL alias écrit muet : dès qu'il se déclare « alias », « adaptateur »
 *     ou `deprecated: true`, il doit porter `depreciee(...)` ;
 *   - la disparition silencieuse d'une annonce sur un alias qui l'avait ;
 *   - le pourrissement de la DETTE : une entrée qui ne désigne plus rien.
 *
 * ## Ce qu'elle n'attrape pas, et qu'elle ne prétend pas attraper
 *
 * Que la date et le successeur soient JUSTES — c'est du sens, pas de la
 * couverture ; `deprecation.test.ts` tient la forme des en-têtes, et
 * `alias-deprecation-adoption.test.ts` tient le fait qu'ils partent.
 *
 * ## La FRONTIÈRE du balayage, déclarée plutôt que subie
 *
 * Une route ne compte comme « déclarée alias » que si elle le dit à un endroit
 * qu'un client peut voir ou qu'un relecteur lit d'abord : le commentaire
 * ADJACENT à l'enregistrement, ou `schema.description` / `summary` /
 * `deprecated`. Une déclaration enfouie dans le CORPS du handler n'est pas
 * balayée — la chercher ferait rougir toute route dont un commentaire interne
 * emploie le mot (mesuré : onze faux positifs, dont `Task ID (alias for
 * jobId)`). `ALIAS_INVISIBLES_AU_BALAYAGE` les nomme donc à la main, pour que
 * « non couvert » reste un fait écrit et jamais un angle mort.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname, basename } from 'path';

const ROUTES_DIR = join(__dirname, '../../../routes');

const VERBES = 'get|post|put|patch|delete|head|options|all';
const ENREGISTREMENT = new RegExp(String.raw`\bfastify\.(${VERBES})\s*(?:<[\s\S]*?>\s*)?\(`, 'g');
const VOCABULAIRE = /\balias\b|adaptateur|adresses? historiques?|\bdeprecated\b|dépréci/i;
const ANNONCE_POSEE = /\bdepreciee\s*\(/;

type Enregistrement = {
  readonly fichier: string;
  readonly ligne: number;
  readonly verbe: string;
  readonly chemin: string;
  readonly declare: boolean;
  readonly annonce: boolean;
};

function fichiersDeRoutes(dossier: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      if (nom !== '__tests__') fichiersDeRoutes(chemin, acc);
    } else if (nom.endsWith('.ts') && !nom.endsWith('.test.ts')) {
      acc.push(chemin);
    }
  }
  return acc;
}

/**
 * Avance depuis un ouvrant jusqu'à l'index qui SUIT son fermant, en ignorant
 * chaînes et commentaires. Une analyse par accolades naïve confond le `}` d'un
 * littéral de gabarit avec celui de l'objet d'options.
 */
function apresLeFermant(source: string, debut: number): number {
  let profondeur = 0;
  let index = debut;
  let mode: string | null = null;

  while (index < source.length) {
    const c = source[index];
    const suivant = source[index + 1];

    if (mode !== null) {
      if (mode === "'" || mode === '"' || mode === '`') {
        if (c === '\\') { index += 2; continue; }
        if (c === mode) mode = null;
      } else if (mode === '//') {
        if (c === '\n') mode = null;
      } else if (c === '*' && suivant === '/') {
        mode = null;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (c === '/' && suivant === '/') { mode = '//'; index += 2; continue; }
    if (c === '/' && suivant === '*') { mode = '/*'; index += 2; continue; }
    if (c === "'" || c === '"' || c === '`') { mode = c; index += 1; continue; }
    if (c === '(' || c === '{' || c === '[') { profondeur += 1; index += 1; continue; }
    if (c === ')' || c === '}' || c === ']') {
      profondeur -= 1;
      index += 1;
      if (profondeur === 0) return index;
      continue;
    }
    index += 1;
  }
  return index;
}

function argumentsDeNiveau1(interieur: string): string[] {
  const sortie: string[] = [];
  let profondeur = 0;
  let mode: string | null = null;
  let courant = '';
  let index = 0;

  while (index < interieur.length) {
    const c = interieur[index];
    const suivant = interieur[index + 1];

    if (mode !== null) {
      courant += c;
      if (mode === "'" || mode === '"' || mode === '`') {
        if (c === '\\') { courant += suivant ?? ''; index += 2; continue; }
        if (c === mode) mode = null;
      } else if (mode === '//') {
        if (c === '\n') mode = null;
      } else if (c === '*' && suivant === '/') {
        courant += suivant;
        mode = null;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (c === '/' && suivant === '/') { mode = '//'; courant += c + suivant; index += 2; continue; }
    if (c === '/' && suivant === '*') { mode = '/*'; courant += c + suivant; index += 2; continue; }
    if (c === "'" || c === '"' || c === '`') { mode = c; courant += c; index += 1; continue; }
    if (c === '(' || c === '{' || c === '[') { profondeur += 1; courant += c; index += 1; continue; }
    if (c === ')' || c === '}' || c === ']') { profondeur -= 1; courant += c; index += 1; continue; }
    if (c === ',' && profondeur === 0) { sortie.push(courant); courant = ''; index += 1; continue; }
    courant += c;
    index += 1;
  }
  sortie.push(courant);
  return sortie;
}

/** Retire les commentaires de TÊTE d'une entrée, pour que sa clé soit ancrable. */
function sansCommentaireDeTete(entree: string): string {
  let reste = entree.trimStart();
  for (;;) {
    if (reste.startsWith('//')) {
      const fin = reste.indexOf('\n');
      reste = fin === -1 ? '' : reste.slice(fin + 1).trimStart();
      continue;
    }
    if (reste.startsWith('/*')) {
      const fin = reste.indexOf('*/');
      reste = fin === -1 ? '' : reste.slice(fin + 2).trimStart();
      continue;
    }
    return reste;
  }
}

/**
 * La valeur des clés nommées au PREMIER niveau d'un objet littéral.
 *
 * La clé est ANCRÉE au début de son entrée, jamais cherchée dedans : sans cet
 * ancrage, `schema.body.properties.captchaToken.description` répond à une
 * demande de `description`, et deux routes parfaitement saines se déclarent
 * dépréciées parce qu'un de leurs CHAMPS l'est (mesuré : `/forgot-password`
 * pour son `captchaToken`, `/voice/translate/async` pour son `taskId`).
 */
function valeursDeNiveau1(objet: string, cles: readonly string[]): Record<string, string> {
  const trouvees: Record<string, string> = {};

  for (const entree of argumentsDeNiveau1(objet.slice(1, -1))) {
    const m = sansCommentaireDeTete(entree).match(/^(?:['"])?([A-Za-z0-9_$]+)(?:['"])?\s*:\s*([\s\S]*)$/);
    if (m === null || !cles.includes(m[1])) continue;
    trouvees[m[1]] = (trouvees[m[1]] ?? '') + ' ' + m[2];
  }
  return trouvees;
}

function commentaireAdjacent(lignes: readonly string[], ligne: number): string {
  let index = ligne - 2;
  while (index >= 0 && lignes[index].trim() === '') index -= 1;

  const bloc: string[] = [];
  while (index >= 0) {
    const texte = lignes[index].trim();
    const estCommentaire =
      texte.startsWith('//') || texte.startsWith('*') || texte.startsWith('/*') || texte.endsWith('*/');
    if (!estCommentaire) break;
    bloc.unshift(texte);
    if (texte.startsWith('/*')) break;
    index -= 1;
  }
  return bloc.join('\n');
}

function balayer(): Enregistrement[] {
  const sortie: Enregistrement[] = [];

  for (const fichier of fichiersDeRoutes(ROUTES_DIR)) {
    const source = readFileSync(fichier, 'utf8');
    const lignes = source.split('\n');
    ENREGISTREMENT.lastIndex = 0;

    let m: RegExpExecArray | null;
    while ((m = ENREGISTREMENT.exec(source)) !== null) {
      const ouvrant = m.index + m[0].length - 1;
      const appel = source.slice(ouvrant, apresLeFermant(source, ouvrant));
      const ligne = source.slice(0, m.index).split('\n').length;

      const args = argumentsDeNiveau1(appel.slice(1, -1));
      const litteral = (args[0] ?? '').trim().match(/^(['"`])([\s\S]*?)\1$/);
      const options = (args[1] ?? '').trim().startsWith('{') ? (args[1] ?? '').trim() : '';

      const schema = options ? (valeursDeNiveau1(options, ['schema'])['schema'] ?? '').trim() : '';
      const meta = schema.startsWith('{')
        ? valeursDeNiveau1(schema, ['description', 'summary', 'deprecated'])
        : {};
      const declaration = [
        meta['description'] ?? '',
        meta['summary'] ?? '',
        /\btrue\b/.test(meta['deprecated'] ?? '') ? 'deprecated' : '',
        commentaireAdjacent(lignes, ligne),
      ].join(' ');

      sortie.push({
        fichier: relative(ROUTES_DIR, fichier),
        ligne,
        verbe: m[1].toUpperCase(),
        chemin: litteral ? litteral[2] : '<dynamique>',
        declare: VOCABULAIRE.test(declaration),
        annonce: ANNONCE_POSEE.test(options),
      });
    }
  }
  return sortie;
}

const cle = (e: Pick<Enregistrement, 'fichier' | 'verbe' | 'chemin'>) =>
  `${e.fichier} ${e.verbe} ${e.chemin}`;

/**
 * Le RECENSEMENT : les adresses en sursis que le dépôt sert AUJOURD'HUI et que
 * le balayage doit continuer à voir.
 *
 * Il n'est pas décoratif. Une garde qui ne vérifierait que « tout ce que je
 * trouve porte l'annonce » passerait au VERT le jour où le balayage cesse de
 * trouver quoi que ce soit — c'est la mort silencieuse des gardes négatives.
 * Nommer les quinze fait rougir la garde si le détecteur se casse.
 */
const RECENSEMENT: readonly string[] = [
  'admin/reports.ts POST /',
  'admin/users-write.ts PATCH /admin/users/:userId/role',
  'admin/users-write.ts PATCH /admin/users/:userId/status',
  'admin/users-write.ts POST /admin/users/:userId/unlock',
  'admin/users-write.ts POST /admin/users/:userId/enable-2fa',
  'admin/users-write.ts POST /admin/users/:userId/disable-2fa',
  'admin/users-write.ts POST /admin/users/:userId/verify-email',
  'admin/users-write.ts POST /admin/users/:userId/verify-phone',
  'admin/users-write.ts POST /admin/users/:userId/verify-age',
  'admin/users-write.ts POST /admin/users/:userId/voice-consent',
  'auth/register.ts GET /check-availability',
  'me/delete-account.ts GET <dynamique>',
  'users/blocking.ts POST /users/:userId/block',
  'users/blocking.ts DELETE /users/:userId/block',
  'users/blocking.ts GET /users/me/blocked-users',
];

/**
 * La DETTE : des alias déclarés qui ne portent pas encore leur annonce.
 *
 * Ils vivent hors du territoire du lot #4274 (`utils/`, `admin/reports.ts`,
 * `admin/users-write.ts`, `directory/blocks.ts`) et cinq autres agents
 * travaillent dans le même arbre : les toucher d'ici écraserait leur travail.
 * L'insertion exacte est déclarée par le lot ; cette liste rougira le jour où
 * l'entrée ne désignera plus rien.
 */
const DETTE: readonly { readonly cle: string; readonly issue: string }[] = [
  { cle: 'auth/register.ts GET /check-availability', issue: '#4158' },
  { cle: 'me/delete-account.ts GET <dynamique>', issue: '#4183' },
  { cle: 'users/blocking.ts POST /users/:userId/block', issue: '#4164' },
  { cle: 'users/blocking.ts DELETE /users/:userId/block', issue: '#4164' },
  { cle: 'users/blocking.ts GET /users/me/blocked-users', issue: '#4164' },
];

/**
 * Les alias que le balayage NE VOIT PAS, et pourquoi.
 *
 * Les trois portes de profil (#4161) se déclarent alias dans le CORPS de leur
 * handler, hors de la frontière balayée. Les nommer ici, avec l'empreinte qui
 * les identifie, empêche « non détecté » de se confondre avec « inexistant ».
 */
const ALIAS_INVISIBLES_AU_BALAYAGE: readonly { readonly fichier: string; readonly empreinte: string }[] = [
  { fichier: 'users/profile.ts', empreinte: 'ALIAS de `GET /directory/people/:handle` (#4161, critère 9).' },
];

/**
 * Les dix adresses du TERRITOIRE de #4274 — celles que ce lot pouvait toucher.
 *
 * L'assertion qui les tient est une INCLUSION, jamais une égalité. Six agents
 * travaillent dans le même arbre : un lot voisin qui annonce enfin une adresse
 * de la DETTE doit passer au vert sans toucher cette garde. **Une garde qui
 * rougit quand on la CORRIGE se fait contourner** — et une garde contournée ne
 * garde plus rien. Le nettoyage de `DETTE` devient alors une courtoisie ; ce
 * que la garde exige vraiment — qu'aucune entrée ne désigne du vide — est tenu
 * par « chaque entrée désigne encore un alias déclaré ».
 */
const TERRITOIRE: readonly string[] = RECENSEMENT.filter(
  (c) => !DETTE.some((d) => d.cle === c)
);

describe('Le recensement des adresses en sursis', () => {
  it('voit encore les quinze adresses déclarées — sinon le détecteur est cassé', () => {
    const declarees = balayer().filter((e) => e.declare).map(cle);

    expect(declarees).toEqual(expect.arrayContaining([...RECENSEMENT]));
  });

  it('balaye bien tout le répertoire — plus de 400 enregistrements', () => {
    expect(balayer().length).toBeGreaterThan(400);
  });
});

/**
 * Les SUCCESSEURS, que le vocabulaire attrape à tort.
 *
 * `VOCABULAIRE` répond à « ce voisinage parle-t-il d'alias ? », jamais à « CETTE
 * route EN EST-ELLE un ? ». Or une adresse cible parle nécessairement de ses
 * prédécesseurs — c'est même le seul endroit honnête où le dire, puisque c'est
 * elle qui les remplace. **Déclarer ses prédécesseurs n'est pas se déclarer
 * soi-même**, et les trois entrées ci-dessous sont exactement ce cas.
 *
 * Elles n'ont RIEN à faire dans `DETTE` : y entrer signifierait « alias déclaré
 * qui n'annonce pas encore », ce qui serait faux, et le mensonge survivrait à la
 * correction — la dette ne se viderait jamais de ces trois-là, puisqu'elles ne
 * peuvent pas annoncer un successeur qu'elles SONT.
 *
 * Cette liste est un aveu de la limite du détecteur, pas une dispense : chaque
 * entrée porte l'issue qui a introduit la route cible, et le témoin ci-dessous
 * vérifie qu'elle désigne encore quelque chose de réel.
 */
const SUCCESSEURS: readonly { readonly cle: string; readonly issue: string }[] = [
  { cle: 'links/user.ts GET /links', issue: '#4170 — cible de /my-links et /links/stats' },
  { cle: 'me/index.ts GET /', issue: '#4178 — cible de /auth/me' },
  {
    cle: 'user-deletions.ts POST ${basePath}/conversations/:conversationId/restore-for-me',
    issue: "#4332 — n'a AUCUN successeur à nommer : la corbeille n'existe qu'ici",
  },
];

/**
 * Les SILENCES ASSUMÉS — DISTINCTS de `DETTE`.
 *
 * `DETTE` promet une réparation : « alias déclaré qui n'annonce pas ENCORE ».
 * Une entrée ci-dessous ne porte AUCUNE promesse — elle mesure une
 * IMPOSSIBILITÉ : `depreciee`/`annoncerDepreciation` (`utils/deprecation.ts`)
 * composent un `Link` INCONDITIONNELLEMENT depuis `successeur`, requis, sans
 * forme « `Deprecation` seul » ; et la route n'a, mesuré, AUCUNE source
 * DB-free pour composer un successeur suivable. Un `Link` en gabarit
 * désinforme plus qu'il n'informe (`deprecated-alias-headers-guard.test.ts`
 * § « un successeur en gabarit n'indique aucune migration », qui a refusé un
 * premier essai sur CETTE porte). Voir le doc-comment de site
 * (`message-read-status.ts` § « NE PORTE PAS d'annonce ») pour les deux
 * issues qui en sortiraient : élargir le helper (hors territoire de #4423),
 * ou retirer la porte si aucun appelant ne la tient.
 *
 * Une entrée ne quitte cette liste QUE si une nouvelle source apparaît —
 * jamais par lassitude. Le témoin ci-dessous vérifie les deux sens : la route
 * existe encore, ET elle reste réellement MUETTE (sinon quelqu'un l'a
 * annoncée sans retirer sa ligne ici — le mensonge inverse de `DETTE`).
 */
const SILENCES_ASSUMES: readonly { readonly cle: string; readonly issue: string }[] = [
  {
    cle: 'message-read-status.ts GET /messages/:messageId/read-status',
    issue: '#4423 — aucun conversationId sans base ; voir deprecated-alias-headers-guard.test.ts',
  },
];

describe('Une adresse qui se déclare alias le DIT au client', () => {
  it("n'admet aucun alias muet hors de la dette nommée et des silences assumés", () => {
    const enDette = new Set(DETTE.map((d) => d.cle));
    const successeurs = new Set(SUCCESSEURS.map((s) => s.cle));
    const silencesAssumes = new Set(SILENCES_ASSUMES.map((s) => s.cle));
    const muets = balayer()
      .filter((e) => e.declare && !e.annonce)
      .map(cle)
      .filter((c) => !enDette.has(c) && !successeurs.has(c) && !silencesAssumes.has(c));

    expect(muets).toEqual([]);
  });

  it.each(SILENCES_ASSUMES.map((s) => [s.cle, s.issue] as const))(
    '%s reste un silence ASSUMÉ (%s) — sinon retirer sa ligne',
    (cle) => {
      const trouvee = balayer().find((e) => `${e.fichier} ${e.verbe} ${e.chemin}` === cle);
      expect(trouvee).toBeDefined();
      expect(trouvee?.declare).toBe(true);
      expect(trouvee?.annonce).toBe(false);
    }
  );

  it('chaque SUCCESSEUR nommé désigne encore une route réelle du balayage', () => {
    // Sans ce témoin, la liste ci-dessus deviendrait une dispense permanente :
    // une entrée qui ne désigne plus rien continuerait d'exempter un nom que
    // personne ne porte, et le jour où ce nom réapparaîtrait sur un VRAI alias,
    // il entrerait muet sans faire rougir personne.
    const balayees = new Set(balayer().map(cle));
    const fantomes = SUCCESSEURS.map((s) => s.cle).filter((c) => !balayees.has(c));

    expect(fantomes).toEqual([]);
  });

  it('les dix adresses du territoire portent leur annonce', () => {
    const annoncees = new Set(balayer().filter((e) => e.declare && e.annonce).map(cle));

    expect(TERRITOIRE.filter((c) => !annoncees.has(c))).toEqual([]);
  });
});

describe('La dette ne pourrit pas', () => {
  it('chaque entrée désigne encore un alias déclaré', () => {
    const declarees = new Set(balayer().filter((e) => e.declare).map(cle));
    const perimees = DETTE.filter((d) => !declarees.has(d.cle)).map((d) => `${d.cle} (${d.issue})`);

    expect(perimees).toEqual([]);
  });

  it('chaque alias invisible au balayage existe encore, à son empreinte', () => {
    // #4284 — l'empreinte se cherche dans l'UNITÉ (le fichier nommé plus ses
    // frères `X-*.ts`), jamais dans le seul fichier nommé : `users/profile.ts`
    // est devenu une façade de ré-export et l'empreinte vit désormais dans
    // `profile-lookups.ts`. Même doctrine que `uniteDeSite` de
    // `deprecated-alias-headers-guard` et que `AppSourceGuard.unit` (#4425) —
    // un GLOB, jamais une liste de parties, qui se périmerait au découpage
    // suivant sans que rien ne rougisse.
    const uniteDeFichier = (relatif: string): string => {
      const dossier = join(ROUTES_DIR, dirname(relatif));
      const base = basename(relatif, '.ts');
      return readdirSync(dossier)
        .filter((nom) => nom === basename(relatif) || (nom.startsWith(`${base}-`) && nom.endsWith('.ts')))
        .sort()
        .map((nom) => readFileSync(join(dossier, nom), 'utf8'))
        .join('\n');
    };

    // BORNE : un glob cassé rendrait le seul fichier nommé et ce témoin
    // redeviendrait en silence celui, épinglé, qu'il remplace.
    expect(uniteDeFichier('users/profile.ts').length).toBeGreaterThan(
      readFileSync(join(ROUTES_DIR, 'users/profile.ts'), 'utf8').length
    );

    const absents = ALIAS_INVISIBLES_AU_BALAYAGE.filter(
      ({ fichier, empreinte }) => !uniteDeFichier(fichier).includes(empreinte)
    ).map((a) => a.fichier);

    expect(absents).toEqual([]);
  });
});
