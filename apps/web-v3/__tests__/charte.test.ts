/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { FEUILLE_DU_CHOIX } from '@/app/(public)/chat/[lien]/choix-feuille';
import { FEUILLE_DE_LA_STORY } from '@/app/(public)/stories/[id]/story-feuille';
import { tableDeJetons } from '@/app/actifs-inlines';
import { FEUILLE_CONNECTEE, FEUILLE_DU_TABLEAU } from '@/app/connecte/feuille';
import { FEUILLE_DU_FIL } from '@/app/connecte/fil-feuille';
import { FEUILLE_DU_PLEIN } from '@/app/connecte/plein-feuille';
import { FEUILLE_DES_MEDIAS } from '@/app/connecte/medias-feuille';
import { FEUILLE_DES_CONTACTS } from '@/app/connecte/contacts-feuille';
import { FEUILLE_DES_LIENS } from '@/app/connecte/liens-feuille';
import { FEUILLE_DES_COMMENTAIRES } from '@/app/connecte/commentaires-feuille';
import { FEUILLE_DE_LA_RECHERCHE } from '@/app/connecte/recherche-feuille';
import { FEUILLE_DE_LA_LISTE } from '@/app/connecte/liste-feuille';
import { FEUILLE_DES_NOTIFS } from '@/app/connecte/notifs-feuille';
import { FEUILLE_DU_CHROME } from '@/app/enveloppe/feuille';
import { SOCLE_DU_DOCUMENT } from '@/app/socle';
import { FEUILLE_DE_LA_VITRINE } from '@/app/vitrine/feuille';

/**
 * LA CHARTE VISUELLE, ET SES TÉMOINS — conception § 12.5.
 *
 * « Chaque règle a son témoin ; une règle sans témoin n'entre pas ici. » Ce
 * fichier est ce témoin pour tout ce qui se lit dans une FEUILLE ou dans un
 * DOCUMENT servi ; ce qui ne se mesure qu'au navigateur (cibles à 360 et 390 px,
 * axe, conformité) vit dans `e2e/visual/v3-cibles.spec.ts`,
 * `__tests__/vitrine-a11y.test.ts` et `compare-rendu.js`.
 *
 * CE QUE LA LISTE `FEUILLES` DÉCLARE, ET CE QU'ELLE NE DÉCLARE PAS
 *
 * Elle nomme les feuilles DÉJÀ portées à la charte — le socle, le chrome du
 * site et la vitrine. Elle ne prétend pas que ce sont les seules feuilles de la
 * v3 : `app/connecte/feuille.ts`, `app/authentification/feuille.ts`,
 * `app/institutionnel/feuille.ts` et `app/(public)/l/[token]/feuille.ts`
 * écrivent encore leurs espacements en pixels littéraux, et chacune rejoint
 * cette liste dans le commit de SON écran. Porter la loi à `app/**` d'un coup
 * déplacerait les quatre écrans que la charte n'a pas encore jugés — un gate ne
 * doit pas redessiner ce qu'il garde.
 *
 * Une liste qui grandit est une liste qui peut se vider sans un mot : le
 * premier témoin ci-dessous mesure donc qu'elle porte au moins ce que l'écran
 * de ce commit a livré, et chaque `grep` prouve sa non-vacuité par une SONDE
 * qui doit le faire rougir.
 */

type Feuille = {
  readonly nom: string;
  readonly source: string;
};

const FEUILLES: readonly Feuille[] = [
  { nom: 'app/socle.ts', source: SOCLE_DU_DOCUMENT },
  { nom: 'app/enveloppe/feuille.ts', source: FEUILLE_DU_CHROME },
  { nom: 'app/vitrine/feuille.ts', source: FEUILLE_DE_LA_VITRINE },
  { nom: 'app/connecte/feuille.ts', source: FEUILLE_CONNECTEE },
  { nom: 'app/connecte/fil-feuille.ts', source: FEUILLE_DU_FIL },
  { nom: 'app/connecte/plein-feuille.ts', source: FEUILLE_DU_PLEIN },
  { nom: 'app/(public)/chat/[lien]/choix-feuille.ts', source: FEUILLE_DU_CHOIX },
  { nom: 'app/connecte/medias-feuille.ts', source: FEUILLE_DES_MEDIAS },
  { nom: 'app/(public)/stories/[id]/story-feuille.ts', source: FEUILLE_DE_LA_STORY },
  { nom: 'app/connecte/notifs-feuille.ts', source: FEUILLE_DES_NOTIFS },
  { nom: 'app/connecte/contacts-feuille.ts', source: FEUILLE_DES_CONTACTS },
  { nom: 'app/connecte/liens-feuille.ts', source: FEUILLE_DES_LIENS },
  { nom: 'app/connecte/recherche-feuille.ts', source: FEUILLE_DE_LA_RECHERCHE },
  { nom: 'app/connecte/commentaires-feuille.ts', source: FEUILLE_DES_COMMENTAIRES },
  { nom: 'app/connecte/liste-feuille.ts', source: FEUILLE_DE_LA_LISTE },
  { nom: 'app/connecte/feuille.ts › FEUILLE_DU_TABLEAU', source: FEUILLE_DU_TABLEAU },
];

const TOUTES = FEUILLES.map((feuille) => feuille.source).join('');

const octetsCompresses = (source: string): number => gzipSync(Buffer.from(source, 'utf8'), { level: 9 }).length;

// --- l'outillage des témoins, chacun prouvé par une sonde ---------------------

/**
 * Les pixels qu'une feuille écrit HORS des deux idiomes que la règle 1 excepte :
 * la règle `.hors-ecran` (1px/−1px, la seule façon de masquer visuellement un
 * nœud sans le retirer de l'arbre d'accessibilité) et la CONDITION d'un point de
 * rupture. Le corps d'une requête de média n'est pas excepté : c'est bien une
 * déclaration de design, servie à un lecteur.
 */
export const pixelsLitteraux = (source: string): readonly string[] =>
  [
    ...source
      .replace(/@media[^{]*/g, ' ')
      .replace(/\.hors-ecran\s*\{[^}]*\}/g, ' ')
      .matchAll(/-?\d+(?:\.\d+)?px/g),
  ].map(([pixel]) => pixel);

/** Les règles d'une feuille compactée, sélecteur par sélecteur. */
export const regles = (source: string): readonly { selecteur: string; corps: string }[] =>
  [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selecteur, corps]) => ({
    selecteur: (selecteur ?? '').replace(/@media[^{]*\{/, '').trim(),
    corps: corps ?? '',
  }));

/**
 * Règle 13 — un accent, cinq emplois. Rend les sélecteurs qui peignent avec
 * `--color-primary` : le témoin les oppose à la liste NOMMÉE, jamais à un
 * compte.
 */
export const selecteursDAccent = (source: string): readonly string[] =>
  regles(source)
    .filter(({ corps }) => corps.includes('var(--color-primary)'))
    .map(({ selecteur }) => selecteur);

/**
 * Règle 24 — le mouvement ne déplace rien. Rend les PROPRIÉTÉS animées par une
 * transition : la charte n'en autorise que trois, et aucune n'est géométrique.
 */
export const proprietesEnTransition = (source: string): readonly string[] =>
  [...source.matchAll(/transition:([^;}]*)/g)].flatMap(([, valeur]) =>
    (valeur ?? '')
      .split(',')
      .map((segment) => segment.trim().split(/\s+/)[0] ?? '')
      .filter((propriete) => propriete.length > 0),
  );

describe('la liste des feuilles portées à la charte', () => {
  it('porte le socle, le chrome et la vitrine — sinon les témoins sont vides', () => {
    expect(FEUILLES.map((feuille) => feuille.nom)).toEqual([
      'app/socle.ts',
      'app/enveloppe/feuille.ts',
      'app/vitrine/feuille.ts',
      'app/connecte/feuille.ts',
      'app/connecte/fil-feuille.ts',
      'app/connecte/plein-feuille.ts',
      'app/(public)/chat/[lien]/choix-feuille.ts',
      'app/connecte/medias-feuille.ts',
      'app/(public)/stories/[id]/story-feuille.ts',
      'app/connecte/notifs-feuille.ts',
      'app/connecte/contacts-feuille.ts',
      'app/connecte/liens-feuille.ts',
      'app/connecte/recherche-feuille.ts',
      'app/connecte/commentaires-feuille.ts',
      'app/connecte/liste-feuille.ts',
      'app/connecte/feuille.ts › FEUILLE_DU_TABLEAU',
    ]);
    expect(TOUTES.length).toBeGreaterThan(0);
  });
});

describe('règle 1 — une table, zéro valeur ailleurs', () => {
  it.each(FEUILLES)('n’écrit aucun pixel de design ($nom)', ({ source }) => {
    expect(pixelsLitteraux(source)).toEqual([]);
  });

  it('rougit sur une feuille qui écrit un pixel', () => {
    expect(pixelsLitteraux('.sonde{padding:7px}')).toEqual(['7px']);
  });

  it('laisse passer les DEUX idiomes exceptés, et eux seuls', () => {
    expect(pixelsLitteraux('.hors-ecran{width:1px;margin:-1px}')).toEqual([]);
    expect(pixelsLitteraux('@media (min-width:600px){.a{gap:var(--space-3)}}')).toEqual([]);
    expect(pixelsLitteraux('@media (min-width:600px){.a{gap:12px}}')).toEqual(['12px']);
  });
});

/**
 * `hidden` CACHE, quelle que soit la règle de display qui touche l'élément — et
 * c'est le seul `!important` que les feuilles s'autorisent. Mesuré sur le fil :
 * `.langue{display:inline-flex}` rendait inerte l'attribut `hidden` posé par le
 * module de participation, et la pastille « N nouveaux messages » comme le
 * composeur fermé restaient visibles sous leur `hidden`.
 */
describe('[hidden] l’emporte sur toute règle de display', () => {
  it('est posé dans le socle, une fois, avec le seul !important des feuilles', () => {
    expect(SOCLE_DU_DOCUMENT).toContain('[hidden]{display:none!important}');
    const importants = FEUILLES.map(({ nom, source }) => ({ nom, importants: (source.match(/!important/g) ?? []).length }));
    expect(importants).toEqual(FEUILLES.map(({ nom }) => ({ nom, importants: nom === 'app/socle.ts' ? 1 : 0 })));
  });
});

describe('règle 2 — corps 17 px, pile système, aucune police demandée', () => {
  it('pose le corps sur la pile native, en --text-md et interligne détendu', () => {
    expect(SOCLE_DU_DOCUMENT).toContain('font-family:var(--font-native)');
    expect(SOCLE_DU_DOCUMENT).toContain('font-size:var(--text-md)');
    expect(SOCLE_DU_DOCUMENT).toContain('line-height:var(--leading-relaxed)');
  });

  it('n’écrit aucune autre famille, aucune @font-face, aucun url(', () => {
    // `inherit` ne NOMME aucune famille : c'est ce qui empêche un `<button>` de
    // retomber sur la police par défaut de l'agent utilisateur, que la règle 2
    // ne remplace pas — elle l'interdit.
    expect(
      [...TOUTES.matchAll(/font-family:([^;}]*)/g)]
        .map(([, valeur]) => (valeur ?? '').trim())
        .filter((famille) => famille !== 'inherit'),
    ).toEqual(['var(--font-native)']);
    expect(TOUTES).not.toContain('@font-face');
    expect(TOUTES).not.toContain('url(');
  });

  it('n’emploie jamais le plus petit corps, interdit par la charte', () => {
    expect(TOUTES).not.toContain('--text-2xs');
  });
});

/**
 * RÈGLE 3 — le poids. Deux plafonds, deux sujets, et il faut les tenir séparés :
 * « feuille de CHROME compactée ≤ 4 Ko gzip » (plafond décidé, mesuré 3 041 o
 * pour la base retenue) porte sur le chrome — le socle et la feuille du site,
 * ce que TOUT écran sert — ; « CSS ≤ 20 Ko gzip par route » (§ 8.5, GATE de
 * `budgets.json`) porte sur ce qu'UN document sert, chrome ET feuilles de son
 * écran. Le premier témoin opposait la SOMME de toutes les feuilles listées au
 * plafond du chrome : vert par chance à cinq feuilles (3 777 o), rouge à la
 * sixième — sans qu'aucun écran ne serve jamais les six ensemble. Il mesurait
 * la longueur de la liste, pas le poids d'un chrome (leçon 419 : un témoin qui
 * mesure autre chose que son sujet tombe quand le voisin grandit).
 *
 * Les compositions servies, et par qui : vitrine (`app/vitrine/vue.ts`),
 * connecté (`app/connecte/vue.ts`), fil (`app/connecte/fil-vue.ts`, chrome +
 * connecté + fil), choix (`app/(public)/chat/[lien]/choix-vue.ts`, les trois
 * plus la modale). Mesurées au 2026-09-02 : 1 067 · 1 412 · 1 695 · 3 550 ·
 * 4 100 o gzip.
 */
describe('règle 3 — le poids, plafonds décidés du § 12.6', () => {
  const CHROME = SOCLE_DU_DOCUMENT + FEUILLE_DU_CHROME;
  const COMPOSITIONS: readonly { readonly nom: string; readonly source: string }[] = [
    { nom: 'vitrine', source: CHROME + FEUILLE_DE_LA_VITRINE },
    { nom: 'connecté', source: CHROME + FEUILLE_CONNECTEE },
    // Le TABLEAU DE BORD sert la feuille de zone PLUS la sienne — l'aperçu au
    // Prisme de ses cartes (`cible/home.png`), que les cinq autres
    // compositions ne rendent pas et ne paient donc pas (charte règle 7).
    { nom: 'tableau de bord', source: CHROME + FEUILLE_CONNECTEE + FEUILLE_DU_TABLEAU },
    // `/chats` MANQUAIT à ce relevé : sa feuille est la seule de la zone qu'aucune
    // composition n'opposait au plafond.
    { nom: 'liste', source: CHROME + FEUILLE_CONNECTEE + FEUILLE_DE_LA_LISTE },
    { nom: 'fil', source: CHROME + FEUILLE_CONNECTEE + FEUILLE_DU_FIL },
    // L'état `?media=` du fil (§ 12.10.1) : la SEULE composition qui porte la
    // feuille du plein écran — un fil ordinaire n'en paie pas un octet.
    { nom: 'fil en plein écran', source: CHROME + FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DU_PLEIN },
    { nom: 'choix', source: CHROME + FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DU_CHOIX },
    { nom: 'médias', source: CHROME + FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DES_MEDIAS },
    { nom: 'story', source: CHROME + FEUILLE_CONNECTEE + FEUILLE_DE_LA_STORY },
  ];
  const PLAFOND_PAR_ROUTE_KO: number = (JSON.parse(readFileSync(join(__dirname, '..', 'budgets.json'), 'utf8')) as { reseau: { transverses: { css_ko: { valeur: number } } } }).reseau.transverses.css_ko.valeur;

  it('tient la feuille de chrome sous 4 Ko gzip', () => {
    expect(octetsCompresses(CHROME)).toBeLessThanOrEqual(4 * 1024);
  });

  it.each(COMPOSITIONS)('tient le CSS servi par UN document sous le plafond par route du § 8.5 ($nom)', ({ source }) => {
    expect(PLAFOND_PAR_ROUTE_KO).toBe(20);
    expect(octetsCompresses(source)).toBeLessThanOrEqual(PLAFOND_PAR_ROUTE_KO * 1024);
  });

  it('tient la table inlinée sous 1,5 Ko gzip, jetons de la charte compris', () => {
    expect(octetsCompresses(tableDeJetons())).toBeLessThanOrEqual(1536);
  });
});

describe('règle 4 — les hauteurs d’action viennent de la table', () => {
  it('sert 56 px en primaire, 52 en contour, 44 en tertiaire', () => {
    expect(FEUILLE_DU_CHROME).toContain('min-height:var(--action-height)');
    expect(FEUILLE_DU_CHROME).toContain('min-height:var(--action-height-secondary)');
    expect(FEUILLE_DU_CHROME).toContain('min-height:var(--target-min)');
    expect(FEUILLE_DU_CHROME).toContain('min-width:var(--target-min)');
  });
});

/**
 * RÈGLE 8 — l'échelle est FERMÉE, et chaque pas y a un RÔLE : « gouttière
 * `--space-5`, titre d'écran `--space-6` sous la marque, section `--space-7`,
 * cartes `--space-4`, actions empilées `--space-3` ».
 *
 * La règle 1 gardait la moitié « aucun pixel littéral » ; personne ne gardait
 * la moitié « le bon pas au bon endroit », qui est celle qui se VOIT. Les trois
 * cartes de la vitrine — héros, mission, appel — prenaient `--space-6`, le pas
 * du TITRE D'ÉCRAN, pendant que les neuf cartes d'atout, sur le même écran,
 * prenaient `--space-4`. Deux vocabulaires d'espace pour une même forme, c'est
 * la dimension 6 (cohérence de positionnement) perdue à l'intérieur d'un écran ;
 * et 16 px de gouttière interne en trop suffisaient à faire passer « Créer son
 * compte maintenant » sur DEUX lignes, là où la cible le tient sur une.
 */
describe('règle 8 — chaque pas de l’échelle a son rôle', () => {
  const paddingsDe = (source: string, selecteurs: readonly string[]): readonly string[] =>
    selecteurs.map((selecteur) => {
      const bloc = new RegExp(`\\${selecteur}\\{([^}]*)\\}`).exec(source)?.[1] ?? '';
      return /(?:^|;)padding:([^;]+)/.exec(bloc)?.[1] ?? 'ABSENT';
    });

  it('donne à TOUTE carte de la vitrine le pas des cartes, jamais celui d’un titre d’écran', () => {
    expect(paddingsDe(FEUILLE_DE_LA_VITRINE, ['.heros', '.mission', '.appel', '.atouts li'])).toEqual([
      'var(--space-4)',
      'var(--space-4)',
      'var(--space-4)',
      'var(--space-4)',
    ]);
  });

  it('rougit sur une carte qui reprendrait le pas du titre d’écran', () => {
    expect(paddingsDe('.heros{padding:var(--space-6)}', ['.heros'])).toEqual(['var(--space-6)']);
  });

  /**
   * Le tableau de bord est le SECOND écran à porter des cartes, et il a hérité
   * de l'échelle inventée que la règle 8 a chassée de la vitrine : `48px 0 8px`
   * de salutation, `14px` de gouttière de grille, `20px` de carte, `32px` de
   * section. Une carte de tableau de bord et une carte de vitrine se lisent sur
   * le même écran d'un lecteur qui vient de se connecter : deux vocabulaires
   * d'espace pour une même forme, c'est la dimension 6 perdue entre deux écrans.
   */
  it('donne aux cartes du tableau de bord le pas des cartes, jamais un pas inventé', () => {
    expect(paddingsDe(FEUILLE_CONNECTEE, ['.carte', '.chiffres li'])).toEqual([
      'var(--space-4)',
      'var(--space-4)',
    ]);
  });

  it('garde la gouttière du document sur son propre pas', () => {
    expect(FEUILLE_DU_CHROME).toContain(
      '.enveloppe{max-width:var(--shell-width);margin:0 auto;padding:var(--space-5) var(--space-5) var(--space-8)}',
    );
  });
});

/**
 * RÈGLE 18 — l'état VIDE est DESSINÉ : « contour `--stroke-strong` pointillé
 * `--color-border-strong`, glyphe 40 px `--color-text-muted`, titre, phrase
 * ≤ `--measure` ».
 *
 * Ce que la charte demande et que la v3 ne servait pas : un contour POINTILLÉ
 * (le plein se lit comme une carte pleine, donc comme du contenu) et le glyphe
 * qui dit de quoi l'écran est vide. L'ACTION primaire de la règle 18 n'entre
 * pas ici : elle mènerait à une route que la v3 ne sert pas encore, et la
 * règle 7 — « un contrôle existe s'il a un EFFET » — l'emporte sur elle.
 */
describe('règle 18 — l’état vide est dessiné', () => {
  it('pose le contour pointillé et le glyphe de 40 px', () => {
    expect(FEUILLE_CONNECTEE).toContain('var(--stroke-strong) dashed var(--color-border-strong)');
    expect(FEUILLE_CONNECTEE).toContain('width:var(--glyph-large)');
  });
});

describe('règle 5 — quatre rayons, pas onze', () => {
  // Les coins HAUTS de la feuille modale (règle 5 : « `--radius-2xl` : coins
  // hauts de la feuille modale ») sont la seule forme composée admise.
  const AUTORISES = new Set([
    'var(--radius-pill)',
    'var(--radius-lg)',
    'var(--radius-md)',
    'var(--radius-xs)',
    'var(--radius-2xl) var(--radius-2xl) 0 0',
  ]);

  it('n’écrit que les rayons de la charte', () => {
    const rayons = [...TOUTES.matchAll(/border-radius:([^;}]*)/g)].map(([, valeur]) => (valeur ?? '').trim());

    expect(rayons.length).toBeGreaterThan(0);
    expect(rayons.filter((rayon) => !AUTORISES.has(rayon))).toEqual([]);
  });
});

describe('règles 9, 10 et 11 — plans, filets, et ce qui ne se peint jamais', () => {
  it('bannit --color-border, invisible au soleil (1,28:1 en clair)', () => {
    expect(TOUTES).not.toContain('var(--color-border)');
  });

  it('n’écrit ni ombre hors focus, ni dégradé, ni flou de fond', () => {
    expect((TOUTES.match(/box-shadow:/g) ?? []).length).toBe(1);
    expect(SOCLE_DU_DOCUMENT).toContain('box-shadow:');
    expect(TOUTES).not.toContain('gradient(');
    expect(TOUTES).not.toContain('backdrop-filter');
  });

  /** Le SEUL `filter:blur` du dépôt : le cadre INERTE de `/chat/:lien` (règle 11, règle 25) — la modale, elle, n'en porte aucun. */
  it('ne floute qu’une chose : le cadre inerte du fil', () => {
    expect((TOUTES.match(/filter:blur\(/g) ?? []).length).toBe(1);
    expect(FEUILLE_DU_FIL).toContain('.fil-ecran[inert]{filter:blur(var(--frame-blur))}');
  });

  /**
   * Règle 9 — « `--color-surface-raised` = la feuille modale et le rond
   * flottant secondaire, rien d'autre » ; témoin : ≤ 2 sélecteurs, et la
   * feuille modale est le seul à le peindre tant que le rond n'existe pas.
   */
  it('ne réserve --color-surface-raised qu’à ce qui flotte — la feuille modale seule aujourd’hui', () => {
    const peints = FEUILLES.flatMap(({ nom, source }) =>
      regles(source)
        .filter(({ corps }) => corps.includes('var(--color-surface-raised)'))
        .map(({ selecteur }) => `${nom} › ${selecteur}`),
    );
    expect(peints).toEqual(['app/(public)/chat/[lien]/choix-feuille.ts › dialog.feuille']);
  });
});

describe('règle 13 — un accent, cinq emplois', () => {
  /**
   * La liste NOMMÉE de la règle 13, projetée sur les sélecteurs que la vitrine
   * et le chrome écrivent. Chaque entrée dit lequel des cinq emplois elle sert ;
   * un sélecteur qui n'en sert aucun n'entre pas, quelle que soit sa beauté.
   */
  const EMPLOIS: readonly string[] = [
    'a', // le cliquable — tout lien du site
    '.action.primaire', // le cliquable — action primaire
    '.action.primaire:hover', // le même, survolé
    '.action.contour', // le cliquable — action secondaire
    '.action.contour:hover', // le même, survolé
    '.marque .tuile', // la tuile de marque
    '.heros h1 em', // vitrine seule — UN mot de l'accroche
    '.compte', // le compte de non-lus
    // La boîte (#4898) : la pastille d'une notification NON LUE est de la même
    // nature que `.compte` — elle dit « ceci vous attend », comme l'accusé dit
    // « ceci est de moi ». Elle est le SEUL emploi de l'accent sur cet écran :
    // le glyphe d'un genre et celui d'un avis restent sur l'encre, et une ligne
    // non lue se distingue par le POIDS de son texte et son filet, jamais par
    // une couleur seule.
    '.notif .pastille',
    // Le fil (charte règles 22 et 26) : le cliquable — chevron de retour,
    // puce du Prisme, original à déplier, pièce jointe, envoi, accusé —, et la
    // pastille `.langue`. Le nom d'un auteur, un filet, un fond de ligne ne
    // prennent JAMAIS l'accent.
    '.fil-tete .retour', // le cliquable — chevron de retour
    '.fil-tete .medias', // le cliquable — la galerie des médias, à un tap du fil
    '.puce', // le cliquable — puce du Prisme
    '.ligne .accuse', // l'accusé de mes messages, comme le compte de non-lus
    '.langue', // la pastille de langue
    '.original summary', // le cliquable — « Voir l'original »
    '.pieces .media', // le cliquable — une pièce jointe, sur son affiche
    '.lecteur .lire', // le cliquable — le rond de lecture d'un vocal ou d'une vidéo
    '.pieces .transcrit-original summary', // le cliquable — l'original d'un transcrit
    '.pieces>li[data-genre=video] .media .lire', // le cliquable — le rond de lecture d'une vidéo, sur son poster
    '.pieces .fiche', // le cliquable — la fiche d'un vocal, où sa transcription se lit entière
    // Le plein écran (§ 12.10.1) : le cliquable — la croix qui ferme, l'original
    // d'un transcrit. La scène, le nom du fichier et son poids restent sur l'encre.
    'dialog.plein .fermer',
    'dialog.plein .transcrit-original summary',
    '.frappe', // « écrit… », charte règle 27
    '.composeur .envoyer', // le cliquable — action primaire du fil
    '.composeur .joindre', // le cliquable — joindre une pièce
    '.ligne .reagir:hover', // le cliquable — « Réagir », survolé
    '.reaction[aria-pressed=true]', // la pastille qui est la MIENNE, comme l'accusé
    // La modale de `/chat/:lien` (règle 25) : l'accordéon des droits est un
    // `<summary>` — du cliquable — et son glyphe le dit, comme le chevron de
    // retour dit le sien. Rien d'autre n'y prend l'accent : le nom du lien, la
    // citation et les champs restent sur l'encre.
    '.feuille .droits summary>svg', // le cliquable — l'accordéon des droits
    // La galerie (`cible/media.png`) : la puce ACTIVE d'un filtre est un
    // contrôle SÉLECTIONNÉ — comme l'accusé ou la réaction qui est la mienne,
    // elle prend l'accent en FOND —, et l'original d'un transcrit y est le même
    // cliquable que dans le fil.
    '.puces.filtres .puce[aria-current]',
    '.lecteurs .transcrit-original summary',
    // La story (`cible/story.png`) : le cliquable — la puce des langues, qui
    // ouvre la liste des textes servis —, l'action primaire de l'écran (l'envoi
    // d'une réponse) et le cœur PRESSÉ, qui prend l'accent pour la même raison
    // que l'accusé et la réaction qui est la mienne. Le nom de l'auteur, l'heure,
    // le texte de la story et les barres du haut restent sur l'encre.
    '.langues summary',
    '.story-repondre .envoyer',
    '.story-repondre .aimer[aria-pressed=true]',
    // Les commentaires (`cible/comments.png`) : la puce de la source COURANTE
    // est un contrôle SÉLECTIONNÉ — même emploi que `.puces.filtres
    // .puce[aria-current]` de la galerie, l'accent en FOND —, et `.prisme
    // summary` est un cliquable : il déplie l'original, exactement comme
    // `.original summary` du fil. Le nom d'un auteur, l'heure, le texte d'un
    // commentaire et le compte de cœurs restent sur l'encre.
    '.source[aria-current]',
    '.prisme summary',
    // La liste (`cible/chats.png`) : le cliquable — le résumé du menu d'une
    // ligne, SURVOLÉ, comme « Réagir » l'est dans le fil. La ligne elle-même,
    // son aperçu, son heure et son filet restent sur l'encre ; la pastille de
    // non-lus (`.compte`) et celle de langue (`.langue`) sont déjà nommées plus
    // haut, et c'est la même règle qui les gouverne des deux côtés.
    '.actions>summary:hover',
  ];

  it('ne peint avec l’accent que les sélecteurs de la liste nommée', () => {
    const peints = FEUILLES.flatMap((feuille) => selecteursDAccent(feuille.source));

    expect(peints.length).toBeGreaterThan(0);
    expect(peints.filter((selecteur) => !EMPLOIS.includes(selecteur))).toEqual([]);
  });

  it('rougit sur un titre peint à l’accent', () => {
    expect(selecteursDAccent('h2{color:var(--color-primary)}')).toEqual(['h2']);
  });
});

describe('règle 15 — focus double, jamais supprimé', () => {
  it('pose l’anneau et son contre-anneau sur les jetons de focus', () => {
    expect(SOCLE_DU_DOCUMENT).toContain('outline:var(--stroke-focus) solid var(--color-focus)');
    expect(SOCLE_DU_DOCUMENT).toContain('var(--color-focus-contra)');
  });

  it('ne supprime jamais un contour', () => {
    expect(TOUTES).not.toContain('outline:none');
  });
});

describe('règle 24 — le mouvement ne déplace rien', () => {
  const AUTORISEES = new Set(['background-color', 'border-color', 'color']);

  it('n’anime que la couleur, jamais la géométrie', () => {
    const proprietes = proprietesEnTransition(TOUTES);

    expect(proprietes.filter((propriete) => !AUTORISEES.has(propriete))).toEqual([]);
  });

  it('rougit sur une transition géométrique', () => {
    expect(proprietesEnTransition('.a{transition:transform 120ms}')).toEqual(['transform']);
    expect(proprietesEnTransition('.a{transition:all 120ms}')).toEqual(['all']);
  });

  it('coupe tout mouvement pour qui le demande', () => {
    expect(SOCLE_DU_DOCUMENT).toContain('prefers-reduced-motion');
  });

  it('n’écrit aucune animation sur ces trois feuilles', () => {
    expect(TOUTES).not.toContain('@keyframes');
  });
});

describe('règle 28 — les interdits, chacun avec sa sonde', () => {
  it('n’écrit aucune couleur littérale : la table est la seule source', () => {
    expect(TOUTES).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(TOUTES).not.toMatch(/\b(?:rgb|hsl)a?\(/);
  });

  it('ne déclare aucune SECONDE table de jetons', () => {
    expect(TOUTES).not.toMatch(/--[\w-]+\s*:/);
  });

  it('rougit sur une feuille qui déclarerait la sienne', () => {
    expect('.sonde{--x:1}').toMatch(/--[\w-]+\s*:/);
  });
});
