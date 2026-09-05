import { prendsLePleinEcran } from '@/lib/realtime/plein-ecran';

/**
 * **CE QUE LE MODULE AJOUTE À LA SURIMPRESSION — ET RIEN DE PLUS** (§ 12.10.1,
 * § 12.10.6).
 *
 * Le plein écran est SERVI par le serveur et se ferme par un `<a href>` : il
 * marche entier sans un octet de script. Le module n'en ouvre aucun, n'en
 * compose aucun — il ÉLÈVE celui qui est là en modale, pour Échap, le voile et
 * le piège à focus que `showModal()` donne gratuitement.
 *
 * Les deux témoins qui suivent gardent les deux façons dont cette élévation
 * pouvait tout casser :
 *
 *   1. `close()` avant `showModal()` — l'appel évident, et un piège : il ÉMET
 *      l'événement `close` dans une tâche différée, qui arrivait APRÈS
 *      l'écouteur et suivait le lien de retour. Mesuré au navigateur : la
 *      surimpression se fermait TOUTE SEULE à l'arrivée du module ;
 *   2. un navigateur sans dialogue modal — la surimpression doit rester ce
 *      qu'elle était, servie et entière, jamais fermée par le correctif.
 */

const sers = (attributs = 'open data-retour="/chats/c1#m-r1"'): HTMLDialogElement => {
  document.body.innerHTML = `<dialog class="plein" id="plein" ${attributs}><a class="fermer" href="/chats/c1#m-r1">Fermer</a></dialog>`;
  return document.querySelector<HTMLDialogElement>('dialog.plein')!;
};

describe('l’élévation d’une surimpression servie', () => {
  it('n’ouvre rien quand le document n’en sert aucune', () => {
    document.body.innerHTML = '<main></main>';
    expect(() => prendsLePleinEcran()).not.toThrow();
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('élève en modale SANS émettre de fermeture — la surimpression reste ouverte', () => {
    const dialogue = sers();
    const appels: string[] = [];
    let ferme = 0;
    dialogue.addEventListener('close', () => {
      ferme += 1;
    });
    Object.defineProperty(dialogue, 'showModal', {
      value: () => {
        appels.push('showModal');
        dialogue.setAttribute('open', '');
      },
    });

    prendsLePleinEcran();

    expect(appels).toEqual(['showModal']);
    expect(dialogue.hasAttribute('open')).toBe(true);
    // AUCUNE fermeture n'a été émise : c'est elle qui refermait la
    // surimpression à l'arrivée du module.
    expect(ferme).toBe(0);
  });

  /**
   * LE FOCUS DU LECTEUR SURVIT À L'ÉLÉVATION. `showModal()` pose le focus sur
   * le PREMIER élément focalisable du dialogue — la poignée « Fermer » — et ce
   * module arrive APRÈS le premier pixel (§ 12.4) : un lecteur au clavier peut
   * déjà tenir un contrôle du dialogue. Mesuré (`v3-deconnexion.spec.ts:51`, en
   * CI comme en local, une fois sur trois) : Entrée partait sur la poignée, et
   * la SORTIE devenait une FERMETURE — atterrissage sur `/chats` au lieu de `/`.
   */
  it('rend le focus au contrôle que le lecteur tenait quand showModal() l’a déplacé', () => {
    document.body.innerHTML =
      '<dialog class="espace" open data-retour="/chats"><a class="poignee" href="/chats">Fermer</a>' +
      '<form class="sortie" method="post" action="/deconnexion"><button type="submit">Se déconnecter</button></form></dialog>';
    const dialogue = document.querySelector<HTMLDialogElement>('dialog.espace')!;
    const poignee = dialogue.querySelector<HTMLAnchorElement>('a.poignee')!;
    const bouton = dialogue.querySelector<HTMLButtonElement>('button')!;
    bouton.focus();
    expect(document.activeElement).toBe(bouton);
    Object.defineProperty(dialogue, 'showModal', {
      value: () => {
        dialogue.setAttribute('open', '');
        // Ce que fait le navigateur : le premier focalisable du dialogue.
        poignee.focus();
      },
    });

    prendsLePleinEcran();

    expect(document.activeElement).toBe(bouton);
  });

  it('laisse au navigateur son premier focalisable quand le lecteur ne tenait rien dans le dialogue', () => {
    document.body.innerHTML =
      '<button id="ailleurs">Ailleurs</button>' +
      '<dialog class="espace" open data-retour="/chats"><a class="poignee" href="/chats">Fermer</a>' +
      '<form class="sortie" method="post" action="/deconnexion"><button type="submit">Se déconnecter</button></form></dialog>';
    const dialogue = document.querySelector<HTMLDialogElement>('dialog.espace')!;
    const poignee = dialogue.querySelector<HTMLAnchorElement>('a.poignee')!;
    document.querySelector<HTMLButtonElement>('#ailleurs')!.focus();
    Object.defineProperty(dialogue, 'showModal', {
      value: () => {
        dialogue.setAttribute('open', '');
        poignee.focus();
      },
    });

    prendsLePleinEcran();

    expect(document.activeElement).toBe(poignee);
  });

  /**
   * Le repli : `showModal()` jette (un navigateur sans dialogue modal — jsdom
   * en est un). La surimpression garde son `open`, donc son contenu et sa
   * croix ; seul Échap manque.
   */
  it('rend sa surimpression telle quelle quand le dialogue modal n’existe pas', () => {
    const dialogue = sers();
    expect(() => prendsLePleinEcran()).not.toThrow();
    expect(dialogue.hasAttribute('open')).toBe(true);
    expect(dialogue.querySelector('a.fermer')).not.toBeNull();
  });
});
