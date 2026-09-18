import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { isMediaAbsent, noteMediaAbsent, resetAbsentMedia } from '@/lib/api/media-absent';
import type { FeedCardMedia } from '@/lib/feed/card-model';
import type { StoryCitation } from '@/lib/view/message-body';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { StoryMediaLayer } from '@/routes/story-parts';

import { FeedMediaSurface } from './feed-media-surface';
import { StoryCitationCard } from './message-body-blocks';

/**
 * LA DÉGRADATION PROPRE D'UN MÉDIA ABSENT, SUR LA SURFACE D'UN POST (#7022).
 *
 * LE DÉFAUT QUE CE FICHIER GARDE, et il n'est pas celui qu'on croit. Le dépôt
 * SAIT déjà masquer une image cassée : `Avatar` efface la sienne au `onError`,
 * `scene-object-media` pose `hidden`, `story.tsx` retient `mediaFailed`. Les
 * trois oublient au démontage — et un fil virtualisé démonte puis remonte ses
 * rangées à chaque passage du défilement. **La même référence morte repart
 * donc en requête à chaque aller-retour**, rend son 404, et le journalise. Ce
 * n'est pas le trou visuel qui cascade, c'est la REQUÊTE.
 *
 * D'où un témoin en TROIS temps — et c'est le troisième qui porte le lot :
 * monter, échouer, puis **REMONTER** et vérifier qu'aucune `<img>` ne
 * redemande la source. Un témoin qui s'arrêterait au deuxième temps passerait
 * au vert sur l'état local que le dépôt avait déjà, sans rien prouver de neuf.
 *
 * Événements RÉELS (`onError`), donc happy-dom + `createRoot` + `act` — patron
 * d'`attachment-blocks.test.tsx` § « l'image en ÉCHEC de décodage ».
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const ABSENT = 'https://gate.meeshy.me/api/v1/attachments/file/2025%2F10%2Fdisparu.jpg';

const media = (partial: Partial<FeedCardMedia> = {}): FeedCardMedia => ({
  id: 'm-1',
  kind: 'image',
  src: ABSENT,
  ratio: 1,
  ...partial,
});

describe('la surface média d’un POST — #7022', () => {
  beforeAll(async () => {
    await loadInterfaceCatalog('fr');
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetAbsentMedia();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const monter = (node: ReactNode) => {
    act(() => {
      root.render(node);
    });
  };

  test('AVANT tout échec, la surface demande son image — rien n’est masqué par précaution', () => {
    monter(<FeedMediaSurface media={media()} />);

    expect(container.querySelector(`img[src="${ABSENT}"]`)).not.toBeNull();
    expect(container.querySelector('[data-media-unavailable]')).toBeNull();
  });

  test('l’échec rend l’état DESSINÉ, et retire l’image morte du document', () => {
    monter(<FeedMediaSurface media={media()} />);

    act(() => {
      container.querySelector(`img[src="${ABSENT}"]`)!.dispatchEvent(new Event('error'));
    });

    expect(container.querySelector('[data-media-unavailable]')).not.toBeNull();
    expect(container.querySelector(`img[src="${ABSENT}"]`)).toBeNull();
  });

  test('l’échec est ENREGISTRÉ au niveau module — pas seulement dans l’état de la surface', () => {
    monter(<FeedMediaSurface media={media()} />);

    act(() => {
      container.querySelector(`img[src="${ABSENT}"]`)!.dispatchEvent(new Event('error'));
    });

    expect(isMediaAbsent(ABSENT)).toBe(true);
  });

  /**
   * LE TÉMOIN QUI PORTE LE LOT. C'est exactement ce que le virtualiseur du fil
   * fait des dizaines de fois par défilement, et ce qu'aucun état local ne
   * peut survivre.
   */
  test('APRÈS REMONTAGE, la surface ne redemande RIEN — l’état dessiné est là d’emblée', () => {
    monter(<FeedMediaSurface media={media()} />);
    act(() => {
      container.querySelector(`img[src="${ABSENT}"]`)!.dispatchEvent(new Event('error'));
    });

    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    monter(<FeedMediaSurface media={media()} />);

    expect(container.querySelector(`img[src="${ABSENT}"]`)).toBeNull();
    expect(container.querySelector('[data-media-unavailable]')).not.toBeNull();
  });

  /**
   * LE VERDICT SUIT LA SOURCE, JAMAIS L'INSTANCE. Un virtualiseur RECYCLE ses
   * composants : la même instance sert une autre rangée, avec une autre
   * source. Un `useState` semé au montage garderait le verdict de la ligne
   * PRÉCÉDENTE — c'est le défaut qu'on vient de fermer, retourné.
   */
  test('une AUTRE source sur la MÊME surface recyclée charge normalement', () => {
    const vivante = 'https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fvivante.jpg';
    monter(<FeedMediaSurface media={media()} />);
    act(() => {
      container.querySelector(`img[src="${ABSENT}"]`)!.dispatchEvent(new Event('error'));
    });

    monter(<FeedMediaSurface media={media({ id: 'm-2', src: vivante })} />);

    expect(container.querySelector(`img[src="${vivante}"]`)).not.toBeNull();
    expect(container.querySelector('[data-media-unavailable]')).toBeNull();
  });

  /**
   * NON DESTRUCTEUR — la surface remplit son parent (`absolute inset-0`) dans
   * les trois hôtes du fil, et l'état dessiné doit occuper la MÊME place : un
   * `return null` referait s'effondrer la carte autour de lui.
   *
   * C'EST L'HÔTE QUI POSITIONNE, pas l'état dessiné, et le premier jet de ce
   * témoin l'avait à l'envers — il exigeait `absolute inset-0` sur la boîte
   * `data-media-unavailable` elle-même. Les trois surfaces n'ont pas le même
   * contrat de mise en page : le fil remplit un parent positionné, une bulle de
   * message tient dans le flux, une vignette citée fait 44 px de côté. Un état
   * dessiné qui s'imposerait `absolute` serait inutilisable dans deux des trois
   * — donc recopié, donc divergent. Ce qui se garde ici est la PROPRIÉTÉ
   * (« il remplit la place du média »), pas le nom des classes de qui la porte.
   */
  test('l’état dessiné OCCUPE la place du média — la carte autour ne s’effondre pas', () => {
    monter(<FeedMediaSurface media={media()} />);
    act(() => {
      container.querySelector(`img[src="${ABSENT}"]`)!.dispatchEvent(new Event('error'));
    });

    const boîte = container.querySelector('[data-media-unavailable]')!;
    const remplissant = boîte.closest('.absolute.inset-0');
    expect(remplissant).not.toBeNull();
    expect(remplissant!.contains(boîte)).toBe(true);
  });
});

/**
 * LA MÊME LOI SUR LA SURFACE D'UNE STORY (#7022).
 *
 * Le lecteur de story avait DÉJÀ l'état dessiné (`MediaUnavailable`) et déjà
 * un `onFailed` — c'est la seule des trois surfaces qui n'était pas nue. Ce
 * qu'il n'avait pas, c'est la MÉMOIRE : `mediaFailed` vit dans l'état de
 * `story.tsx` et se remet à `false` à chaque changement de story
 * (`story.tsx:426`). Rouvrir la même story, ou y revenir par un retour en
 * arrière dans le carrousel, rejoue donc la requête morte et son 404.
 */
describe('la surface média d’une STORY — #7022', () => {
  beforeAll(async () => {
    await loadInterfaceCatalog('fr');
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetAbsentMedia();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const couche = (extra: { readonly mediaSrc?: string } = {}) => (
    <StoryMediaLayer
      storyId="st-1"
      mediaSrc={extra.mediaSrc ?? ABSENT}
      mimeType="image/jpeg"
      showsMedia
      hasMedia
      background={{}}
      caption={null}
      onReady={() => undefined}
      onFailed={() => undefined}
    />
  );

  test('une source DÉJÀ connue absente ne monte aucune `<img>` — l’état dessiné d’emblée', () => {
    noteMediaAbsent(ABSENT);

    act(() => {
      root.render(couche());
    });

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-media-unavailable]')).not.toBeNull();
  });

  test('l’échec s’enregistre au module — la réouverture de la story n’y revient pas', () => {
    act(() => {
      root.render(couche());
    });

    act(() => {
      container.querySelector('img')!.dispatchEvent(new Event('error'));
    });

    expect(isMediaAbsent(ABSENT)).toBe(true);
  });

  test('une story dont le média est VIVANT charge normalement', () => {
    noteMediaAbsent(ABSENT);
    const vivante = 'https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fvivante.jpg';

    act(() => {
      root.render(couche({ mediaSrc: vivante }));
    });

    expect(container.querySelector(`img[src="${vivante}"]`)).not.toBeNull();
    expect(container.querySelector('[data-media-unavailable]')).toBeNull();
  });
});

/**
 * LA MÊME LOI SUR LA SURFACE D'UN MESSAGE (#7022) — la vignette d'une story
 * CITÉE dans un fil.
 *
 * C'est la surface la plus nue des trois : `<img src={attachmentSrc(…)}>`, sans
 * `onError`, sans repli. Une référence morte y laissait l'icône de lien brisé
 * du navigateur au milieu d'une carte de citation par ailleurs intacte —
 * l'apparence exacte d'un message corrompu, pour un fichier manquant.
 *
 * Le repli DESSINÉ y est `compact` : la carte fait 120 px de large, un libellé
 * y déborderait. L'annonce, elle, reste — elle est portée par la boîte.
 */
describe('la vignette d’une story citée dans un MESSAGE — #7022', () => {
  beforeAll(async () => {
    await loadInterfaceCatalog('fr');
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetAbsentMedia();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  /** `thumbnailUrl` porte la CLÉ de stockage ; `attachmentSrc` la résout. */
  const citation: StoryCitation = {
    id: 'st-9',
    previewText: 'Une story de démonstration',
    thumbnailUrl: '2025/10/68f33afa/disparue.jpg',
    createdAt: new Date('2026-09-18T10:00:00Z').toISOString(),
  };

  const carte = () => (
    <StoryCitationCard citation={citation} accent="#5B5BD6" now={new Date('2026-09-18T12:00:00Z')} />
  );

  /**
   * LA VIGNETTE MORTE RETOMBE SUR L'APERÇU, PAS SUR L'AVEU.
   *
   * Le premier jet de ce témoin exigeait l'état dessiné dès l'échec. Il est
   * tombé en montrant mieux : la carte porte DÉJÀ un repli — `previewText`,
   * le texte de la story — que la vignette ne faisait que RECOUVRIR. Le rendre
   * quand l'image meurt sert du contenu RÉEL, qui existe encore, là où l'état
   * dessiné n'aurait servi que l'aveu qu'il manque une image.
   *
   * **Un témoin mal spécifié qui tombe apprend quelque chose ; le corriger vers
   * ce qu'on croyait n'aurait fait qu'ensevelir un meilleur comportement.**
   */
  test('l’échec retire l’image morte et découvre l’APERÇU de la story — du contenu réel', () => {
    act(() => {
      root.render(carte());
    });

    act(() => {
      container.querySelector('img')!.dispatchEvent(new Event('error'));
    });

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('Une story de démonstration');
  });

  /**
   * L'ÉTAT DESSINÉ N'ARRIVE QU'EN DERNIER — quand il ne reste RIEN à montrer.
   * C'est la seule place où il ajoute quelque chose.
   */
  test('SANS aperçu à découvrir, l’échec rend l’état dessiné COMPACT', () => {
    act(() => {
      root.render(<StoryCitationCard citation={{ ...citation, previewText: '' }} accent="#5B5BD6" now={new Date()} />);
    });

    act(() => {
      container.querySelector('img')!.dispatchEvent(new Event('error'));
    });

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-media-unavailable]')).not.toBeNull();
  });

  /**
   * NON DESTRUCTEUR : la carte porte aussi son libellé (« réponse à sa
   * story ») et sa date. Une vignette morte ne doit rien leur faire — le
   * message reste entier.
   */
  test('la carte AUTOUR reste entière — le libellé et la date survivent à la vignette morte', () => {
    act(() => {
      root.render(carte());
    });
    const avant = container.textContent ?? '';

    act(() => {
      container.querySelector('img')!.dispatchEvent(new Event('error'));
    });

    expect(avant).toContain('story');
    expect(container.textContent).toContain('story');
    expect(container.textContent).toContain('2h');
  });

  test('APRÈS REMONTAGE, la vignette n’est pas redemandée', () => {
    act(() => {
      root.render(carte());
    });
    act(() => {
      container.querySelector('img')!.dispatchEvent(new Event('error'));
    });

    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    act(() => {
      root.render(carte());
    });

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('Une story de démonstration');
  });
});
