import type { Droits } from '@/lib/api/invite';
import { droitsRendus, PARAMETRE_DE_JONCTION_FRAICHE } from '@/lib/contenu/droits';

/**
 * LES DROITS, REPEINTS EN DIRECT — la seconde lecture de `lib/contenu/droits.ts`
 * dans le navigateur (issue #4523). Le serveur a servi le bandeau (`app/
 * connecte/fil-vue.ts`) avec les verdicts du montage — l'INSTANTANÉ pris au
 * join que `PATCH /guest-sessions/me` rend (`participantConversationPayload`,
 * `link-admission.ts:554-577`, `participant.permissions`). Ce que l'hôte
 * change ENSUITE (`PATCH …/participants/:id/rights`) ne repasse pas par le
 * battement — la passerelle le POUSSE : `participant:rights-updated` sur la
 * room de conversation et, en charge complète, sur la room personnelle de
 * l'intéressé (`participants-writes.ts:403-425`, room rejointe par
 * `AuthHandler.ts:381`). `droitsDuChangement` lit cet événement tel que
 * l'émetteur le compose ; ce module ne fabrique aucune ligne : il retourne la
 * classe des lignes servies et y réécrit le titre et la phrase que la source
 * donne — chaque ligne porte ses DEUX glyphes de verdict, et c'est la feuille
 * qui montre l'un ou l'autre.
 *
 * Le trombone suit le même principe : le serveur le sert — CACHÉ quand la
 * porte n'admet pas encore de pièce, là où un module viendra (`fil-vue.ts`) —
 * et ce module le RÉVÈLE ou le retire, `accept` et `required` compris. Sur une
 * lecture pure, il n'existe pas, et rien n'en fabrique un.
 */

const texte = (racine: ParentNode, selecteur: string, valeur: string): void => {
  const noeud = racine.querySelector<HTMLElement>(selecteur);
  if (noeud !== null && noeud.textContent !== valeur) noeud.textContent = valeur;
};

const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Readonly<Record<string, unknown>>)
    : null;

/**
 * `participant:rights-updated` (`ParticipantRightsUpdatedEventData`,
 * `packages/shared/types/socketio-events/participant.ts`) : `rights` porte
 * l'état RÉSOLU — `anonymousSession.rights ?? permissions` —, jamais le delta.
 * `canViewHistory` est ABSENT sur la room de conversation (#4009, un fait de
 * modération) et présent sur la room personnelle ; les deux charges arrivent
 * dans un ordre qui ne se suppose pas. La clé se lit donc par sa PRÉSENCE, et
 * l'historique connu reste tant qu'aucune charge ne le dit — recopier
 * inconditionnellement effacerait l'octroi que l'autre charge vient de porter.
 * `null` : ce n'est pas MON changement, ou la charge ne porte aucun droit.
 */
export const droitsDuChangement = (charge: unknown, moi: string | null, courants: Droits): Droits | null => {
  const brut = objet(charge);
  const rights = objet(brut?.rights);
  if (brut === null || rights === null || moi === null || brut.participantId !== moi) return null;
  return {
    canSendMessages: rights.canSendMessages === true,
    canSendFiles: rights.canSendFiles === true,
    canSendImages: rights.canSendImages === true,
    canViewHistory: typeof rights.canViewHistory === 'boolean' ? rights.canViewHistory : courants.canViewHistory,
  };
};

export const peinsLesDroits = (main: HTMLElement, droits: Droits): void => {
  droitsRendus(droits).forEach((droit) => {
    const ligne = main.querySelector<HTMLElement>(`.bandeau.bien li[data-droit="${droit.cle}"]`);
    if (ligne === null) return;
    ligne.classList.toggle('accorde', droit.accorde);
    ligne.classList.toggle('refuse', !droit.accorde);
    texte(ligne, 'b', droit.titre);
    texte(ligne, 'p', droit.sous);
  });
};

/**
 * Le trombone suit les DEUX droits de pièce — `accept="image/*"` quand seules
 * les photos sont admises, comme le serveur le pose — et le texte redevient
 * obligatoire quand plus aucune pièce ne peut faire un message à elle seule.
 */
export const peinsLeTrombone = (main: HTMLElement, droits: Droits): void => {
  const admis = droits.canSendFiles || droits.canSendImages;
  const trombone = main.querySelector<HTMLElement>('label.joindre');
  const champ = main.querySelector<HTMLInputElement>('#champ-piece');
  const texteDuMessage = main.querySelector<HTMLTextAreaElement>('#champ-texte');
  if (trombone !== null) trombone.hidden = !admis;
  if (champ !== null) {
    // Caché ET désactivé, comme le serveur le sert : un champ sans libellé visible n'a pas de nom pour un lecteur d'écran.
    champ.hidden = !admis;
    champ.disabled = !admis;
    if (admis && !droits.canSendFiles) champ.setAttribute('accept', 'image/*');
    else champ.removeAttribute('accept');
  }
  if (texteDuMessage !== null && trombone !== null) texteDuMessage.required = !admis;
};

/**
 * `?bienvenue` a fait son office — le bandeau est ouvert. Retiré de l'adresse
 * sans rechargement, pour qu'un F5 (§ 6.3.B) rende la conversation telle
 * qu'elle était, bandeau replié, et non une seconde fois l'arrivée.
 */
export const oublieLaJonctionFraiche = (): void => {
  const adresse = new URL(window.location.href);
  if (!adresse.searchParams.has(PARAMETRE_DE_JONCTION_FRAICHE)) return;
  adresse.searchParams.delete(PARAMETRE_DE_JONCTION_FRAICHE);
  window.history.replaceState(window.history.state, '', adresse);
};
