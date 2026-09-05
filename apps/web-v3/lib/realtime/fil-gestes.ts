import { citationDeReponse, resoutContreLaPage } from '@/lib/api/citations';
import { MENTIONS_RETENUES } from '@/lib/api/fil';
import { modifie as modifieParRoute, reagis, retire as retireParRoute, traduitLeRefusServi } from '@/lib/api/fil-mutations';
import { FIL } from '@/lib/contenu/fil';

import type { Contexte } from './fil-contexte';
import * as F from './fil-etat';
import { choisisUneReaction } from './fil-peinture';

/**
 * LES GESTES DU FIL — réagir (extrait de `participate.ts`, § 4 étape 0 de la
 * spécification #5163) ET répondre / modifier / retirer (§ 12.10.1, la
 * livraison de cette issue). AUCUN import de `app/` (leçon 518 : +54 % mesuré
 * sur un import de vue) ; `ctx`, `applique` et `envoieLaBulle` sont reçus en
 * DÉPENDANCES — jamais un import circulaire vers `participate.ts`, qui
 * possède le socket et la boucle de peinture.
 */

const DELAI_D_ACCUSE_MS = 10_000;

const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur) ? (valeur as Readonly<Record<string, unknown>>) : null;

const chaine = (valeur: unknown): string | null => (typeof valeur === 'string' && valeur !== '' ? valeur : null);

/**
 * Un accusé de socket — `{ success, error? }` (`_sendGenericError`,
 * `MessageHandler.ts:2282-2292` ; `ReactionHandler.ts`, `AckResponseOf`) —, ou
 * l'échec SANS transport ni réponse (délai, déconnexion). `message` porte la
 * raison SERVIE quand le geste est refusé — `null` sur un succès ou une panne
 * de transport, jamais une phrase fabriquée ici.
 */
export const emetsAvecAccuse = (
  socket: NonNullable<Contexte['socket']>,
  evenement: string,
  charge: unknown,
): Promise<{ readonly fait: boolean; readonly message: string | null }> =>
  new Promise((resoud) => {
    socket.timeout(DELAI_D_ACCUSE_MS).emit(evenement, charge, (erreur: unknown, reponse: unknown) => {
      const enveloppe = objet(reponse);
      const fait = (erreur === null || erreur === undefined) && enveloppe?.success === true;
      resoud({ fait, message: fait ? null : chaine(enveloppe?.error) });
    });
  });

type Applique = (ctx: Contexte, suivant: F.EtatDuFil) => void;

/**
 * MON geste sur une pastille : peint d'abord (`reagisMoiMeme`), dit ensuite —
 * `reaction:add` / `reaction:remove` `{ messageId, emoji }` sur le socket
 * (`ReactionHandler.ts`), ou `POST` / `DELETE /reactions` par la route quand
 * le socket manque (`lib/api/fil.ts` › `reagis`). Un refus rejoue le geste à
 * l'envers ; l'agrégat exact arrive par `reaction:added` / `reaction:removed`.
 */
export const basculeLaReaction = async (ctx: Contexte, applique: Applique, messageId: string, emoji: string, ajoute: boolean): Promise<void> => {
  if (ctx.ferme || emoji === '' || messageId === '') return;
  applique(ctx, F.reagisMoiMeme(ctx.etat, messageId, emoji, ajoute));
  const fait =
    ctx.socket !== null && ctx.pret
      ? (await emetsAvecAccuse(ctx.socket, ajoute ? 'reaction:add' : 'reaction:remove', { messageId, emoji })).fait
      : (await reagis({ creance: ctx.creance, messageId, emoji, retirer: !ajoute, base: ctx.config.passerelle })).genre === 'fait';
  if (!fait) applique(ctx, F.reagisMoiMeme(ctx.etat, messageId, emoji, !ajoute));
};

/**
 * La raison d'un refus est SERVIE, jamais avalée — le même `<output
 * role="alert">` que le composeur (`fil-vue.ts:492`). EXPORTÉE depuis
 * l'issue #5061 : `lib/realtime/capture.ts` (micro, position) le réutilise
 * pour peindre exactement la même sortie — jamais une jumelle.
 */
export const afficheLeRefus = (ctx: Contexte, message: string): void => {
  const noeud = ctx.main.querySelector<HTMLElement>('#refus-du-composeur');
  if (noeud === null) return;
  noeud.textContent = message;
  noeud.hidden = false;
};

/** Le focus se pose sur la LIGNE elle-même après un retrait — jamais `<body>` (leçon 519). */
const poseLeFocusSurLaLigne = (ctx: Contexte, messageId: string): void => {
  const ligne = ctx.p.liste.querySelector<HTMLElement>(`li[data-id="${messageId}"]`);
  if (ligne === null) return;
  if (!ligne.hasAttribute('tabindex')) ligne.setAttribute('tabindex', '-1');
  ligne.focus();
};

/**
 * RETIRER SA PROPRE BULLE — optimiste (`retireMoiMeme`), le socket d'abord
 * (`message:delete`, `MeeshySocketIOManager.ts:1758-1759`), la route en
 * repli (`DELETE /messages/:id`) quand le socket manque — le même patron que
 * `basculeLaReaction`. Un refus RÉTABLIT la bulle à l'identique.
 */
export const executeLeRetrait = async (ctx: Contexte, applique: Applique, messageId: string): Promise<void> => {
  const avant = ctx.etat.bulles.find((bulle) => bulle.id === messageId);
  if (avant === undefined || ctx.ferme) return;
  applique(ctx, F.retireMoiMeme(ctx.etat, messageId));
  poseLeFocusSurLaLigne(ctx, messageId);
  const resultat =
    ctx.socket !== null && ctx.pret
      ? await emetsAvecAccuse(ctx.socket, 'message:delete', { messageId })
      : await retireParRoute({ creance: ctx.creance, messageId, base: ctx.config.passerelle }).then((issue) =>
          issue.genre === 'fait' ? { fait: true, message: null } : { fait: false, message: issue.message },
        );
  if (resultat.fait) {
    applique(ctx, F.confirmeLaMutation(ctx.etat, messageId));
    return;
  }
  applique(ctx, F.retabli(ctx.etat, avant));
  afficheLeRefus(ctx, resultat.message ?? FIL.refuse);
};

/**
 * MODIFIER SA PROPRE BULLE — optimiste (`modifieMoiMeme`), le socket d'abord
 * (`message:edit`, le transport PRIMAIRE, `messageEditedPayload.ts:9-11`), la
 * route en repli (`PUT /messages/:id`). Un refus RÉTABLIT la bulle ET rend
 * le texte saisi au champ (`composeur.rends`) — jamais perdu.
 */
export const envoieLaModification = async (ctx: Contexte, applique: Applique, id: string, texte: string): Promise<void> => {
  const avant = ctx.etat.bulles.find((bulle) => bulle.id === id);
  if (avant === undefined || ctx.ferme) return;
  applique(ctx, F.modifieMoiMeme(ctx.etat, id, texte));
  const parSocket = ctx.socket !== null && ctx.pret;
  const issue = parSocket
    ? await emetsAvecAccuse(ctx.socket as NonNullable<Contexte['socket']>, 'message:edit', { messageId: id, content: texte }).then((resultat) => ({
        fait: resultat.fait,
        // `modifieParRoute` (repli REST) traduit déjà — `traduitLeRefusServi`
        // est le site UNIQUE des deux transports (défaut #5163 §6) : la même
        // raison anglaise du socket (« edit ») ne doit pas rester non traduite
        // là où celle de la route (« modify ») l'était déjà.
        message: resultat.fait ? '' : traduitLeRefusServi(resultat.message ?? FIL.refuse),
      }))
    : await modifieParRoute({ creance: ctx.creance, messageId: id, texte, base: ctx.config.passerelle }).then((issue) =>
        issue.genre === 'fait' ? { fait: true, message: '' } : { fait: false, message: issue.message },
      );
  if (issue.fait) {
    applique(ctx, F.confirmeLaMutation(ctx.etat, id));
    return;
  }
  applique(ctx, F.retabli(ctx.etat, avant));
  // L'ARMEMENT SURVIT AU REFUS. `rends()` remettait le texte dans un composeur
  // DÉSARMÉ (`envoie()` a vidé le contexte avant l'appel) : réessayer y aurait
  // posté un message NEUF, doublon visible de tous, au lieu de rééditer le
  // message visé. Réarmer rend le texte ET la cible.
  ctx.composeur?.armeLaModification({
    id,
    texteOriginal: texte,
    // La base de comparaison « rien n'a changé » reste le texte SERVI —
    // celui du message avant cette tentative, jamais le texte refusé
    // lui-même (défaut #5163 §8) : sans quoi retenter le MÊME texte
    // désarmerait au lieu de réessayer.
    texteServi: avant.texteOriginal,
    langue: avant.langueOriginale,
    avecPiece: avant.pieces.length > 0,
  });
  afficheLeRefus(ctx, issue.message);
};

/**
 * LE BOUTON QUI A SOUMIS LE FORMULAIRE — `SubmitEvent.submitter`, sur un
 * moteur qui le sert. Sans lui (`submitter === null` — un moteur qui ne
 * l'implémente pas), le REPLI est `document.activeElement` : le bouton
 * cliqué reste le dernier élément focalisé au moment du `submit`. S'il ne
 * s'agit toujours pas d'un bouton DE CE formulaire, le geste NAVIGUE — le
 * chemin sans JavaScript, qui marche déjà (défaut #5163 §3) — plutôt que de
 * deviner une action. C'est une décision ÉCRITE, pas un accident.
 */
const boutonSoumis = (evenement: SubmitEvent, formulaire: HTMLFormElement): HTMLButtonElement | null => {
  // `!= null` — jamais `!== null` : un `Event` qui n'implémente pas
  // `SubmitEvent` (un moteur qui ne le sert pas, ou un événement fabriqué à la
  // main sans le constructeur) rend `submitter` ABSENT (`undefined`), jamais
  // `null` — `undefined !== null` est vrai en JavaScript, ce qui aurait fait
  // sauter le repli et retourné `undefined` comme s'il s'agissait d'un bouton.
  const direct = (evenement as { readonly submitter?: HTMLButtonElement | null }).submitter;
  if (direct != null) return direct;
  const actif = document.activeElement;
  return actif instanceof HTMLButtonElement && formulaire.contains(actif) ? actif : null;
};

/**
 * REFERMER LES MENUS — un lecteur qui ouvre un menu par erreur ne doit
 * jamais rester avec un panneau posé sur le fil (défaut #5163 §5) : ouvrir un
 * SECOND menu referme le premier, un clic hors de tout menu les referme tous,
 * et Échap fait de même — traité sur LA LISTE, avant que le composeur ne
 * désarme le sien (`composeur.ts` › `surTouche`, un autre élément, jamais en
 * concurrence directe, mais la liste doit trancher pour ce qui lui appartient).
 */
const refermeLesMenus = (ctx: Contexte, sauf: HTMLDetailsElement | null): void => {
  ctx.p.liste.querySelectorAll<HTMLDetailsElement>('details.actions[open]').forEach((details) => {
    if (details !== sauf) details.removeAttribute('open');
  });
};

/**
 * PAS ASSEZ DE PLACE AU-DESSUS — une ESTIMATION de la hauteur du panneau (le
 * plus grand des trois formulaires possibles, mesuré une fois), pas une
 * mesure du panneau lui-même : `getBoundingClientRect` d'un `<details>` tout
 * juste ouvert peut encore rendre une hauteur nulle sur certains moteurs
 * avant le prochain paint. Trop proche du haut de la liste ⇒ le panneau
 * bascule et s'ouvre vers le BAS (`.ouvre-bas`, `fil-feuille.ts`), plutôt que
 * de sortir de la zone visible (défaut #5163 §4).
 */
const HAUTEUR_DU_PANNEAU_ESTIMEE_PX = 168;

const positionneLePanneau = (ctx: Contexte, details: HTMLDetailsElement): void => {
  const ligne = details.closest<HTMLElement>('li.ligne');
  if (ligne === null) return;
  const placeAuDessus = ligne.getBoundingClientRect().top - ctx.p.liste.getBoundingClientRect().top;
  details.classList.toggle('ouvre-bas', placeAuDessus < HAUTEUR_DU_PANNEAU_ESTIMEE_PX);
};

const prendsLaFermetureDesMenus = (ctx: Contexte): { readonly detruit: () => void } => {
  const surBascule = (evenement: Event): void => {
    const details = evenement.target;
    if (!(details instanceof HTMLDetailsElement) || !details.open) return;
    refermeLesMenus(ctx, details);
    positionneLePanneau(ctx, details);
  };
  const surPointeurExterieur = (evenement: Event): void => {
    const cible = evenement.target as HTMLElement | null;
    if (cible?.closest('details.actions[open]') != null) return;
    refermeLesMenus(ctx, null);
  };
  const surEchap = (evenement: KeyboardEvent): void => {
    if (evenement.key !== 'Escape') return;
    if (ctx.p.liste.querySelector('details.actions[open]') === null) return;
    evenement.stopPropagation();
    refermeLesMenus(ctx, null);
  };
  // `toggle` sur `<details>` NE BULLE PAS (spécification HTML) : la CAPTURE,
  // qui traverse les ancêtres avant la cible, est le seul moyen de l'attraper
  // depuis la liste plutôt que d'en poser un par ligne.
  ctx.p.liste.addEventListener('toggle', surBascule, true);
  document.addEventListener('pointerdown', surPointeurExterieur);
  ctx.p.liste.addEventListener('keydown', surEchap);
  return {
    detruit: () => {
      ctx.p.liste.removeEventListener('toggle', surBascule, true);
      document.removeEventListener('pointerdown', surPointeurExterieur);
      ctx.p.liste.removeEventListener('keydown', surEchap);
    },
  };
};

/**
 * LE MENU D'UNE LIGNE — un SEUL `<form>` par ligne (§ 12.10.1, issue #5163) ;
 * `boutonSoumis` élit le bouton cliqué. « Répondre » et « Modifier » arment
 * le composeur EN PLACE — Q4 de la spécification : l'armement n'est PAS une
 * navigation, `preventDefault` l'empêche donc de naviguer avec JavaScript, là
 * où la même page navigue sans lui. « Retirer » part aussitôt (Q10 : pas de
 * confirmation, le `<details>` en est déjà une).
 */
const prendsLeMenu = (ctx: Contexte, applique: Applique): { readonly detruit: () => void } => {
  const surSoumission = (evenement: Event): void => {
    const cible = evenement.target as HTMLElement | null;
    const formulaire = cible?.closest<HTMLFormElement>('details.actions form');
    if (formulaire === null || formulaire === undefined) return;
    const bouton = boutonSoumis(evenement as SubmitEvent, formulaire);
    if (bouton === null) return;
    const messageId = bouton.value;
    const bulle = ctx.etat.bulles.find((candidate) => candidate.id === messageId);
    if (bulle === undefined) return;
    evenement.preventDefault();
    formulaire.closest<HTMLDetailsElement>('details.actions')?.removeAttribute('open');

    if (bouton.name === 'repondre') {
      // L'APERÇU EST RÉSOLU CONTRE LA PAGE, comme le serveur le résout
      // (`fil-vue.ts` › `contexteDuComposeur`) : `citationDeReponse` ne rend
      // qu'un SQUELETTE — sans cette descente, le bandeau annonçait une
      // réponse au-dessus d'une citation VIDE, là où le chemin sans
      // JavaScript montrait le texte cité.
      ctx.composeur?.armeLaReponse(
        resoutContreLaPage(
          citationDeReponse({ cible: bulle.id, source: bulle.deMoi ? FIL.vous : bulle.auteur }),
          ctx.etat.bulles,
          MENTIONS_RETENUES,
        ),
      );
      return;
    }
    if (bouton.name === 'modifier') {
      ctx.composeur?.armeLaModification({
        id: bulle.id,
        texteOriginal: bulle.texteOriginal,
        langue: bulle.langueOriginale,
        avecPiece: bulle.pieces.length > 0,
      });
      return;
    }
    if (bouton.name === 'retirer') void executeLeRetrait(ctx, applique, messageId);
  };
  ctx.p.liste.addEventListener('submit', surSoumission);
  return { detruit: () => ctx.p.liste.removeEventListener('submit', surSoumission) };
};

/**
 * TOUS LES GESTES D'UNE LIGNE — réagir, répondre, modifier, retirer.
 * `envoieLaBulle` est celle de `participate.ts` : « Réessayer » un envoi
 * échoué rejoue le MÊME transport que l'envoi initial, jamais une jumelle.
 *
 * REND une poignée de destruction (dimension 3, § 12.11 étage 3 — « aucune
 * fuite de listener ni de socket ») : le `<main>` entier est aujourd'hui
 * remplacé par le navigateur de zone (`replaceWith`, `navigateur.ts`), ce qui
 * emporte ces écouteurs DOM avec lui — mais rien ne le garantissait si un
 * jour un écran se recompose SANS remplacer `<main>`, et la poignée coûte
 * trois `removeEventListener`.
 */
export const prendsLesGestes = ({
  ctx,
  applique,
  envoieLaBulle,
}: {
  readonly ctx: Contexte;
  readonly applique: Applique;
  readonly envoieLaBulle: (ctx: Contexte, bulle: F.Bulle) => Promise<void>;
}): { readonly detruit: () => void } => {
  const surReaction = (evenement: Event): void => {
    const formulaire = (evenement.target as HTMLElement | null)?.closest<HTMLFormElement>('form.reagir-par');
    if (formulaire === null || formulaire === undefined) return;
    evenement.preventDefault();
    const emoji = formulaire.querySelector<HTMLInputElement>('input[name="reaction"]')?.value ?? '';
    const messageId = formulaire.querySelector<HTMLInputElement>('input[name="message"]')?.value ?? '';
    const bulle = ctx.etat.bulles.find((b) => b.id === messageId);
    const mienne = bulle?.reactions.find((r) => r.emoji === emoji)?.mienne ?? false;
    void basculeLaReaction(ctx, applique, messageId, emoji, !mienne);
  };

  const surClic = (evenement: Event): void => {
    const cible = evenement.target as HTMLElement | null;
    const reagir = cible?.closest<HTMLElement>('button.reagir');
    if (reagir !== null && reagir !== undefined) {
      const messageId = reagir.closest<HTMLElement>('li.ligne')?.dataset.id ?? '';
      void choisisUneReaction(ctx.p).then((emoji) => basculeLaReaction(ctx, applique, messageId, emoji, true));
      return;
    }
    const reessayer = cible?.closest<HTMLElement>('button.reessayer');
    if (reessayer === null || reessayer === undefined) return;
    const ligne = reessayer.closest<HTMLElement>('li.ligne');
    const bulle = ctx.etat.bulles.find((b) => b.clientMessageId !== null && b.clientMessageId === ligne?.dataset.cid);
    if (bulle !== undefined) void envoieLaBulle(ctx, { ...bulle, envoi: 'en-attente' });
  };

  ctx.p.liste.addEventListener('submit', surReaction);
  ctx.p.liste.addEventListener('click', surClic);
  const menu = prendsLeMenu(ctx, applique);
  const fermeture = prendsLaFermetureDesMenus(ctx);

  return {
    detruit: () => {
      ctx.p.liste.removeEventListener('submit', surReaction);
      ctx.p.liste.removeEventListener('click', surClic);
      menu.detruit();
      fermeture.detruit();
    },
  };
};
