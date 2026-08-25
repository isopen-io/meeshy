/**
 * Task W8, Step 2 — la surface REPOST, loi 5 (« le repost miroite ; changer
 * de format est l'ANCRAGE »).
 *
 * Ce que cette suite verrouille, cas par cas cités à la ligne du plan
 * (`docs/superpowers/plans/2026-08-24-meeshy-composer-v2-lot-6.md`, Task W8
 * Step 2) :
 *
 *  2. `targetType` suit le format ACTUELLEMENT sélectionné dans l'éventail —
 *     par défaut celui de la CARTE agie (`door.sourceFormat`), et le geste de
 *     choisir un autre format dans le fan est ce qui le change ;
 *  3. reposter un RÉEL ou une STORY offre l'ancrage `post` dans l'éventail ;
 *     reposter un POST ne l'offre pas deux fois (le fan ne se peint même
 *     pas — une seule entrée) ;
 *  4. la citation porte le MÊME `targetType` que le repost sec, pour le même
 *     format sélectionné.
 *
 * Ce fichier teste `ComposerRepostSurface` DIRECTEMENT (composant réel, non
 * mocké) — même niveau que `meeshy-composer-post.test.tsx` pour la surface
 * document. Le CÂBLAGE des six surfaces (les quatre montages hérités +
 * `StoryViewer.tsx:1291`/`:1303`) est prouvé par les suites de site
 * (`PostsFeedScreen.repostTargetType.test.tsx`, etc.), pas ici.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

import { ComposerRepostSurface } from '@/components/composer/ComposerRepostSurface';
import { MeeshyComposer } from '@/components/composer/MeeshyComposer';
import type { ComposerRepostPayload } from '@/components/composer/payload';

function selectFormat(format: string): void {
  fireEvent.click(screen.getByTestId(`composer-format-${format}`));
}

function submit(): void {
  fireEvent.click(screen.getByTestId('composer-repost-submit'));
}

describe('ComposerRepostSurface — le repost miroite, changer de format est l’ancrage', () => {
  it('un repost sec de RÉEL envoie targetType REEL par défaut, sans content', () => {
    const onRepost = jest.fn<void, [ComposerRepostPayload]>();
    render(<ComposerRepostSurface door={{ kind: 'repost', sourceFormat: 'reel' }} onRepost={onRepost} />);

    submit();
    expect(onRepost).toHaveBeenCalledWith({ targetType: 'REEL', isQuote: false });
  });

  it("l'éventail offre l'ancrage POST pour un repost de RÉEL — inatteignable avant ce lot", () => {
    const onRepost = jest.fn<void, [ComposerRepostPayload]>();
    render(<ComposerRepostSurface door={{ kind: 'repost', sourceFormat: 'reel' }} onRepost={onRepost} />);

    expect(screen.getByTestId('composer-format-reel')).toBeInTheDocument();
    expect(screen.getByTestId('composer-format-post')).toBeInTheDocument();

    selectFormat('post');
    submit();
    expect(onRepost).toHaveBeenCalledWith({ targetType: 'POST', isQuote: false });
  });

  it("l'éventail offre l'ancrage POST pour un repost de STORY", () => {
    const onRepost = jest.fn<void, [ComposerRepostPayload]>();
    render(<ComposerRepostSurface door={{ kind: 'repost', sourceFormat: 'story' }} onRepost={onRepost} />);

    selectFormat('post');
    submit();
    expect(onRepost).toHaveBeenCalledWith({ targetType: 'POST', isQuote: false });
  });

  it("reposter un POST n'offre pas l'ancrage deux fois — aucun éventail peint", () => {
    render(
      <ComposerRepostSurface door={{ kind: 'repost', sourceFormat: 'post' }} onRepost={jest.fn()} />,
    );
    expect(screen.queryByTestId('composer-format-fan')).not.toBeInTheDocument();
  });

  it('la citation porte le MÊME targetType que le repost sec, avec son content trimmé', () => {
    const onRepost = jest.fn<void, [ComposerRepostPayload]>();
    render(<ComposerRepostSurface door={{ kind: 'repost', sourceFormat: 'reel' }} onRepost={onRepost} />);

    fireEvent.click(screen.getByRole('tab', { name: 'composer.repost.quote' }));
    fireEvent.change(screen.getByLabelText('composer.repost.contentLabel'), {
      target: { value: '  mon commentaire  ' },
    });
    submit();

    expect(onRepost).toHaveBeenCalledWith({ targetType: 'REEL', isQuote: true, content: 'mon commentaire' });
  });

  it("la citation suit AUSSI l'ancrage choisi dans l'éventail", () => {
    const onRepost = jest.fn<void, [ComposerRepostPayload]>();
    render(<ComposerRepostSurface door={{ kind: 'repost', sourceFormat: 'reel' }} onRepost={onRepost} />);

    selectFormat('post');
    fireEvent.click(screen.getByRole('tab', { name: 'composer.repost.quote' }));
    fireEvent.change(screen.getByLabelText('composer.repost.contentLabel'), {
      target: { value: 'ancré' },
    });
    submit();

    expect(onRepost).toHaveBeenCalledWith({ targetType: 'POST', isQuote: true, content: 'ancré' });
  });

  it('la citation bloque tant que le texte est vide', () => {
    const onRepost = jest.fn();
    render(<ComposerRepostSurface door={{ kind: 'repost', sourceFormat: 'post' }} onRepost={onRepost} />);

    fireEvent.click(screen.getByRole('tab', { name: 'composer.repost.quote' }));
    submit();
    expect(onRepost).not.toHaveBeenCalled();
  });

  it("montre l'aperçu de l'original quand il est fourni", () => {
    render(
      <ComposerRepostSurface
        door={{ kind: 'repost', sourceFormat: 'post' }}
        original={{ author: 'Bob', content: 'Contenu original' }}
        onRepost={jest.fn()}
      />,
    );
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Contenu original')).toBeInTheDocument();
  });
});

/**
 * Constat MINEUR (revue adversariale) — `composer.repost.posting` n'était
 * lisible que via `ComposerRepostSurface.saving`, une prop qu'AUCUN des
 * quatre hôtes (`app/reel/[postId]/page.tsx`, `app/feeds/post/[postId]/page.tsx`,
 * `ReelsFeedScreen.tsx`, `PostsFeedScreen.tsx`) ne câblait — la clé était
 * gardée par `composer-i18n-keys.test.ts` sans qu'aucun pixel ne la rende. Le
 * meuble est le site UNIQUE de la CASCADE : `MeeshyComposer.repostSaving` →
 * `ComposerRepostSurface.saving`. Les quatre hôtes passent déjà `isReposting`
 * (`useComposerRepost().isPending`) sur `disabled` ; ce test prouve que la
 * MÊME valeur, une fois câblée sur `repostSaving`, atteint le libellé.
 */
describe('MeeshyComposer (porte repost) — repostSaving atteint le libellé du bouton', () => {
  it('repostSaving=true rend `composer.repost.posting`, jamais le libellé statique', () => {
    render(
      <MeeshyComposer
        door={{ kind: 'repost', sourceFormat: 'post' }}
        onPublish={jest.fn()}
        onRepost={jest.fn()}
        repostSaving
      />,
    );

    expect(screen.getByTestId('composer-repost-submit')).toHaveTextContent('composer.repost.posting');
  });

  it('repostSaving absent (ou faux) laisse le libellé statique inchangé', () => {
    render(
      <MeeshyComposer door={{ kind: 'repost', sourceFormat: 'post' }} onPublish={jest.fn()} onRepost={jest.fn()} />,
    );

    expect(screen.getByTestId('composer-repost-submit')).toHaveTextContent('repost');
  });
});
