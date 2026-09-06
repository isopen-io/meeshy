/**
 * LA VIEW TRANSITION PORTE TROIS PROMESSES (#5440) — `lib/realtime/navigateur.ts`
 * n'attendait que `updateCallbackDone`. Quand une SECONDE navigation appelle
 * `document.startViewTransition()` avant que la PREMIÈRE n'ait atteint son état
 * final, le navigateur ABANDONNE la précédente : ses promesses `ready` et
 * `finished` REJETTENT avec `InvalidStateError`, sans qu'aucun code du module ne
 * les référence — un rejet non attrapé, sur chaque navigation abandonnée.
 *
 * Ce témoin arme une transition dont les TROIS promesses rejettent (le cas le
 * plus sévère : abandonnée avant même `updateCallbackDone`) et prouve qu'AUCUN
 * rejet n'atteint le process — le swap du document doit rester silencieux même
 * quand la transition elle-même est abandonnée par le navigateur.
 */

type TransitionDeTest = {
  readonly ready: Promise<void>;
  readonly updateCallbackDone: Promise<void>;
  readonly finished: Promise<void>;
};

const CADRE_NAVIGABLE = '{"navigable":["/feed"]}';

const HTML_CIBLE =
  '<!doctype html><html><head><title>Fil</title></head>' +
  '<body><main data-participation="feed"><p>contenu</p></main></body></html>';

const monteLeDocument = (): HTMLAnchorElement => {
  document.body.innerHTML =
    `<script type="application/json" id="zone-navigation">${CADRE_NAVIGABLE}</script>` +
    '<div id="annonce-de-zone" role="status"></div>' +
    '<main data-participation="chats"><a href="/feed" class="lien">aller</a></main>';
  return document.querySelector('a.lien') as HTMLAnchorElement;
};

const flush = async (): Promise<void> => {
  for (let tour = 0; tour < 6; tour += 1) {
    await new Promise((resoud) => setTimeout(resoud, 0));
  }
};

describe('la navigation douce attrape les trois promesses de la View Transition', () => {
  let rejetsNonAttrapes: unknown[];
  const surRejetNonAttrape = (raison: unknown): void => {
    rejetsNonAttrapes.push(raison);
  };

  beforeEach(() => {
    rejetsNonAttrapes = [];
    process.on('unhandledRejection', surRejetNonAttrape);
    jest.resetModules();
  });

  afterEach(() => {
    process.off('unhandledRejection', surRejetNonAttrape);
    Reflect.deleteProperty(document, 'startViewTransition');
    (globalThis as { fetch?: unknown }).fetch = undefined;
  });

  it('une transition ABANDONNÉE (ready et finished rejettent) ne laisse aucun rejet non attrapé, et le document bascule quand même', async () => {
    const lien = monteLeDocument();

    (globalThis as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      url: 'http://localhost/feed',
      text: () => Promise.resolve(HTML_CIBLE),
    });

    (document as unknown as { startViewTransition: (rappel: () => void) => TransitionDeTest }).startViewTransition =
      (rappel: () => void): TransitionDeTest => {
        rappel();
        const abandonnee = new DOMException(
          'Transition was aborted because of invalid state',
          'InvalidStateError',
        );
        return {
          ready: Promise.reject(abandonnee),
          updateCallbackDone: Promise.resolve(),
          finished: Promise.reject(abandonnee),
        };
      };

    await import('@/lib/realtime/navigateur');

    lien.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    await flush();

    expect(rejetsNonAttrapes).toEqual([]);
    expect(document.title).toBe('Fil');
    expect(document.querySelector('main')?.getAttribute('data-participation')).toBe('feed');
  });
});
