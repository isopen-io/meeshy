import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

// `node:fs`, jamais le global `Bun` — même raison que
// `conversations-quick-actions.test.ts` : `tsconfig.json` ne déclare pas ses
// types, et `bun test` passerait au vert pendant que `tsc --noEmit` rougirait.
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'conversations.tsx'), 'utf8');

/**
 * **DEUX DES NEUF PORTES D'iOS EXISTENT MAINTENANT** (#6150).
 *
 * `ACTIONS_DE_DEMARRAGE` portait une seule action — inviter — et son
 * doc-comment disait pourquoi : « iOS en peint NEUF […] La v3.1 n'a de route
 * pour AUCUNE d'entre elles […] les porter toutes ici peindrait huit contrôles
 * qui mentent ». Il ajoutait la règle de sortie : « elles arriveront avec leurs
 * écrans et s'ajouteront ICI — une ligne par porte, impossible à ajouter sans
 * son effet puisque `run` n'est pas optionnel ».
 *
 * `storyCompose` (#6080) et `statusCompose` (#6150) EXISTENT. Ces deux portes
 * peuvent donc être tenues, et la phrase de l'état vide — « un message, une
 * story, un mood, un post » — cesse d'en promettre deux qu'elle ne montre pas.
 *
 * Ce témoin lit la SOURCE, comme sa voisine, parce que c'est une constante de
 * module : la monter demanderait tout l'écran, ses requêtes et son magasin.
 */
describe('les portes story et humeur du démarrage', () => {
  test('les deux clés sont là', () => {
    expect(source).toContain("key: 'story'");
    expect(source).toContain("key: 'humeur'");
  });

  /** Loi 4 — un contrôle existe s'il a un EFFET. Une porte dont le `run` ne
   * mène nulle part serait exactement le « contrôle qui ment » que le
   * doc-comment de cette constante existe pour empêcher. */
  test('chacune mène à une adresse RÉELLE de la table de routes', () => {
    expect(source).toContain("navigate('/stories/new')");
    expect(source).toContain("navigate('/status/new')");
    const table = readFileSync(join(here, 'route-table.tsx'), 'utf8');
    expect(table).toContain("pattern: '/stories/new'");
    expect(table).toContain("pattern: '/status/new'");
  });

  /**
   * NI L'UNE NI L'AUTRE N'EST HÉROS. iOS range story et mood en TUILES — ses
   * trois héros sont chercher des membres, ses contacts, ses affiliations. Le
   * seul héros de la v2 est « inviter », et son commentaire dit que ce rang est
   * TEMPORAIRE, tenu faute des trois vrais. Promouvoir story ou humeur
   * remplirait le rang avec les mauvais candidats et rendrait cet écart
   * impossible à solder.
   */
  test('aucune des deux ne prend le rang de héros', () => {
    const bloc = source.slice(source.indexOf('ACTIONS_DE_DEMARRAGE'), source.indexOf('export default function ConversationsScreen'));
    const story = bloc.slice(bloc.indexOf("key: 'story'"));
    const humeur = bloc.slice(bloc.indexOf("key: 'humeur'"));
    expect(story.slice(0, story.indexOf('},')).includes('hero: true')).toBe(false);
    expect(humeur.slice(0, humeur.indexOf('},')).includes('hero: true')).toBe(false);
  });

  test('inviter reste, et reste le héros', () => {
    expect(source).toContain("key: 'inviter'");
    expect(source).toContain('hero: true');
  });
});
