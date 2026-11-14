// Témoins de la planche des appels (#18226, #18227, loi 18) : ce que le code porte en plus de la vue est GARDÉ et
// DESSINÉ, chaque vue de la planche a sa capture et sa ligne dans le texte, et le texte nomme chaque extra.
// Usage : node --test docs/product/appels-vue-finale/planche.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'planche.html'), 'utf8');
const texte = readFileSync(join(here, '..', 'appels-vue-finale.md'), 'utf8');

const vues = [...html.matchAll(/^\{id:'([A-Za-z0-9]+)',t:'((?:[^'\\]|\\.)*)',d:'((?:[^'\\]|\\.)*)'/gm)].map(([, id, titre, description]) => ({ id, titre, description }));
const vue = (id) => vues.find((v) => v.id === id);
const bloc = (id) => {
  const debut = html.indexOf(`{id:'${id}'`);
  const fin = html.indexOf('\n{id:', debut + 1);
  return html.slice(debut, fin === -1 ? undefined : fin);
};

const EXTRAS = ['E1', 'E2', 'E3', 'E4', 'E5'];

test('chaque vue de la planche a sa capture et sa ligne dans le texte', () => {
  assert.ok(vues.length > 40, 'la planche est lue');
  for (const { id } of vues) {
    assert.ok(existsSync(join(here, 'vues', `${id}.png`)), `la capture ${id}.png existe`);
    assert.ok(texte.includes(`![${id}](appels-vue-finale/vues/${id}.png)`), `${id} est dans le texte`);
  }
});

test('les extras du code sont des vues dessinées : zoom de ma caméra, micro du pair, En attente, Vidéo réduite, Lissage', () => {
  for (const id of EXTRAS) assert.ok(vue(id), `la vue ${id} existe`);
  assert.match(bloc('E1'), /0,5×/);
  assert.match(bloc('E1'), /aria-label="Zoom de ma caméra"/);
  assert.match(bloc('E1'), /data-extra="indicateur-zoom"/);
  assert.match(bloc('E2'), /data-extra="micro-pair-coupe"/);
  assert.match(bloc('E2'), /data-extra="zoom-vignette"/);
  assert.match(bloc('E3'), /En attente/);
  assert.match(bloc('E3'), /role="status"/);
  assert.match(bloc('E4'), /Vidéo réduite/);
  assert.match(bloc('E4'), /role="status"/);
  assert.match(bloc('E5'), /Force du lissage/);
});

test('En attente et Vidéo réduite sont dessinées en verre, dans la pile des bannières du haut, sur les trois plateformes (#18227)', () => {
  for (const id of ['E3', 'E4']) {
    const { description } = vue(id) ?? { description: '' };
    assert.match(description, /#18227/, `${id} cite la décision`);
    assert.match(description, /iOS/, `${id} dit iOS`);
    assert.match(description, /web/, `${id} dit le web`);
    assert.match(description, /Android/, `${id} dit Android`);
    assert.match(bloc(id), /class="chip glass/, `${id} est une pastille de verre`);
  }
  assert.match(vue('E3')?.description ?? '', /40 %/);
  assert.match(vue('E4')?.description ?? '', /Lumière insuffisante/);
});

test('la loi 18 nomme chaque extra gardé, et les vues voisines renvoient vers les extras', () => {
  const loi18 = texte.slice(texte.indexOf('18. **Simplicité'), texte.indexOf('## Les vues'));
  for (const id of EXTRAS) assert.ok(loi18.includes(id), `la loi 18 cite ${id}`);
  assert.match(vue('P8b')?.description ?? '', /E5/);
  assert.match(vue('P9')?.description ?? '', /E3/);
  assert.match(vue('P7')?.description ?? '', /E2/);
});

test('le texte porte une section des extras, avec une ligne par vue', () => {
  assert.match(texte, /^### Ce que le code porte en plus$/m);
  for (const id of EXTRAS) assert.ok(texte.includes(`| ![${id}](appels-vue-finale/vues/${id}.png)`) || texte.includes(`![${id}](appels-vue-finale/vues/${id}.png)`), `${id} est montrée`);
});
