import type { Page } from '@playwright/test';

/**
 * L'ATTENTE D'UN MODULE DE PARTICIPATION, PAR SON EFFET (#5139) — jamais par
 * une minuterie devinée sur la vitesse du runner.
 *
 * `data-participation="<nom>"` est posé par le SERVEUR dès le premier pixel ;
 * il dit quel module l'écran ATTEND, jamais que ce module a fini de câbler
 * ses écouteurs. Huit témoins complétaient jusqu'ici par un `waitForTimeout`
 * après avoir observé la seule présence de cet attribut — un pari tenu en
 * local et perdu sur un runner chargé (CI du 2026-09-04, run 33911055635).
 *
 * `signaleArme` (`lib/realtime/arme.ts`) pose `data-arme="1"` sur le MÊME
 * élément, en dernière ligne de l'amorçage du module — cette fonction
 * l'observe, pour les modules qui n'ont pas de marqueur d'état plus précis
 * (`.etat[data-etat]` pour un module qui tient un socket lui-même, voir
 * `attendLeTempsReel` du fil).
 */
export const attendsLeModuleArme = async (page: Page, participation: string): Promise<void> => {
  await page.waitForFunction(
    (nom) => document.querySelector(`main[data-participation="${nom}"][data-arme="1"]`) !== null,
    participation,
  );
};
