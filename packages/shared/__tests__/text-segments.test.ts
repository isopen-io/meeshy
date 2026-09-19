/**
 * LE DÉCOUPAGE D'UN TEXTE ÉCRIT PAR QUELQU'UN (#7032).
 *
 * Ce que ces témoins gardent, et qui n'est PAS « il y a un segment de type
 * lien » :
 *
 *  - la CLASSE DE CARACTÈRES d'une mention est DÉRIVÉE de `mention-parser.ts`,
 *    jamais recopiée — un `@marie-claire` est un seul handle, un
 *    `contact@marie.com` n'en est pas un ;
 *  - une URL est ANCRÉE sur `https?://`, donc aucun autre schéma ne peut
 *    produire un `href` — c'est la garde qui rend `javascript:` inatteignable
 *    par construction plutôt que par filtrage ;
 *  - le hashtag est une OPTION, `false` par défaut : les hashtags n'existent
 *    que pour les publications (aucune jointure message ↔ hashtag dans le
 *    schéma), et un lien de hashtag en conversation serait un contrôle inerte ;
 *  - une mention se compare en INSENSIBLE À LA CASSE au jeu validé par le
 *    serveur (`Message.validatedMentions` est stocké en minuscules).
 */
import { describe, expect, it } from 'vitest';

import { hasRichText, segmentText } from '../utils/text-segments';

const texts = (content: string, options?: Parameters<typeof segmentText>[1]) =>
  segmentText(content, options).map((s) => s.kind);

describe('segmentText — le texte nu', () => {
  it('rend UN seul segment de texte quand rien n’est à enrichir', () => {
    expect(segmentText('Bonjour tout le monde')).toEqual([{ kind: 'text', text: 'Bonjour tout le monde' }]);
  });

  it('rend une liste VIDE sur une chaîne vide, jamais un segment vide', () => {
    expect(segmentText('')).toEqual([]);
  });
});

describe('segmentText — les mentions', () => {
  it('découpe @pseudo et garde le texte autour', () => {
    expect(segmentText('salut @alice ça va')).toEqual([
      { kind: 'text', text: 'salut ' },
      { kind: 'mention', text: '@alice', username: 'alice' },
      { kind: 'text', text: ' ça va' },
    ]);
  });

  it('le tiret appartient au handle — @marie-claire est UN handle, pas @marie', () => {
    const [mention] = segmentText('@marie-claire');
    expect(mention).toEqual({ kind: 'mention', text: '@marie-claire', username: 'marie-claire' });
  });

  it('une adresse e-mail n’est pas une mention — frontière gauche de mention-parser', () => {
    expect(texts('écris à contact@marie.com')).toEqual(['text']);
  });

  it('un @ précédé d’une lettre ACCENTUÉE n’est pas une mention non plus', () => {
    expect(texts('éric@marie.com')).toEqual(['text']);
  });

  it('le username SERVI est en minuscules, le texte AFFICHÉ garde sa casse', () => {
    expect(segmentText('@Alice')).toEqual([{ kind: 'mention', text: '@Alice', username: 'alice' }]);
  });

  it('avec un jeu validé, seuls les pseudos du jeu deviennent des mentions', () => {
    expect(texts('@alice et @inconnue', { mentions: ['alice'] })).toEqual(['mention', 'text']);
  });

  it('la comparaison au jeu validé est INSENSIBLE à la casse — sinon @Alice n’est jamais un lien', () => {
    expect(texts('@Alice', { mentions: ['alice'] })).toEqual(['mention']);
  });

  it('un jeu validé VIDE ne linkifie rien — le serveur s’est prononcé', () => {
    expect(texts('@alice', { mentions: [] })).toEqual(['text']);
  });

  it('sans jeu validé, tout handle est une mention — ne rien linkifier serait une régression', () => {
    expect(texts('@alice')).toEqual(['mention']);
  });
});

describe('segmentText — les hashtags', () => {
  it('N’EST PAS activé par défaut : en conversation, #projet reste du texte', () => {
    expect(texts('on avance sur #projet')).toEqual(['text']);
  });

  it('activé, découpe #projet et minuscule le tag servi', () => {
    expect(segmentText('sur #Projet', { hashtags: true })).toEqual([
      { kind: 'text', text: 'sur ' },
      { kind: 'hashtag', text: '#Projet', tag: 'projet' },
    ]);
  });

  it('une ancre d’URL (#section) n’est pas un hashtag — le / la précède', () => {
    const segments = segmentText('https://exemple.fr/page#section', { hashtags: true });
    expect(segments.map((s) => s.kind)).toEqual(['url']);
  });
});

describe('segmentText — les liens', () => {
  it('découpe une URL et porte son href', () => {
    expect(segmentText('vois https://meeshy.me/a')).toEqual([
      { kind: 'text', text: 'vois ' },
      { kind: 'url', text: 'https://meeshy.me/a', href: 'https://meeshy.me/a' },
    ]);
  });

  it('AUCUN schéma autre que http(s) ne produit un lien — la regex est ANCRÉE', () => {
    for (const hostile of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      "[clique](javascript:alert('xss'))",
    ]) {
      expect(segmentText(hostile).every((s) => s.kind !== 'url')).toBe(true);
    }
  });

  it('AUCUN segment produit ne porte un href hors http(s), quel que soit l’entrant', () => {
    const hrefs = segmentText('a javascript:x https://ok.fr data:x', { hashtags: true })
      .flatMap((s) => (s.kind === 'url' ? [s.href] : []));
    expect(hrefs).toEqual(['https://ok.fr']);
  });

  it('une balise <script> reste du TEXTE — aucun segment ne la rend active', () => {
    expect(texts('<script>alert(1)</script>')).toEqual(['text']);
  });

  /**
   * LE CHEVAUCHEMENT RÉEL — pas seulement « le hashtag ne matche pas dans
   * l'ancre » (cas déjà couvert plus haut, où le second analyseur ne trouve
   * simplement rien). Ici `@alice`, précédé d'un `/`, EST un match valide de
   * `MENTION_REGEX` — et il vit entièrement À L'INTÉRIEUR du match de l'URL.
   * Sans le tri par position d'ouverture PUIS le rejet `match.start < cursor`
   * (le premier par position d'ouverture gagne), la mention couperait le lien
   * en trois segments au lieu d'un seul.
   */
  it('un handle valide À L’INTÉRIEUR d’une URL ne la découpe pas — le lien gagne en entier', () => {
    expect(segmentText('https://meeshy.me/@alice')).toEqual([
      { kind: 'url', text: 'https://meeshy.me/@alice', href: 'https://meeshy.me/@alice' },
    ]);
  });

  /**
   * **LA PONCTUATION QUI FERME LA PHRASE N'APPARTIENT PAS AU LIEN** — et c'est
   * le cas NOMINAL, pas un cas tordu : « regarde https://meeshy.me/notes. »
   * est la façon dont on écrit un lien dans une phrase. Les caractères de
   * ponctuation étant tous des caractères d'URL valides, la classe gourmande
   * les avalait : le lien affiché disait `…/notes.` et MENAIT à `…/notes.`,
   * une adresse qui n'existe pas. Un lien qui ne va pas où il dit est un
   * contrôle qui ment (loi 4), et rien ne le signale à l'écran.
   *
   * La parenthèse est traitée par ÉQUILIBRE, jamais par liste : un `)` final
   * ne se retire que si la chaîne en compte plus que de `(` — sans quoi
   * `…/Sémantique_(logique)`, où la parenthèse fait partie de l'adresse,
   * serait cassée par le correctif censé réparer `(https://…)`.
   */
  it('la ponctuation FINALE reste dans la phrase — le lien s’arrête où l’adresse s’arrête', () => {
    const hrefs = (content: string) => segmentText(content).flatMap((s) => (s.kind === 'url' ? [s.href] : []));
    expect(hrefs('regarde https://meeshy.me/notes.')).toEqual(['https://meeshy.me/notes']);
    expect(hrefs('lire https://meeshy.me/a, puis https://meeshy.me/b;')).toEqual([
      'https://meeshy.me/a',
      'https://meeshy.me/b',
    ]);
    expect(hrefs('vraiment https://meeshy.me/a ?! et https://meeshy.me/b!')).toEqual([
      'https://meeshy.me/a',
      'https://meeshy.me/b',
    ]);
    expect(hrefs('voir (https://meeshy.me/a) merci')).toEqual(['https://meeshy.me/a']);
  });

  it('le crochet suit la MÊME règle d’équilibre que la parenthèse', () => {
    const hrefs = (content: string) => segmentText(content).flatMap((s) => (s.kind === 'url' ? [s.href] : []));
    expect(hrefs('voir [https://meeshy.me/a] merci')).toEqual(['https://meeshy.me/a']);
    expect(hrefs('voir https://meeshy.me/a[0] merci')).toEqual(['https://meeshy.me/a[0]']);
  });

  it('une parenthèse ÉQUILIBRÉE appartient à l’adresse et y reste', () => {
    expect(segmentText('voir https://fr.wikipedia.org/wiki/Prisme_(optique) ok')).toEqual([
      { kind: 'text', text: 'voir ' },
      {
        kind: 'url',
        text: 'https://fr.wikipedia.org/wiki/Prisme_(optique)',
        href: 'https://fr.wikipedia.org/wiki/Prisme_(optique)',
      },
      { kind: 'text', text: ' ok' },
    ]);
  });

  it('la ponctuation retirée du lien RESTE LISIBLE — le découpage couvre toujours le texte d’origine', () => {
    const content = 'regarde https://meeshy.me/notes.';
    expect(segmentText(content).map((s) => (s.kind === 'emphasis' ? '' : s.text)).join('')).toBe(content);
  });

  it('une adresse qui se réduirait à son seul schéma n’est pas un lien', () => {
    expect(segmentText('bizarre https://. suite').every((s) => s.kind !== 'url')).toBe(true);
  });
});

describe('segmentText — le gras et l’italique', () => {
  it('**gras** devient un segment d’emphase qui ne garde PAS ses étoiles', () => {
    expect(segmentText('un **mot** fort')).toEqual([
      { kind: 'text', text: 'un ' },
      { kind: 'emphasis', style: 'bold', children: [{ kind: 'text', text: 'mot' }] },
      { kind: 'text', text: ' fort' },
    ]);
  });

  it('*italique* aussi', () => {
    expect(segmentText('*doucement*')).toEqual([
      { kind: 'emphasis', style: 'italic', children: [{ kind: 'text', text: 'doucement' }] },
    ]);
  });

  it('une étoile ISOLÉE reste du texte — 3 * 4 n’ouvre aucune emphase', () => {
    expect(texts('3 * 4 = 12')).toEqual(['text']);
  });

  it('une emphase NON FERMÉE reste du texte', () => {
    expect(texts('**pas fermé')).toEqual(['text']);
  });

  it('une emphase VIDE (****) reste du texte', () => {
    expect(texts('****')).toEqual(['text']);
  });

  it('un lien DANS une emphase reste un lien — l’emphase porte ses propres segments', () => {
    const [segment] = segmentText('**vois https://meeshy.me/a**');
    expect(segment).toEqual({
      kind: 'emphasis',
      style: 'bold',
      children: [
        { kind: 'text', text: 'vois ' },
        { kind: 'url', text: 'https://meeshy.me/a', href: 'https://meeshy.me/a' },
      ],
    });
  });

  it('une mention DANS une emphase reste une mention, et le jeu validé s’y applique', () => {
    expect(segmentText('**@alice et @inconnue**', { mentions: ['alice'] })).toEqual([
      {
        kind: 'emphasis',
        style: 'bold',
        children: [
          { kind: 'mention', text: '@alice', username: 'alice' },
          { kind: 'text', text: ' et @inconnue' },
        ],
      },
    ]);
  });

  it('une emphase ne s’imbrique pas dans une emphase — un seul niveau, pas de récursion sans fin', () => {
    const [segment] = segmentText('**a *b* c**');
    expect(segment).toEqual({
      kind: 'emphasis',
      style: 'bold',
      children: [{ kind: 'text', text: 'a *b* c' }],
    });
  });
});

/**
 * LES QUATRE EMPHASES (directive porteur) — gras, italique, souligné, barré.
 * Les deux dernières arrivent après les deux premières, et le piège n'est pas
 * le même : `*` n'apparaît jamais DANS un mot, `_` si. C'est pourquoi le
 * souligné porte une frontière de mot que le gras n'a pas besoin d'avoir.
 */
describe('segmentText — le souligné et le barré', () => {
  it('__souligné__ devient une emphase `underline` sans garder ses tirets bas', () => {
    expect(segmentText('un __mot__ souligné')).toEqual([
      { kind: 'text', text: 'un ' },
      { kind: 'emphasis', style: 'underline', children: [{ kind: 'text', text: 'mot' }] },
      { kind: 'text', text: ' souligné' },
    ]);
  });

  it('~~barré~~ devient une emphase `strikethrough`', () => {
    expect(segmentText('~~annulé~~')).toEqual([
      { kind: 'emphasis', style: 'strikethrough', children: [{ kind: 'text', text: 'annulé' }] },
    ]);
  });

  /**
   * LE PIÈGE NOMMÉ PAR LE PORTEUR, et il ne se limite pas à `snake_case` (qui
   * n'a qu'UN tiret bas, donc hors de portée d'un marqueur double). Le cas qui
   * mord vraiment est le tiret bas DOUBLE à l'intérieur d'un mot : sans
   * frontière, `chemin__long__ici` souligne « long » au milieu d'un
   * identifiant. La frontière de mot est donc la garde, pas le doublement.
   */
  it('un tiret bas DANS un mot ne souligne rien — ni snake_case, ni un identifiant à double tiret', () => {
    expect(texts('la variable snake_case reste nue')).toEqual(['text']);
    expect(texts('chemin__long__ici')).toEqual(['text']);
  });

  it('un tiret bas ISOLÉ et un tilde ISOLÉ restent du texte', () => {
    expect(texts('a _ b ~ c')).toEqual(['text']);
  });

  it('un souligné ou un barré NON FERMÉ reste du texte', () => {
    expect(texts('__pas fermé')).toEqual(['text']);
    expect(texts('~~pas fermé')).toEqual(['text']);
  });

  it('un souligné VIDE et un barré VIDE restent du texte', () => {
    expect(texts('____')).toEqual(['text']);
    expect(texts('~~~~')).toEqual(['text']);
  });

  it('un lien DANS un souligné reste un lien, et une mention DANS un barré reste une mention', () => {
    expect(segmentText('__vois https://meeshy.me/a__')).toEqual([
      {
        kind: 'emphasis',
        style: 'underline',
        children: [
          { kind: 'text', text: 'vois ' },
          { kind: 'url', text: 'https://meeshy.me/a', href: 'https://meeshy.me/a' },
        ],
      },
    ]);
    expect(segmentText('~~@alice~~', { mentions: ['alice'] })).toEqual([
      { kind: 'emphasis', style: 'strikethrough', children: [{ kind: 'mention', text: '@alice', username: 'alice' }] },
    ]);
  });

  /**
   * L'EMPHASE À L'INTÉRIEUR D'UNE URL NE DOIT PAS LA COUPER — le cas que
   * l'énoncé du lot nomme, et le seul où les deux analyseurs se marcheraient
   * dessus. Une adresse porte couramment des tirets bas ; `segmentText`
   * découpe l'emphase AVANT les liens, donc c'est ici que la garde se mesure.
   */
  it('une adresse qui porte des tirets bas doublés reste UN lien entier', () => {
    expect(segmentText('https://meeshy.me/a__b__c')).toEqual([
      { kind: 'url', text: 'https://meeshy.me/a__b__c', href: 'https://meeshy.me/a__b__c' },
    ]);
  });

  it('les quatre emphases cohabitent dans une même phrase', () => {
    expect(segmentText('**a** *b* __c__ ~~d~~').filter((s) => s.kind === 'emphasis')).toEqual([
      { kind: 'emphasis', style: 'bold', children: [{ kind: 'text', text: 'a' }] },
      { kind: 'emphasis', style: 'italic', children: [{ kind: 'text', text: 'b' }] },
      { kind: 'emphasis', style: 'underline', children: [{ kind: 'text', text: 'c' }] },
      { kind: 'emphasis', style: 'strikethrough', children: [{ kind: 'text', text: 'd' }] },
    ]);
  });

  /**
   * DEUX matches DE NATURE DIFFÉRENTE dans le MÊME morceau non enrichi — le
   * cas que `RUDE` ci-dessous ne couvre jamais : chacun de ses matches y vit
   * dans son propre segment plat, séparé des autres par une emphase. Ici, le
   * lien précède la mention dans le texte mais SUIT `MENTION_REGEX` dans
   * l'ordre de construction du tableau (`collect` empile mentions, hashtags,
   * puis URLs) — sans le tri par position d'ouverture, la mention sortirait
   * avant le lien alors qu'elle lui succède dans la phrase.
   */
  it('un lien et une mention non chevauchants restent dans l’ordre du texte, pas celui de leur analyseur', () => {
    expect(segmentText('vois https://meeshy.me/a puis @alice')).toEqual([
      { kind: 'text', text: 'vois ' },
      { kind: 'url', text: 'https://meeshy.me/a', href: 'https://meeshy.me/a' },
      { kind: 'text', text: ' puis ' },
      { kind: 'mention', text: '@alice', username: 'alice' },
    ]);
  });
});

describe('segmentText — la reconstruction', () => {
  /** Les QUATRE marqueurs dans la même phrase : un trou ou un doublon
   * introduit par l'un d'eux tombe ici, et nulle part ailleurs. */
  const RUDE =
    'Salut @Alice, vois **https://meeshy.me/a** et #Projet — __noté__, ~~annulé~~, pas contact@x.fr ni 3 * 4 ni snake_case';

  const MARKER: Record<string, string> = { bold: '**', italic: '*', underline: '__', strikethrough: '~~' };

  it('les segments couvrent le texte d’origine sans trou ni doublon (les marqueurs d’emphase exceptés)', () => {
    const flatten = (segments: ReturnType<typeof segmentText>): string =>
      segments
        .map((s) => (s.kind === 'emphasis' ? `${MARKER[s.style]}${flatten(s.children)}${MARKER[s.style]}` : s.text))
        .join('');
    expect(flatten(segmentText(RUDE, { hashtags: true }))).toBe(RUDE);
  });

  it('deux appels sur le même texte rendent la même chose — les regex globales sont RÉINITIALISÉES', () => {
    expect(segmentText(RUDE, { hashtags: true })).toEqual(segmentText(RUDE, { hashtags: true }));
  });
});

describe('hasRichText — la question qu’une surface se pose avant de monter des segments', () => {
  it('un texte nu ne porte rien à enrichir', () => {
    expect(hasRichText('Bonjour tout le monde')).toBe(false);
  });

  it('une chaîne vide ne porte rien à enrichir', () => {
    expect(hasRichText('')).toBe(false);
  });

  it('une mention, un lien ou une emphase font basculer la réponse à VRAI', () => {
    expect(hasRichText('salut @alice')).toBe(true);
    expect(hasRichText('vois https://meeshy.me/a')).toBe(true);
    expect(hasRichText('**gras**')).toBe(true);
  });

  it('un hashtag ne compte QUE si l’option est activée — le chemin nominal reste nu sinon', () => {
    expect(hasRichText('on avance sur #projet')).toBe(false);
    expect(hasRichText('on avance sur #projet', { hashtags: true })).toBe(true);
  });
});
