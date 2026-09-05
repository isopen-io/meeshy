/**
 * Le COMPOSEUR et le SCHÉMA servi déclarent le MÊME jeu de champs (#4654).
 *
 * ## Le défaut que cette garde ferme
 *
 * Six défauts en deux jours partagent un mécanisme : un champ que la passerelle
 * CALCULE et que `fast-json-stringify` SUPPRIME faute d'être déclaré au schéma
 * de réponse — ou l'inverse, un champ DÉCLARÉ que rien ne produit. Aucun n'a
 * été trouvé par un témoin, parce qu'aucun témoin ne confrontait les deux
 * déclarations du MÊME contrat l'une à l'autre.
 *
 * Le couple `formatUserResponse` / `userSchema` porte les deux sens, et chacun
 * a coûté une issue :
 *
 * | sens | cas réel |
 * |---|---|
 * | déclaré, non produit | `banner` (#4641) — servi `null` en dur à toute connexion |
 * | produit, non déclaré | `pendingEmail` / `pendingPhone` (#4653) — TRANCHÉ : producteur retiré, plus un écart |
 *
 * ## Pourquoi ce motif, et pas un témoin de corps
 *
 * Le motif vient de `unit/routes/messages-routes.test.ts:635` : **il assère la
 * DÉCLARATION, jamais un corps sérialisé.** Trois conséquences, toutes voulues
 * ici (critère 5 de #4654) :
 *
 * 1. **Aucune injection Fastify.** Ce fichier ne monte pas d'application, ne
 *    double aucun magasin, n'appelle aucun gestionnaire. Il lit deux
 *    déclarations et les compare.
 * 2. **Il est immunisé aux bouchons de schéma.** 85 suites du dépôt remplacent
 *    un schéma partagé par un bouchon plus ÉTROIT ; un témoin qui lit un CORPS
 *    ne peut voir que ce que son bouchon l'a autorisé à voir. Ici le bouchon
 *    n'a rien à atteindre.
 * 3. **Il ne demande la conversion d'aucun harnais.**
 *
 * ## Ce qui LIT le producteur, et pourquoi
 *
 * Trois lectures possibles, mesurées TOUTES LES TROIS ici plutôt que choisies
 * sur intuition :
 *
 * | lecture | ce qu'elle rend | ce qu'elle vaut |
 * |---|---|---|
 * | `TYPE_DECLARE` — le texte de `interface UserResponseData` | la DÉCLARATION TS | stable, mais un type peut MENTIR sur ce que la fonction compose |
 * | `PRODUIT` — les clés de l'objet que `formatUserResponse` REND | ce qui part vraiment | c'est le producteur, donc c'est lui qui fait AUTORITÉ |
 * | `PRODUIT_SANS_DONNEE` — le même appel sur une ligne VIDE | le jeu de clés minimal | dit si le composeur est CONDITIONNEL |
 *
 * **`PRODUIT` fait autorité** : c'est le producteur qui décide ce que
 * `fast-json-stringify` aura à supprimer, et le type n'est qu'une seconde
 * déclaration du même contrat — celle dont #4653 dit précisément qu'elle
 * diverge du schéma. Un témoin adossé au TYPE aurait un angle mort exactement
 * là où vit la famille de défauts : entre ce qu'on déclare et ce qu'on fait.
 *
 * `TYPE_DECLARE` n'est donc pas le sujet de la garde, il en est le CONTRÔLE :
 * un écart entre le type et ce que la fonction compose serait un TROISIÈME
 * défaut, et le témoin qui les confronte le NOMME. Il vaut aussi témoin de
 * non-vacuité fin — un plancher ne voit pas un analyseur qui perd UN champ,
 * une égalité exacte contre une source indépendante, si.
 *
 * ## La procuration, et pourquoi elle est le bon SEED
 *
 * `PRODUIT` est mesuré sur une PROCURATION qui répond une sentinelle non nulle
 * à toute lecture. Ce n'est pas une commodité : c'est le jeu de clés MAXIMAL,
 * celui qu'aucune ligne réelle ne peut dépasser. La loi étant « produit ⊆
 * déclaré » ET « déclaré ⊆ produit », le maximum est le seul côté qui ne
 * puisse pas rendre la garde faussement verte — une ligne de test incomplète
 * ferait manquer une clé et la garde conclurait « rien à déclarer ».
 *
 * ## Ce que cette garde ne couvre PAS, avec sa taille
 *
 * Elle couvre **UNE famille sur 548 routes servies** (`route-manifest.json`) et
 * **352 blocs `response:`** de `src/routes/`. Le reste, nommé :
 *
 * - **Les producteurs SANS type nommé.** Le dépôt ne porte que DEUX composeurs
 *   à type nommé, tous deux dans `routes/auth/types.ts` : `UserResponseData` et
 *   `SessionResponseData`. Partout ailleurs la charge est un objet littéral
 *   composé dans le gestionnaire — hors de portée de ce motif, qui a besoin
 *   d'une unité à interroger.
 * - **La famille SESSION**, non traitée ici par décision de lot (#4654 est
 *   livrée sur UNE famille). Mesurée le 2026-09-01 : `formatSessionResponse`
 *   compose 8 clés, `sessionMinimalSchema` en déclare 8, **différence
 *   symétrique VIDE** — l'étendre gèlerait une symétrie déjà juste, à coût
 *   quasi nul. À ne pas confondre avec `sessionSchema` (18 clés), qui est servi
 *   par un AUTRE producteur.
 * - **`routes/magic-link.ts`**, seul fichier qui sert `userSchema` sans passer
 *   par `formatUserResponse` : sa charge vient de `MagicLinkService`
 *   (`socketIOUser`). Un défaut de déclaration y resterait invisible à cette
 *   garde. Le dernier témoin de ce fichier gèle cette exception PAR SON NOM,
 *   pour que sa taille ne dérive pas en silence.
 * - **Les VALEURS.** Cette garde ne dit rien de ce qu'un champ VAUT — c'est la
 *   moitié que tient sa jumelle, ci-dessous.
 *
 * ## Sa JUMELLE, et pourquoi aucune ne subsume l'autre
 *
 * `unit/services/auth-served-user-field-producers.test.ts` (#4641) monte les
 * VRAIES routes de connexion et assère le corps SÉRIALISÉ, champ par champ,
 * contre la valeur en base. Les deux gardes partagent un couple et une
 * exemption (`phoneCountryCode`), et ne posent pas la même question :
 *
 * | garde | la question | ce qu'elle voit | son angle mort |
 * |---|---|---|---|
 * | #4641 (`…-field-producers`) | le champ déclaré VAUT-il la colonne ? | un repli constant (`banner: null` partout) | un champ que le schéma ne déclare PAS — il n'atteint jamais le corps |
 * | #4654 (ce fichier) | les deux déclarations disent-elles la MÊME chose ? | une clé produite hors contrat, une clé promise sans producteur | ce qu'un champ déclaré ET produit VAUT |
 *
 * **Ne pas en supprimer une comme doublon de l'autre.** #4653 était la preuve
 * vivante de l'angle mort de la première : `pendingEmail`, tant qu'il restait
 * produit sans être déclaré, était absent du corps qu'elle inspecte — elle
 * restait verte quel que soit le sort de l'écart. Symétriquement, un `banner`
 * déclaré, produit, et constant à `null` laisserait ce fichier vert : les deux
 * jeux de clés coïncident parfaitement.
 *
 * Deux autres suites nomment `formatUserResponse` (`unit/routes/auth/types.test.ts`,
 * `unit/routes/auth-types.test.ts`) : elles exercent la CORRESPONDANCE de
 * valeurs champ par champ et ne lisent aucun schéma. Elles ne peuvent voir
 * aucun des deux sens mesurés ici.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

import { userSchema } from '@meeshy/shared/types';
import { formatUserResponse } from '../../../../routes/auth/types';

// ─── Les deux racines ───────────────────────────────────────────────────────

const SRC = join(__dirname, '..', '..', '..', '..');
const SOURCE_DU_COMPOSEUR = join(SRC, 'routes', 'auth', 'types.ts');
const RACINE_DES_ROUTES = join(SRC, 'routes');

// ─── Lecture 1 : le TYPE, par son texte source ──────────────────────────────

/** Fin (exclusive) de l'objet ouvert à `ouvrant`, accolades équilibrées. */
const finDuBloc = (source: string, ouvrant: number): number => {
  let profondeur = 0;
  for (let i = ouvrant; i < source.length; i++) {
    if (source[i] === '{') profondeur += 1;
    else if (source[i] === '}') {
      profondeur -= 1;
      if (profondeur === 0) return i;
    }
  }
  throw new Error(`accolade ouverte à ${ouvrant} jamais refermée`);
};

/**
 * Les commentaires portent des `:` et des mots qui ressemblent à des champs —
 * `UserResponseData` en porte un de dix lignes sur `timezone`. Les retirer
 * AVANT le découpage est ce qui distingue un analyseur d'un `grep`.
 */
const sansCommentaire = (texte: string): string =>
  texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const CHAMP = /^([A-Za-z_$][\w$]*)\??\s*:/;

const champsDeLInterface = (source: string, nom: string): readonly string[] => {
  const tete = source.indexOf(`interface ${nom}`);
  if (tete < 0) throw new Error(`interface ${nom} introuvable`);
  const ouvrant = source.indexOf('{', tete);
  const corps = sansCommentaire(source.slice(ouvrant + 1, finDuBloc(source, ouvrant)));

  return corps
    .split(';')
    .map((membre) => CHAMP.exec(membre.trim())?.[1])
    .filter((nomDeChamp): nomDeChamp is string => typeof nomDeChamp === 'string');
};

const TYPE_DECLARE = champsDeLInterface(
  readFileSync(SOURCE_DU_COMPOSEUR, 'utf8'),
  'UserResponseData'
);

// ─── Lecture 2 : ce que le COMPOSEUR compose ────────────────────────────────

const SENTINELLE = 'valeur-de-procuration';

/**
 * Répond une valeur NON NULLE à toute lecture : le jeu de clés rendu est donc
 * le MAXIMUM que `formatUserResponse` puisse composer, quelle que soit la
 * ligne. Aucun inventaire de colonnes à tenir à jour — et un futur
 * `...(x ? { y } : {})` prendrait sa branche vraie, ce qu'un objet de test
 * incomplet ne ferait pas.
 */
const procuration: Record<string, unknown> = new Proxy(
  {} as Record<string, unknown>,
  { get: () => SENTINELLE }
);

const PRODUIT = Object.keys(formatUserResponse(procuration, procuration));
const PRODUIT_SANS_DONNEE = Object.keys(formatUserResponse({}, undefined));

// ─── Lecture 3 : ce que le CONTRAT déclare ──────────────────────────────────

const DECLARE = Object.keys(userSchema.properties);

// ─── Les écarts ASSUMÉS, avec leur raison et leur issue ─────────────────────

type Sens = 'produit-non-declare' | 'declare-non-produit';

type EcartAssume = {
  readonly sens: Sens;
  /** L'issue qui PORTE la décision — jamais un renvoi vers ce fichier. */
  readonly issue: number;
  readonly raison: string;
};

/**
 * Les écarts qu'on ASSUME aujourd'hui, et **eux seuls**. La liste ne dispense
 * de rien : le dernier témoin de ce bloc exige que chaque entrée soit un écart
 * RÉEL, dans le sens qu'elle déclare. Une entrée qui cesse d'être un écart —
 * parce que la décision a été prise et appliquée — fait ROUGIR la garde, ce
 * qui oblige la main qui ferme l'issue à retirer sa ligne dans le même commit.
 *
 * C'est la moitié qui manque à une simple liste d'exclusion : sans elle, une
 * exemption périmée affaiblit la garde en silence, exactement comme une entrée
 * périmée d'un cliquet d'inventaire.
 */
const ECARTS_ASSUMES: Readonly<Record<string, EcartAssume>> = {
  phoneCountryCode: {
    sens: 'declare-non-produit',
    issue: 4641,
    raison:
      '`SocketIOUser` (packages/shared) ne DÉCLARE pas ce champ : le projecteur d’amont ne peut ' +
      'pas le porter sans élargir le type partagé, hors du territoire de #4641 qui l’a nommé et ' +
      'différé. Aucune issue dédiée n’existe encore — c’est le suivi que #4641 annonçait. La ' +
      'jumelle de ce fichier porte la MÊME exemption vue de son côté (production par VALEUR).'
  }
};

const exempts = (sens: Sens): readonly string[] =>
  Object.entries(ECARTS_ASSUMES)
    .filter(([, ecart]) => ecart.sens === sens)
    .map(([champ]) => champ);

const moins = (gauche: readonly string[], droite: readonly string[]): readonly string[] =>
  gauche.filter((champ) => !droite.includes(champ));

// ─── Les planchers de NON-VACUITÉ ───────────────────────────────────────────

/**
 * Une garde qui n'inspecte AUCUN champ passe au vert pour la pire des raisons
 * (critère 3 de #4654). Ces planchers sont larges — la famille en porte 33 et
 * 32 au 2026-09-01 — parce qu'ils gardent la panne GROSSIÈRE : un import qui
 * rend `undefined`, un analyseur qui ne trouve plus l'interface, un schéma
 * remplacé par un bouchon vide. La panne FINE (un champ perdu sur trente-trois)
 * est gardée par l'égalité exacte `TYPE_DECLARE` ↔ `PRODUIT`, qu'aucun plancher
 * ne pourrait voir.
 */
const PLANCHER_CHAMPS = 25;
const PLANCHER_COMPOSEURS = 5;

// ─── Le PAIRAGE : ce schéma est-il bien celui qui sert ce composeur ? ────────

const fichiersDeProduction = (racine: string): readonly string[] => {
  const entrees = readdirSync(racine);
  return entrees.flatMap((entree): readonly string[] => {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) {
      return entree === '__tests__' ? [] : fichiersDeProduction(chemin);
    }
    return entree.endsWith('.ts') && !entree.endsWith('.test.ts') ? [chemin] : [];
  });
};

type SiteDeRoute = {
  readonly fichier: string;
  readonly composeAvecFormatUserResponse: boolean;
  readonly declareUserSchema: boolean;
};

const relatif = (chemin: string): string => relative(SRC, chemin).split(sep).join('/');

const SITES: readonly SiteDeRoute[] = fichiersDeProduction(RACINE_DES_ROUTES).map((chemin) => {
  const code = sansCommentaire(readFileSync(chemin, 'utf8'));
  return {
    fichier: relatif(chemin),
    composeAvecFormatUserResponse:
      /\bformatUserResponse\s*\(/.test(code) && !/export function formatUserResponse/.test(code),
    declareUserSchema: /\buserSchema\b/.test(code)
  };
});

const COMPOSEURS = SITES.filter((site) => site.composeAvecFormatUserResponse).map((s) => s.fichier);
const DECLARANTS = SITES.filter((site) => site.declareUserSchema).map((s) => s.fichier);

/**
 * Le seul fichier qui sert `userSchema` SANS passer par `formatUserResponse` :
 * il sert `result.user` de `MagicLinkService`, c'est-à-dire un `SocketIOUser`.
 * Cette garde ne dit donc RIEN de lui, et le geler par son nom est ce qui
 * empêche l'angle mort de grandir sans que personne ne le décide.
 */
const DECLARE_PAR_UN_AUTRE_PRODUCTEUR: readonly string[] = ['routes/magic-link.ts'];

// ═══════════════════════════════════════════════════════════════════════════
// Les témoins
// ═══════════════════════════════════════════════════════════════════════════

describe('la mesure elle-même ne peut pas être vide (#4654, critère 3)', () => {
  it('le composeur rend un jeu de clés SUBSTANTIEL', () => {
    expect(PRODUIT.length).toBeGreaterThanOrEqual(PLANCHER_CHAMPS);
  });

  it('le contrat déclare un jeu de champs SUBSTANTIEL', () => {
    expect(DECLARE.length).toBeGreaterThanOrEqual(PLANCHER_CHAMPS);
  });

  it("l'analyse du type source rend un jeu de champs SUBSTANTIEL", () => {
    expect(TYPE_DECLARE.length).toBeGreaterThanOrEqual(PLANCHER_CHAMPS);
  });

  it('aucune des trois listes ne porte de doublon', () => {
    expect(new Set(PRODUIT).size).toBe(PRODUIT.length);
    expect(new Set(DECLARE).size).toBe(DECLARE.length);
    expect(new Set(TYPE_DECLARE).size).toBe(TYPE_DECLARE.length);
  });
});

describe('le TYPE et le COMPOSEUR disent la même chose (contrôle de la mesure)', () => {
  it('`UserResponseData` énumère exactement ce que `formatUserResponse` compose', () => {
    // Si ce témoin tombe, ce n'est PAS un défaut de schéma : c'est un
    // TROISIÈME écart — le type promet ce que la fonction ne compose pas, ou
    // l'inverse. Il se signale, il ne se referme pas depuis ici.
    expect([...TYPE_DECLARE].sort()).toEqual([...PRODUIT].sort());
  });

  it('le jeu de clés du composeur ne dépend pas de la ligne qu’on lui donne', () => {
    // Tant que c'est vrai, la procuration et une ligne vide se valent, et la
    // mesure « produit » est un FAIT plutôt qu'un choix de seed. Le jour où un
    // spread conditionnel entre dans le composeur, ce témoin tombe et la
    // procuration devient la seule lecture juste — c'est ce qu'il faut savoir
    // avant de changer quoi que ce soit d'autre.
    expect(PRODUIT_SANS_DONNEE).toEqual(PRODUIT);
  });
});

describe('tout champ PRODUIT est DÉCLARÉ — sinon le sérialiseur le supprime (#4653)', () => {
  it('aucune clé du composeur ne manque à `userSchema`, hors écarts assumés', () => {
    const supprimes = moins(moins(PRODUIT, DECLARE), exempts('produit-non-declare'));

    expect(supprimes).toEqual([]);
  });
});

describe('tout champ DÉCLARÉ a un PRODUCTEUR — sinon le contrat ment (#4641)', () => {
  it('aucun champ de `userSchema` n’est absent du composeur, hors écarts assumés', () => {
    const promesses = moins(moins(DECLARE, PRODUIT), exempts('declare-non-produit'));

    expect(promesses).toEqual([]);
  });
});

describe('la liste des écarts assumés vaut exactement ce qu’elle vaut', () => {
  it('chaque écart assumé EST un écart, aujourd’hui, dans le sens qu’il déclare', () => {
    // Le méta-témoin. Sans lui, une exemption périmée reste et affaiblit la
    // garde en silence : le champ exempté cesserait d'être confronté à quoi
    // que ce soit. Avec lui, fermer #4653 ou servir `phoneCountryCode` fait
    // ROUGIR ce fichier, et retirer la ligne fait partie du correctif.
    const perimes = Object.entries(ECARTS_ASSUMES)
      .filter(([champ, ecart]) =>
        ecart.sens === 'produit-non-declare'
          ? !(PRODUIT.includes(champ) && !DECLARE.includes(champ))
          : !(DECLARE.includes(champ) && !PRODUIT.includes(champ))
      )
      .map(([champ, ecart]) => `${champ} (${ecart.sens}, #${ecart.issue})`);

    expect(perimes).toEqual([]);
  });

  it('la différence symétrique des deux jeux est EXACTEMENT la liste assumée', () => {
    const differenceSymetrique = [...moins(PRODUIT, DECLARE), ...moins(DECLARE, PRODUIT)].sort();

    expect(differenceSymetrique).toEqual(Object.keys(ECARTS_ASSUMES).sort());
  });

  it('chaque écart porte une RAISON de fond et le numéro de l’issue qui la tient', () => {
    // Une exemption sans raison est une exclusion : elle retire un champ de la
    // mesure sans dire au nom de quoi. Le seuil est grossier À DESSEIN — il
    // n'arbitre pas la qualité d'une phrase, il interdit la ligne vide et le
    // « TODO » posé en passant.
    const muets = Object.entries(ECARTS_ASSUMES)
      .filter(([, ecart]) => ecart.raison.length <= 120 || ecart.issue <= 0)
      .map(([champ]) => champ);

    expect(muets).toEqual([]);
  });
});

describe('ce schéma est bien celui qui sert ce composeur (pairage)', () => {
  it('la lecture des routes n’est pas vide', () => {
    expect(SITES.length).toBeGreaterThan(50);
    expect(COMPOSEURS.length).toBeGreaterThanOrEqual(PLANCHER_COMPOSEURS);
  });

  it('tout fichier qui COMPOSE avec `formatUserResponse` déclare `userSchema`', () => {
    // Sans ce témoin, la garde comparerait deux constantes qui ne se
    // rencontrent nulle part : un fichier qui compose sous un AUTRE schéma
    // sortirait du contrat mesuré ici sans rien faire rougir.
    expect(moins(COMPOSEURS, DECLARANTS)).toEqual([]);
  });

  it('les fichiers qui déclarent `userSchema` pour un AUTRE producteur sont gelés par leur nom', () => {
    // L'angle mort de cette garde, à sa taille. Un fichier de plus ici veut
    // dire « une charge de plus sert `userSchema` sans que rien ne confronte
    // ses clés » — à instruire, jamais à ajouter à la liste par réflexe.
    expect(moins(DECLARANTS, COMPOSEURS)).toEqual(DECLARE_PAR_UN_AUTRE_PRODUCTEUR);
  });
});
