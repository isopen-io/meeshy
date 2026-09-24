import { describe, expect, test } from 'bun:test';

import type { EphemeralDeadline } from '@meeshy/shared/utils/ephemeral-deadline';

import { DESTRUCTION_MS, destructionPhaseOf } from './ephemeral-destruction';

/**
 * **LA DESTRUCTION SE VOIT** (#7468, travail 2) — précision du porteur : « sa
 * destruction doit avoir un effet visuel si on est dans la conversation au
 * moment de la destruction ».
 *
 * Le lot #7454 faisait disparaître la rangée d'une IMAGE à l'autre :
 * `deadlineReached` ⇒ la peau ne rend plus rien. Correct, et muet — le lecteur
 * voyait un trou, jamais une disparition.
 *
 * ## POURQUOI LA PHASE EST UNE LOI PURE, ET PAS UN `useState`
 *
 * Elle répond à une question que TROIS sources posent — l'échéance locale
 * atteinte sous les yeux du lecteur, `message:expired` arrivé pendant
 * l'affichage, et un fil ROUVERT longtemps après — et les trois doivent rendre
 * le même verdict sans se coordonner. Un état porté par l'écran aurait la
 * quatrième réponse : « je n'ai rien vu passer », qui est précisément le
 * défaut.
 *
 * **LA FENÊTRE EST SANS ÉTAT, ET C'EST CE QUI FERME LA COURSE.** Entre
 * l'échéance et le tic suivant de l'horloge partagée, l'écran peut se rendre
 * pour une raison étrangère (une frappe, un défilement qui bouge le
 * virtualiseur). Si la phase se lisait d'un ensemble alimenté par le seul
 * rappel du chrome, ce rendu-là couperait la rangée net, sans effet. En
 * comparant l'échéance à MAINTENANT, la fenêtre répond « en destruction » quel
 * que soit celui qui demande.
 */

const NOW = Date.parse('2026-09-22T18:00:00.000Z');

const scheduled = (expiresAtMs: number): EphemeralDeadline => ({ state: 'scheduled', expiresAtMs });

describe('destructionPhaseOf — les trois phases d’une rangée éphémère', () => {
  test('une échéance à venir laisse la rangée VISIBLE', () => {
    expect(
      destructionPhaseOf({ deadline: scheduled(NOW + 5_000), now: NOW, destroying: false, expired: false }),
    ).toBe('visible');
  });

  test('l’échéance ATTEINTE ouvre la fenêtre de destruction, sans que personne l’annonce', () => {
    expect(destructionPhaseOf({ deadline: scheduled(NOW), now: NOW, destroying: false, expired: false })).toBe(
      'destroying',
    );
    expect(
      destructionPhaseOf({ deadline: scheduled(NOW - DESTRUCTION_MS + 1), now: NOW, destroying: false, expired: false }),
    ).toBe('destroying');
  });

  /**
   * ON N'ASSISTE PAS À UNE DESTRUCTION PASSÉE. Un fil rouvert des heures plus
   * tard ne doit pas rejouer la combustion de chaque éphémère échu : ce serait
   * raconter un fait auquel le lecteur n'était pas.
   */
  test('passée la fenêtre, la rangée est simplement PARTIE', () => {
    expect(
      destructionPhaseOf({ deadline: scheduled(NOW - DESTRUCTION_MS), now: NOW, destroying: false, expired: false }),
    ).toBe('gone');
    expect(
      destructionPhaseOf({ deadline: scheduled(NOW - 3_600_000), now: NOW, destroying: false, expired: false }),
    ).toBe('gone');
  });

  /**
   * `message:expired` peut arriver AVANT l'échéance que le client a calculée
   * (horloges qui dérivent, destruction anticipée côté serveur) : l'annonce
   * gagne sur l'arithmétique, sinon la rangée partirait sans effet.
   */
  test('une destruction ANNONCÉE gagne sur une échéance encore à venir', () => {
    expect(
      destructionPhaseOf({ deadline: scheduled(NOW + 30_000), now: NOW, destroying: true, expired: false }),
    ).toBe('destroying');
  });

  test('un message sans éphémère n’est jamais en destruction', () => {
    expect(destructionPhaseOf({ deadline: { state: 'none' }, now: NOW, destroying: false, expired: false })).toBe(
      'visible',
    );
  });

  test('l’expéditeur EN ATTENTE de réception reste visible — rien ne décompte encore', () => {
    expect(
      destructionPhaseOf({
        deadline: { state: 'awaiting-reception', durationSeconds: 30 },
        now: NOW,
        destroying: false,
        expired: false,
      }),
    ).toBe('visible');
  });

  test('`expired` clôt le sujet, même dans la fenêtre — le retrait a déjà eu lieu', () => {
    expect(destructionPhaseOf({ deadline: scheduled(NOW), now: NOW, destroying: true, expired: true })).toBe('gone');
  });
});
