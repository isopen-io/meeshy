/**
 * #20091 — LA PORTÉE du balayage des audiences est une AFFIRMATION, et c'est
 * celle que personne ne relit.
 *
 * Le cliquet de #16690 partait de `path.resolve(__dirname, '..')`, soit
 * `src/socketio/`. Mesuré avec son PROPRE classifieur sur `src/` : 15 audiences
 * dans `socketio/` (13 conformes, 2 déclarées larges) et **51 au dehors, dont
 * 50 nues** — dont l'annuaire des appareils qui reçoivent les enveloppes
 * chiffrées. Le cliquet était vert : il affirmait d'un dépôt ce qu'il mesurait
 * d'un répertoire.
 *
 * Ce témoin garde la portée elle-même, et il est distinct de ceux qui gardent
 * l'inventaire : une portée resserrée les rendrait TOUS verts en même temps,
 * sans qu'aucun ne parle de ce qui a disparu. **Un inventaire vide et un
 * balayage aveugle sont le même vert.**
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { sweepConversationAudiences } from './conversation-audience-living-participation';

describe('#20091 — le balayage des audiences voit tout `src/`, pas un répertoire', () => {
  const sites = sweepConversationAudiences();

  /**
   * Les quatre racines où vivent réellement les audiences. `socketio/` n'en est
   * qu'une, et c'était la seule balayée — les trois autres portaient les
   * cinquante lectures nues.
   */
  it.each(['routes/', 'services/', 'socketio/', 'utils/'])('relève des audiences sous `%s`', (root) => {
    expect(sites.filter((site) => site.file.startsWith(root)).length).toBeGreaterThan(0);
  });

  /**
   * Le gros des audiences vit HORS de l'ancien répertoire. Ce n'est pas une
   * curiosité de comptage : c'est la mesure qui rend la portée d'avant
   * intenable, et le chiffre doit rester vérifiable plutôt que de vivre dans un
   * journal (un compte est une AFFIRMATION, cycle 93).
   */
  it('en trouve plus au dehors de `socketio/` qu’au dedans', () => {
    const inside = sites.filter((site) => site.file.startsWith('socketio/')).length;
    const outside = sites.length - inside;

    expect(outside).toBeGreaterThan(inside);
  });
});
