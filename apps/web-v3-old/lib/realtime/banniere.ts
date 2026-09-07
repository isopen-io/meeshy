import { BANNIERE, DUREE_DE_LA_BANNIERE_MS } from '@/lib/contenu/banniere';
import {
  banniereDeNotification,
  type BanniereDeNotification,
  type NotificationServie,
} from '@/lib/notifications/banniere';

/**
 * LA BANNIÈRE EN APPLICATION (#4454) — le toast qui dit CE QUI vient d'arriver,
 * par-dessus l'écran qu'on est en train de lire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELLE NE PORTE AUCUNE RÈGLE DE CADRAGE, ET C'EST TOUT L'OBJET DU DÉCOUPAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Quel type relève de quelle famille, où va la phrase d'action, quand un corps
 * ferait doublon, quand une pastille de réaction dirait deux fois la même
 * chose : tout cela est dans `@meeshy/shared/utils/notification-banner`,
 * partagé avec iOS et le web existant, et LIÉ à la v3 par
 * `lib/notifications/banniere.ts`. Ce module-ci ne fait que PEINDRE ce que la
 * liaison rend, et écouter le socket qui l'apporte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ ELLE PARAÎT, ET POURQUOI PAS PARTOUT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Sur les écrans qui tiennent DÉJÀ un socket : le fil (`participate`) et
 * `/chats` (`liste`). Mesuré : ce sont les deux seuls, avec `/notifications`,
 * dont le module ouvre une connexion — les six autres modules de la v3 n'en
 * ouvrent aucun, et le tableau de bord, le composer et les réglages n'expédient
 * pas une ligne de JavaScript.
 *
 * **Ouvrir un socket sur un écran à 0 Ko pour y montrer un toast contredirait
 * la directive du § 12.4 et celle de la 3G rurale** : on paierait une connexion
 * permanente, sur chaque écran, pour une information que la navigation suivante
 * apporte de toute façon. Le prix est nommé plutôt que payé : sur un écran sans
 * socket, ce qui arrive s'apprend en arrivant sur `/notifications` — dont la
 * pastille, elle, est servie par le document.
 *
 * `/notifications` NE LA MONTRE PAS, et c'est délibéré : son module PRÉPEND
 * déjà la ligne neuve à la liste qu'on regarde. Un toast par-dessus dirait la
 * même chose deux fois, à dix pixels d'écart.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PEINT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Un `<output>` — l'élément que HTML donne au « résultat d'un calcul », donc
 * une région de statut POLIE par défaut : un lecteur d'écran l'annonce sans
 * couper ce qui est en train d'être lu. Elle est SERVIE VIDE par le document
 * (`app/connecte/banniere-vue.ts`) et non créée par le module : une région
 * `aria-live` créée après coup n'est annoncée par aucun lecteur d'écran — le
 * navigateur ne surveille que celles qui existaient quand il a construit
 * l'arbre.
 *
 * AUCUNE VIGNETTE N'EST CHARGÉE. La loi rend `vignette` ; la v3 ne la peint
 * pas — une image tirée du réseau au moment où un toast paraît coûte une
 * requête que personne n'a demandée, sur l'écran de quelqu'un qui fait autre
 * chose. Le TEXTE porte le sens. Le champ reste rendu par la loi pour les
 * clients qui en veulent une.
 *
 * UN TITRE VIDE NE PEINT RIEN. C'est le contrat de `nomDeLActeur` : sans nom
 * servi et sans phrase d'action, la v3 ne fabrique pas de « Quelqu'un » — et un
 * toast qui ne dirait rien vaut moins que pas de toast du tout.
 */

const banniereDeLaCharge = (charge: unknown): BanniereDeNotification | null => {
  if (typeof charge !== 'object' || charge === null || Array.isArray(charge)) return null;
  const notification = charge as NotificationServie;
  return banniereDeNotification(notification, ({ acteur, groupe }) =>
    BANNIERE.dansLeGroupe(acteur, groupe),
  );
};

/**
 * LA COUTURE DU TEMPS — comme `maintenant` l'est des portes serveur. Un témoin
 * qui attendrait sept secondes réelles ferait payer sept secondes à chaque
 * exécution de la suite, et ne prouverait rien de plus.
 */
export type Minuterie = {
  readonly arme: (rappel: () => void, ms: number) => number;
  readonly desarme: (identifiant: number) => void;
};

const MINUTERIE_DU_NAVIGATEUR: Minuterie = {
  arme: (rappel, ms) => window.setTimeout(rappel, ms),
  desarme: (identifiant) => window.clearTimeout(identifiant),
};

export type PorteDeLaBanniere = {
  /** Peint une charge `notification:new`. Sans région servie, ne fait RIEN. */
  readonly montre: (charge: unknown) => void;
  /** Retire la bannière et désarme sa minuterie — la croix, et la fin du module. */
  readonly cache: () => void;
};

/**
 * LA PORTE — elle prend la RÉGION servie, jamais le document : un module qui
 * chercherait lui-même son nœud ne serait pas opposable à un témoin sans
 * navigateur.
 */
export const porteDeLaBanniere = (
  region: HTMLElement | null,
  minuterie: Minuterie = MINUTERIE_DU_NAVIGATEUR,
): PorteDeLaBanniere => {
  let enCours: number | null = null;

  const partie = (classe: string): HTMLElement | null =>
    region === null ? null : region.querySelector<HTMLElement>(`.${classe}`);

  const cache = (): void => {
    if (enCours !== null) {
      minuterie.desarme(enCours);
      enCours = null;
    }
    if (region === null) return;
    region.hidden = true;
    const titre = partie('banniere-titre');
    const corps = partie('banniere-corps');
    const pastille = partie('banniere-reaction');
    if (titre !== null) titre.textContent = '';
    if (corps !== null) corps.textContent = '';
    if (pastille !== null) {
      pastille.textContent = '';
      pastille.hidden = true;
    }
  };

  const montre = (charge: unknown): void => {
    if (region === null) return;
    const banniere = banniereDeLaCharge(charge);
    // Un titre vide est le refus EXPLICITE de la liaison : voir le doc-comment.
    if (banniere === null || banniere.titre === '') return;

    const titre = partie('banniere-titre');
    const corps = partie('banniere-corps');
    const pastille = partie('banniere-reaction');
    if (titre === null || corps === null) return;

    titre.textContent = banniere.titre;
    corps.textContent = banniere.corps ?? '';
    corps.hidden = banniere.corps === null;
    if (pastille !== null) {
      pastille.textContent = banniere.reaction ?? '';
      pastille.hidden = banniere.reaction === null;
    }
    region.hidden = false;

    if (enCours !== null) minuterie.desarme(enCours);
    enCours = minuterie.arme(cache, DUREE_DE_LA_BANNIERE_MS);
  };

  return { montre, cache };
};

/**
 * LE BRANCHEMENT — un site unique, appelé par les deux modules qui tiennent un
 * socket. Il ne connaît ni le fil ni la liste : il connaît une région et un
 * socket, ce qui est exactement ce que les deux ont en commun.
 */
export const brancheLaBanniere = ({
  socket,
  region,
  minuterie,
}: {
  readonly socket: { readonly on: (evenement: string, ecouteur: (charge: unknown) => void) => void };
  readonly region: HTMLElement | null;
  readonly minuterie?: Minuterie;
}): PorteDeLaBanniere => {
  const porte = porteDeLaBanniere(region, minuterie);
  socket.on('notification:new', (charge: unknown) => porte.montre(charge));
  region?.querySelector<HTMLElement>('.banniere-fermer')?.addEventListener('click', (evenement) => {
    evenement.preventDefault();
    porte.cache();
  });
  return porte;
};
