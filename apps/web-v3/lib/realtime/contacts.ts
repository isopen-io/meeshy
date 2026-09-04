import { repondreALaDemande, type Geste } from '@/lib/api/contacts';
import { COOKIE_DE_JETON, valeurDuCookie } from '@/lib/api/cookies';
import { CONTACTS } from '@/lib/contenu/contacts';
import { FENETRE_REVERSIBLE_MS } from '@/lib/contenu/liste';

import { observeCycleDeVie } from './lifecycle';

/**
 * LE MODULE DE PARTICIPATION DE `/contacts` (issue #4921) — le cinquième, sans
 * socket comme `/feed` : accepter et refuser une demande sont des allers
 * simples, et la présence de cette page est STATIQUE par la loi (directive
 * 2026-08-25 : rien ne se fabrique, rien ne se garde de ce que le serveur a
 * retiré — un direct de présence n'aurait rien à peindre).
 *
 * TOUT CE QU'IL FAIT, LE DOCUMENT LE FAIT DÉJÀ SANS LUI, plus lentement : les
 * deux gestes sont des `<form method="post">` que la porte applique en
 * Post/Redirect/Get. Le module SUPPRIME le rechargement et rend le geste
 * OPTIMISTE — peint d'abord, envoyé ensuite, défait et DIT sur refus.
 *
 * IL NE CRÉE AUCUN NŒUD (même loi que `feed.ts`) : l'état « fait » d'une ligne
 * est une fente SERVIE cachée (`.etat-du-geste`, `contacts-vue.ts`), la voix de
 * l'écran est la région `#journal-des-gestes` servie par le document.
 *
 * LE REFUS EST RÉVERSIBLE, ET LA FENÊTRE EST CELLE DE `/chats`
 * (`FENETRE_REVERSIBLE_MS`, un seul site) : refuser RETIRE la ligne de l'écran
 * tout de suite, « Annuler » la rend tant que rien n'est parti, et l'envoi ne
 * part qu'à la fermeture de la fenêtre — refuser est une porte à sens unique
 * côté serveur, et proposer « Annuler » après l'avoir franchie promettrait une
 * réversibilité que la passerelle ne sait pas rendre. L'acceptation, elle,
 * part tout de suite : elle ne détruit rien.
 */

type Contexte = {
  readonly main: HTMLElement;
  readonly passerelle: string;
  readonly jeton: string;
  /** Le refus dont l'envoi attend la fin de sa fenêtre d'annulation. */
  differe: { readonly ligne: HTMLElement; readonly minuterie: ReturnType<typeof setTimeout> } | null;
};

const journal = (ctx: Contexte): HTMLElement | null =>
  ctx.main.querySelector<HTMLElement>('#journal-des-gestes');

/** Le contrôle d'où le geste de refus part — celui à qui le focus revient quand la ligne revient. */
const boutonDeRefus = (ligne: HTMLElement): HTMLElement | null =>
  ligne.querySelector<HTMLElement>('button[value="refuser"]');

/** La ligne VOISINE encore visible — là où le clavier reprend quand la ligne d'origine part. */
const controleVoisin = (ctx: Contexte, ligne: HTMLElement): HTMLElement | null => {
  const lignes = [...ctx.main.querySelectorAll<HTMLElement>('li[data-demande]')].filter((l) => !l.hidden);
  const rang = lignes.indexOf(ligne);
  const voisine = lignes[rang + 1] ?? lignes[rang - 1] ?? null;
  return voisine === null ? ctx.main.querySelector<HTMLElement>('.fil-tete a.retour') : boutonDeRefus(voisine);
};

const boutonDAnnulation = (ctx: Contexte): HTMLButtonElement | null =>
  journal(ctx)?.querySelector<HTMLButtonElement>('button') ?? null;

const tientLeFocus = (bouton: HTMLButtonElement | null): boolean =>
  bouton !== null && document.activeElement === bouton;

/**
 * LA VOIX DE L'ÉCRAN — la région servie, jamais fabriquée. Le bouton
 * « Annuler » y prend le FOCUS dès qu'il existe (WCAG 2.4.3, la même
 * discipline que `/chats`) : la ligne d'où le geste part est cachée avec lui,
 * et sans ce déplacement un lecteur au clavier devait re-tabuler tout le
 * document en moins de cinq secondes pour rattraper un refus.
 */
const dis = (ctx: Contexte, phrase: string, annulation: (() => void) | null): void => {
  const region = journal(ctx);
  if (region === null) return;
  region.replaceChildren();
  const quoi = document.createElement('span');
  quoi.className = 'quoi';
  quoi.textContent = phrase;
  region.append(quoi);
  if (annulation === null) return;
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'action contour';
  bouton.textContent = CONTACTS.annuler;
  bouton.addEventListener('click', annulation, { once: true });
  region.append(bouton);
  bouton.focus();
};

const retireLAnnulation = (ctx: Contexte, cible: HTMLElement | null): void => {
  const bouton = boutonDAnnulation(ctx);
  if (bouton === null) return;
  const reprend = tientLeFocus(bouton);
  bouton.remove();
  if (reprend) cible?.focus();
};

const peinsLeFait = (ligne: HTMLElement, phrase: string): void => {
  const gestes = ligne.querySelector<HTMLElement>('.gestes');
  const etat = ligne.querySelector<HTMLElement>('.etat-du-geste');
  if (gestes !== null) gestes.hidden = true;
  if (etat !== null) {
    etat.textContent = phrase;
    etat.hidden = false;
  }
};

const defaisLaPeinture = (ligne: HTMLElement): void => {
  const gestes = ligne.querySelector<HTMLElement>('.gestes');
  const etat = ligne.querySelector<HTMLElement>('.etat-du-geste');
  ligne.hidden = false;
  if (gestes !== null) gestes.hidden = false;
  if (etat !== null) {
    etat.hidden = true;
    etat.textContent = '';
  }
};

const envoie = (ctx: Contexte, ligne: HTMLElement, geste: Geste): Promise<void> =>
  repondreALaDemande({
    jeton: ctx.jeton,
    demandeId: ligne.dataset.demande ?? '',
    geste,
    base: ctx.passerelle,
  }).then((issue) => {
    if (issue === 'faite') return;
    // LE REFUS DE LA PASSERELLE NE MENT PAS : la ligne revient, l'écran le dit.
    defaisLaPeinture(ligne);
    dis(ctx, CONTACTS.echouee, null);
  });

/** ACCEPTER — rien à détruire : peint, dit, part tout de suite, se défait sur refus. */
const surAccepter = (ctx: Contexte, ligne: HTMLElement): void => {
  soldeLeDiffere(ctx);
  peinsLeFait(ligne, CONTACTS.acceptee);
  dis(ctx, CONTACTS.acceptee, null);
  void envoie(ctx, ligne, 'accepter');
};

/** REFUSER — la ligne part de l'écran, « Annuler » la rend, l'envoi attend la fenêtre. */
const surRefuser = (ctx: Contexte, ligne: HTMLElement): void => {
  soldeLeDiffere(ctx);
  const voisin = controleVoisin(ctx, ligne);
  ligne.hidden = true;
  const minuterie = setTimeout(() => {
    ctx.differe = null;
    void envoie(ctx, ligne, 'refuser');
    retireLAnnulation(ctx, voisin);
  }, FENETRE_REVERSIBLE_MS);
  ctx.differe = { ligne, minuterie };
  dis(ctx, CONTACTS.refusee, () => {
    const differe = ctx.differe;
    if (differe === null) return;
    clearTimeout(differe.minuterie);
    ctx.differe = null;
    defaisLaPeinture(differe.ligne);
    const reprend = tientLeFocus(boutonDAnnulation(ctx));
    journal(ctx)?.replaceChildren();
    if (reprend) boutonDeRefus(differe.ligne)?.focus();
  });
};

/** Un second geste SOLDE le refus en attente — deux fenêtres ne se partagent pas. */
const soldeLeDiffere = (ctx: Contexte): void => {
  const differe = ctx.differe;
  if (differe === null) return;
  clearTimeout(differe.minuterie);
  ctx.differe = null;
  void envoie(ctx, differe.ligne, 'refuser');
};

const prendsLesGestes = (ctx: Contexte): void => {
  ctx.main.addEventListener('submit', (evenement) => {
    const formulaire = (evenement.target as HTMLElement | null)?.closest<HTMLFormElement>('form');
    const ligne = formulaire?.closest<HTMLElement>('li[data-demande]');
    if (formulaire === null || formulaire === undefined || ligne === null || ligne === undefined) return;
    const geste = ((evenement as SubmitEvent).submitter as HTMLButtonElement | null)?.value ?? '';
    if (geste !== 'accepter' && geste !== 'refuser') return;
    evenement.preventDefault();
    if (geste === 'accepter') surAccepter(ctx, ligne);
    else surRefuser(ctx, ligne);
  });

  // LE DÉPART DE LA PAGE EXPÉDIE ce qui attendait : la fenêtre d'annulation
  // n'y survit pas — sans quoi un refus « fait » à l'écran n'aurait jamais
  // atteint la passerelle. Le cycle de vie a UN point d'écoute (`lifecycle.ts`,
  // gardé par le lint de zone) : la destruction y est la transition du départ.
  observeCycleDeVie({
    cleDuJeton: 'meeshy-contacts',
    sur: (transition) => {
      if (transition.type === 'destruction') soldeLeDiffere(ctx);
    },
  });
};

const demarre = (): void => {
  const main = document.querySelector<HTMLElement>('main[data-participation="contacts"]');
  if (main === null) return;
  const passerelle = main.dataset.passerelle;
  if (passerelle === undefined) return;
  const jeton = valeurDuCookie(document.cookie, COOKIE_DE_JETON);
  if (jeton === null) return;

  prendsLesGestes({ main, passerelle, jeton, differe: null });
};

demarre();
