import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

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
