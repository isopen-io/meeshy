import { FEUILLE_DU_FIL } from '@/app/connecte/fil-feuille';
import { gabaritDeLigne, lignes } from '@/app/connecte/fil-lignes';
import type { Message } from '@/lib/api/fil';

/**
 * #5136 — **la date et l'accusé se posent au bas de la bulle, en colonne.**
 *
 * Directive porteur 2026-09-04 : « il faudrait mettre la date et coche au
 * niveau de la bulle et non sur une ligne […] un composant de deux colonnes
 * dont la seconde colonne alignée en bas contient la date et l'information de
 * réception si nécessaire ! ce qui permet d'éviter quelques lignes blanches
 * inutiles ! » — puis, explicitement : « Ceci doit être le cas pour ios, **et
 * web v3** ! »
 *
 * Jumelle iOS : #5135 (`FocalMetaColumn`).
 *
 * **Ce que ces témoins gardent** : la GÉOGRAPHIE, des deux côtés du rendu. Le
 * fichier `fil-lignes.ts` ouvre sur l'invariant qui rend ce lot risqué — « la
 * bulle reçue en direct et la bulle rechargée » doivent être indiscernables.
 * Une datation posée dans le SSR et pas dans le gabarit ferait sauter chaque
 * message au premier rechargement, sans qu'aucun test de valeur ne tombe.
 */

const message = (attributs: Partial<Message> = {}): Message => ({
  id: 'm1',
  clientMessageId: null,
  auteur: 'Marta Ruiz',
  auteurId: 'u2',
  anonyme: false,
  deMoi: false,
  systeme: false,
  texte: 'Bonjour à tous',
  texteOriginal: 'Hello everyone',
  langueServie: 'fr',
  langueOriginale: 'en',
  traductions: { fr: 'Bonjour à tous' },
  ecritA: '2026-09-01T12:00:00.000Z',
  protege: false,
  edite: false,
  supprime: false,
  pieces: [],
  lieu: null,
  citations: [],
  reactions: [],
  accuse: 'envoye',
  ...attributs,
});

const rendu = (m: Message): HTMLElement => {
  const hote = document.createElement('div');
  hote.innerHTML = lignes({
    messages: [m],
    maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
    langueDuDocument: 'fr',
    adresse: '/chats/c1',
    composeurOuvert: true,
    estInvite: false,
  });
  return hote;
};

const gabarit = (): HTMLElement => {
  const hote = document.createElement('div');
  hote.innerHTML = gabaritDeLigne('/chats/c1');
  const modele = hote.querySelector('template')!;
  const monte = document.createElement('div');
  monte.appendChild(modele.content.cloneNode(true));
  return monte;
};

describe('la datation vit dans la seconde colonne du corps', () => {
  it('sert un corps à DEUX colonnes — la bulle, puis la datation', () => {
    const hote = rendu(message());
    expect(hote.querySelector('.corps.colonnes > .bulle')).not.toBeNull();
    expect(hote.querySelector('.corps.colonnes > .datation')).not.toBeNull();
  });

  it("pose l'heure et l'accusé dans la datation, jamais dans la ligne méta", () => {
    const hote = rendu(message({ deMoi: true }));
    expect(hote.querySelector('.datation time')).not.toBeNull();
    expect(hote.querySelector('.datation .accuse')).not.toBeNull();
    // La ligne qu'on vient de vider : c'est TOUT l'objet du lot.
    expect(hote.querySelector('.meta time')).toBeNull();
    expect(hote.querySelector('.meta .accuse')).toBeNull();
  });

  /**
   * **« si nécessaire »** — un accusé ne concerne que ce qu'on a envoyé
   * soi-même. La colonne d'un message reçu ne porte que son heure.
   */
  it("ne date un message d'autrui d'aucun accusé", () => {
    const hote = rendu(message({ deMoi: false }));
    expect(hote.querySelector('.datation time')).not.toBeNull();
    expect(hote.querySelector('.datation .accuse')).toBeNull();
  });

  /**
   * L'invariant du fichier, éprouvé sur la géographie NEUVE : le gabarit que le
   * module clone porte les mêmes fentes que la ligne servie. C'est le seul
   * témoin qui puisse attraper une datation posée d'un côté seulement.
   */
  it('donne au gabarit cloné la même géographie que la ligne servie', () => {
    const servie = rendu(message({ deMoi: true }));
    const clone = gabarit();
    ['.corps.colonnes > .bulle', '.corps.colonnes > .datation', '.datation time', '.datation .accuse', '.meta .reagir-slot'].forEach(
      (fente) => {
        expect(servie.querySelector(fente)).not.toBeNull();
        expect(clone.querySelector(fente)).not.toBeNull();
      },
    );
  });

  /**
   * Le slot « Réagir » reste RÉSERVÉ. Son doc-comment mesure ce qu'il évite —
   * « sans elle, ils glissaient de 56 px à l'arrivée du module ». L'heure et
   * l'accusé ne sont plus derrière lui, mais `.langue` et `.modifie` le
   * PRÉCÈDENT : le retirer les ferait pousser par le bouton.
   */
  it('garde la place du bouton « Réagir » dans la ligne méta', () => {
    expect(rendu(message()).querySelector('.meta .reagir-slot')).not.toBeNull();
  });
});

describe('la feuille tient la colonne', () => {
  it('aligne les deux colonnes EN BAS — la date au niveau de la dernière ligne', () => {
    expect(FEUILLE_DU_FIL).toContain('.ligne .corps.colonnes{display:flex;align-items:flex-end');
  });

  /**
   * **Largeur réservée** (arbitrage porteur du 2026-09-04) : les dates
   * s'alignent verticalement d'un message à l'autre. `min-width` et non
   * `width` — la colonne ne doit pas tronquer aux grandes tailles de texte.
   */
  it('réserve une largeur à la datation, sans la figer', () => {
    expect(FEUILLE_DU_FIL).toMatch(/\.ligne \.datation\{[^}]*min-width:[^;]+;/);
    expect(FEUILLE_DU_FIL).not.toMatch(/\.ligne \.datation\{[^}]*[^-]width:[^;]*rem/);
  });

  /**
   * **La ligne méta ne réserve plus de marge pour rien.** Vidée de l'heure,
   * elle ne contient plus, dans le cas nominal, qu'un `.reagir-slot` en
   * `height:0` : sa `margin-top` serait un blanc pur. Les états d'envoi la
   * reprennent, eux, puisqu'ils s'affichent à cet endroit.
   */
  it('annule la marge de la méta quand rien n’y est visible, et la rend aux états d’envoi', () => {
    expect(FEUILLE_DU_FIL).toContain('.ligne .meta:not(:has(>:not(.reagir-slot):not(.attente):not(.echec):not([hidden]))){margin-top:0}');
    expect(FEUILLE_DU_FIL).toContain('.ligne.envoi-attente .meta,.ligne.envoi-hors-ligne .meta,.ligne.envoi-echec .meta{margin-top:var(--space-1)}');
  });

  /**
   * **REVUE DE #5061 — le bouton « Réagir » RECOUVRE la dernière ligne du
   * texte.** `.reagir-slot` reste en `height:0` tant qu'il est SERVI vide
   * (no-JS, ligne sans réaction possible) : `poseLeBoutonReagir`
   * (`fil-peinture.ts`) y insère alors le `button.reagir` réel
   * (`--target-min`, 44 px). `overflow:visible` + `align-items:center` sur un
   * conteneur de hauteur nulle centre ce bouton SUR la ligne de `.meta`, donc
   * pour moitié au-dessus d'elle — sur le dernier mot du `.texte` qui la
   * précède (mesuré : `rich-capture-{light,dark}.png`, « les chiffres de
   * mars. » et « pour Marta. » recouverts).
   *
   * Le correctif GARDE l'économie du slot vide (aucune ligne blanche tant que
   * le module n'a rien posé) et ne réserve la hauteur du bouton QUE lorsque
   * `.reagir-slot` porte réellement un `.reagir` — donc jamais avant que le
   * module l'y insère, jamais sur un navigateur sans JavaScript. La marge de
   * la ligne (test précédent) n'est pas concernée : seule la hauteur change.
   */
  it('réserve la hauteur du bouton « Réagir » SEULEMENT quand il est posé — jamais avant, jamais en trop', () => {
    expect(FEUILLE_DU_FIL).toContain('.ligne .reagir-slot{display:inline-flex;align-items:center;justify-content:center;flex:none;width:var(--target-min);height:0;overflow:visible}');
    expect(FEUILLE_DU_FIL).toContain('.ligne .reagir-slot:has(>.reagir){height:var(--target-min)}');
  });
});
