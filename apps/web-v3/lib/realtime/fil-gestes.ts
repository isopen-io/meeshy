import { citationDeReponse, resoutContreLaPage } from '@/lib/api/citations';
import { MENTIONS_RETENUES } from '@/lib/api/fil';
import { modifie as modifieParRoute, reagis, retire as retireParRoute, traduitLeRefusServi } from '@/lib/api/fil-mutations';
import { FIL } from '@/lib/contenu/fil';

import type { Contexte } from './fil-contexte';
import * as F from './fil-etat';
import { choisisUneReaction } from './fil-peinture';
import { memoriseLeRetrait, oublieLeRetrait, retraitsEnAttente } from './fil-reserve';

/**
 * LES GESTES DU FIL — réagir (extrait de `participate.ts`, § 4 étape 0 de la
 * spécification #5163) ET répondre / modifier / retirer (§ 12.10.1, la
 * livraison de cette issue). AUCUN import de `app/` (leçon 518 : +54 % mesuré
 * sur un import de vue) ; `ctx`, `applique` et `envoieLaBulle` sont reçus en
 * DÉPENDANCES — jamais un import circulaire vers `participate.ts`, qui
 * possède le socket et la boucle de peinture.
 */

const DELAI_D_ACCUSE_MS = 10_000;

/**
 * LA FENÊTRE D'ANNULATION D'UN RETRAIT (suivi #5163 § 12.12) — le temps
 * pendant lequel RIEN ne part vers la passerelle : « Retirer » n'est donc pas
 * irréversible tant qu'elle est ouverte, et « Annuler » n'annule jamais un
 * envoi déjà parti — il annule un envoi qui n'a PAS ENCORE eu lieu. Il
 * n'existe aucune route de restauration côté passerelle (`deletedAt` n'a pas
 * de repli) : le différé est la forme du snapshot qui ne coûte AUCUNE
 * capacité serveur nouvelle.
 */
export const FENETRE_D_ANNULATION_DU_RETRAIT_MS = 5_000;

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
 * LA FENÊTRE SE REFERME SOUS LE FOCUS — le bouton « Annuler » n'est visible
 * que tant que `<li>` porte `envoi-retrait-differe` (`fil-feuille.ts`) : à
 * l'expiration, la classe tombe, le bouton passe `display:none` et le
 * navigateur RETIRE le focus qu'il portait — c'est-à-dire `<body>`, la
 * leçon 519 rejouée un cran plus loin par la fenêtre elle-même. Le focus
 * revient donc sur LA LIGNE, la même destination qu'`annule` — et seulement
 * s'il était encore DANS la fente qui disparaît : un lecteur reparti écrire
 * dans le composeur ne se le fait jamais voler.
 */
const sauveLeFocusDeLaFenetre = (ctx: Contexte, messageId: string): void => {
  const fente = ctx.p.liste.querySelector<HTMLElement>(`li[data-id="${messageId}"] .retrait`);
  if (fente === null || !fente.contains(document.activeElement)) return;
  poseLeFocusSurLaLigne(ctx, messageId);
};

type PoigneeDeRetrait = {
  /** « Retirer » — peint tout de suite, n'envoie RIEN pendant la fenêtre. */
  readonly differe: (messageId: string) => void;
  /** « Annuler » — restaure la bulle. Inopérant si le différé a déjà été DÉSARMÉ (§ ci-dessous). */
  readonly annule: (messageId: string) => void;
  /** `destruction` (§ 12.11 étage 3) — flush IMMÉDIAT de ce qui restait en fenêtre, par la route, `keepalive`. */
  readonly detruit: () => void;
};

/**
 * RETIRER SA PROPRE BULLE, DERRIÈRE UNE FENÊTRE D'ANNULATION (suivi #5163
 * § 12.12) — peindre optimiste TOUT DE SUITE (`retireMoiMeme`), mais
 * n'envoyer RIEN avant `fenetreMs` : la passerelle n'offre aucune route de
 * restauration (`deletedAt` n'a pas de repli), donc « Annuler » ne peut
 * qu'annuler un envoi qui n'a PAS ENCORE eu lieu. Le transport, une fois la
 * fenêtre expirée, est le MÊME patron que `basculeLaReaction` — le socket
 * d'abord (`message:delete`), la route en repli (`DELETE /messages/:id`).
 *
 * L'ÉTAT TENU ICI (`enCours`) vit dans la FERMETURE d'un appel —
 * jamais un état de module : deux onglets, deux fils, deux fenêtres
 * indépendantes. `encoreDiffere` est la garde qui rend `annule` et le flush
 * DIFFÉRÉ tolérants à un `message:deleted` reçu D'AUTRUI pendant la
 * fenêtre (`retire`, `fil-etat.ts`, appelé par `participate.ts`) : la bulle
 * n'est alors plus `retrait-differe`, et ni l'expiration ni un clic sur
 * « Annuler » n'y touchent plus — le message est déjà retiré côté serveur,
 * il n'y a plus rien à annuler ni à envoyer une seconde fois.
 *
 * ET LA FENÊTRE NE FAIT RIEN PARTIR D'UN ONGLET CACHÉ NI D'UN RÉSEAU ABSENT
 * (revue) : la minuterie, armée sous les yeux du lecteur, expire quoi qu'il
 * arrive ensuite — elle se RÉARME alors au lieu d'émettre, et l'envoi part au
 * retour. Sans ce report, ce module devenait le premier de la v3 à muter
 * pendant `visibilitychange:hidden`, ce que le § 8.5 interdit nommément.
 */
export const prendsLesRetraits = ({
  ctx,
  applique,
  fenetreMs = FENETRE_D_ANNULATION_DU_RETRAIT_MS,
}: {
  readonly ctx: Contexte;
  readonly applique: Applique;
  readonly fenetreMs?: number;
}): PoigneeDeRetrait => {
  const enCours = new Map<string, { readonly avant: F.Bulle; readonly minuteur: ReturnType<typeof setTimeout> }>();

  const encoreDiffere = (messageId: string): boolean =>
    ctx.etat.bulles.find((bulle) => bulle.id === messageId)?.envoi === 'retrait-differe';

  const flush = async (messageId: string): Promise<void> => {
    const entree = enCours.get(messageId);
    if (entree === undefined) return;
    // UN ONGLET CACHÉ NE FAIT RIEN PARTIR (§ 8.5, `lifecycle.ts` loi 1), ET
    // HORS LIGNE NON PLUS (§ 7) — une minuterie armée sous les yeux du lecteur
    // expire, elle, quelle que soit la suite : sans ce report, masquer
    // l'onglet dans les cinq secondes émettait un `message:delete` (ou, le
    // socket coupé au masquage, un `DELETE`) que le gate « onglet caché ⇒
    // ZÉRO requête » interdit nommément, et le faire hors ligne rétablissait
    // la bulle sur un refus de transport. La fenêtre se RÉARME : « Annuler »
    // reste offert, et le retrait part au retour — l'erreur choisie est celle
    // qui se répare (le lecteur voit son message encore retirable), jamais
    // celle qui envoie derrière son dos.
    if ((ctx.cache || !ctx.enLigne) && encoreDiffere(messageId)) {
      enCours.set(messageId, { avant: entree.avant, minuteur: setTimeout(() => void flush(messageId), fenetreMs) });
      return;
    }
    enCours.delete(messageId);
    // LE SORT DE CE RETRAIT EST EN TRAIN DE SE DÉCIDER — désarmé par un
    // `message:deleted` d'autrui, envoyé avec succès, ou rétabli sur un refus :
    // dans les TROIS cas, l'intention persistée (`memoriseLeRetrait`) n'a plus
    // rien à survivre. Un rechargement entre ici et l'issue verrait de toute
    // façon la bulle SERVIE (`retraitsEnAttente` la relit contre l'état
    // COURANT, jamais contre une horloge) — l'effacer ici, plutôt qu'à chaque
    // branche, garantit qu'aucune ne l'oublie.
    void oublieLeRetrait(ctx, messageId);
    sauveLeFocusDeLaFenetre(ctx, messageId);
    if (!encoreDiffere(messageId)) return;
    applique(ctx, F.partLeRetrait(ctx.etat, messageId));
    // IDEMPOTENT — « Message not found » (socket, `MessageHandler.ts:1105`)
    // ou un 404 (route, `sendNotFound`, `messages-writes.ts:472`) n'est pas
    // un ÉCHEC de CE `DELETE` : c'est l'état DÉJÀ atteint, exactement comme
    // `reagis()` le traite déjà pour une réaction (`fil-mutations.ts`, un
    // 404 au retrait d'une réaction absente). Sans ce repli, un retrait
    // REPRIS après un rechargement (`reprendLesRetraits`) dont le
    // `keepalive` de la page précédente avait déjà abouti RESSUSCITAIT la
    // bulle sur ce refus — le défaut même que la reprise corrige, rejoué un
    // cran plus loin.
    //
    // La branche SOCKET applique le repli en SYNCHRONE sur la valeur déjà
    // résolue par son SEUL `await` (`issueSocket`) — jamais par un second
    // maillon `.then()` : `flush()` est observé par des témoins qui
    // n'attendent qu'UN battement de microtâche après l'expiration de la
    // fenêtre, et un maillon de plus les aurait fait lire un état
    // INTERMÉDIAIRE (`partLeRetrait`, pas encore `confirmeLaMutation` /
    // `retabli`) — mesuré, en revue, sur ce test même. La branche ROUTE,
    // elle, portait déjà un `.then()` de mapping avant ce lot (une seule
    // forme `Mutation` à traduire) : y ajouter la condition du 404 n'y
    // change pas le nombre de maillons.
    const issueSocket = ctx.socket !== null && ctx.pret ? await emetsAvecAccuse(ctx.socket, 'message:delete', { messageId }) : null;
    const resultat =
      issueSocket !== null
        ? issueSocket.fait || issueSocket.message === 'Message not found'
          ? { fait: true, message: null }
          : issueSocket
        : await retireParRoute({ creance: ctx.creance, messageId, base: ctx.config.passerelle }).then((issue) => {
            if (issue.genre === 'fait' || issue.statut === 404) return { fait: true, message: null };
            return { fait: false, message: issue.message };
          });
    if (resultat.fait) {
      applique(ctx, F.confirmeLaMutation(ctx.etat, messageId));
      return;
    }
    applique(ctx, F.retabli(ctx.etat, entree.avant));
    afficheLeRefus(ctx, resultat.message ?? FIL.refuse);
  };

  const differe = (messageId: string): void => {
    const avant = ctx.etat.bulles.find((bulle) => bulle.id === messageId);
    if (avant === undefined || ctx.ferme || enCours.has(messageId)) return;
    applique(ctx, F.retireMoiMeme(ctx.etat, messageId));
    const minuteur = setTimeout(() => void flush(messageId), fenetreMs);
    enCours.set(messageId, { avant, minuteur });
    // DURABLE (suivi #5163 § 12.12, défaut majeur de revue « un retrait
    // différé ne survit pas à un rechargement ») — l'INTENTION seule est
    // mémorisée, jamais le snapshot `avant` : un rechargement relit la bulle
    // SERVIE par le document neuf (`reprendLesRetraits`), qui EST le snapshot
    // à restaurer si la passerelle n'a toujours rien reçu.
    void memoriseLeRetrait(ctx, messageId);
    // L'ÉCHÉANCE SE VOIT (suivi #5163 § 12.12, défaut majeur de revue « rien
    // ne dit que la fenêtre se referme ») — `--duree-retrait` porte la MÊME
    // valeur que `fenetreMs`, à la source, pour que la barre CSS
    // (`fil-feuille.ts`) et la minuterie ne puissent jamais diverger ; le
    // repère TEXTUEL (`.decompte`) reste dans le DOM en permanence — masqué
    // par défaut, seul `prefers-reduced-motion` le révèle (§ 12.5) — pour que
    // la coupure de l'animation laisse un REPÈRE, jamais une absence.
    const fente = ctx.p.liste.querySelector<HTMLElement>(`li[data-id="${messageId}"] .retrait`);
    if (fente !== null) {
      fente.style.setProperty('--duree-retrait', `${fenetreMs}ms`);
      const decompte = fente.querySelector<HTMLElement>('.decompte');
      if (decompte !== null) decompte.textContent = FIL.decompteDuRetrait(Math.round(fenetreMs / 1000));
    }
    // Le focus se pose sur LE BOUTON D'ANNULATION — l'action que la fenêtre
    // offre — plutôt que sur la ligne : un lecteur d'écran l'annonce
    // aussitôt, sans un second geste pour le trouver. Ce que ce déplacement
    // CONTRACTE, c'est de le rendre : la fenêtre refermée, le bouton cesse
    // d'être rendu et le focus retomberait sur `<body>` — d'où
    // `sauveLeFocusDeLaFenetre` dans `flush` (l'expiration), et le
    // `poseLeFocusSurLaLigne` INCONDITIONNEL d'`annule`, dont le geste même
    // prouve que le focus était sur le bouton.
    const bouton = fente?.querySelector<HTMLElement>('.annuler-le-retrait') ?? null;
    if (bouton !== null) bouton.focus();
    else poseLeFocusSurLaLigne(ctx, messageId);
  };

  const annule = (messageId: string): void => {
    const entree = enCours.get(messageId);
    if (entree === undefined) return;
    clearTimeout(entree.minuteur);
    enCours.delete(messageId);
    void oublieLeRetrait(ctx, messageId);
    // DÉSARMÉ ENTRE-TEMPS (voir le doc-comment) : rien à restaurer, le
    // message est déjà retiré côté serveur.
    if (!encoreDiffere(messageId)) return;
    applique(ctx, F.retabli(ctx.etat, entree.avant));
    poseLeFocusSurLaLigne(ctx, messageId);
  };

  const detruit = (): void => {
    const entrees = [...enCours.entries()];
    enCours.clear();
    // L'ÉCRAN PART : un retrait VOULU par le lecteur ne doit pas rester sans
    // suite parce que la fenêtre n'a pas eu le temps d'expirer. Le socket est
    // DÉJÀ déconnecté à cet instant (`participate.ts` › `destruction`, avant
    // `ctx.gestes?.detruit()`) — la route, en `keepalive`, est le SEUL
    // transport qui survit à la navigation ; fire-and-forget, aucun
    // rétablissement n'est plus possible une fois l'écran parti.
    entrees.forEach(([messageId, { minuteur }]) => {
      clearTimeout(minuteur);
      void retireParRoute({ creance: ctx.creance, messageId, base: ctx.config.passerelle, keepalive: true });
    });
  };

  return { differe, annule, detruit };
};

/**
 * REPRENDRE CE QUI ATTENDAIT ENCORE À LA FERMETURE (suivi #5163 § 12.12,
 * défauts de revue « ne survit pas à un rechargement » et « le document
 * rechargé montre le message revenu ») — lue UNE fois au montage, contre
 * l'état SERVI par le document neuf, jamais contre une horloge locale :
 *
 *   - la bulle est encore là, PAS `supprime` : la passerelle n'a toujours
 *     rien reçu (le `keepalive` de `detruit()` n'a pas encore abouti, ou
 *     l'écran a été fermé autrement qu'en naviguant). `differe()` REJOUE —
 *     la MÊME fenêtre, le MÊME bouton « Annuler » : le document ne montre
 *     JAMAIS le texte d'origine passé le premier octet du module, et
 *     l'éventuel refus « Message not found » d'un `keepalive` qui aurait
 *     entre-temps abouti est désormais IDEMPOTENT (`flush`, ci-dessus) — il
 *     ne ressuscite plus la bulle.
 *   - la bulle est déjà `supprime` : la passerelle a déjà tout reçu (le cas
 *     du SECOND rechargement du défaut de revue). Rien à rejouer — juste
 *     oublier l'intention, qui a atteint son but.
 *   - la bulle n'est plus dans la fenêtre SERVIE (page plus profonde, ou
 *     jamais chargée ici) : ni l'un ni l'autre n'est décidable — on laisse
 *     l'entrée, elle sera relue au prochain montage de ce fil.
 */
export const reprendLesRetraits = async (ctx: Contexte, retraits: PoigneeDeRetrait): Promise<void> => {
  const ids = await retraitsEnAttente(ctx);
  ids.forEach((messageId) => {
    const bulle = ctx.etat.bulles.find((candidate) => candidate.id === messageId);
    if (bulle === undefined) return;
    if (bulle.supprime) {
      void oublieLeRetrait(ctx, messageId);
      return;
    }
    retraits.differe(messageId);
  });
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
 * où la même page navigue sans lui. « Retirer » ne DEMANDE pas confirmation
 * (Q10 : le `<details>` en est déjà une) — mais il ne part plus aussitôt pour
 * autant : il ouvre la FENÊTRE D'ANNULATION (`prendsLesRetraits`, suivi #5163
 * § 12.12), qui remplace la confirmation AVANT par un repentir APRÈS.
 */
const prendsLeMenu = (ctx: Contexte, retraits: PoigneeDeRetrait): { readonly detruit: () => void } => {
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
    if (bouton.name === 'retirer') retraits.differe(messageId);
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
  const retraits = prendsLesRetraits({ ctx, applique });
  // DURABLE À TRAVERS UN RECHARGEMENT (suivi #5163 § 12.12) — lu une fois,
  // au montage, contre l'état SERVI que le document vient de peindre.
  void reprendLesRetraits(ctx, retraits);

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
    const annulerLeRetrait = cible?.closest<HTMLElement>('button.annuler-le-retrait');
    if (annulerLeRetrait !== null && annulerLeRetrait !== undefined) {
      const messageId = annulerLeRetrait.closest<HTMLElement>('li.ligne')?.dataset.id ?? '';
      if (messageId !== '') retraits.annule(messageId);
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
  const menu = prendsLeMenu(ctx, retraits);
  const fermeture = prendsLaFermetureDesMenus(ctx);

  return {
    detruit: () => {
      ctx.p.liste.removeEventListener('submit', surReaction);
      ctx.p.liste.removeEventListener('click', surClic);
      menu.detruit();
      fermeture.detruit();
      retraits.detruit();
    },
  };
};
