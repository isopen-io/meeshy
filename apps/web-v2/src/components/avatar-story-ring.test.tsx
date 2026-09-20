import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Avatar } from './avatar';

/**
 * **L'AVATAR PORTE L'ANNEAU DE STORY, ET L'ANNEAU OUVRE LA STORY** (#7185,
 * directive porteur du 2026-09-20).
 *
 * ## Ce que la mesure d'ouverture disait
 *
 * L'anneau EXISTAIT, mais seulement dans le rail — et recopié trois fois
 * (`story-rail.tsx`, `story-rail-self-tile.tsx`, `routes/stories.tsx`). Nulle
 * part ailleurs : aucun anneau sur l'avatar d'une carte du fil, d'une rangée de
 * conversation, d'un commentaire ou d'une notification. Le doc-comment du
 * composant l'annonçait d'ailleurs comme un enfant à venir (« l'anneau de story
 * et le badge d'humeur annoncés par D-32 §4 »).
 *
 * Et il n'était pas de la couleur demandée : les trois recopies posent
 * `--color-ios-brand` EN DUR, la même pour tout le monde.
 *
 * ## DEUX RÈGLES QUE CES TÉMOINS TIENNENT
 *
 * 1. **L'anneau est de la couleur de SON utilisateur** — `color`, l'accent que
 *    `authorAccentColor` dérive de l'identifiant. D-93 l'autorise ici et
 *    l'interdirait sur un texte : cet accent descend sous AA (4,22:1 en
 *    sombre), et l'article réserve justement l'accent à « là où il ne porte
 *    aucun texte — le dégradé de bannière et l'avatar ».
 * 2. **Un anneau implique une destination**, et elle PRIME sur le profil : un
 *    avatar ne peut pas mener à deux endroits, et l'anneau est ce que le
 *    lecteur voit.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const ACCENT = '#4455ff';

const avatar = (props: Record<string, unknown>) =>
  renderToStaticMarkup(<Avatar initials="NO" color={ACCENT} size={40} name="Nour" {...props} />);

describe('l’anneau ne se peint que s’il a une story à ouvrir', () => {
  /** LE CONTRE-TÉMOIN DE LA LOI 4 — sans lui, un anneau posé
      inconditionnellement annoncerait une story à tout le monde, et chaque
      avatar de l'application mentirait. */
  test('sans story, aucun anneau', () => {
    expect(avatar({})).not.toContain('data-story-ring');
  });

  test('avec une story non vue, l’anneau est là et le DIT', () => {
    const html = avatar({ storyRing: { entryStoryId: 'st-1', unseen: true } });

    expect(html).toContain('data-story-ring="unseen"');
  });

  /** L'ÉTAT VU N'EST PAS UNE ABSENCE : la story s'ouvre toujours, l'anneau
      change seulement d'intensité. */
  test('une story déjà vue garde son anneau, atténué', () => {
    const html = avatar({ storyRing: { entryStoryId: 'st-1', unseen: false } });

    expect(html).toContain('data-story-ring="seen"');
    expect(html).toContain('color-mix');
  });
});

describe('et il est de la couleur de SON utilisateur, pas de la marque', () => {
  test('l’accent de l’auteur peint l’anneau', () => {
    const html = avatar({ storyRing: { entryStoryId: 'st-1', unseen: true } });

    expect(html).toContain(ACCENT);
    expect(html).not.toContain('--color-ios-brand');
  });

  /**
   * LA GÉOMÉTRIE VIENT DU SITE UNIQUE — `railStroke` double le trait pour une
   * story non vue (miroir `MeeshyAvatar.swift:167-175`). Le témoin mesure
   * l'ÉCART entre les deux états plutôt qu'une valeur gravée : c'est la règle
   * qui compte, et une valeur recopiée ici dériverait du jour où le site unique
   * changerait.
   */
  test('le trait est plus épais quand il reste du non-vu', () => {
    const traitDe = (unseen: boolean): number => {
      const html = avatar({ storyRing: { entryStoryId: 'st-1', unseen } });
      const m = /inset 0 0 0 ([\d.]+)px/.exec(html);
      return m === null ? 0 : Number(m[1]);
    };

    expect(traitDe(true)).toBeGreaterThan(traitDe(false));
  });
});

describe('l’anneau OUVRE la story, et prime sur le profil', () => {
  test('l’avatar mène à la story d’entrée', () => {
    const html = avatar({ storyRing: { entryStoryId: 'st-entree', unseen: true } });

    expect(html).toContain('href="/story/st-entree"');
  });

  /**
   * LA RÈGLE DE PRIORITÉ, et c'est le témoin qui la porte : un avatar qui
   * porterait les DEUX destinations n'en a qu'une à offrir. L'anneau gagne
   * parce qu'il est VISIBLE — il annonce ce qu'il ouvre.
   */
  test('avec une story ET un pseudo, c’est la story qui ouvre', () => {
    const html = avatar({ storyRing: { entryStoryId: 'st-1', unseen: true }, profileUsername: 'nour' });

    expect(html).toContain('href="/story/st-1"');
    expect(html).not.toContain('/u/nour');
  });

  test('et le lien dit ce qu’il ouvre — jamais « voir le profil » sur une story', () => {
    const html = avatar({ storyRing: { entryStoryId: 'st-1', unseen: true }, profileUsername: 'nour' });

    expect(html).toContain('aria-label="Voir la story de Nour"');
  });

  /** Sans anneau, le profil reprend la main — la règle est une PRIORITÉ, pas
      un remplacement. */
  test('sans story, le pseudo ouvre toujours le profil', () => {
    const html = avatar({ profileUsername: 'nour' });

    expect(html).toContain('href="/u/nour"');
    expect(html).toContain('aria-label="Voir le profil de Nour"');
  });
});
