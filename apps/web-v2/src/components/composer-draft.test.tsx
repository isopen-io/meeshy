import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { Composer } from './composer';
import { createDraftStore, type StorageLike } from '@/lib/send/draft-store';
import { useComposerDraft } from '@/lib/view/use-draft';

/**
 * LE BROUILLON DE `Composer` (#6175) — EXTRAIT de `composer.test.tsx`
 * (revue-correction #6175, défaut majeur 3 : le fichier franchissait le
 * plafond dur de 1200 lignes du CLAUDE.md racine). Découpé PAR
 * RESPONSABILITÉ : ce fichier ne porte que la restauration et le rapport du
 * brouillon (texte, langue, protection, citation) — la citation elle-même,
 * la langue d'écriture au repos, les pièces jointes et l'envoi restent dans
 * `composer.test.tsx`, qui ne les a jamais quittés.
 */

/**
 * LE BROUILLON RESTAURE TEXTE ET LANGUE (#6175) — rendu STATIQUE pour la
 * graine (§ T6 de la spécification), DOM RÉEL pour le rapport de chaque
 * changement (§ T8).
 */
describe('Composer — le brouillon restaure texte ET langue (#6175)', () => {
  test('rendu statique : le champ porte le texte du brouillon, la pastille annonce sa langue', () => {
    const html = renderToStaticMarkup(
      <Composer
        onSend={() => {}}
        preferred={['fr', 'en']}
        draft={{ text: 'Hallo, wie geht es dir?', language: 'de', protection: {} }}
      />,
    );
    expect(html).toContain('Hallo, wie geht es dir?');
    expect(html).toMatch(/aria-label="Langue d’écriture : (allemand|Deutsch|German)"/);
  });

  test('sans brouillon, le champ est vide et la pastille reste au rang 1 du lecteur', () => {
    const html = renderToStaticMarkup(<Composer onSend={() => {}} preferred={['en', 'fr']} />);
    expect(html).not.toContain('Hallo');
    expect(html).toMatch(/aria-label="Langue d’écriture : (anglais|English)"/);
  });

  describe('DOM réel', () => {
    const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

    beforeAll(() => {
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

    afterEach(() => {
      act(() => {
        root.unmount();
      });
      container.remove();
    });

    type DraftReport = { text: string; language: string; protection: Record<string, unknown>; replyToId?: string };

    const mountWithDraft = (onDraftChange: (r: DraftReport) => void) => {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      act(() => {
        root.render(
          <Composer
            onSend={() => {}}
            preferred={['fr']}
            draft={{ text: 'reprise', language: 'de', protection: {} }}
            onDraftChange={onDraftChange}
          />,
        );
      });
      return container;
    };

    test('envoyer ⇒ onSend porte la langue restaurée ("de"), jamais le rang 1 du lecteur', () => {
      let sentLanguage: string | null = null;
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      act(() => {
        root.render(
          <Composer
            onSend={(p) => {
              sentLanguage = p.language;
            }}
            preferred={['fr']}
            draft={{ text: 'reprise', language: 'de', protection: {} }}
          />,
        );
      });
      act(() => {
        container.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
      });
      expect(sentLanguage).toBe('de');
    });

    test('chaque changement de texte est rapporté à onDraftChange, langue et protection incluses', () => {
      const reports: DraftReport[] = [];
      const el = mountWithDraft((r) => reports.push(r));
      const field = el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;

      act(() => {
        field.value = 'reprise encore';
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });

      const last = reports[reports.length - 1]!;
      expect(last.text).toBe('reprise encore');
      expect(last.language).toBe('de');
      expect(last.protection).toEqual({});
    });

    test('armer le flou ⇒ rapporté à onDraftChange', () => {
      const reports: DraftReport[] = [];
      const el = mountWithDraft((r) => reports.push(r));
      act(() => {
        el.querySelector<HTMLButtonElement>('[data-composer-blur]')!.click();
      });
      const last = reports[reports.length - 1]!;
      expect(last.protection).toEqual({ blurred: true });
    });

    test('envoi ⇒ rapporté VIDE (purge du brouillon)', () => {
      const reports: DraftReport[] = [];
      const el = mountWithDraft((r) => reports.push(r));
      act(() => {
        el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
      });
      const last = reports[reports.length - 1]!;
      expect(last.text).toBe('');
      expect(last.protection).toEqual({});
    });
  });
});

/**
 * L'INTÉGRATION `useComposerDraft` + `Composer` REPRODUIT LE MONTAGE DE
 * `thread.tsx` (#6175) — `Composer` capture `draft.text` dans un `useState`
 * PARESSEUX (le champ est un contrôle NON contrôlé) : si la graine
 * n'atteignait `Composer` qu'UN RENDU APRÈS son montage (motif à effet, comme
 * `usePersistedReadingMode`), le premier montage verrait TOUJOURS un champ
 * vide, quel que soit le brouillon persisté — exactement le défaut qu'une
 * lecture SYNCHRONE (`useMemo`, `use-draft.ts`) évite. Ce témoin monte les
 * DEUX hooks ENSEMBLE, avec la MÊME transition que `thread.tsx` : la
 * conversation passe de `undefined` à résolue EN MÊME TEMPS que `Composer`
 * apparaît pour la première fois (jamais monté puis re-seedé).
 */
describe('useComposerDraft + Composer — la graine atteint le PREMIER montage, pas le second (#6175)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
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

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function fakeStorage(initial: Record<string, string>): StorageLike {
    const data: Record<string, string> = { ...initial };
    return {
      getItem: (key) => data[key] ?? null,
      setItem: (key, value) => {
        data[key] = value;
      },
      removeItem: (key) => {
        delete data[key];
      },
    };
  }

  function ThreadLike({ conversationId }: { readonly conversationId: string | undefined }) {
    const { initial, report } = useComposerDraft({ store: sharedStore, scope: 'u_a', conversationId });
    // `conversationId === undefined` : thread.tsx ne rend PAS le fil (retour
    // anticipé sur le squelette) — le témoin reproduit exactement cette
    // asymétrie, jamais un Composer monté à vide « en attendant ».
    if (conversationId === undefined) return null;
    return <Composer onSend={() => {}} preferred={['fr']} draft={initial} onDraftChange={report} />;
  }

  // Le magasin PARTAGÉ entre les deux rendus (motif `use-persisted-mode.test.tsx`,
  // `backend` partagé) — une variable de MODULE, jamais reconstruite à chaque
  // rendu de `ThreadLike` (sinon chaque render verrait un magasin vide et
  // invaliderait ce que ce témoin prouve).
  let sharedStore: ReturnType<typeof createDraftStore>;

  test('la conversation résolue DIRECTEMENT (jamais vue undefined avant) : le champ porte le texte au PREMIER rendu qui monte Composer', () => {
    sharedStore = createDraftStore(fakeStorage({ 'meeshy.draft.u_a.c1': JSON.stringify({ text: 'Hallo zusammen', language: 'de', protection: {} }) }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // UN SEUL rendu : `conversationId` est déjà résolu au montage, exactement
    // comme `thread.tsx` qui ne rend le fil qu'une fois la conversation en
    // cache (jamais un premier rendu à `undefined` suivi d'un second à `c1`).
    act(() => {
      root.render(<ThreadLike conversationId="c1" />);
    });

    const field = container.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]');
    expect(field).not.toBeNull();
    expect(field!.value).toBe('Hallo zusammen');
    expect(container.querySelector('[data-composer-language="de"]')).not.toBeNull();
  });

  test('la conversation NON résolue puis résolue (le cas réel de thread.tsx) : Composer monte directement avec le texte, jamais vide-puis-rempli', () => {
    sharedStore = createDraftStore(fakeStorage({ 'meeshy.draft.u_a.c1': JSON.stringify({ text: 'reprise', language: 'fr', protection: {} }) }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(<ThreadLike conversationId={undefined} />);
    });
    expect(container.querySelector('[aria-label="Écrire un message"]')).toBeNull(); // squelette, pas de Composer.

    act(() => {
      root.render(<ThreadLike conversationId="c1" />);
    });
    const field = container.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]');
    expect(field).not.toBeNull();
    // AU PREMIER RENDU où `Composer` existe, le texte est DÉJÀ là — jamais
    // vide puis rempli un rendu plus tard.
    expect(field!.value).toBe('reprise');
  });
});
