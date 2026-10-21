import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { closeMoodPeek, registerMoodPeekHost } from '@/lib/view/mood-peek';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Avatar } from './avatar';

/**
 * **L'HUMEUR SE TOUCHE, SE LIT À VOIX HAUTE, ET NE BOUGE PAS DANS UNE LISTE**
 * (#10528, directive porteur du 2026-10-13).
 *
 * Mesure d'ouverture : la pastille existait déjà sur la rangée d'un direct,
 * l'en-tête du fil et l'avatar d'un auteur (#9065), mais elle était
 * `pointer-events-none` et `aria-hidden` partout — on ne pouvait ni la
 * toucher ni l'entendre — et elle respirait (`mood-breathe`) dans les deux
 * listes.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const hosts: Array<() => void> = [];
const withHost = () => {
  hosts.push(registerMoodPeekHost());
};

afterEach(() => {
  closeMoodPeek();
  hosts.splice(0).forEach((release) => release());
});

const avatar = (props: Record<string, unknown>) =>
  renderToStaticMarkup(<Avatar initials="NO" color="#4455ff" size={44} name="Nour" {...props} />);

describe('dans une liste, la pastille ne s’anime pas', () => {
  test('par défaut, elle respire', () => {
    expect(avatar({ mood: '🎉' })).toContain('mood-breathe');
  });

  test('posée immobile, elle ne porte aucune classe de mouvement', () => {
    const html = avatar({ mood: '🎉', moodStill: true, here: true, hereActive: true });

    expect(html).toContain('data-mood="🎉"');
    expect(html).not.toContain('mood-breathe');
    expect(html).not.toContain('mood-stir');
    expect(html).not.toContain('mood-hush');
    expect(html).not.toContain('mood-enter');
  });
});

describe('le lecteur d’écran entend l’humeur avec le nom', () => {
  test('sans photo, le libellé des initiales porte l’humeur', () => {
    expect(avatar({ mood: '🎉' })).toContain('aria-label="Nour, humeur 🎉"');
  });

  test('avec une photo, c’est son texte de remplacement', () => {
    expect(avatar({ mood: '🎉', src: 'https://cdn.example/n.png' })).toContain('alt="Nour, humeur 🎉"');
  });

  test('sans humeur, le libellé reste le nom', () => {
    expect(avatar({})).toContain('aria-label="Nour"');
  });
});

describe('toucher l’humeur ouvre l’humeur', () => {
  test('sans auteur désigné, la pastille reste un dessin', () => {
    withHost();
    expect(avatar({ mood: '🎉' })).not.toContain('data-mood-peek');
  });

  test('sans hôte monté, aucun bouton ne promet un effet qu’il n’a pas', () => {
    expect(avatar({ mood: '🎉', moodAuthorId: 'u-nour' })).not.toContain('data-mood-peek');
  });

  test('sans humeur, aucun bouton', () => {
    withHost();
    expect(avatar({ moodAuthorId: 'u-nour' })).not.toContain('data-mood-peek');
  });

  test('avec un auteur et un hôte, un bouton nommé d’au moins 44 px', () => {
    withHost();
    const html = avatar({ mood: '🎉', moodAuthorId: 'u-nour' });

    expect(html).toContain('data-mood-peek="u-nour"');
    expect(html).toContain('aria-label="Humeur de Nour"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toMatch(/data-mood-peek="u-nour"[^>]*style="[^"]*width:44px;height:44px/);
  });

  test('le bouton est le FRÈRE du lien de profil, jamais son enfant', () => {
    withHost();
    const html = avatar({ mood: '🎉', moodAuthorId: 'u-nour', profileUsername: 'nour' });
    const link = html.slice(html.indexOf('<a '), html.indexOf('</a>'));

    expect(link).toContain('data-mood="🎉"');
    expect(link).not.toContain('data-mood-peek');
    expect(html).toContain('data-mood-peek="u-nour"');
  });
});
