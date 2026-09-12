import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { DetectedLanguage } from '@/lib/send/compose-language';
import type { LanguageDetector } from '@/lib/send/language-detector';

import { COMPOSE_DETECT_DEBOUNCE_MS, useComposeLanguage, type ComposeLanguageSource } from './use-compose-language';

/**
 * `useComposeLanguage` — la pastille dit ce qui partira (#5828, § 4.4).
 * Patron `use-live-announcer.test.tsx` : happy-dom + `createRoot` + `act`,
 * un détecteur INJECTÉ (jamais l'API navigateur ni l'heuristique réelle).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

/** Un détecteur INJECTÉ dont le verdict et le compte d'appels sont observables. */
function fakeDetector(verdictOf: (text: string) => DetectedLanguage | null): LanguageDetector & { calls: number } {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async detect(text: string) {
      calls += 1;
      return verdictOf(text);
    },
  };
}

type Handle = ReturnType<typeof useComposeLanguage>;

function Harness({
  preferred,
  detector,
  onReady,
}: {
  preferred: readonly string[];
  detector: LanguageDetector;
  onReady: (handle: Handle) => void;
}) {
  const handle = useComposeLanguage({ preferred, detector });
  onReady(handle);
  return (
    <div data-language={handle.language} data-source={handle.source}>
      {handle.language}/{handle.source}
    </div>
  );
}

function mount(preferred: readonly string[], detector: LanguageDetector): { el: HTMLDivElement; handleOf: () => Handle } {
  let handle: Handle | null = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <Harness
        preferred={preferred}
        detector={detector}
        onReady={(h) => {
          handle = h;
        }}
      />,
    );
  });
  return { el: container, handleOf: () => handle! };
}

const stateOf = (el: HTMLDivElement): { language: string; source: ComposeLanguageSource } => {
  const node = el.firstElementChild as HTMLDivElement;
  return { language: node.dataset.language ?? '', source: (node.dataset.source ?? '') as ComposeLanguageSource };
};

/** Laisse le débounce (et la promesse du détecteur) s'écouler DANS `act`. */
const passDebounce = () => act(async () => new Promise((r) => setTimeout(r, COMPOSE_DETECT_DEBOUNCE_MS + 60)));

describe('useComposeLanguage — la pastille dit ce qui partira', () => {
  test('au montage, language === preferred[0] et source === "preferred"', () => {
    const { el } = mount(['en', 'fr'], fakeDetector(() => null));
    expect(stateOf(el)).toEqual({ language: 'en', source: 'preferred' });
  });

  test('une détection franche (debounce 300 ms) déplace la pastille — AVANT 300 ms, rien n’a bougé', async () => {
    const detector = fakeDetector((t) => (t.includes('confirm') ? { language: 'en', confidence: 0.97 } : null));
    const { el, handleOf } = mount(['fr', 'en'], detector);

    act(() => {
      handleOf().setText('Do you confirm the mockup?');
    });
    // Moitié basse : avant l'écoulement du débounce, la valeur n'a pas bougé.
    expect(stateOf(el)).toEqual({ language: 'fr', source: 'preferred' });

    await passDebounce();
    expect(stateOf(el)).toEqual({ language: 'en', source: 'detected' });
  });

  test('moins de 4 lettres ⇒ le détecteur n’est PAS appelé (compte = 0)', async () => {
    const detector = fakeDetector(() => ({ language: 'en', confidence: 0.99 }));
    const { handleOf } = mount(['fr'], detector);
    act(() => {
      handleOf().setText('ok');
    });
    await passDebounce();
    expect(detector.calls).toBe(0);
  });

  test('verrou à 10 mots : après un verdict sur ≥ 10 mots, une frappe de plus n’appelle plus le détecteur', async () => {
    const long = 'Do you confirm the full mockup review for tomorrow morning meeting';
    const detector = fakeDetector(() => ({ language: 'en', confidence: 0.97 }));
    const { el, handleOf } = mount(['fr'], detector);

    act(() => {
      handleOf().setText(long);
    });
    await passDebounce();
    expect(stateOf(el).language).toBe('en');
    expect(detector.calls).toBe(1);

    act(() => {
      handleOf().setText(`${long} please`);
    });
    await passDebounce();
    expect(detector.calls).toBe(1); // verrouillé : aucun second appel.
  });

  /**
   * LE RANG « COURANT » (revue-correction #5828) — `ComposerLanguageResolver.resolve`
   * rend `nil` = « current already wins », doc-comment `ComposerModels.swift:141-142` :
   * « Below the confidence floor the helper returns nil — pill stays where it
   * was (no flicker on 2-3 char noise) ». `TextAnalyzer.analyze` vide bien
   * `language`/`languageConfidence` sur un texte vidé (`TextAnalyzer.swift:104-119`),
   * mais `applyDetectedLanguage` ne DÉPLACE alors rien : `currentLanguage`
   * garde la dernière langue ADOPTÉE. Sans ce rang, la pastille retombait sur
   * le rang 1 du LECTEUR dès qu'on effaçait — et un « ok » de suite repartait
   * étiqueté `fr` après un message anglais, le défaut même que #5828 corrige.
   */
  test('setText("") : la dernière langue ADOPTÉE reste (rang courant, iOS « pill stays where it was ») — le verrou, lui, est levé', async () => {
    const long = 'Do you confirm the full mockup review for tomorrow morning meeting';
    const detector = fakeDetector((t) => (t.includes('confirm') ? { language: 'en', confidence: 0.97 } : null));
    const { el, handleOf } = mount(['fr'], detector);

    act(() => {
      handleOf().setText(long);
    });
    await passDebounce();
    expect(stateOf(el).language).toBe('en');

    act(() => {
      handleOf().setText('');
    });
    expect(stateOf(el)).toEqual({ language: 'en', source: 'sticky' });

    act(() => {
      handleOf().setText('Bonjour le monde entier vraiment');
    });
    await passDebounce();
    expect(detector.calls).toBe(2); // le verrou a bien été levé.
  });

  test('un texte trop COURT ne fait pas retomber la pastille : après une détection anglaise, « ok » reste "en"', async () => {
    const detector = fakeDetector((t) => (t.includes('confirm') ? { language: 'en', confidence: 0.97 } : null));
    const { el, handleOf } = mount(['fr', 'en'], detector);

    act(() => {
      handleOf().setText('Do you confirm the mockup?');
    });
    await passDebounce();
    expect(stateOf(el)).toEqual({ language: 'en', source: 'detected' });

    act(() => {
      handleOf().setText('ok');
    });
    await passDebounce();
    expect(stateOf(el)).toEqual({ language: 'en', source: 'sticky' });
  });

  test('une détection SOUS le plancher ne devient PAS le rang courant (0,80 : ni adoptée, ni collante)', async () => {
    const detector = fakeDetector(() => ({ language: 'de', confidence: 0.8 }));
    const { el, handleOf } = mount(['fr'], detector);

    act(() => {
      handleOf().setText('Bitte bestätigen Sie die Vorlage');
    });
    await passDebounce();
    expect(stateOf(el)).toEqual({ language: 'fr', source: 'preferred' });

    act(() => {
      handleOf().setText('');
    });
    expect(stateOf(el)).toEqual({ language: 'fr', source: 'preferred' });
  });

  test('le rang courant CÈDE à une détection franche d’une AUTRE langue', async () => {
    // Marqueurs DISJOINTS : « confirmar » CONTIENT « confirm », et un faux
    // détecteur qui teste une sous-chaîne rendrait l'anglais sur l'espagnol.
    const detector = fakeDetector((t) =>
      t.includes('mockup') ? { language: 'en', confidence: 0.97 } : { language: 'es', confidence: 0.95 },
    );
    const { el, handleOf } = mount(['fr'], detector);

    act(() => {
      handleOf().setText('Do you confirm the mockup?');
    });
    await passDebounce();
    expect(stateOf(el).language).toBe('en');

    act(() => {
      handleOf().setText('Puedes confirmar la maqueta');
    });
    await passDebounce();
    expect(stateOf(el)).toEqual({ language: 'es', source: 'detected' });
  });

  test('choose("de") ⇒ language = "de", source = "chosen" ; une détection ultérieure à 0,99 ne le déplace PAS', async () => {
    const detector = fakeDetector(() => ({ language: 'en', confidence: 0.99 }));
    const { el, handleOf } = mount(['fr'], detector);

    act(() => {
      handleOf().choose('de');
    });
    expect(stateOf(el)).toEqual({ language: 'de', source: 'chosen' });

    act(() => {
      handleOf().setText('Do you confirm the mockup?');
    });
    await passDebounce();
    expect(stateOf(el)).toEqual({ language: 'de', source: 'chosen' });
  });

  test('noteSent() après choose("de") : "de" reste COLLANT, puis une détection ≥ 0,86 le déplace', async () => {
    const detector = fakeDetector((t) => (t.includes('confirm') ? { language: 'en', confidence: 0.9 } : null));
    const { el, handleOf } = mount(['fr'], detector);

    act(() => {
      handleOf().choose('de');
      handleOf().noteSent();
    });
    expect(stateOf(el)).toEqual({ language: 'de', source: 'sticky' });

    act(() => {
      handleOf().setText('Do you confirm the mockup?');
    });
    await passDebounce();
    expect(stateOf(el)).toEqual({ language: 'en', source: 'detected' });
  });

  test('un verdict qui arrive APRÈS que le texte a changé est JETÉ (jeton de génération)', async () => {
    // UNE FILE de résolveurs, un par APPEL — jamais une seule variable
    // réaffectée : sinon « résoudre le premier appel » résout en réalité le
    // SECOND (le seul dont la référence a survécu), et le témoin ne prouve
    // plus rien du jeton de génération.
    const resolvers: ((value: DetectedLanguage | null) => void)[] = [];
    const slow: LanguageDetector = {
      detect: () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    };
    const { el, handleOf } = mount(['fr'], slow);

    act(() => {
      handleOf().setText('Do you confirm the mockup?');
    });
    await act(async () => new Promise((r) => setTimeout(r, COMPOSE_DETECT_DEBOUNCE_MS + 20)));
    expect(resolvers.length).toBe(1);

    // Le texte change AVANT que la première promesse ne réponde.
    act(() => {
      handleOf().setText('Bonjour tout le monde vraiment');
    });
    await act(async () => new Promise((r) => setTimeout(r, COMPOSE_DETECT_DEBOUNCE_MS + 60)));
    expect(resolvers.length).toBe(2);
    const afterSecond = stateOf(el);

    // La PREMIÈRE promesse (périmée) répond seulement maintenant — jamais un
    // effet observable, donc rien à attendre après l'avoir résolue.
    act(() => {
      resolvers[0]?.({ language: 'en', confidence: 0.99 });
    });
    expect(stateOf(el)).toEqual(afterSecond); // aucun effet du verdict périmé.
  });

  test('démontage pendant une détection en vol : aucun setState après démontage', async () => {
    // RACINE LOCALE, DISTINCTE de `container`/`root` (module-level) — ce
    // témoin démonte lui-même AVANT la fin du test, et `afterEach` ne doit
    // pas rappeler `unmount()` sur une racine déjà démontée.
    const localContainer = document.createElement('div');
    document.body.appendChild(localContainer);
    const localRoot = createRoot(localContainer);
    let resolveDetect: ((value: DetectedLanguage | null) => void) | null = null;
    let handle: Handle | null = null;
    const slow: LanguageDetector = {
      detect: () =>
        new Promise((resolve) => {
          resolveDetect = resolve;
        }),
    };
    act(() => {
      localRoot.render(
        <Harness
          preferred={['fr']}
          detector={slow}
          onReady={(h) => {
            handle = h;
          }}
        />,
      );
    });
    act(() => {
      handle!.setText('Do you confirm the mockup?');
    });
    await act(async () => new Promise((r) => setTimeout(r, COMPOSE_DETECT_DEBOUNCE_MS + 20)));

    act(() => {
      localRoot.unmount();
    });
    localContainer.remove();

    // Ne doit lever ni avertir : le hook a vérifié qu'il est démonté.
    await act(async () => {
      resolveDetect?.({ language: 'en', confidence: 0.99 });
      await new Promise((r) => setTimeout(r, 10));
    });

    // Cette racine locale a déjà été démontée : donner à `root`/`container`
    // (les variables partagées par `afterEach`) une paire NEUVE et déjà
    // démontable, pour que le nettoyage commun ne double-démonte rien.
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
});
