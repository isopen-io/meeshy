import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { PAGE_A_PROPOS } from '@/app/about/contenu';
import { PAGE_CONTACT } from '@/app/contact/contenu';
import { PIED } from '@/app/enveloppe/contenu';
import {
  documentDeLaPage,
  type Bloc,
  type Carte,
  type PageDeContenu,
} from '@/app/institutionnel/document';
import { PAGE_PARTENAIRES } from '@/app/partners/contenu';
import { PAGE_CONFIDENTIALITE } from '@/app/privacy/contenu';
import { echappe } from '@/app/socle';
import { PAGE_CONDITIONS } from '@/app/terms/contenu';
import { CONNEXION, INSCRIPTION } from '@/app/authentification/contenu';
import { documentDeLEcran } from '@/app/authentification/vue';
import { documentDeLaVitrine } from '@/app/vitrine/vue';

/**
 * **Les cinq pages institutionnelles servent le contenu du LEGACY, redessiné.**
 *
 * Directive du porteur (2026-09-01) : « Integre les pages /about, /contact,
 * /partners, /terms, /privacy dans la V3 avec le design de la v3 ». Comme pour
 * la vitrine, le contenu est celui de `apps/web/locales/fr/` et seul le dessin
 * change — ces témoins gardent les deux moitiés.
 *
 * LE TÉMOIN CENTRAL EST STRUCTUREL, pas une liste de phrases attendues. Un
 * modèle déclaratif déplace le risque : ce n'est plus « ai-je écrit la bonne
 * phrase ? » mais « le composeur rend-il TOUT ce que la page DÉCLARE ? ». Un
 * genre de bloc dont le rendu perdrait un champ — la `mention` d'une carte, le
 * second paragraphe d'une section — ne ferait tomber AUCUNE assertion de
 * présence, et la page serait amputée en silence sur les cinq adresses à la
 * fois. D'où « chaque feuille du modèle atteint le document », qui parcourt le
 * modèle et non une liste écrite à la main.
 */

const PAGES: readonly (readonly [string, PageDeContenu])[] = [
  ['/about', PAGE_A_PROPOS],
  ['/contact', PAGE_CONTACT],
  ['/partners', PAGE_PARTENAIRES],
  ['/terms', PAGE_CONDITIONS],
  ['/privacy', PAGE_CONFIDENTIALITE],
];

/** Les feuilles TEXTE du modèle — tout ce qu'un lecteur doit voir. */
const textesDuBloc = (bloc: Bloc): readonly string[] => {
  switch (bloc.genre) {
    case 'paragraphes':
      return bloc.corps;
    case 'liste':
      return bloc.items;
    case 'cartes':
      return bloc.cartes.flatMap((carte) => [
        carte.titre,
        ...(carte.corps === undefined ? [] : [carte.corps]),
        ...(carte.mention === undefined ? [] : [carte.mention]),
        ...(carte.items ?? []),
      ]);
    case 'accent':
      return [bloc.corps];
    case 'encadre':
      return bloc.lignes.map((ligne) => ligne.texte);
  }
};

const textesDeLaPage = (page: PageDeContenu): readonly string[] => [
  page.titre,
  ...(page.accroche === undefined ? [] : [page.accroche]),
  ...(page.mention === undefined ? [] : [page.mention]),
  ...page.sections.flatMap((section) => [section.titre, ...section.blocs.flatMap(textesDuBloc)]),
  page.suite.titre,
  ...(page.suite.accroche === undefined ? [] : [page.suite.accroche]),
  ...page.suite.liens.map((lien) => lien.libelle),
];

const genresDeLaPage = (page: PageDeContenu): readonly string[] =>
  page.sections.flatMap((section) => section.blocs.map((bloc) => bloc.genre));

/**
 * Le texte tel qu'il ARRIVE au document. Ce témoin-ci demande « rien n'est
 * PERDU », pas « rien n'est mal échappé » — il emprunte donc l'échappeur de
 * production plutôt que d'en réécrire un, ce qui en ferait une jumelle. La
 * question de l'échappement a son propre témoin, plus bas, et il pousse du
 * balisage à travers les cinq genres.
 */
const attendu = echappe;

const hrefsInternes = (doc: string): readonly string[] =>
  [...doc.matchAll(/href="([^"]*)"/g)]
    .map(([, href]) => href ?? '')
    .filter((href) => href.startsWith('/') && !href.startsWith('//'));

describe('les cinq pages institutionnelles', () => {
  // MARK: — le composeur ne perd rien de ce que la page déclare

  it.each(PAGES)('%s — chaque feuille du modèle atteint le document', (_route, page) => {
    const doc = documentDeLaPage(page);
    for (const texte of textesDeLaPage(page)) {
      expect(doc).toContain(attendu(texte));
    }
  });

  /**
   * Le `switch` de `rendLeBloc` est exhaustif : un sixième genre ne compile pas
   * tant qu'il n'est pas rendu. Ce témoin garde l'autre moitié — qu'aucun des
   * cinq genres ne soit un cas MORT, jamais exercé par un contenu réel, dont on
   * ne saurait qu'au premier usage s'il rend quelque chose.
   */
  /**
   * LE TÉMOIN QUI A ATTRAPÉ UNE PERTE RÉELLE. Les cinq encarts de
   * `privacy.protection` portent leur texte sous la clé `content`, là où les
   * quatre autres familles du catalogue le portent sous `description` : la
   * reprise les a donc déclarés avec un `corps` INDÉFINI, et la page servait
   * cinq titres nus.
   *
   * « Chaque feuille du modèle atteint le document » ne pouvait pas le voir —
   * un champ absent du MODÈLE n'est pas une feuille, donc il n'est pas cherché.
   * C'est la forme du piège : la garde qui compte ce qui est déclaré est aveugle
   * à ce qui a été perdu AVANT la déclaration. Celle-ci interroge le SENS —
   * une carte qui n'a ni corps ni items ne dit rien.
   */
  it('ne déclare aucune carte VIDE — un titre sans corps ni items ne dit rien', () => {
    const cartesDeLaPage = (page: PageDeContenu): readonly Carte[] =>
      page.sections.flatMap((section) =>
        section.blocs.flatMap((bloc) => (bloc.genre === 'cartes' ? bloc.cartes : [])),
      );

    const vides = PAGES.flatMap(([route, page]) =>
      cartesDeLaPage(page)
        .filter((carte) => carte.corps === undefined && (carte.items ?? []).length === 0)
        .map((carte) => `${route} → ${carte.titre}`),
    );

    expect(vides).toEqual([]);
  });

  it('exerce les CINQ genres de bloc sur du contenu réel', () => {
    const exerces = new Set(PAGES.flatMap(([, page]) => genresDeLaPage(page)));
    expect([...exerces].sort()).toEqual(['accent', 'cartes', 'encadre', 'liste', 'paragraphes']);
  });

  /**
   * LE TÉMOIN QUE LE RENDU A DICTÉ. `/privacy` n'a pas de sous-titre au
   * catalogue ; lui en fabriquer un en reprenant sa première section faisait
   * lire DEUX FOIS le même paragraphe, l'un sous l'autre — visible à la
   * capture, invisible à toute assertion de présence, puisque les deux textes
   * ÉTAIENT bien là.
   *
   * Une accroche est une PROMESSE : elle annonce ce que la page va dire. Quand
   * elle est le premier paragraphe de la page, elle n'annonce rien, et le
   * lecteur relit. L'absence d'accroche est alors la bonne forme — pas un trou
   * de mise en page.
   */
  it('ne répète jamais son accroche dans une section', () => {
    const repetitions = PAGES.flatMap(([route, page]) =>
      page.accroche === undefined
        ? []
        : page.sections
            .flatMap((section) => section.blocs.flatMap(textesDuBloc))
            .filter((texte) => texte === page.accroche)
            .map(() => `${route} → « ${page.accroche?.slice(0, 50)}… »`),
    );

    expect(repetitions).toEqual([]);
  });

  /**
   * MÊME FAMILLE QUE LE PRÉCÉDENT, un cran plus bas. Grouper deux cartes sous un
   * chapeau demande un titre de groupe ; quand le seul disponible est celui de
   * la première carte, la section et sa carte portent le même libellé — un
   * repère dédoublé pour un lecteur d'écran, une redite pour l'œil. `/partners`
   * l'a porté jusqu'à la capture, avec « Solutions Entreprise » deux fois.
   *
   * Le remède n'est pas de renommer : c'est de ne pas grouper ce que le contenu
   * ne groupe pas.
   */
  it('ne porte jamais deux fois le même titre de niveau 2', () => {
    const redites = PAGES.flatMap(([route, page]) => {
      const dansSaPropreCarte = page.sections.flatMap((section) =>
        section.blocs
          .flatMap((bloc) => (bloc.genre === 'cartes' ? bloc.cartes : []))
          .filter((carte) => carte.titre === section.titre)
          .map(() => `${route} → carte « ${section.titre} » sous la section du même nom`),
      );

      // La rangée de suite EST un `<h2>` : `/partners` terminait sur « Devenir
      // Partenaire » deux fois, une fois au-dessus du paragraphe et une fois
      // au-dessus des boutons. Un témoin qui ne regarde que les SECTIONS ne
      // voit pas le dernier titre de la page.
      const titres = [...page.sections.map((section) => section.titre), page.suite.titre];
      const deuxFois = titres
        .filter((titre, rang) => titres.indexOf(titre) !== rang)
        .map((titre) => `${route} → « ${titre} » deux fois en <h2>`);

      return [...dansSaPropreCarte, ...deuxFois];
    });

    expect(redites).toEqual([]);
  });

  /**
   * Le legacy porte une date de mise à jour sur ses DEUX pages légales, et sur
   * elles seules. La poser partout la rendrait fausse là où rien ne date.
   */
  it('ne date que les deux pages légales', () => {
    const datees = PAGES.filter(([, page]) => page.mention !== undefined).map(([route]) => route);
    expect(datees).toEqual(['/terms', '/privacy']);
  });

  /**
   * LE TÉMOIN QUI TIENT LA PROMESSE DES CINQ DOC-COMMENTS.
   *
   * Chaque `contenu.ts` affirme « le contenu de `apps/web/locales/fr/<page>.json`,
   * MOT POUR MOT ». C'était une affirmation, pas une propriété : rien ne
   * l'opposait au catalogue, et la reprise a effectivement inventé trois mots —
   * « …et la collaboration internationale **dans votre établissement** » —
   * qu'aucune relecture n'aurait distingués d'une phrase du produit.
   *
   * POURQUOI CE TÉMOIN A LE DROIT DE SORTIR DU PAQUET. L'invariant (i) de
   * `scripts/check-v3-pipeline.mjs` interdit à une SOURCE de la v3 d'atteindre
   * le disque hors de `apps/web-v3/` : l'étage builder du Dockerfile ne copie
   * que ce répertoire. Un test ne voyage pas dans l'image — c'est la raison
   * exacte pour laquelle `runtimeEnvChains` exclut déjà `__tests__` de son
   * champ. La lecture se fait par CHEMIN et non par `import`, ce qui la tient
   * de plus hors du graphe de modules que le traceur suit.
   *
   * Le jour où le legacy est décommissionné (§ 4.9 étape 7), ce témoin
   * disparaît avec sa source : la copie devient alors l'original.
   */
  it('ne porte, dans ses cinq pages, que des phrases du catalogue legacy', () => {
    const CATALOGUES: Readonly<Record<string, string>> = {
      '/about': 'about',
      '/contact': 'contact',
      '/partners': 'partners',
      '/terms': 'terms',
      '/privacy': 'privacy',
    };

    const feuillesDuJson = (valeur: unknown): readonly string[] => {
      if (typeof valeur === 'string') return [valeur];
      if (Array.isArray(valeur)) return valeur.flatMap(feuillesDuJson);
      if (valeur !== null && typeof valeur === 'object') {
        return Object.values(valeur).flatMap(feuillesDuJson);
      }
      return [];
    };

    const inventees = PAGES.flatMap(([route, page]) => {
      const nom = CATALOGUES[route] ?? '';
      const source = readFileSync(
        join(__dirname, '..', '..', 'web', 'locales', 'fr', `${nom}.json`),
        'utf8',
      );
      const catalogue = new Set(feuillesDuJson(JSON.parse(source)));
      return textesDeLaPage(page)
        .filter((texte) => !catalogue.has(texte))
        .map((texte) => `${route} → « ${texte} »`);
    });

    expect(inventees).toEqual([]);
  });

  // MARK: — le chrome est le MÊME partout (dimension 6)

  it('sert le MÊME pied que la vitrine, sur les six documents', () => {
    for (const doc of [documentDeLaVitrine(), ...PAGES.map(([, page]) => documentDeLaPage(page))]) {
      expect(doc).toContain(PIED.devise);
      for (const { libelle, href } of PIED.liens) {
        expect(doc).toContain(attendu(libelle));
        expect(doc).toContain(`href="${href}"`);
      }
    }
  });

  /**
   * L'accueil est le seul écran qui n'offre pas de retour vers lui-même.
   */
  it('offre le retour à l’accueil, que la vitrine seule n’a pas', () => {
    for (const [, page] of PAGES) {
      expect(documentDeLaPage(page)).toContain('class="retour"');
    }
    expect(documentDeLaVitrine()).not.toContain('class="retour"');
  });

  // MARK: — aucun lien ne meurt à la frontière de zone

  /**
   * LE PIÈGE QUE CE TÉMOIN FERME. La vitrine renvoyait vers cinq adresses que
   * la v3 ne servait pas : elles franchissaient la frontière vers le legacy, ce
   * que le § 4.9 autorise entre les étapes 2 et 6 — mais que rien ne
   * VÉRIFIAIT. Un chemin qu'aucune des deux zones ne sert est un lien mort sur
   * la page d'accueil, et il ne rougit nulle part.
   *
   * Les routes servies sont LUES sur le disque, jamais recopiées : une liste
   * écrite ici serait la jumelle qui prend du retard au premier écran ajouté.
   */
  const APP = join(__dirname, '..', 'app');

  const routesServies = (dossier: string, prefixe: string): readonly string[] =>
    readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
      if (entree.name === 'route.ts') return [prefixe === '' ? '/' : prefixe];
      if (!entree.isDirectory() || entree.name.startsWith('_')) return [];
      const segment = entree.name.startsWith('(') ? '' : `/${entree.name}`;
      return routesServies(join(dossier, entree.name), `${prefixe}${segment}`);
    });

  /**
   * Ce que la v3 NE sert pas, et qui reste pourtant un lien légitime. La liste
   * s'est VIDÉE : `/login` et `/signup` y figuraient, et la v3 les sert
   * désormais — c'est exactement ce que ce nommage devait rendre visible le
   * jour venu, plutôt que de laisser une exemption survivre à sa raison.
   *
   * Elle reste déclarée parce que la frontière, elle, existe toujours :
   * `/forgot-password` et `/auth/verify-2fa` sont atteints depuis ces écrans et
   * vivent au legacy (§ 4.9, entre les étapes 2 et 6).
   */
  const HORS_ZONE: readonly string[] = [
    '/forgot-password',
    '/auth/verify-2fa',
    // Le FIL d'une conversation est encore servi par le legacy : la v3 rend la
    // liste, pas les messages. `/conversations/:id` est donc une frontière
    // assumée — et le témoin la fera rougir le jour où la v3 servira le fil
    // sans que ce nom ait suivi.
    '/conversations',
  ];

  it('ne renvoie que vers ce que la v3 sert, ou vers une frontière NOMMÉE', () => {
    const servies = new Set(routesServies(APP, ''));
    expect(servies).toContain('/about');

    // LES DEUX ÉCRANS D'ACCÈS ENTRENT DANS LE BALAYAGE, et c'est là que
    // l'exemption mord : « Mot de passe oublié ? » sort de la zone, et la seule
    // façon de savoir qu'il ne meurt pas est de le NOMMER.
    const ecran = (e: typeof CONNEXION): string =>
      documentDeLEcran({ ecran: e, erreur: null, valeurs: {}, retour: null });

    const documents = [
      ['/', documentDeLaVitrine()] as const,
      ...PAGES.map(([route, page]) => [route, documentDeLaPage(page)] as const),
      ['/login', ecran(CONNEXION)] as const,
      ['/signup', ecran(INSCRIPTION)] as const,
    ];

    // Un chemin PARAMÉTRÉ est ramené à son premier segment : `/conversations/42`
    // est la même frontière que `/conversations`, et l'énumérer identifiant par
    // identifiant serait une liste infinie.
    const racineDe = (href: string): string => `/${href.split('/')[1] ?? ''}`;

    const morts = documents.flatMap(([route, doc]) =>
      hrefsInternes(doc)
        .filter(
          (href) =>
            !servies.has(href) &&
            !HORS_ZONE.includes(href) &&
            !HORS_ZONE.includes(racineDe(href)),
        )
        .map((href) => `${route} → ${href}`),
    );

    expect(morts).toEqual([]);
  });

  // MARK: — la forme ne fait rien payer

  it.each(PAGES)('%s — n’embarque QUE le script de thème', (_route, page) => {
    const doc = documentDeLaPage(page);
    expect(doc.split('<script').length - 1).toBe(1);
    expect(doc).toContain('meeshy-theme');
    expect(doc).not.toContain('<link rel="stylesheet"');
  });

  it.each(PAGES)('%s — déclare la langue ET le thème sur <html>', (_route, page) => {
    expect(documentDeLaPage(page)).toMatch(/<html lang="[a-z]{2}" class="(dark|light)"/);
  });

  it.each(PAGES)('%s — porte un seul <h1> et le repère de contenu', (_route, page) => {
    const doc = documentDeLaPage(page);
    expect(doc.split('<h1').length - 1).toBe(1);
    expect(doc).toContain('<main id="main-content">');
  });

  /**
   * LE TÉMOIN QUI A ATTRAPÉ LA JUMELLE. Extraire le chrome de la vitrine vers
   * `app/enveloppe/feuille.ts` demande DEUX gestes — l'ajouter là, le retirer
   * ici — et le second peut échouer seul. Il a échoué : les douze règles du
   * chrome ont vécu quelques minutes dans les DEUX feuilles, servies deux fois
   * dans le même `<style>`.
   *
   * Rien ne rougissait. Le document restait valide, la page restait juste, les
   * 910 témoins restaient verts — la cascade CSS applique la seconde
   * déclaration et rend exactement le même pixel. Seul le POIDS le disait,
   * +1 420 octets, et un poids ne se lit que si quelqu'un le mesure. C'est la
   * forme même de la jumelle : elle ne se manifeste qu'au jour où les deux
   * copies divergent, c'est-à-dire quand il est trop tard pour la voir naître.
   *
   * Le sélecteur DÉCLARÉ DEUX FOIS est la trace observable, et elle est
   * observable TOUT DE SUITE.
   */
  it('ne déclare aucun sélecteur deux fois : une règle, une feuille', () => {
    const doublons = (doc: string): readonly string[] => {
      const style = doc.slice(doc.indexOf('<style>'), doc.indexOf('</style>'));
      const selecteurs = (style.slice(style.indexOf('*,*::before')).match(/[^{}]+\{[^{}]*\}/g) ?? [])
        .map((regle) => regle.slice(0, regle.indexOf('{')))
        .filter((selecteur) => !selecteur.startsWith('@'));
      return selecteurs.filter((selecteur, rang) => selecteurs.indexOf(selecteur) !== rang);
    };

    expect(doublons(documentDeLaVitrine())).toEqual([]);
    for (const [, page] of PAGES) {
      expect(doublons(documentDeLaPage(page))).toEqual([]);
    }
  });

  /**
   * Le § 3.2 corollaire 2 interdit la seconde table de jetons. Une couleur
   * ÉCRITE dans la feuille en serait une — et elle serait fausse dans l'un des
   * deux schémas, sans qu'aucun gate de thème ne puisse l'attraper.
   */
  it('n’écrit aucune couleur : tout vient des jetons', () => {
    const doc = documentDeLaPage(PAGE_A_PROPOS);
    const feuille = doc.slice(doc.indexOf('.enveloppe'), doc.indexOf('</style>'));
    expect(feuille).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(feuille).not.toMatch(/\b(rgb|hsl)a?\(/);
  });

  /**
   * Rien du modèle n'entre en BALISAGE. Les cinq contenus sont constants
   * aujourd'hui, donc aucun ne porte de chevron — c'est précisément pourquoi le
   * témoin en pousse un : la garde doit tenir AVANT que le contenu ne devienne
   * traduit (#4415), pas après.
   */
  it('échappe tout ce qu’une page déclare', () => {
    const injectee: PageDeContenu = {
      titre: '<script>alert(1)</script>',
      accroche: '"& <b>gras</b>',
      description: 'sonde',
      sections: [
        {
          titre: '<h9>',
          blocs: [
            { genre: 'paragraphes', corps: ['<img onerror=x>'] },
            { genre: 'liste', items: ['<li>'] },
            { genre: 'cartes', cartes: [{ titre: '<td>', corps: '<em>', mention: '<u>', items: ['<i>'] }] },
            { genre: 'accent', corps: '<blockquote>' },
            { genre: 'encadre', lignes: [{ texte: '<a>', href: '"onmouseover="x' }] },
          ],
        },
      ],
      suite: { titre: '<nav>', liens: [{ libelle: '<span>', href: '/about' }] },
    };

    const doc = documentDeLaPage(injectee);
    const corps = doc.slice(doc.indexOf('<body>'));

    expect(corps).not.toContain('<script>alert(1)</script>');
    expect(corps).not.toContain('<img onerror=x>');
    expect(corps).toContain('&lt;blockquote&gt;');
    expect(corps).toContain('&lt;u&gt;');

    // Le `href` d'un encadré est une ADRESSE : la sonde y ferme le guillemet
    // pour tenter d'ouvrir un attribut de plus. L'assertion porte sur la forme
    // ÉCHAPPÉE exacte — « le texte `onmouseover=` est absent » serait faux et
    // le resterait, puisque la sonde le contient par construction.
    expect(corps).toContain('href="&quot;onmouseover=&quot;x"');
  });
});
