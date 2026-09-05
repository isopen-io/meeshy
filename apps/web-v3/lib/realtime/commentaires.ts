import { COMMENTAIRES } from '@/lib/contenu/commentaires';

/**
 * LE MODULE DE PARTICIPATION DE `/post/:id` (issue #5091) — le huitième, au
 * patron de `/links` : le formulaire d'écriture est INTERCEPTÉ, posté par
 * `fetch` au MÊME document, et le Post/Redirect/Get SUIVI jusqu'au bout EST le
 * document frais — sa région `#fil-des-commentaires` (liste avec le
 * commentaire neuf + avis « publié » + formulaire vidé, ou formulaire refusé
 * saisie tenue + motif) remplace la nôtre, d'un bloc. Le serveur reste
 * l'unique compositeur : Prisme des commentaires compris.
 *
 * DEUX RÉPONSES SERVIES, UN SEUL GESTE (l'échange) ; la troisième — rien de
 * lisible, transport coupé — laisse le formulaire INTACT et parle dans sa voix
 * (`.voix-du-geste`, servie muette). Le focus suit l'issue : liste fraîche ⇒
 * le champ vidé (on enchaîne les commentaires) ; refus ⇒ le champ tenu.
 */

const region = (): HTMLElement | null => document.querySelector<HTMLElement>('#fil-des-commentaires');

const disLeGeste = (formulaire: HTMLFormElement, phrase: string): void => {
  const voix = formulaire.querySelector<HTMLElement>('.voix-du-geste');
  if (voix === null) return;
  voix.textContent = phrase;
  voix.hidden = false;
};

const soumets = async (formulaire: HTMLFormElement): Promise<void> => {
  const bouton = formulaire.querySelector<HTMLButtonElement>('button[type="submit"]');
  const libelle = bouton?.textContent ?? '';
  if (bouton !== null) bouton.disabled = true;
  const rends = (): void => {
    if (bouton !== null) {
      bouton.disabled = false;
      bouton.textContent = libelle;
    }
  };

  const reponse = await fetch(window.location.pathname + window.location.search, {
    method: 'POST',
    body: new URLSearchParams(new FormData(formulaire) as unknown as Record<string, string>),
    headers: { accept: 'text/html' },
    redirect: 'follow',
  }).catch(() => null);
  const corps = reponse === null ? null : await reponse.text().catch(() => null);
  if (corps === null) {
    rends();
    disLeGeste(formulaire, COMMENTAIRES.refuse);
    return;
  }

  const recu = new DOMParser().parseFromString(corps, 'text/html');
  const fraiche = recu.querySelector('#fil-des-commentaires');
  const courante = region();
  if (fraiche === null || courante === null) {
    rends();
    disLeGeste(formulaire, COMMENTAIRES.refuse);
    return;
  }

  courante.replaceChildren(...fraiche.children);
  if (reponse !== null && new URL(reponse.url).searchParams.has('commente')) {
    history.replaceState(null, '', new URL(reponse.url).pathname + new URL(reponse.url).search);
  }
  // Le clavier reprend au champ — vidé après un succès, TENU après un refus :
  // dans les deux cas c'est là que la suite s'écrit.
  region()?.querySelector<HTMLTextAreaElement>('textarea[name="contenu"]')?.focus();
};

const demarre = (): void => {
  const main = document.querySelector<HTMLElement>('main[data-participation="commentaires"]');
  if (main === null) return;

  main.addEventListener('submit', (evenement) => {
    const formulaire = (evenement.target as HTMLElement | null)?.closest<HTMLFormElement>('form.ecrire');
    if (formulaire === null || formulaire === undefined) return;
    evenement.preventDefault();
    void soumets(formulaire);
  });
};

demarre();

/**
 * REMONTAGE PAR LE NAVIGATEUR DE ZONE (#5106) : un ES module réimporté ne se
 * ré-exécute pas — après une navigation douce, c'est cet export que le
 * navigateur appelle pour monter l'écran neuf. L'auto-démarrage ci-dessus
 * reste : sans navigateur (amélioration progressive), l'import du chargeur
 * suffit, comme avant.
 */
export const monte = demarre;
