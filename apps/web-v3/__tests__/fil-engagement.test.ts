import {
  engagementARejouer,
  peutOuvrirLeTransport,
} from '@/app/(public)/chats/[lien]/engagement';

/**
 * QUAND LE TRANSPORT S'OUVRE — et le témoin qui n'existait nulle part.
 *
 * L'engagement se gardait sur « déjà ouvert » et « place refusée », jamais sur
 * le RÉSEAU : toucher le composeur pendant une coupure — le chemin même que le
 * lot met en avant — chargeait `socket.io-client` puis, module en cache,
 * lançait une boucle de reconnexion 1 s → 30 s pour toute la durée de la
 * coupure. Le § 6.2 l'interdit nommément.
 *
 * Ce témoin est ICI et pas dans le navigateur pour une raison mesurée :
 * `context.setOffline(true)` coupe AUSSI le chunk asynchrone du transport, donc
 * l'import échoue de lui-même et l'écran retombe au même état avec ou sans la
 * garde — un gate vert des deux côtés ne garde rien. Le défaut réel se produit
 * quand le module est DÉJÀ en cache, ce qu'un `setOffline` ne met pas en scène.
 */

const etat = (partiel: Partial<Parameters<typeof peutOuvrirLeTransport>[0]> = {}) => ({
  dejaEngage: false,
  refuse: false,
  horsLigne: false,
  ...partiel,
});

describe('l’engagement du transport', () => {
  it('ouvre quand rien ne s’y oppose — le geste nominal, composeur touché', () => {
    expect(peutOuvrirLeTransport(etat())).toBe(true);
  });

  it('n’ouvre PAS une seconde fois : deux `io(...)` sont le défaut mesuré d’apps/web', () => {
    expect(peutOuvrirLeTransport(etat({ dejaEngage: true }))).toBe(false);
  });

  it('n’ouvre PAS sur une place refusée : il n’y a plus rien à tenir', () => {
    expect(peutOuvrirLeTransport(etat({ refuse: true }))).toBe(false);
  });

  /**
   * LE DÉFAUT CORRIGÉ. Et la suspension ne le rattrapait pas :
   * `perte-du-reseau` est émise AVANT l'engagement, donc la référence de
   * participation valait `null` au moment du `suspend()`.
   */
  it('n’ouvre PAS hors-ligne — 12,8 Ko sur un réseau qui n’existe pas, puis une boucle', () => {
    expect(peutOuvrirLeTransport(etat({ horsLigne: true }))).toBe(false);
  });
});

describe('le souhait de participer, REPORTÉ et non annulé', () => {
  it('se rejoue à la reprise quand on a touché le composeur hors-ligne', () => {
    expect(engagementARejouer({ voulu: true, dejaEngage: false })).toBe(true);
  });

  /**
   * Sans ce second volet, la garde ci-dessus serait une perte de fonction :
   * quelqu'un qui a écrit dans le métro ne recevrait plus jamais la suite dans
   * la seconde.
   */
  it('ne rejoue rien si personne n’a touché le composeur', () => {
    expect(engagementARejouer({ voulu: false, dejaEngage: false })).toBe(false);
  });

  it('ne rejoue rien sur un transport déjà ouvert', () => {
    expect(engagementARejouer({ voulu: true, dejaEngage: true })).toBe(false);
  });
});
