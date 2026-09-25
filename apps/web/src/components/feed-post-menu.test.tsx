import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';
import type { PostActionOutcome } from '@/lib/api/publication-actions';
import type { ReportReason } from '@/lib/api/reports';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { FeedPostCard } from './feed-post-card';
import type { PostMenuHost } from './feed-post-menu';

/**
 * LE « ⋯ » EN HAUT À DROITE DES CARTES DU FIL (#7533, directive porteur du
 * 2026-09-23) — sur la carte POST comme sur la carte RÉEL, et chaque entrée a
 * un effet (loi 4).
 */
describe('FeedPostCard — le menu « ⋯ »', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    await loadInterfaceCatalog('fr');
  });
  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.querySelectorAll('[role="menu"]').forEach((node) => node.remove());
  });

  const post = (overrides: Partial<FeedPost> = {}): FeedPost => ({
    id: 'p1',
    type: 'POST',
    createdAt: '2026-09-13T11:55:00.000Z',
    content: 'Bonjour le fil',
    originalLanguage: 'fr',
    author: { id: 'u-other', displayName: 'Nour', username: 'nour' },
    ...overrides,
  });

  const host = (viewerId: string | null, editOutcome: PostActionOutcome | (() => Promise<PostActionOutcome>) = 'done') => {
    const journal: string[] = [];
    const menu: PostMenuHost = {
      viewerId,
      onCopyText: (text) => journal.push(`copy:${text}`),
      onPin: (id) => journal.push(`pin:${id}`),
      onEdit: (id, content) => {
        journal.push(`edit:${id}:${content}`);
        return typeof editOutcome === 'function' ? editOutcome() : Promise.resolve(editOutcome);
      },
      onDelete: (id) => journal.push(`delete:${id}`),
      onReport: (id, reason: ReportReason) => journal.push(`report:${id}:${reason}`),
    };
    return { menu, journal };
  };

  const monte = (feedPost: FeedPost, menu?: PostMenuHost, preferredLanguages: readonly string[] = ['fr']) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <FeedPostCard
          model={resolveFeedCardModel(feedPost, { preferredLanguages, now: new Date('2026-09-13T12:00:00.000Z') })}
          onShare={() => {}}
          onGesture={() => {}}
          {...(menu === undefined ? {} : { menu })}
        />,
      );
    });
  };

  /* Le panneau se charge À LA DEMANDE (`lazy`) : l'import se résout avant
     que le menu ne se peigne. */
  const ouvre = async () => {
    const bouton = container.querySelector<HTMLButtonElement>('[data-feed-post-menu]');
    expect(bouton?.getAttribute('aria-label')).toBe('Plus d’options');
    act(() => bouton?.click());
    await act(async () => {
      await import('./publication-menu-panel');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return [...document.querySelectorAll<HTMLButtonElement>('[data-feed-post-action]')];
  };

  /* « Modifier » ouvre une SECONDE feuille, chargée à la demande de la
     même façon — un import de plus à attendre avant qu'elle ne se peigne. */
  const ouvreEdition = async () => {
    const entrees = await ouvre();
    const modifier = entrees.find((e) => e.dataset.feedPostAction === 'edit');
    act(() => modifier?.click());
    await act(async () => {
      await import('./publication-edit-sheet');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return document.querySelector('[data-publication-edit-sheet]');
  };

  const tape = (champ: HTMLTextAreaElement, texte: string) => {
    act(() => {
      champ.value = texte;
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  test('sans hôte de menu, aucun bouton — un contrôle sans effet n’existe pas', () => {
    monte(post());
    expect(container.querySelector('[data-feed-post-menu]')).toBeNull();
  });

  test('la publication d’un autre : les entrées d’iOS, et « Copier » copie le texte', async () => {
    const { menu, journal } = host('u-me');
    monte(post(), menu);

    const entrees = await ouvre();
    expect(entrees.map((e) => e.dataset.feedPostAction)).toEqual(['open', 'copyText', 'share', 'save', 'report']);

    act(() => entrees.find((e) => e.dataset.feedPostAction === 'copyText')?.click());
    expect(journal).toEqual(['copy:Bonjour le fil']);
  });

  test('MA publication : « Supprimer » part vers l’hôte', async () => {
    const { menu, journal } = host('u-other');
    monte(post(), menu);

    const supprimer = (await ouvre()).find((e) => e.dataset.feedPostAction === 'delete');
    expect(supprimer?.textContent).toContain('Supprimer');
    act(() => supprimer?.click());
    expect(journal).toEqual(['delete:p1']);
  });

  test('« Signaler » demande un MOTIF, et c’est le motif qui part', async () => {
    const { menu, journal } = host('u-me');
    monte(post(), menu);

    const signaler = (await ouvre()).find((e) => e.dataset.feedPostAction === 'report');
    act(() => signaler?.click());
    const motif = document.querySelector<HTMLButtonElement>('[data-report-reason="harassment"]');
    expect(motif).not.toBeNull();
    act(() => motif?.click());
    expect(journal).toEqual(['report:p1:harassment']);
  });

  test('la carte RÉEL porte le même bouton, en haut à droite', () => {
    const { menu } = host('u-me');
    monte(post({ type: 'REEL' }), menu);

    expect(container.querySelector('[data-feed-card="reel"] [data-feed-post-menu]')).not.toBeNull();
  });

  /**
   * **« MODIFIER » LE TEXTE D'UNE PUBLICATION** (#7534) — miroir
   * `FeedPostCard+Header.swift:208-215` : entre Épingler et Supprimer, sans
   * séparateur, et une feuille chargée à la demande qui reste ouverte sur un
   * refus.
   */
  describe('« Modifier »', () => {
    test('MA publication : entre Épingler et Supprimer, sans séparateur avant elle', async () => {
      const { menu } = host('u-other');
      monte(post(), menu);

      const entrees = await ouvre();
      expect(entrees.map((e) => e.dataset.feedPostAction)).toEqual(['open', 'copyText', 'share', 'save', 'pin', 'edit', 'delete']);

      const modifier = entrees.find((e) => e.dataset.feedPostAction === 'edit')!;
      expect(modifier.textContent).toContain('Modifier');
      expect(modifier.style.borderTop).toBe('');
    });

    test('la publication d’un AUTRE n’offre jamais « Modifier »', async () => {
      const { menu } = host('u-me');
      monte(post(), menu);

      expect((await ouvre()).map((e) => e.dataset.feedPostAction)).not.toContain('edit');
    });

    test('ouvre la feuille sur l’ORIGINAL, jamais la traduction affichée (rang ≠ 1)', async () => {
      const { menu } = host('u-other');
      monte(
        post({ originalLanguage: 'es', content: 'La reunión se traslada', translations: { fr: { text: 'La réunion est déplacée' } } }),
        menu,
        ['fr'],
      );

      /* La CARTE affiche le français résolu… */
      expect(container.textContent).toContain('La réunion est déplacée');

      const sheet = await ouvreEdition();
      expect(sheet).not.toBeNull();
      const champ = sheet!.querySelector<HTMLTextAreaElement>('[data-publication-edit-field]');
      /* …le CHAMP, lui, ouvre sur l'espagnol — l'original. */
      expect(champ?.value).toBe('La reunión se traslada');
    });

    test('« Publier » est désactivé à l’ouverture, s’active au changement, se redésactive au retour au texte d’origine', async () => {
      const { menu } = host('u-other');
      monte(post({ content: 'Texte original' }), menu);

      const sheet = await ouvreEdition();
      const champ = sheet!.querySelector<HTMLTextAreaElement>('[data-publication-edit-field]')!;
      const publier = sheet!.querySelector<HTMLButtonElement>('[data-publication-edit-save]')!;
      expect(publier.disabled).toBe(true);

      tape(champ, 'Texte corrigé');
      expect(publier.disabled).toBe(false);

      tape(champ, 'Texte original');
      expect(publier.disabled).toBe(true);
    });

    test('« Publier » appelle l’hôte ; sur `done`, la feuille se ferme et le focus revient au « ⋯ »', async () => {
      const { menu, journal } = host('u-other', 'done');
      monte(post({ content: 'Texte original' }), menu);

      const sheet = await ouvreEdition();
      const champ = sheet!.querySelector<HTMLTextAreaElement>('[data-publication-edit-field]')!;
      tape(champ, 'Texte corrigé');
      const publier = sheet!.querySelector<HTMLButtonElement>('[data-publication-edit-save]')!;

      act(() => publier.click());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(journal).toEqual(['edit:p1:Texte corrigé']);
      expect(document.querySelector('[data-publication-edit-sheet]')).toBeNull();
      expect(document.activeElement).toBe(container.querySelector('[data-feed-post-menu]'));
    });

    test('sur `offline`, la feuille RESTE ouverte, le brouillon est intact, et « Réessayer » rejoue le MÊME texte', async () => {
      const { menu, journal } = host('u-other', 'offline');
      monte(post({ content: 'Texte original' }), menu);

      const sheet = await ouvreEdition();
      const champ = sheet!.querySelector<HTMLTextAreaElement>('[data-publication-edit-field]')!;
      tape(champ, 'Texte corrigé');
      const publier = sheet!.querySelector<HTMLButtonElement>('[data-publication-edit-save]')!;

      act(() => publier.click());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(document.querySelector('[data-publication-edit-sheet]')).not.toBeNull();
      const erreur = document.querySelector('[data-publication-edit-error]');
      expect(erreur).not.toBeNull();
      const retry = erreur?.querySelector<HTMLButtonElement>('[data-publication-edit-retry]');
      expect(retry).not.toBeNull();
      expect(champ.value).toBe('Texte corrigé');

      act(() => retry?.click());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(journal).toEqual(['edit:p1:Texte corrigé', 'edit:p1:Texte corrigé']);
    });

    test('sur `failed`, une erreur SANS bouton de rejeu', async () => {
      const { menu } = host('u-other', 'failed');
      monte(post({ content: 'Texte original' }), menu);

      const sheet = await ouvreEdition();
      const champ = sheet!.querySelector<HTMLTextAreaElement>('[data-publication-edit-field]')!;
      tape(champ, 'Texte corrigé');
      const publier = sheet!.querySelector<HTMLButtonElement>('[data-publication-edit-save]')!;

      act(() => publier.click());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const erreur = document.querySelector('[data-publication-edit-error]');
      expect(erreur).not.toBeNull();
      expect(erreur?.querySelector('[data-publication-edit-retry]')).toBeNull();
    });

    test('« Annuler » ferme SANS appeler l’hôte', async () => {
      const { menu, journal } = host('u-other');
      monte(post(), menu);

      const sheet = await ouvreEdition();
      const annuler = sheet!.querySelector<HTMLButtonElement>('[data-publication-edit-cancel]')!;
      act(() => annuler.click());

      expect(journal).toEqual([]);
      expect(document.querySelector('[data-publication-edit-sheet]')).toBeNull();
    });

    test('PENDANT LE VOL : « Publier », « Annuler » désactivés et le champ en LECTURE SEULE', async () => {
      let resolveOutcome: (value: PostActionOutcome) => void = () => {};
      const pending = new Promise<PostActionOutcome>((resolve) => {
        resolveOutcome = resolve;
      });
      const { menu } = host('u-other', () => pending);
      monte(post({ content: 'Texte original' }), menu);

      const sheet = await ouvreEdition();
      const champ = sheet!.querySelector<HTMLTextAreaElement>('[data-publication-edit-field]')!;
      tape(champ, 'Texte corrigé');
      const publier = sheet!.querySelector<HTMLButtonElement>('[data-publication-edit-save]')!;
      const annuler = sheet!.querySelector<HTMLButtonElement>('[data-publication-edit-cancel]')!;

      act(() => publier.click());

      expect(publier.disabled).toBe(true);
      expect(annuler.disabled).toBe(true);
      expect(champ.readOnly).toBe(true);

      await act(async () => {
        resolveOutcome('done');
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    });
  });
});
