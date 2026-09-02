/**
 * @jest-environment node
 */

import { gzipSync } from 'node:zlib';

import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { documentDeLEcran, type ParametresDuDocument } from '@/app/(public)/l/[token]/document';
import { FEUILLE_DE_L_ECRAN } from '@/app/(public)/l/[token]/feuille';
import { themeScriptSource } from '@/app/theme-script';

/**
 * Le document manuscrit des DEUX écrans de `/l/:token`.
 *
 * Il est écrit à la main pour une raison que ce fichier mesure : un
 * gestionnaire de route rend un `Response(html)` sans traverser le pipeline de
 * rendu de Next, donc son `<head>` ne porte AUCUN chunk du runtime d'App Router.
 * C'est ce qui tient le gate de requêtes des deux écrans — et la propriété se
 * vérifie ici, sur la chaîne, avant même qu'un navigateur ne la compte.
 */

const document = (surcharge: Partial<ParametresDuDocument> = {}): string =>
  documentDeLEcran({
    meta: {
      titre: 'Équipe Lagos',
      description: 'Rejoignez la conversation partagée avec vous.',
      robots: 'noindex',
      carte: { url: 'https://meeshy.me/l/8fz3-lagos' },
    },
    entete: { titre: 'Ouverture du lien', sous: 'Redirection' },
    pastille: { glyphe: 'ph-arrows-clockwise', ton: 'primaire' },
    titre: 'Ouverture du lien',
    corps: 'Nous vérifions le lien et préparons la conversation. Cela prend une seconde.',
    lignes: [
      { cle: 'Jeton', valeur: 'l/8fz3-lagos' },
      { cle: 'Origine', valeur: 'WhatsApp · partage' },
      { cle: 'Appareil', valeur: 'iPhone · Safari' },
      { cle: 'Langue détectée', valeur: '🇫🇷 Français' },
    ],
    principal: { libelle: 'Continuer', href: '/chats/8fz3-lagos' },
    secondaire: { libelle: "Revenir à l'accueil", href: '/' },
    ...surcharge,
  });

const scripts = (html: string): readonly string[] => html.match(/<script\b[\s\S]*?<\/script>/g) ?? [];

describe('documentDeLEcran — le seul HTML des deux écrans de /l/:token', () => {
  it('est un document complet, avec le thème posé par le SERVEUR', () => {
    const html = document();

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain(`<html lang="${DOCUMENT_LANGUAGE}" class="dark">`);
  });

  /**
   * Le témoin de la règle : `lang` déclare la langue de ce qui est ÉCRIT.
   *
   * Il ne peut pas s'écrire sur le document seul — `documentDeLEcran` ne reçoit
   * plus de langue, donc rien à surcharger. Ce qu'il vérifie est donc l'ACCORD
   * entre l'attribut et la copie CONSTANTE du gabarit : le jour où l'un des deux
   * bouge sans l'autre, il tombe. Son pendant côté requête (un visiteur
   * anglophone reçoit `lang="fr"`) vit dans `lien-route.test.ts`.
   */
  it('déclare la langue de sa COPIE, qui est constante et française', () => {
    const html = document();

    expect(DOCUMENT_LANGUAGE).toBe('fr');
    expect(html).toContain(`<html lang="${DOCUMENT_LANGUAGE}"`);
    expect(html).toContain('Ouverture du lien');
    expect(html).toContain('Redirection');
  });

  it("ne porte qu'UN script — le moteur de thème — et il tient sous 400 octets", () => {
    const trouves = scripts(document());

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toContain(themeScriptSource);
    expect(Buffer.byteLength(themeScriptSource, 'utf8')).toBeLessThanOrEqual(400);
  });

  it('porte des OG RÉELS — le défaut mesuré était title:"" description:"" images:[]', () => {
    const html = document();

    expect(html).toContain('<meta property="og:title" content="Équipe Lagos"/>');
    expect(html).toContain(
      '<meta property="og:description" content="Rejoignez la conversation partagée avec vous."/>',
    );
    expect(html).toContain('<meta property="og:url" content="https://meeshy.me/l/8fz3-lagos"/>');
    expect(html).toContain('<title>Équipe Lagos</title>');
    expect(html).toContain('name="twitter:card"');
  });

  /**
   * La CARTE est ce qui distingue les deux écrans dans le `<head>`, et c'est une
   * décision : un lien mort n'annonce aucun contenu, donc il n'offre aucun
   * aperçu à composer. Un `carte: null` qui laisserait passer un seul `og:` ferait
   * circuler l'aperçu d'un contenu qui n'est plus là.
   */
  it('ne pose AUCUNE carte d’aperçu quand l’écran n’a rien à annoncer', () => {
    const html = document({
      meta: {
        titre: 'Lien indisponible — Meeshy',
        description: 'Ce lien de partage ne donne plus accès à son contenu.',
        robots: 'noindex, nofollow',
        carte: null,
      },
    });

    expect(html).not.toContain('og:');
    expect(html).not.toContain('twitter:');
    expect(html).toContain('<title>Lien indisponible — Meeshy</title>');
    expect(html).toContain('name="robots" content="noindex, nofollow"');
  });

  it('déclare le robots que l’écran lui donne — une adresse de passage ne s’indexe pas', () => {
    expect(document()).toContain('name="robots" content="noindex"');
  });

  it('rend les repères que le gate d’accessibilité exige', () => {
    const html = document();

    expect(html).toContain('<header');
    expect(html).toContain('<main id="main-content"');
    expect(html).toContain('<nav');
    expect(html).toContain('<h1');
  });

  it('rend les deux CTA de la planche en LIENS réels — ils marchent sans JavaScript', () => {
    const html = document();

    expect(html).toContain('<a class="cta principal" href="/chats/8fz3-lagos">Continuer</a>');
    expect(html).toContain('<a class="cta secondaire" href="/">Revenir à l&#39;accueil</a>');
  });

  it('rend les quatre lignes de contexte en liste de DÉFINITIONS, pas en <div>', () => {
    const html = document();

    expect(html).toContain('<dl');
    expect(html).toContain('<dt');
    expect(html).toContain('Langue détectée');
    expect(html).toContain('iPhone · Safari');
  });

  it('n’appelle AUCUNE sous-ressource : le gate de requêtes tient sur la CHAÎNE', () => {
    const html = document();

    // Le navigateur demande `/favicon.ico` tout seul : la seule façon de tenir
    // « 1 requête » est de la lui retirer.
    expect(html).toContain('<link rel="icon" href="data:,"/>');

    expect(html).not.toContain('rel="stylesheet"');
    expect(html).not.toMatch(/<img\b/);
    expect(html).not.toMatch(/\bsrc=/);
    expect(html).not.toContain('@import');
  });

  it('inline la table de jetons — aucune couleur n’est écrite dans le code de l’écran', () => {
    const html = document();

    expect(html).toContain('--color-bg:');
    expect(html).toContain(':root.light');
  });

  it('tient sous 4 Ko gzip — le plafond du § 8.3', () => {
    expect(gzipSync(Buffer.from(document(), 'utf8'), { level: 9 }).byteLength).toBeLessThanOrEqual(
      4096,
    );
  });

  it('échappe ce qui vient du réseau — un jeton n’est pas du balisage', () => {
    const html = document({
      meta: {
        titre: '</title><script>x()</script>',
        description: '"',
        robots: 'noindex',
        carte: { url: 'https://m/l/x' },
      },
      entete: { titre: '<b>en-tête</b>', sous: '<i>sous</i>' },
      titre: '<u>titre</u>',
      corps: '<em>corps</em>',
      lignes: [{ cle: 'Jeton', valeur: '<img onerror=x>' }],
    });

    expect(scripts(html)).toHaveLength(1);
    expect(html).not.toContain('<img onerror');
    expect(html).not.toContain('<b>en-tête</b>');
    expect(html).not.toContain('<u>titre</u>');
    expect(html).toContain('&lt;');
  });

  /**
   * LE CONTOUR D'UN BOUTON FANTÔME EST SON AFFORDANCE — WCAG 1.4.11, 3:1.
   *
   * `.secondaire` n'a aucun fond : sa bordure porte SEULE l'information « il y a
   * un contrôle ici ». `packages/design-tokens` disqualifie `--color-border` et
   * `--color-border-strong` pour ce rôle à l'endroit même où il les définit
   * (« ce sont des séparateurs, pas des contours ») et pose
   * `--color-border-interactive` à côté.
   *
   * La règle est écrite sur la FORME, pas sur la ligne : toute règle de la
   * feuille qui peint un contrôle SANS fond doit nommer le jeton de contour.
   * Le jour où un second bouton fantôme entre dans cette feuille, ce témoin le
   * juge sans qu'on l'ait rouvert. Le ratio, lui, est mesuré au NAVIGATEUR sur
   * les quatre colonnes de thème (`e2e/visual/lib/contours.ts`) : une feuille ne
   * sait pas quelle couleur le thème servira, le DOM le sait.
   */
  it('donne à tout contrôle SANS fond le jeton de contour, jamais un séparateur', () => {
    const CONTROLE = /(?:^|[\s,>+~])(?:button|a\b|\.cta|\.principal|\.secondaire)/;

    const fautifs = [...FEUILLE_DE_L_ECRAN.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((regle) => ({ selecteur: regle[1] ?? '', corps: regle[2] ?? '' }))
      .filter(({ selecteur, corps }) => CONTROLE.test(selecteur) && /(?:^|;)border\s*:/.test(corps))
      .filter(({ corps }) => !/(?:^|;)background\s*:/.test(corps))
      .filter(({ corps }) => !corps.includes('var(--color-border-interactive)'))
      .map(({ selecteur }) => selecteur.trim());

    expect(fautifs).toEqual([]);
  });
});
