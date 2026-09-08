/**
 * LE MODULE DE LECTURE, MONTÉ (#5388) — ce que la DÉCISION pure
 * (`reels-lecture.test.ts`) ne peut pas dire : ce que le module BRANCHE, ce
 * qu'il RELÂCHE, et combien de fois il le fait.
 *
 * Trois faits que seule une exécution peut prouver, et que le e2e ne voyait
 * pas (il ne compte que des `<video>`) :
 *
 *  1. **UN SEUL MONTAGE PAR ÉCRAN.** Le navigateur de zone (`navigateur.ts`,
 *     `monteLeModule`) `import()` le module PUIS appelle `monte()` : à la
 *     PREMIÈRE traversée douce vers `/feed/reels`, l'auto-démarrage de
 *     l'évaluation et l'appel explicite montent le MÊME `<main>` deux fois.
 *     Deux jeux d'écouteurs sur `document`, deux `observeCycleDeVie`, et une
 *     seule flèche qui fait DEUX pas de file. `unSeulMontageParEcran`
 *     (`lifecycle.ts`, le site unique) est ce qui ferme cette fenêtre.
 *  2. **LE DÉCODEUR EST RENDU À LA DESTRUCTION**, et les écouteurs de geste —
 *     posés sur `document`, donc hors du nettoyage qu'offre le remplacement de
 *     `<main>` — partent avec lui.
 *  3. **LE RETOUR ARRIÈRE EST UNE PILE, PAS UN LOQUET.** Le document ne rend
 *     AUCUN tap « précédente » (`reels-porte.ts`) : le geste ne doit reculer
 *     que sur ce que le module a lui-même avancé, et cesser d'agir une fois
 *     revenu au point d'entrée — sans quoi une flèche haut de plus fait sortir
 *     le lecteur de la file, vers l'écran d'où il venait.
 */

const HTML_DE_LECRAN =
  '<main id="main-content" class="story-ecran" data-participation="reels">' +
  '<video controls preload="none" src="https://cdn.meeshy.test/reel-1.mp4"></video>' +
  '<a class="tap suivante" href="/feed/reels?cursor=c2">Réel suivant</a>' +
  '</main>';

type MediaEspionne = {
  readonly joue: jest.Mock;
  readonly pause: jest.Mock;
  readonly charge: jest.Mock;
};

const espionneLeMedia = (): MediaEspionne => {
  const joue = jest.fn(() => Promise.resolve());
  const pause = jest.fn();
  const charge = jest.fn();
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, writable: true, value: joue });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, writable: true, value: pause });
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, writable: true, value: charge });
  return { joue, pause, charge };
};

const clicsSurLeTap = (): { readonly compte: () => number } => {
  let compte = 0;
  document.querySelector('a.tap.suivante')?.addEventListener('click', (evenement) => {
    // Le tap est un VRAI lien : jsdom refuserait la navigation en bruit de fond.
    evenement.preventDefault();
    compte += 1;
  });
  return { compte: () => compte };
};

const fleche = (touche: string): void => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: touche, bubbles: true }));
};

/**
 * LA PREMIÈRE TRAVERSÉE DOUCE, telle que `navigateur.ts` la joue : le module
 * est ÉVALUÉ (son auto-démarrage court), puis son export `monte()` est appelé
 * sur le même `<main>`.
 */
const monteCommeLeNavigateur = async (): Promise<void> => {
  const charge = (await import('@/lib/realtime/reels')) as { readonly monte: () => void };
  charge.monte();
};

describe('le module de lecture des réels, monté', () => {
  let media: MediaEspionne;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = HTML_DE_LECRAN;
    media = espionneLeMedia();
  });

  afterEach(() => {
    // La destruction retire les écouteurs que ce module a posés sur `document` :
    // sans elle, un témoin déteindrait sur le suivant.
    window.dispatchEvent(new Event('meeshy:zone-depart'));
    document.body.innerHTML = '';
  });

  it('l’autolecture est demandée MUETTE, en boucle, et sur place', async () => {
    await monteCommeLeNavigateur();

    const video = document.querySelector('video');
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(media.joue).toHaveBeenCalledTimes(1);
  });

  it('une flèche vers le bas fait UN pas de file, même monté comme le navigateur de zone le monte', async () => {
    const taps = clicsSurLeTap();
    await monteCommeLeNavigateur();

    fleche('ArrowDown');

    expect(taps.compte()).toBe(1);
  });

  it('la destruction relâche le décodeur ET retire les écouteurs de geste', async () => {
    const taps = clicsSurLeTap();
    await monteCommeLeNavigateur();

    window.dispatchEvent(new Event('meeshy:zone-depart'));

    const video = document.querySelector('video');
    expect(media.pause).toHaveBeenCalled();
    expect(video?.hasAttribute('src')).toBe(false);
    expect(media.charge).toHaveBeenCalled();

    fleche('ArrowDown');
    expect(taps.compte()).toBe(0);
  });

  it('le masquage de l’onglet met la vidéo en pause — un onglet caché ne décode pas', async () => {
    await monteCommeLeNavigateur();
    media.pause.mockClear();

    const visibilite = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(media.pause).toHaveBeenCalledTimes(1);
    visibilite.mockRestore();
  });

  it('le retour arrière ne part que sur ce que le module a avancé, et s’arrête au point d’entrée', async () => {
    const taps = clicsSurLeTap();
    const enArriere = jest.spyOn(window.history, 'back').mockImplementation(() => {});
    await monteCommeLeNavigateur();

    // AUCUNE avance : la flèche haut est inerte — le document ne sert aucun
    // tap « précédente », la fabriquer sortirait de la file.
    fleche('ArrowUp');
    expect(enArriere).not.toHaveBeenCalled();

    fleche('ArrowDown');
    expect(taps.compte()).toBe(1);

    fleche('ArrowUp');
    expect(enArriere).toHaveBeenCalledTimes(1);

    // REVENU AU POINT D'ENTRÉE : la pile est vide, le geste redevient inerte.
    fleche('ArrowUp');
    expect(enArriere).toHaveBeenCalledTimes(1);

    enArriere.mockRestore();
  });

  it('un tap MANUEL sur « Réel suivant » compte comme une avance — le retour arrière ne refuse pas ce que le doigt a fait', async () => {
    const enArriere = jest.spyOn(window.history, 'back').mockImplementation(() => {});
    clicsSurLeTap();
    await monteCommeLeNavigateur();

    document.querySelector<HTMLAnchorElement>('a.tap.suivante')?.click();

    fleche('ArrowUp');
    expect(enArriere).toHaveBeenCalledTimes(1);

    enArriere.mockRestore();
  });

  it('rentrer dans la file par sa TÊTE remet la pile à zéro — un compte périmé ne fait pas sortir de la file', async () => {
    const enArriere = jest.spyOn(window.history, 'back').mockImplementation(() => {});
    clicsSurLeTap();
    await monteCommeLeNavigateur();

    fleche('ArrowDown');

    // LE LECTEUR QUITTE LA FILE PUIS Y REVIENT PAR SA TÊTE (`/feed/reels`,
    // sans curseur) : le module, lui, n'a pas été réévalué.
    window.dispatchEvent(new Event('meeshy:zone-depart'));
    document.body.innerHTML = HTML_DE_LECRAN;
    const charge = (await import('@/lib/realtime/reels')) as { readonly monte: () => void };
    charge.monte();

    fleche('ArrowUp');
    expect(enArriere).not.toHaveBeenCalled();

    enArriere.mockRestore();
  });

  it('un onglet d’ARRIÈRE-PLAN ne tire aucun média — et la reprise le rattrape', async () => {
    const visibilite = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await monteCommeLeNavigateur();

    // MONTÉ CACHÉ : rien ne part. `play()` sur `preload="none"` déclencherait
    // le téléchargement du média, contre le gate « onglet caché ⇒ ZÉRO
    // requête » (§ 8.5) — et pour un écran que personne ne regarde.
    expect(media.joue).not.toHaveBeenCalled();

    visibilite.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(media.joue).toHaveBeenCalledTimes(1);

    visibilite.mockRestore();
  });

  it('le retour de l’onglet REPREND la lecture — un réel ne reste pas mort derrière un masquage', async () => {
    await monteCommeLeNavigateur();
    media.joue.mockClear();

    const visibilite = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(media.joue).not.toHaveBeenCalled();

    visibilite.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(media.joue).toHaveBeenCalledTimes(1);

    visibilite.mockRestore();
  });
});
