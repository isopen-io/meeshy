import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '../../src/test-support/happy-dom-environment';

import { sidewaysReleve } from './progression-sideways.mjs';

/**
 * LA PAGE QUE PROGRESSION MESURE EST LA PAGE, PAS SON SQUELETTE (#12783) — voir
 * le commentaire de `sidewaysReleve` : la première page reste un instant en
 * « squelette, réseau au repos », et le cadre téléphone la jugeait alors sur
 * ses cartes grises (« niveau lu : null »).
 */

beforeAll(() => ensureHappyDomRegistered());
afterAll(() => releaseHappyDomIfRegistered());

const page = (html: string) => {
  document.body.innerHTML = html;
  return sidewaysReleve();
};

describe('sidewaysReleve', () => {
  test('sans #contenu, la page n’a rien peint', () => {
    expect(page('<div>chargement de la route</div>')).toMatchObject({ sansContenu: true, enChargement: false });
  });

  test('un #contenu qui porte encore son squelette (aria-busy) est en chargement', () => {
    const lecture = page('<main id="contenu"><header>Progression</header><div aria-busy="true"><div></div><div></div></div></main>');
    expect(lecture).toMatchObject({ sansContenu: false, enChargement: true });
  });

  test('un #contenu servi n’est plus en chargement, même si un bouton s’y dit au repos (aria-busy="false")', () => {
    const lecture = page('<main id="contenu"><header>Progression</header><button aria-busy="false">Frapper</button><p>Niveau 97</p></main>');
    expect(lecture).toMatchObject({ sansContenu: false, enChargement: false });
  });
});
