import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { PRESENCE_HERE_HEX, PRESENCE_HEX, presenceTone } from '@meeshy/shared/utils/user-presence';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Avatar } from './avatar';

/**
 * **L'AVATAR PORTE L'HUMEUR DU MOMENT, ET MASQUE ALORS LA PRÉSENCE** (#7186,
 * directive porteur du 2026-09-20).
 *
 * ## La mesure d'ouverture
 *
 * Le mood existe de bout en bout — `Post` de type `STATUS`, éphémère à une
 * heure, servi par `?scope=statuses` — et l'animation `mood-breathe` n'était
 * PAS orpheline comme un premier examen le laissait croire : elle sert le rail
 * (`story-rail-self-tile.tsx:203`, `story-rail.tsx:216`).
 *
 * Mais `components/avatar.tsx` n'en portait aucune trace. Sur iOS, la pastille
 * se pose au coin de TOUT avatar (`MeeshyAvatar.swift:384`) ; ici, elle
 * n'existait que dans le rail. C'était l'écart exact avec la cible.
 *
 * ## LE TÉMOIN QUI COMPTE FAIT VARIER LES DEUX SIGNAUX ENSEMBLE
 *
 * Présence et mood se disputent le MÊME coin. Un témoin qui ne ferait varier
 * qu'un seul des deux ne pourrait pas voir le masquage — et une dimension
 * qu'aucun témoin ne fait VARIER est absente, pas « testée par défaut ».
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const avatar = (props: Record<string, unknown>) =>
  renderToStaticMarkup(<Avatar initials="NO" color="#4455ff" size={40} name="Nour" {...props} />);

/** La balise du GLYPHE du mood — celle qui porte le contour. */
const glyph = (html: string): string => {
  const start = html.indexOf('data-mood-glyph');
  return start < 0 ? '' : html.slice(html.lastIndexOf('<', start), html.indexOf('>', start) + 1);
};

describe('la pastille ne se peint que s’il y a une humeur', () => {
  test('sans humeur, aucune pastille', () => {
    expect(avatar({})).not.toContain('data-mood');
  });

  test('avec une humeur, elle est là et porte ce qu’elle sert', () => {
    expect(avatar({ mood: '🎉' })).toContain('data-mood="🎉"');
  });

  /** Une chaîne VIDE n'est pas une humeur — `withMoods` la filtre déjà en
      amont, et la laisser passer peindrait une pastille muette. */
  test('une humeur vide ne peint rien', () => {
    expect(avatar({ mood: '' })).not.toContain('data-mood=');
  });
});

describe('et elle MASQUE la présence — jamais les deux dans le même coin', () => {
  /**
   * LE TÉMOIN CENTRAL. Les deux signaux occupent la même place : en peindre
   * deux l'un sur l'autre les rendrait illisibles tous les deux. Miroir exact
   * d'iOS (`MeeshyAvatar.swift:385-390`, un `else if`).
   */
  test('présence SEULE : le point se peint', () => {
    const html = avatar({ presence: 'online' });

    expect(html).toContain('data-presence');
    expect(html).not.toContain('data-mood');
  });

  test('présence ET humeur : l’humeur gagne, le point disparaît', () => {
    const html = avatar({ presence: 'online', mood: '☕' });

    expect(html).toContain('data-mood="☕"');
    expect(html).not.toContain('data-presence');
  });

  /**
   * LA RÈGLE DE CONFIDENTIALITÉ, tenue par un témoin plutôt que par une note :
   * sans présence servie — le cas d'un non-ami, que la directive du 2026-08-25
   * impose — l'humeur se peint quand même. Elle ne se DÉRIVE pas de la
   * présence et ne la REMPLACE pas : son périmètre est plus large (amis ∪
   * contacts DM ∪ co-membres), parce qu'un mood est un contenu PUBLIÉ, pas un
   * signal d'activité. L'utiliser comme repli d'une présence masquée en ferait
   * un canal de présence déguisé.
   */
  test('sans présence servie, l’humeur se peint quand même — et n’en tient pas lieu', () => {
    const html = avatar({ mood: '💪' });

    expect(html).toContain('data-mood="💪"');
    expect(html).not.toContain('data-presence');
  });
});

describe('elle respire, puis se pose', () => {
  /**
   * LA BORNE EST L'INFORMATION. Une animation infinie sur une liste d'avatars
   * est un coût de batterie, et l'audit de chauffe d'iOS (2026-08-26) a déjà
   * tranché : la pastille se pose après ~8 s. La feuille porte la borne
   * (`mood-breathe` : 2 s × 4) et `prefers-reduced-motion` la coupe sans faire
   * disparaître la pastille — l'animation explique, elle n'est pas
   * l'information.
   */
  test('elle porte la classe bornée du dépôt, pas une animation à elle', () => {
    expect(avatar({ mood: '😴' })).toContain('mood-breathe');
  });

  /** ELLE EST DÉCORATIVE POUR LES LECTEURS D'ÉCRAN : l'emoji seul n'a pas de
      sens énonçable hors contexte, et le nom de la personne est déjà porté par
      l'avatar. Une pastille annoncée « visage endormi » couperait la lecture du
      nom sans rien apprendre. */
  test('elle ne parle pas aux lecteurs d’écran', () => {
    const html = avatar({ mood: '😴' });
    const pastille = html.slice(html.indexOf('data-mood='));

    expect(pastille).toContain('aria-hidden');
  });
});

describe('le contour du mood dit la présence (#9065)', () => {
  /**
   * DEMANDE PORTEUR 2026-10-02 : le mood MASQUE le point, donc c'est son
   * CONTOUR — la silhouette dilatée de l'emoji, jamais un anneau de plus — qui
   * porte la présence : indigo dans la conversation, vert en ligne, rien sinon.
   */
  test('dans la conversation : contour indigo, même s’il est aussi en ligne', () => {
    const html = avatar({ mood: '☕', here: true, presence: 'online' });

    expect(glyph(html)).toContain('data-mood-outline="here"');
    expect(glyph(html)).toContain(`--mood-outline:${PRESENCE_HERE_HEX}`);
    expect(html).not.toContain('data-presence');
  });

  test('en ligne hors de la conversation : contour vert', () => {
    const html = avatar({ mood: '☕', presence: 'online' });

    expect(glyph(html)).toContain('data-mood-outline="online"');
    expect(glyph(html)).toContain(`--mood-outline:${PRESENCE_HEX[presenceTone('online')]}`);
  });

  test('absent, inactif ou présence masquée : aucun contour', () => {
    for (const props of [{}, { presence: 'away' }, { presence: 'offline' }]) {
      const html = avatar({ mood: '☕', ...props });
      expect(glyph(html)).not.toContain('data-mood-outline');
      expect(glyph(html)).not.toContain('--mood-outline');
    }
  });

  test('le contour suit la silhouette du glyphe : un filtre, jamais un anneau', () => {
    const css = readFileSync(new URL('../styles/avatar.css', import.meta.url), 'utf8');
    const rule = css.match(/\[data-mood-outline\]\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(rule).toMatch(/filter:\s*drop-shadow\(/);
    expect(rule.match(/drop-shadow\([^;]*?var\(--mood-outline\)\)/g)).toHaveLength(4);
    expect(rule).not.toMatch(/border|box-shadow|outline:/);
  });
});

describe('le mood pulse à peine quand le pair regarde en plein écran (#9065)', () => {
  test('ici au repos, il respire comme d’habitude', () => {
    const html = avatar({ mood: '😴', here: true });
    expect(html).toContain('mood-breathe');
    expect(html).not.toContain('mood-stir');
    expect(html).not.toContain('mood-hush');
  });

  test('actif sans plein écran, il respire plus amplement', () => {
    const html = avatar({ mood: '😴', here: true, hereActive: true });
    expect(html).toContain('mood-stir');
    expect(html).not.toContain('mood-breathe');
    expect(html).not.toContain('mood-hush');
  });

  test('le plein écran prime sur l’activité', () => {
    const html = avatar({ mood: '😴', here: true, hereActive: true, hereFocused: true });
    expect(html).toContain('mood-hush');
    expect(html).not.toContain('mood-stir');
  });

  test('l’activité sans « ici » ne change rien', () => {
    expect(avatar({ mood: '😴', hereActive: true })).toContain('mood-breathe');
  });

  test('une seule échelle : à peine < respiration < ample, et le mouvement réduit coupe tout', () => {
    const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
    const peak = (name: string) => Math.max(...[...(new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1] ?? '').matchAll(/scale\(([\d.]+)\)/g)].map((m) => Number(m[1])));
    expect(peak('moodHush')).toBeLessThan(peak('moodBreathe'));
    expect(peak('moodBreathe')).toBeLessThan(peak('moodStir'));
    expect(peak('moodStir')).toBeCloseTo(1.22, 5);
    expect(css).toMatch(/\.mood-stir\s*\{[^}]*animation-name:\s*moodStir[^}]*animation-duration:\s*1\.4s[^}]*infinite/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^@]*\.mood-stir/);
  });

  test('en plein écran, il quitte sa respiration pour un pulse à peine perceptible', () => {
    const html = avatar({ mood: '😴', here: true, hereFocused: true });

    expect(html).not.toContain('mood-breathe');
    expect(html).toContain('mood-hush');
    expect(html).toContain('data-mood-focused="true"');
    expect(glyph(html)).toContain('data-mood-outline="here"');
  });

  test('le pulse du plein écran est à peine perceptible et se tait en mouvement réduit', () => {
    const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.mood-hush\s*\{[^}]*animation-name:\s*moodHush[^}]*infinite/);
    const peak = Number(/@keyframes moodHush[\s\S]*?scale\(([\d.]+)\)\s*;?\s*\}\s*\}/.exec(css)?.[1]);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(1.06);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^@]*\.mood-hush/);
  });

  test('un focus sans « ici » ne change rien', () => {
    expect(avatar({ mood: '😴', hereFocused: true })).toContain('mood-breathe');
  });
});
