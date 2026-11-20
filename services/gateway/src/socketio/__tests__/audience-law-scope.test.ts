/**
 * #20091 — LA PORTÉE du balayage des audiences est une AFFIRMATION, et c'est
 * celle que personne ne relit.
 *
 * Le cliquet de #16690 partait de `path.resolve(__dirname, '..')`, soit
 * `src/socketio/`. Il était vert : il affirmait d'un dépôt ce qu'il mesurait
 * d'un répertoire — et les audiences hors de sa vue portaient, entre autres,
 * l'annuaire des appareils qui reçoivent les enveloppes chiffrées.
 *
 * **Les comptes sont GELÉS ici, pas racontés ailleurs.** Le premier jet du lot
 * les avait écrits en prose dans quatre endroits, et l'audit adversarial a
 * mesuré qu'aucun ne correspondait plus : le lot élargissait le discriminant en
 * même temps qu'il publiait les chiffres, si bien que l'avant et l'après ne
 * comptaient pas la même chose. Un compte est une affirmation ; il vit dans un
 * témoin ou il dérive.
 *
 * Ce témoin garde la portée elle-même, et il est distinct de ceux qui gardent
 * l'inventaire : une portée resserrée les rendrait TOUS verts en même temps,
 * sans qu'aucun ne parle de ce qui a disparu. **Un inventaire vide et un
 * balayage aveugle sont le même vert.**
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  sweepConversationAudiences,
  DELIBERATELY_WIDE,
  MEASURED_NOT_INSTRUCTED,
} from './conversation-audience-living-participation';

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

  /**
   * LA DISTRIBUTION MESURÉE, gelée — c'est le remède au constat de l'audit :
   * un chiffre en commentaire ne peut pas rougir.
   *
   * Dans la portée d'AVANT, la loi tenait sur 13 sites et 2 étaient déclarés
   * larges : le cliquet y était légitimement vert. Au dehors, **50 audiences**
   * ne l'épelaient pas. Ces bornes bougent quand le dépôt bouge — elles sont
   * écrites en `<=` / `>=` pour qu'une DÉGRADATION rougisse sans qu'une
   * amélioration ait à venir les rééditer.
   */
  it('gèle la distribution : la portée d’avant était conforme, le dehors ne l’était pas', () => {
    const inside = sites.filter((site) => site.file.startsWith('socketio/'));
    const outside = sites.filter((site) => !site.file.startsWith('socketio/'));

    // Les bornes ont bougé avec #20100, et c'est le discriminant qui a changé,
    // pas le dépôt : la forme IMBRIQUÉE, `findFirst` et le filtre NÉGATIF ont
    // fait entrer soixante lectures de plus. Un lot qui touche le discriminant
    // reclasse l'inventaire ENTIER — il ne fait pas que l'étendre.
    expect(inside.filter((site) => !site.usesLaw).length).toBeLessThanOrEqual(3);
    expect(outside.length).toBeGreaterThanOrEqual(105);
    expect(outside.filter((site) => !site.usesLaw).length).toBeLessThanOrEqual(84);
  });

  /**
   * Toute audience nue est RANGÉE, et dans un seul des deux inventaires. Le
   * témoin jumeau de `conversation-audience-living-participation.test.ts` le
   * dit déjà ; celui-ci garde le COMPTE, pour qu'une dette ne grossisse pas
   * sous couvert d'un reclassement.
   */
  it('range chaque audience nue, et la dette ne dépasse pas ce que #20091 a relevé', () => {
    const bare = sites.filter((site) => !site.usesLaw).length;

    expect(Object.keys(DELIBERATELY_WIDE).length + Object.keys(MEASURED_NOT_INSTRUCTED).length).toBe(bare);
    expect(Object.keys(MEASURED_NOT_INSTRUCTED).length).toBeLessThanOrEqual(71);
  });
});
