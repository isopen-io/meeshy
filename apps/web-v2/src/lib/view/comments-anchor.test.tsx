import { useRef } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { COMMENTS_ANCHOR, revealComments, targetsComments, useCommentsReveal, withCommentsAnchor } from './comments-anchor';

/**
 * **L'ANCRE ANNONCÉE ÉTAIT INERTE** (#7113, marche 2).
 *
 * Le compteur de commentaires d'une carte du fil conduisait déjà à
 * `/post/$post#commentaires`, et DEUX doc-comments l'écrivaient — « à son
 * ancre de commentaires ». Rien ne l'honorait : le routeur du dépôt ne lit
 * PAS le fragment (`readLocation()` ne retient que `pathname` et `search`,
 * `lib/router.tsx:59`), et le défilement d'un écran de détail vit dans son
 * `<main>`, que le `window.scrollTo(0, 0)` de la restauration ne touche même
 * pas. Le lecteur qui demandait les commentaires atterrissait donc EN HAUT
 * d'une carte pleine hauteur — la moitié visible du geste était la mauvaise.
 *
 * iOS ne laisse pas ce trajet au lecteur : le même compteur présente
 * `FeedCommentsSheet` (`FeedPostCard.swift:994-1007`, « Ouvre les
 * commentaires »), donc les commentaires SONT là. Le web n'a pas de couche
 * modale de fil ; l'ancre EST sa réponse, et une ancre qui ne bouge rien est
 * précisément le contrôle qui ment de la loi 4.
 *
 * **UN SEUL NOM POUR L'ANCRE.** Il était écrit TROIS fois — deux `#commentaires`
 * chez les hôtes du fil, un `id="commentaires"` dans le détail — et rien ne
 * les tenait ensemble : renommer l'un rendait le geste muet sans faire rougir
 * quoi que ce soit. `COMMENTS_ANCHOR` est désormais le seul endroit où ce mot
 * est écrit.
 *
 * **LE TÉMOIN NÉGATIF EST LE VRAI TÉMOIN.** Une révélation qui partirait à
 * CHAQUE arrivée passerait le cas positif à l'identique : c'est l'arrivée SANS
 * fragment qui distingue « honore l'ancre » de « saute toujours aux
 * commentaires », et c'est elle qui ferait perdre au lecteur la carte qu'il
 * venait lire.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

/* Les témoins de `revealComments` ne montent AUCUN arbre React — le démontage
   ne vaut que pour ceux du hook, d'où les sentinelles remises à `null`. */
let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  const monte = root;
  if (monte !== null) {
    act(() => {
      monte.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
});

/** La section du fil telle que `comment-thread.tsx` la monte : une région
 * NOMMÉE, focalisable au programme (`tabIndex={-1}`) — la destination que le
 * dépôt avait déjà préparée pour le retour du focus. */
function anchorSection(): { readonly anchor: HTMLElement; readonly region: HTMLElement; readonly scrolled: () => unknown } {
  const anchor = document.createElement('div');
  anchor.id = COMMENTS_ANCHOR;
  const region = document.createElement('section');
  region.setAttribute('data-comment-thread', 'p1');
  region.setAttribute('aria-label', 'Commentaires');
  region.tabIndex = -1;
  anchor.appendChild(region);
  document.body.appendChild(anchor);
  let seen: unknown = null;
  anchor.scrollIntoView = ((options: unknown) => {
    seen = options ?? 'sans-option';
  }) as typeof anchor.scrollIntoView;
  return { anchor, region, scrolled: () => seen };
}

describe('l’ancre des commentaires — UN nom, écrit et honoré au même endroit', () => {
  test('l’adresse d’une publication porte l’ancre, et c’est CE nom-là', () => {
    expect(withCommentsAnchor('/post/p1')).toBe(`/post/p1#${COMMENTS_ANCHOR}`);
    expect(withCommentsAnchor('/post/p1')).toBe('/post/p1#commentaires');
  });

  test('le fragment SERVI par le navigateur est reconnu, et lui seul', () => {
    expect(targetsComments(`#${COMMENTS_ANCHOR}`)).toBe(true);
    expect(targetsComments(COMMENTS_ANCHOR)).toBe(true);
    expect(targetsComments('')).toBe(false);
    expect(targetsComments('#media')).toBe(false);
    /* Le PRÉFIXE ne suffit pas — `#commentaires-2` est une autre ancre. */
    expect(targetsComments('#commentaires-2')).toBe(false);
  });
});

describe('révéler les commentaires — sous les yeux ET sous la voix', () => {
  test('l’ancre est amenée en tête du défileur, SANS animation', () => {
    const { anchor, scrolled } = anchorSection();
    revealComments(anchor);
    expect(scrolled()).toEqual({ block: 'start', behavior: 'auto' });
    anchor.remove();
  });

  test('et la région du fil REÇOIT le focus — la voix arrive où l’œil arrive', () => {
    const { anchor, region } = anchorSection();
    revealComments(anchor);
    expect(document.activeElement).toBe(region);
    anchor.remove();
  });

  test('sans région de fil, rien n’est focalisé de force — on ne vole pas le focus pour rien', () => {
    const anchor = document.createElement('div');
    anchor.id = COMMENTS_ANCHOR;
    anchor.scrollIntoView = (() => undefined) as typeof anchor.scrollIntoView;
    document.body.appendChild(anchor);
    const avant = document.activeElement;
    revealComments(anchor);
    expect(document.activeElement).toBe(avant);
    anchor.remove();
  });

  test('une ancre ABSENTE ne jette pas — un détail refusé n’ouvre aucun fil', () => {
    expect(() => revealComments(null)).not.toThrow();
  });
});

type HarnessProps = { readonly hash: string; readonly ready: boolean };

let reveals: number;
let lastRegion: HTMLElement | null;

function Harness({ hash, ready }: HarnessProps) {
  const anchor = useRef<HTMLDivElement | null>(null);
  useCommentsReveal({ anchor, ready, hash });
  return (
    <div id={COMMENTS_ANCHOR} ref={anchor}>
      <section data-comment-thread="p1" aria-label="Commentaires" tabIndex={-1} />
    </div>
  );
}

function mount(props: HarnessProps): HTMLDivElement {
  const hote = document.createElement('div');
  container = hote;
  document.body.appendChild(hote);
  const arbre = createRoot(hote);
  root = arbre;
  act(() => {
    arbre.render(<Harness {...props} />);
  });
  const anchor = hote.querySelector<HTMLElement>(`#${COMMENTS_ANCHOR}`)!;
  reveals = 0;
  lastRegion = null;
  anchor.scrollIntoView = (() => {
    reveals += 1;
    lastRegion = hote.querySelector<HTMLElement>('[data-comment-thread]');
  }) as typeof anchor.scrollIntoView;
  return hote;
}

const rerender = (props: HarnessProps) => {
  const arbre = root!;
  act(() => {
    arbre.render(<Harness {...props} />);
  });
};

describe('useCommentsReveal — à l’arrivée, une fois, et seulement si l’adresse le demande', () => {
  /* La publication N'EST PAS ENCORE SERVIE : le fil n'existe pas dans le
     document, et révéler maintenant viserait le vide. C'est pourquoi la
     révélation attend `ready` plutôt que le montage. */
  test('tant que la publication n’est pas servie, rien ne bouge', () => {
    mount({ hash: `#${COMMENTS_ANCHOR}`, ready: false });
    expect(reveals).toBe(0);
  });

  test('la publication servie AVEC l’ancre : le fil vient sous les yeux, et prend la voix', () => {
    mount({ hash: `#${COMMENTS_ANCHOR}`, ready: false });
    rerender({ hash: `#${COMMENTS_ANCHOR}`, ready: true });
    expect(reveals).toBe(1);
    expect(document.activeElement).toBe(lastRegion);
  });

  /* LE TÉMOIN QUI DISTINGUE. Sans lui, une implémentation qui révèle à chaque
     arrivée passerait tous les autres — et ferait perdre au lecteur venu lire
     la PUBLICATION la carte qu'il venait voir. */
  test('la MÊME publication servie SANS ancre ne saute nulle part', () => {
    mount({ hash: '', ready: false });
    rerender({ hash: '', ready: true });
    expect(reveals).toBe(0);
  });

  test('une AUTRE ancre ne déclenche pas celle-ci', () => {
    mount({ hash: '#media', ready: false });
    rerender({ hash: '#media', ready: true });
    expect(reveals).toBe(0);
  });

  /**
   * LE TÉMOIN QUI FAIT VARIER LA DIMENSION QU'IL MESURE.
   *
   * Rejouer les MÊMES props ne prouverait rien : React n'exécute pas un effet
   * dont aucune dépendance n'a bougé, donc un hook SANS verrou passerait à
   * l'identique — mesuré, cette version-là du témoin restait verte sur une
   * implémentation sans garde.
   *
   * Ce qui l'exerce vraiment est la publication qui QUITTE puis REVIENT :
   * une relecture qui échoue puis aboutit, une entrée évincée du cache.
   * `ready` refait alors faux → vrai, et sans verrou la page ramènerait de
   * force en bas le lecteur remonté lire la publication.
   */
  test('la publication qui s’en va et revient ne rejoue PAS — le lecteur garde sa place', () => {
    mount({ hash: `#${COMMENTS_ANCHOR}`, ready: false });
    rerender({ hash: `#${COMMENTS_ANCHOR}`, ready: true });
    expect(reveals).toBe(1);
    rerender({ hash: `#${COMMENTS_ANCHOR}`, ready: false });
    rerender({ hash: `#${COMMENTS_ANCHOR}`, ready: true });
    expect(reveals).toBe(1);
  });
});
