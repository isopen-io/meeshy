import { CHAMPS_DU_COMPOSER, CHAMP_DU_FORMAT, COMPOSER } from '@/lib/contenu/composer';

/**
 * LE MODULE DE `/composer` (#4966) — le NEUVIÈME, et le seul qui ne parle à
 * personne : ni socket, ni `fetch`, ni passerelle. Il tient un BROUILLON.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL FALLAIT UN MODULE, ET PAS UN RÉGLAGE DE CACHE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * #4966 demande qu'« un brouillon saisi survive à un rechargement et à un
 * retour ». Il ne survivait pas, et la cause était MESURÉE, pas supposée : le
 * document d'un écran connecté est servi `cache-control: no-store, private`
 * (`app/connecte/porte.ts` › `CACHE_PRIVE`), et `no-store` exclut un document
 * du bfcache de Chromium.
 *
 * Les deux moitiés de l'alternative étaient mauvaises. Retirer `no-store`
 * ferait resservir par le bouton « précédent » un document qui porte les
 * publications d'UNE personne, sur un appareil qui peut être partagé : on
 * paierait une fuite pour un confort. D'où ce module — et le brouillon vit
 * DEHORS du document, ce que le cache ne gouverne pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `sessionStorage`, ET C'EST LA DÉCISION DE CE LOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **Pas `localStorage`.** Le brouillon est le texte NON PUBLIÉ de quelqu'un :
 * exactement ce que `no-store` refuse de laisser resservir par le bouton
 * précédent. L'écrire dans `localStorage` recréerait cette exposition, en pire
 * — sans borne de temps, et lisible par la personne SUIVANTE qui ouvre
 * `/composer` sur le même appareil. La v3 n'a pas encore de route de
 * déconnexion : rien ne viendrait l'effacer.
 *
 * `sessionStorage` est lié à l'ONGLET et meurt avec lui. Il couvre le critère
 * ENTIER de l'issue — un rechargement, un changement de format (`?format=` est
 * une NAVIGATION), un aller-retour par le bouton précédent — et ne couvre que
 * lui. Ce qu'il ne survit pas, c'est la fermeture de l'onglet, c'est-à-dire
 * précisément l'exposition qu'on ne veut pas accorder.
 *
 * **La complexité se paie dans le CODE, jamais chez l'utilisateur** (dimension
 * 12) : ici, le choix le plus sûr est aussi celui qui tient le critère. Quand
 * les deux coïncident, il n'y a pas d'arbitrage à faire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES DE RESTITUTION, ET LA PREMIÈRE EST LA MOINS ÉVIDENTE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  1. **LE SERVEUR A TOUJOURS RAISON.** Après un REFUS, la porte re-sert le
 *     texte tapé dans le document. Restaurer par-dessus écraserait la saisie
 *     par une version plus ANCIENNE d'elle-même. Le module ne restitue donc
 *     QUE sur une page qui n'est la réponse d'AUCUNE soumission — jamais sur
 *     `main[data-refuse="1"]` (#5390, régression trouvée en vérifiant : une
 *     saisie de seuls espaces, nettoyée à `''` par `texteDe().trim()` côté
 *     porte, redonnait la main à cette règle-ci — champ VIDE, condition
 *     remplie —, qui réinjectait alors la version NON nettoyée encore dans
 *     `sessionStorage`. Un champ vide ne veut plus dire « rien n'a été
 *     tenté » depuis que la règle 3 ne l'efface plus au `submit` : il peut
 *     aussi vouloir dire « le serveur a nettoyé jusqu'au vide ». Seul
 *     `data-refuse` distingue les deux.)
 *  2. **LE BROUILLON EST PAR FORMAT.** « post » et « humeur » sont deux
 *     compositions ; passer de l'une à l'autre ne doit pas déverser le texte de
 *     la première dans la seconde.
 *  3. **LA PUBLICATION PARTIE EFFACE — jamais la SOUMISSION.** Cette règle
 *     valait autrement (« `submit` efface, il court avant la navigation ») et
 *     c'était FAUX pour le cas qui compte : un `submit` qui échoue en route
 *     (panne réseau, page d'erreur du navigateur) avait déjà effacé le
 *     brouillon AVANT de savoir si la publication était partie — le défaut le
 *     plus cher d'un formulaire, au pire moment (#5390). Le module lit
 *     désormais `main[data-publie="1"]`, un fait que seul le SERVEUR déclare
 *     après un Post/Redirect/Get réussi (`composer-vue.ts`) : la publication
 *     est PARTIE, pas seulement tentée. Un refus (422) garde la règle 1 — le
 *     serveur repose la saisie, le module ne réécrit pas.
 */

const CLE = 'meeshy.v3.brouillon';

/** La clé d'un format — voir la règle 2. */
const cleDuFormat = (format: string): string => `${CLE}.${format}`;

/**
 * `sessionStorage` JETTE dans une fenêtre privée, sous une politique de site
 * bloquante, ou pendant une capture de vignette. Chaque accès est donc gardé :
 * un brouillon qu'on ne peut pas tenir n'est pas une raison de casser l'écran
 * qui marchait sans lui.
 */
const lis = (cle: string): string | null => {
  try {
    return sessionStorage.getItem(cle);
  } catch {
    return null;
  }
};

const ecris = (cle: string, valeur: string): void => {
  try {
    sessionStorage.setItem(cle, valeur);
  } catch {
    // Rien : le formulaire marche sans brouillon, c'est son socle.
  }
};

const efface = (cle: string): void => {
  try {
    sessionStorage.removeItem(cle);
  } catch {
    // Idem.
  }
};

/**
 * L'APERÇU DES MÉDIAS (#5390) — AMÉLIORATION PROGRESSIVE : sans lui, le champ
 * `<input type="file">` marche déjà tel quel, un navigateur montrant sa
 * propre liste de noms. Ce que ce module AJOUTE, c'est la vignette avant
 * l'envoi (§ E2 du plan de témoins) — jamais une condition à la soumission,
 * qui reste jugée par le SERVEUR.
 *
 * LE PRÉ-CONTRÔLE DE TYPE EST UNE COMMODITÉ, PAS UNE GARDE : il porte le
 * MÊME message que la porte (`COMPOSER.mediasRefuse`), dans la MÊME alerte,
 * mais ne bloque jamais la soumission — un fichier que ce contrôle laisserait
 * passer à tort reste jugé par `composer-porte.ts`, qui est le seul dont le
 * refus compte.
 */
/** L'`id` du refus, que `composer-vue.ts` sert déjà et que `aria-describedby` cite — un seul nom, deux producteurs. */
const ID_DU_REFUS = 'c-medias-refus';

/** L'`id` du `<template>` du glyphe de retrait — `composer-vue.ts`, `GABARIT_DU_RETRAIT`. */
const ID_DU_GABARIT_DE_RETRAIT = 'c-medias-gabarit-retrait';

/**
 * LE REPLI `mediaAlt` SANS JAVASCRIPT (#5390, revue — défaut 3) — dix lignes
 * `<p class="champ" data-rang="N">`, servies TOUJOURS par `composer-vue.ts`
 * (`champDesMediasAlt`), repliées dans `<details class="medias-alt">`.
 *
 * CE MODULE NE CRÉE JAMAIS UN SECOND JEU DE CHAMPS : il RÉUTILISE ces dix
 * lignes — les montre pour chaque rang qu'un fichier occupe, les cache pour
 * le reste, et remplace leur libellé générique (« Photo ou vidéo n°2 ») par
 * le NOM du fichier qui l'occupe (« Décrire « vue.png » »). Le nom
 * `medias-alt` ne connaît donc jamais qu'un seul producteur, script ou non —
 * une garde qu'un second jeu de champs aurait cassée en silence (deux
 * valeurs pour un même nom, la porte lisant la PREMIÈRE, presque toujours
 * vide).
 */
const accrocheDesAlts = (
  main: HTMLElement,
): { readonly details: HTMLDetailsElement; readonly lignes: readonly HTMLElement[] } | null => {
  const details = main.querySelector<HTMLDetailsElement>('details.medias-alt');
  if (details === null) return null;
  const lignes = Array.from(details.querySelectorAll<HTMLElement>('p.champ[data-rang]')).sort(
    (a, b) => Number(a.dataset.rang) - Number(b.dataset.rang),
  );
  return { details, lignes };
};

const previsualiseMedias = (main: HTMLElement): void => {
  const bloc = main.querySelector<HTMLElement>('.champ.medias');
  const entree = bloc?.querySelector<HTMLInputElement>('input[type="file"]') ?? null;
  const zone = bloc?.querySelector<HTMLElement>('.apercus') ?? null;
  const tuile = zone?.querySelector<HTMLElement>('.tuile-ajouter') ?? null;
  if (bloc === null || entree === null || zone === null || tuile === null) return;

  const gabaritDeRetrait = main.querySelector<HTMLTemplateElement>(`template#${ID_DU_GABARIT_DE_RETRAIT}`);
  const alts = accrocheDesAlts(main);

  /**
   * LES FICHIERS ACTUELLEMENT PRÉVISUALISÉS, DANS L'ORDRE DE LA GRILLE — ce
   * que `accordeLesRangs` doit accorder après CHAQUE changement, qu'il vienne
   * d'une sélection neuve (le `change` ci-dessous la RÉÉCRIT) ou d'un retrait
   * (le clic ci-dessous en EXTRAIT un élément) : une seule variable, jamais
   * recalculée depuis `entree.files` — qui, sur une sélection MIXTE, peut
   * encore contenir un fichier refusé qu'aucune vignette ne représente.
   */
  let fichiersPrevisualises: File[] = [];

  /**
   * LA LÉGENDE PAR FICHIER (#5390, revue — défaut 1 sur le défaut 3) —
   * indexée par IDENTITÉ du `File`, jamais par RANG : un rang n'est qu'une
   * case de la grille, occupée par un fichier différent au fil des retraits
   * et des sélections. `accordeLesRangs` est le site UNIQUE qui la relit
   * (pour peindre `input.value`) et l'écrit (par l'écouteur `input` posé une
   * fois par ligne ci-dessous) : sans elle, une légende tapée à un rang
   * restait accrochée à CE RANG après un retrait, et se retrouvait posée sur
   * le fichier SUIVANT — un `alt` FAUX, pire que l'`alt` vide qu'il
   * remplaçait, et silencieux (`FormData` soumet un champ masqué par
   * `hidden` comme n'importe quel autre : rien ne l'exclut du côté porte).
   */
  const legendesParFichier = new Map<File, string>();

  // UN ÉCOUTEUR PAR LIGNE, POSÉ UNE SEULE FOIS (`alts.lignes` est un tableau
  // FIXE de dix éléments, jamais recréé) : il lit le fichier qui occupe ce
  // rang AU MOMENT de la frappe via la fermeture sur `fichiersPrevisualises`
  // (la même variable que `accordeLesRangs` relit plus bas, jamais une
  // copie) et mémorise la légende PAR CE FICHIER, pas par ce rang.
  if (alts !== null) {
    alts.lignes.forEach((ligne, indice) => {
      const champ = ligne.querySelector<HTMLInputElement>('input[type="text"]');
      champ?.addEventListener('input', () => {
        const fichier = fichiersPrevisualises[indice];
        if (fichier === undefined) return;
        legendesParFichier.set(fichier, champ.value);
      });
    });
  }

  /**
   * RETIRER UN MÉDIA AVANT L'ENVOI (#5390, revue — défaut 1) — reconstruit
   * `entree.files` par IDENTITÉ du `File` retiré, jamais par son NOM (deux
   * fichiers peuvent le partager) ni par un index figé à la création (une
   * suppression antérieure l'aurait décalé) : on cherche la position
   * COURANTE de CE `File` dans `entree.files` au moment du clic.
   *
   * `DataTransfer` est ABSENT de jsdom (§ témoin) et de certains navigateurs
   * anciens — le bouton n'est posé QUE si le constructeur existe (garde
   * `gabaritDeRetrait !== null` ci-dessous ET `typeof DataTransfer` ici) :
   * une amélioration progressive de plus, jamais un contrôle qui mentirait
   * en restant inerte.
   */
  const posesLeRetrait = ({
    ligne,
    fichier,
    nom,
    url,
    revoquePuis,
  }: {
    readonly ligne: HTMLElement;
    readonly fichier: File;
    readonly nom: string;
    readonly url: string;
    readonly revoquePuis: () => void;
  }): void => {
    if (gabaritDeRetrait === null || typeof DataTransfer === 'undefined') return;
    const icone = gabaritDeRetrait.content.firstElementChild?.cloneNode(true);
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'retirer-media';
    bouton.setAttribute('aria-label', COMPOSER.mediasRetirer(nom));
    if (icone !== undefined && icone !== null) bouton.appendChild(icone);
    bouton.addEventListener('click', () => {
      const actuels = Array.from(entree.files ?? []);
      const position = actuels.indexOf(fichier);
      if (position === -1) return;
      const dt = new DataTransfer();
      actuels.forEach((f, i) => {
        if (i !== position) dt.items.add(f);
      });
      entree.files = dt.files;

      URL.revokeObjectURL(url);
      revoquePuis();
      ligne.remove();
      fichiersPrevisualises = fichiersPrevisualises.filter((f) => f !== fichier);
      legendesParFichier.delete(fichier);
      accordeLesRangs(fichiersPrevisualises);

      // LE FOCUS RETOURNE À LA TUILE D'AJOUT — le contrôle qui vient de
      // disparaître ne peut plus le porter (charte règle 5).
      tuile.querySelector<HTMLElement>('input')?.focus();
    });
    ligne.appendChild(bouton);
  };

  /**
   * ACCORDE LE REPLI `mediaAlt` À LA SÉLECTION COURANTE — montre les rangs
   * qu'un fichier occupe (libellé : son NOM), cache le reste, et OUVRE le
   * `<details>` dès qu'il y a quelque chose à décrire (repos sinon : rien à
   * montrer n'est pas une raison de rester déplié, dimension 8).
   *
   * ACCORDE AUSSI LA VALEUR (#5390, revue — défaut 1), pas seulement le
   * libellé : un rang OCCUPÉ reprend la légende mémorisée pour LE FICHIER
   * qui s'y trouve désormais (vide s'il n'en a jamais reçu) — jamais celle
   * laissée par l'occupant précédent. Un rang qui SE CACHE est vidé pour la
   * MÊME raison dans l'autre sens : `hidden` ne retire rien du formulaire,
   * et un champ caché qui garderait une valeur la soumettrait quand même.
   */
  const accordeLesRangs = (fichiersValides: readonly File[]): void => {
    if (alts === null) return;
    alts.lignes.forEach((ligne, indice) => {
      const fichier = fichiersValides[indice];
      const etiquette = ligne.querySelector('label');
      const champ = ligne.querySelector<HTMLInputElement>('input[type="text"]');
      if (fichier === undefined) {
        ligne.hidden = true;
        if (champ !== null) champ.value = '';
        return;
      }
      ligne.hidden = false;
      if (etiquette !== null) etiquette.textContent = COMPOSER.mediasAltPourFichier(fichier.name);
      if (champ !== null) champ.value = legendesParFichier.get(fichier) ?? '';
    });
    alts.details.open = fichiersValides.length > 0;
  };

  /**
   * L'ALERTE NE NAÎT QUE SI ELLE A QUELQUE CHOSE À DIRE, et se REPLIE quand
   * elle n'en a plus. La créer inconditionnellement peignait une barre rouge
   * VIDE sous la grille dès la première sélection — un état d'erreur sans
   * erreur, mesuré sur la capture des deux schémas. `hidden` la referme
   * plutôt qu'un vidage seul : le socle le rend inconditionnel
   * (`[hidden]{display:none!important}`, charte).
   */
  const alerteServie = (): HTMLElement | null => bloc.querySelector<HTMLElement>('p.alerte');

  const dis = (message: string | null): void => {
    const existante = alerteServie();
    if (existante === null && message === null) return;
    const noeud = existante ?? bloc.appendChild(document.createElement('p'));
    noeud.className = 'alerte';
    noeud.setAttribute('role', 'alert');
    noeud.id = ID_DU_REFUS;
    noeud.textContent = message ?? '';
    noeud.hidden = message === null;
  };

  let urlsPrecedentes: string[] = [];

  entree.addEventListener('change', () => {
    urlsPrecedentes.forEach((url) => URL.revokeObjectURL(url));
    urlsPrecedentes = [];
    // LA TUILE D'AJOUT RESTE — elle est le DERNIER élément de cette grille
    // (`composer-vue.ts`), pas un aperçu : seuls les aperçus se remplacent.
    zone.querySelectorAll('li:not(.tuile-ajouter)').forEach((ligne) => ligne.remove());

    const fichiers = Array.from(entree.files ?? []).filter((fichier) => fichier.size > 0);
    let refus: string | null = null;
    // LES SEULS FICHIERS QUE LA GRILLE PRÉVISUALISE — jamais `fichiers`
    // lui-même : une sélection MIXTE (une photo, un `.txt`) n'aperçoit QUE la
    // photo, et c'est CETTE liste, dans CET ordre, que le repli `mediaAlt`
    // doit accorder (§ `accordeLesRangs`) — pas la sélection brute, où un
    // fichier refusé consommerait un rang sans jamais avoir de vignette.
    // RÉÉCRIT la variable PARTAGÉE avec le retrait (§ ci-dessus), jamais une
    // seconde liste.
    fichiersPrevisualises = [];

    fichiers.forEach((fichier) => {
      const estImage = fichier.type.startsWith('image/');
      const estVideo = fichier.type.startsWith('video/');
      if (!estImage && !estVideo) {
        refus = COMPOSER.mediasRefuse(fichier.name);
        return;
      }
      fichiersPrevisualises.push(fichier);
      const url = URL.createObjectURL(fichier);
      urlsPrecedentes.push(url);

      const ligne = document.createElement('li');
      const vignette = document.createElement(estVideo ? 'video' : 'img');
      vignette.setAttribute('src', url);
      if (estVideo) {
        vignette.setAttribute('muted', '');
        vignette.setAttribute('preload', 'metadata');
      } else {
        vignette.setAttribute('alt', fichier.name);
      }
      ligne.appendChild(vignette);

      posesLeRetrait({
        ligne,
        fichier,
        nom: fichier.name,
        url,
        revoquePuis: () => {
          urlsPrecedentes = urlsPrecedentes.filter((u) => u !== url);
        },
      });

      const legende = document.createElement('p');
      legende.className = 'nom';
      legende.textContent = fichier.name;
      ligne.appendChild(legende);

      zone.insertBefore(ligne, tuile);
    });

    accordeLesRangs(fichiersPrevisualises);

    // LE REFUS PRÉCÉDENT S'EFFACE, et c'est la moitié qui manquait (revue
    // #5390) : sans cette ligne, choisir un `.txt` puis une PHOTO laissait le
    // « n'est ni une photo ni une vidéo » du premier au-dessus de l'aperçu
    // valide du second — un refus qui MENT sur la sélection courante, à côté
    // de la preuve du contraire. Une sélection neuve efface le verdict de
    // l'ancienne, qu'elle en porte un nouveau ou non — y compris celui que le
    // SERVEUR a peint sur ce document.
    dis(refus);
  });
};

const demarre = (): void => {
  const main = document.querySelector<HTMLElement>('main[data-participation="composer"]');
  if (main === null) return;

  // L'EFFET OBSERVABLE de l'arrivée du module — ce que les témoins attendent
  // à la place d'une minuterie : `data-participation` est SERVI par le
  // document (il dit qu'un module viendra, pas qu'il est là), et 1 200 ms
  // d'attente aveugle rougissaient en CI dès que FCP + oisiveté + import
  // dépassaient la minuterie. Deux niveaux : le module est LÀ (posé ici), le
  // brouillon est ARMÉ (posé après les écouteurs — c'est lui que le témoin du
  // brouillon attend avant de taper).
  main.setAttribute('data-module-arrive', '1');

  const formulaire = main.querySelector<HTMLFormElement>('form');
  const texte = main.querySelector<HTMLTextAreaElement>(`textarea[name="${CHAMPS_DU_COMPOSER.texte}"]`);
  if (formulaire === null || texte === null) return;

  // Le format vient du champ que le document SERT, jamais de l'adresse : c'est
  // la même valeur, et celle-là est déjà validée contre le vocabulaire clos.
  const format = formulaire.querySelector<HTMLInputElement>(`input[name="${CHAMP_DU_FORMAT}"]`)?.value ?? '';
  if (format === '') return;
  const cle = cleDuFormat(format);

  // RÈGLE 3 D'ABORD — le document que CE chargement sert dit si la
  // publication est PARTIE (`data-publie="1"`, posé par `composer-vue.ts`
  // sur le retour du Post/Redirect/Get). Un `submit` qui échoue en route ne
  // recharge jamais ce document : le brouillon reste alors intact,
  // exactement le critère de #5390. TESTÉE EN PREMIER — un champ vide sur
  // CETTE page ne doit jamais déclencher la restauration de la règle 1
  // ci-dessous, que l'effacement va de toute façon rendre sans objet.
  //
  // `data-refuse="1"` (posé par la MÊME vue sur un 422) ferme l'autre moitié
  // du même défaut : cette page EST AUSSI la réponse d'une soumission — le
  // serveur a déjà décidé ce que le champ doit montrer, vide ou non — et la
  // règle 1 ne doit pas plus y superposer un brouillon périmé.
  const estUneReponseDeSoumission = main.dataset.publie === '1' || main.dataset.refuse === '1';

  if (main.dataset.publie === '1') {
    efface(cle);
  } else if (!estUneReponseDeSoumission && texte.value === '') {
    // RÈGLE 1 — SEULEMENT sur une page qui n'est la réponse d'AUCUNE
    // soumission (une simple navigation, un rechargement, un retour
    // arrière). Un champ vide qui reste vide.
    const garde = lis(cle);
    if (garde !== null && garde !== '') {
      texte.value = garde;
      // Le curseur à la FIN : on revient pour continuer d'écrire, pas pour
      // relire depuis le début.
      texte.setSelectionRange(garde.length, garde.length);
    }
  }

  texte.addEventListener('input', () => {
    if (texte.value === '') {
      efface(cle);
      return;
    }
    ecris(cle, texte.value);
  });

  previsualiseMedias(main);

  main.setAttribute('data-brouillon', 'arme');
};

demarre();

/**
 * REMONTAGE PAR LE NAVIGATEUR DE ZONE (#5106) : un ES module réimporté ne se
 * ré-exécute pas — la convention `monte()` des neuf modules, que celui-ci a
 * ratée en naissant en parallèle du lot. Idempotent de fait : après un swap,
 * les anciens écouteurs sont partis avec les anciens éléments.
 */
export const monte = demarre;
