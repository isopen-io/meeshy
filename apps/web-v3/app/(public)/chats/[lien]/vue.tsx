import { Icone } from '@/components/ui/icone';
import { SpriteDeLEcran } from '@/components/ui/icones';
import type { LangueDemandee } from '@/lib/a11y/langues-demandees';
import type { LienDadhesion } from '@/lib/api/adhesion';

import styles from './ecran.module.css';
import { pointsDuLien, type AvisDeLaPlace, type EtatDeRefus, type PointDuLien } from './etats';
import type { Proposition } from './langues';

/**
 * L'ÉCRAN `join` — l'aperçu d'un lien de partage et l'entrée d'un visiteur sans
 * compte (planche `join`, `cible/join.png`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * IL N'EMBARQUE PAS UN OCTET DE JAVASCRIPT, ET C'EST LE CRITÈRE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Aucun `'use client'`, aucun état, aucun gestionnaire d'événement. Trois choix
 * le rendent possible, et chacun remplace un morceau de JavaScript par du HTML
 * que le navigateur sait déjà faire :
 *
 *   • l'accordéon est un `<details>/<summary>` NATIF — ouverture, fermeture,
 *     `aria-expanded`, atteignabilité au clavier et annonce par le lecteur
 *     d'écran sont dans le navigateur, gratuitement et sans hydratation. Un
 *     `<div onClick>` aurait coûté un îlot client pour un comportement moins
 *     bon (c'est ce que fait la planche, et le § 1 écarte explicitement ses
 *     `<div onClick>`) ;
 *   • le formulaire est un `<form action={…}>` posté par le navigateur. La
 *     réponse d'un refus n'est PAS un état React : c'est une REDIRECTION vers ce
 *     même écran, qui rend le refus depuis l'URL (Post/Redirect/Get). Le
 *     comportement est donc identique avec et sans JavaScript — et le bouton
 *     Précédent ne repropose jamais l'envoi ;
 *   • les glyphes sont des `<use>` vers des `<symbol>` inlinés (coquille pour
 *     les huit critiques, `SpriteDeLEcran` pour le reste) : rien à charger, rien
 *     à exécuter, et aucun `<use>` externe — que ni Chrome ni Safari n'honorent.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE REND PAS, ET POURQUOI
 * ────────────────────────────────────────────────────────────────────────────
 *
 * L'identité du créateur. La planche dessine « Ibrahim Bello · vous a envoyé ce
 * lien » avec son avatar ; le § 5.1 classe cette charge en FUITE et tranche :
 * « l'identité n'est ni affichée ni transportée ». Elle est donc écartée dès
 * `lib/api/adhesion.ts`, avant d'entrer dans le HTML ou dans la charge Flight du
 * RSC. Écart de conformité assumé et déclaré : c'est une décision de sécurité,
 * pas un oubli de disposition.
 *
 * Un formulaire, quand le lien EXIGE un compte. `requireAccount` est connu de
 * l'aperçu : proposer quand même les champs offrirait un contrôle dont le seul
 * effet possible est un 403 — un contrôle inerte (loi 4). Les deux portes de
 * l'authentification le remplacent, avec l'adresse de retour conservée sous le
 * paramètre que le destinataire LIT — `?returnUrl=` (§ 6.3 A, et le doc-comment
 * de `PortesDuCompte`, qui mesure ce que chacune des deux fait) —, et ce sont
 * de vrais `<a href>` : elles sortent du périmètre v3, où la navigation cliente
 * de Next ne va pas (§ 3.2 corollaire 4).
 */

const GLYPHES: readonly string[] = [
  'ph-chat-circle',
  'ph-link-simple',
  'ph-key',
  'ph-caret-down',
  'ph-check-circle',
  'ph-x-circle',
  'ph-warning-circle',
];

/**
 * Ce que l'écran `rights` rend, et rien de plus. `ph-ghost` y figure bien qu'il
 * soit déjà dans le sous-sprite critique (`packages/icons/critique.json` le
 * justifie NOMMÉMENT par cette vue) : la déclaration dit ce que l'écran a
 * besoin de voir, et `symbolesAInliner` retire seul ce que la coquille porte
 * déjà — une liste qui tairait un glyphe critique deviendrait fausse le jour où
 * le sous-sprite change.
 */
const GLYPHES_DES_DROITS: readonly string[] = ['ph-ghost', 'ph-check-circle', 'ph-x-circle'];

export type ChampsPreremplis = {
  readonly pseudo: string;
  readonly langue: string;
};

export type EcranDeJonction = {
  readonly lien: LienDadhesion;
  readonly proposition: Proposition;
  readonly prerempli: ChampsPreremplis;
  readonly refus: EtatDeRefus | null;
  /**
   * Ce que le `<form>` porte. Une action SERVEUR sur la page servie ; une URL
   * dans un témoin, où il n'y a pas de runtime d'action à encoder — et où c'est
   * la STRUCTURE du formulaire qui est jugée, pas le transport.
   */
  readonly action: string | ((donnees: FormData) => void | Promise<void>);
  /** L'adresse de retour que les portes d'authentification conservent. */
  readonly retour: string;
};

const libelle = (langue: LangueDemandee): string =>
  langue.drapeau === null ? langue.libelle : `${langue.drapeau} ${langue.libelle}`;

/**
 * LE RENDU D'UNE LIGNE — un seul, pour les deux listes de l'écran.
 *
 * L'accordéon d'avant l'entrée et les quatre droits d'après ont la MÊME
 * anatomie : un glyphe d'état, un titre, un détail. Ils ne diffèrent que par
 * leur cadre (une carte à séparateurs internes ici, une liste à filets là), et
 * c'est ce que porte `cadre`. Écrire une seconde ligne pour la seconde liste
 * ferait deux anatomies à tenir d'accord, alors que la conformité les juge
 * ensemble.
 */
function Point({ point, cadre }: { readonly point: PointDuLien; readonly cadre?: string }) {
  return (
    <li className={`${cadre ?? styles.point} ${point.accorde ? styles.accorde : styles.refuse}`}>
      <Icone nom={point.accorde ? 'ph-check-circle' : 'ph-x-circle'} />
      <div>
        <p className={styles.pointTitre}>{point.titre}</p>
        <p className={styles.pointDetail}>{point.detail}</p>
      </div>
    </li>
  );
}

/**
 * L'accordéon est OUVERT quand un refus porte sur ce que le lien impose : le
 * visiteur a besoin de lire la contrainte avant de recommencer. Fermé sinon,
 * comme la planche le dessine — l'écran doit tenir sur un écran de téléphone.
 */
function PointsDuLien({ lien, ouvert }: { readonly lien: LienDadhesion; readonly ouvert: boolean }) {
  const points = pointsDuLien(lien);

  return (
    <details className={styles.points} open={ouvert}>
      <summary className={styles.resume}>
        <Icone nom="ph-key" />
        <span className={styles.resumeTexte}>
          <span className={styles.resumeTitre}>Ce que ce lien vous ouvre</span>
          <span className={styles.resumeSous}>
            {points.length} points · à lire avant d’entrer
          </span>
        </span>
        <Icone nom="ph-caret-down" className={styles.chevron} />
      </summary>
      <ul className={styles.liste}>
        {points.map((point) => (
          <Point key={point.cle} point={point} />
        ))}
      </ul>
    </details>
  );
}

/**
 * L'alerte est un `role="alert"` : sans lui, un lecteur d'écran qui revient sur
 * la page après la redirection ne saurait pas qu'une réponse l'attend — le
 * formulaire aurait simplement l'air de s'être vidé.
 *
 * Un seul rendu pour les deux écrans : le refus d'entrée de la jonction et
 * l'avis de la place (états F et G). Ils disent la même chose au même endroit —
 * un titre, une raison —, et deux rendus divergeraient au premier ajustement.
 */
function Alerte({ titre, corps }: { readonly titre: string; readonly corps: string }) {
  return (
    <p className={styles.refus} role="alert">
      <strong>{titre}</strong>
      <span>{corps}</span>
    </p>
  );
}

/**
 * LES DEUX PORTES D'UN LIEN QUI EXIGE UN COMPTE — et le paramètre que le
 * destinataire LIT vraiment.
 *
 * `/login` et `/signup` ne sont dans AUCUNE règle du routeur `frontend-v3`
 * (§ 4.4 : « tout chemin absent de la règle est servi par `apps/web` »). Le
 * destinataire est donc le legacy, et ce qu'il lit est MESURÉ, pas supposé :
 *
 *   • `apps/web/app/login/page.tsx` lit `searchParams.get('returnUrl')` et
 *     `apps/web/components/auth/login-form.tsx` y renvoie après la connexion —
 *     jamais `next`, qu'aucun fichier de `apps/web/app` ni de
 *     `apps/web/components` ne lit. La première écriture émettait `?next=` : le
 *     paramètre était DROPPÉ en silence et le visiteur atterrissait sur
 *     `/dashboard` pendant que la copie lui promettait le retour. Un contrôle
 *     qui navigue sans faire ce que l'écran annonce est inerte au sens de la
 *     loi 4 ;
 *   • `/signup` ne lit NI l'un NI l'autre : `hooks/use-registration-submit.ts`
 *     pose `window.location.href = '/dashboard'` sans condition. Lui passer un
 *     paramètre serait une décoration sans effet, et le laisser promettre un
 *     retour serait la même faute déplacée d'un cran. La copie du refus
 *     `compte-requis` dit donc ce qui se passe VRAIMENT sur chacune des deux
 *     portes (`etats.ts`), et seule celle qui revient porte l'adresse de retour.
 *
 * Le jour où la v3 servira ces deux écrans, c'est cette fonction — et elle
 * seule — qui change de paramètre.
 */
function PortesDuCompte({ retour }: { readonly retour: string }) {
  return (
    <nav className={styles.portes} aria-label="Entrer avec un compte">
      <a
        className={`${styles.porte} ${styles.portePrimaire}`}
        href={`/login?returnUrl=${encodeURIComponent(retour)}`}
      >
        Se connecter
      </a>
      <a className={`${styles.porte} ${styles.porteSecondaire}`} href="/signup">
        Créer un compte
      </a>
    </nav>
  );
}

function Formulaire({ ecran }: { readonly ecran: EcranDeJonction }) {
  const { lien, proposition, prerempli, action } = ecran;

  return (
    <form className={styles.formulaire} method="post" action={action}>
      <p className={styles.champ}>
        <label htmlFor="pseudo">Votre pseudo</label>
        <input
          id="pseudo"
          name="pseudo"
          type="text"
          required
          maxLength={50}
          autoComplete="nickname"
          defaultValue={prerempli.pseudo}
        />
      </p>

      <p className={styles.champ}>
        <label htmlFor="langue">Langue parlée</label>
        {/*
          Le chevron est un GLYPHE, pas une image de fond : `appearance: none`
          retire l'affordance native du `<select>`, et la rendre par
          `background-image` demanderait une couleur écrite à la main dans une
          data-URI — la seconde table que le § 3.2 corollaire 2 interdit. Le
          `<span>` porte `aria-hidden` par `Icone` et `pointer-events: none` par
          la feuille : le clic traverse jusqu'au contrôle, et le lecteur d'écran
          n'annonce rien de plus que le `<label>`.
        */}
        <span className={styles.selecteur}>
          <select id="langue" name="langue" defaultValue={prerempli.langue}>
            {proposition.langues.map((langue) => (
              <option key={langue.code} value={langue.code}>
                {libelle(langue)}
              </option>
            ))}
          </select>
          <Icone nom="ph-caret-down" className={styles.chevronDuChamp} />
        </span>
        <span className={styles.aide}>
          Tout ce qui s’écrit ici vous arrive dans cette langue.
        </span>
      </p>

      {lien.exigeEmail ? (
        <p className={styles.champ}>
          <label htmlFor="email">Votre e-mail</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </p>
      ) : null}

      {lien.exigeNaissance ? (
        <p className={styles.champ}>
          <label htmlFor="naissance">Votre date de naissance</label>
          <input id="naissance" name="naissance" type="date" required autoComplete="bday" />
        </p>
      ) : null}

      <button className={styles.entrer} type="submit">
        Rejoindre la conversation
      </button>
    </form>
  );
}

export function VueDeJonction({ ecran }: { readonly ecran: EcranDeJonction }) {
  const { lien, refus, retour } = ecran;

  return (
    <div className={styles.cadre}>
      <SpriteDeLEcran glyphes={GLYPHES} />
      <header className={styles.marque}>
        <Icone nom="ph-chat-circle" />
        Meeshy
      </header>
      <main id="main-content" className={styles.principal}>
        <p className={styles.sur}>Vous êtes invité à</p>
        <h1 className={styles.titre}>{lien.nom}</h1>

        {lien.invitation === null ? null : (
          <blockquote className={styles.mot}>«&nbsp;{lien.invitation}&nbsp;»</blockquote>
        )}

        {refus === null ? null : <Alerte titre={refus.titre} corps={refus.corps} />}

        <PointsDuLien lien={lien} ouvert={refus !== null && !refus.reessayable} />

        {lien.exigeCompte ? (
          <PortesDuCompte retour={retour} />
        ) : refus !== null && !refus.reessayable ? (
          <nav className={styles.portes} aria-label="Suite">
            <a className={`${styles.porte} ${styles.porteSecondaire}`} href="/">
              Revenir à l’accueil
            </a>
          </nav>
        ) : (
          <Formulaire ecran={ecran} />
        )}
      </main>
    </div>
  );
}

/**
 * LE REFUS SEUL — quand la porte d'aperçu elle-même dit non.
 *
 * Il n'y a alors AUCUN lien à décrire : ni nom, ni mot de l'hôte, ni points. Le
 * fabriquer pour garder la mise en page serait affirmer l'existence de ce qu'on
 * vient de se voir refuser — et, sur un `lien-epuise`, dire le nom d'une
 * conversation dont on n'a pas obtenu l'entrée.
 */
export function VueDeRefus({ etat, retour }: { readonly etat: EtatDeRefus; readonly retour: string }) {
  return (
    <div className={styles.cadre}>
      <SpriteDeLEcran glyphes={GLYPHES} />
      <header className={styles.marque}>
        <Icone nom="ph-chat-circle" />
        Meeshy
      </header>
      <main id="main-content" className={styles.principal}>
        <p className={styles.sur}>Ce lien de conversation</p>
        <h1 className={styles.titre}>{etat.titre}</h1>
        <blockquote className={styles.mot}>{etat.corps}</blockquote>
        <nav className={styles.portes} aria-label="Suite">
          {etat.reessayable ? (
            <a className={`${styles.porte} ${styles.portePrimaire}`} href={retour}>
              Réessayer
            </a>
          ) : null}
          <a className={`${styles.porte} ${styles.porteSecondaire}`} href="/">
            Revenir à l’accueil
          </a>
        </nav>
      </main>
    </div>
  );
}

/**
 * CE QUE L'ÉCRAN DES DROITS REÇOIT — déjà résolu, jamais à résoudre.
 *
 * Aucun champ n'est un objet de passerelle : `page.tsx` a déjà arbitré la place
 * contre SA porte (`POST /anonymous/refresh`) et choisi ce qui se peint. La vue
 * ne sait ni ce qu'est un 401, ni ce qu'est un aperçu — elle rend un accueil, un
 * avis, des lignes et un bouton.
 */
export type EcranDesDroits = {
  readonly pseudo: string;
  /**
   * Le titre de la conversation. `null` quand la place ne le porte pas ET que la
   * passerelle n'a pas répondu : l'écran se peint quand même, sans le nommer —
   * une place doit rester lisible hors-ligne (§ 7).
   */
  readonly nom: string | null;
  /**
   * Les lignes à peindre, déjà choisies. `null` — et non une liste vide — dit
   * « on ne sait rien de ces droits » : aucune ligne n'est alors inventée, et
   * c'est ce que rend l'état F, où les quatre ne valent plus rien.
   */
  readonly points: readonly PointDuLien[] | null;
  /** Ce qui est arrivé à la place depuis son ouverture (états F et G). `null` : rien. */
  readonly avis: AvisDeLaPlace | null;
  /**
   * LE CTA QUE LA CIBLE DESSINE — « Entrer dans la conversation ».
   *
   * Il est arrivé avec l'écran `thread` (matrice ordre 5), et pas avant : tant
   * que personne ne servait le fil, ce bouton n'avait aucun effet, ce que la
   * loi 4 refuse. `null` quand il n'y a rien à ouvrir — une place fermée (état
   * F), ou une réponse qui n'a pas nommé la conversation : le proposer alors
   * serait à nouveau un contrôle inerte.
   */
  readonly entree: {
    readonly libelle: string;
    readonly action: string | ((donnees: FormData) => void | Promise<void>);
  } | null;
  /** LE contrôle de l'écran — voir le doc-comment de `VueDesDroits`. */
  readonly sortie: {
    readonly libelle: string;
    readonly primaire: boolean;
    readonly action: string | ((donnees: FormData) => void | Promise<void>);
  };
};

/**
 * L'ÉCRAN `rights` — la place ouverte, et ce qu'elle donne le droit de faire
 * (planche `rights`, `cible/rights.png`, matrice ordre 3).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL EST À LA MÊME ADRESSE QUE LA JONCTION
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `/chats/:lien` est UNE route dans DEUX états : sans place, elle demande
 * d'entrer ; avec une place, elle dit ce que cette place ouvre. Rediriger
 * ailleurs après le join aurait fabriqué une seconde adresse pour la même
 * chose — et cassé le retour arrière du navigateur. La place se retrouve depuis
 * n'importe laquelle des adresses qui mènent ici, y compris le lien PARTAGÉ dont
 * le segment n'est pas la clé canonique (`lib/api/session-invitee-cookie.ts`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * IL NE FABRIQUE AUCUN DROIT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Les quatre lignes sont RE-LUES de la passerelle à chaque rendu (§ 6.3 B :
 * « l'hôte a pu les changer »), et `points === null` ne veut pas dire « aucun
 * droit » : il veut dire qu'aucune réponse ne les a dits. Rien n'est alors
 * peint. Les deux listes de l'écran — l'accordéon d'avant l'entrée et les droits
 * d'après — viennent du MÊME module (`etats.ts`) et passent par le MÊME rendu de
 * ligne (`Point`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE CONTRÔLE — UN, ET QUI FAIT QUELQUE CHOSE AUJOURD'HUI
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La cible dessine à cette place un CTA pleine largeur, « Entrer dans la
 * conversation ». Le fil est l'écran `thread` (matrice ordre 11) et personne ne
 * le sert : ce bouton-là serait inerte, ce que la loi 4 refuse. Mais la loi 4
 * interdit un contrôle SANS EFFET — elle n'autorise pas un écran SANS CONTRÔLE,
 * et c'est ce que l'écran était devenu : après le lien d'évitement, rien à
 * focaliser, rien à cliquer, et `rights` masquant `join` à cette adresse tant
 * que le cookie vit (400 jours), aucune sortie. Un invité qui voulait un autre
 * pseudo, ou dont la place était morte côté serveur, devait vider ses cookies.
 *
 * Le bloc est donc SERVI, à la place et aux dimensions que la cible lui donne,
 * par le seul geste qui ait un effet réel aujourd'hui :
 *
 *   • nominal — « Quitter cette place » : `POST /anonymous/leave` (idempotent
 *     depuis #4167), le cookie effacé, et `join` rouvert à la même adresse ;
 *   • état F — « Reprendre ma place » : le § 6.3 F demande un BOUTON, et interdit
 *     le re-join silencieux. Celui-ci ramène au formulaire avec le pseudo
 *     précédent pré-rempli ; c'est le visiteur qui appuie.
 *
 * Les deux passent par un `<form>` posté par le navigateur : le comportement est
 * identique avec et sans JavaScript, comme celui de la jonction.
 *
 * La marque « Meeshy » n'est pas rendue : la planche ne la pose pas sur cet écran
 * (elle est dans le bloc `join`, pas dans `isRights`), et la cible le confirme.
 */
export function VueDesDroits({ ecran }: { readonly ecran: EcranDesDroits }) {
  const { pseudo, nom, points, avis, entree, sortie } = ecran;

  return (
    <div className={styles.cadre}>
      <SpriteDeLEcran glyphes={GLYPHES_DES_DROITS} />
      <main id="main-content" className={styles.accueil}>
        <p className={styles.badge}>
          <Icone nom="ph-ghost" titre="Invité, sans compte" />
        </p>
        <h1 className={styles.bienvenue}>Bienvenue {pseudo}&nbsp;!</h1>
        <p className={styles.sous}>
          {nom === null
            ? 'Voilà ce que ce lien vous ouvre.'
            : `Voilà ce que ce lien vous ouvre dans ${nom}.`}
        </p>

        {avis === null ? null : <Alerte titre={avis.titre} corps={avis.corps} />}

        {points === null ? null : (
          <ul className={styles.droits}>
            {points.map((point) => (
              <Point key={point.cle} point={point} cadre={styles.droit} />
            ))}
          </ul>
        )}

        {entree === null ? null : (
          <form className={styles.portes} method="post" action={entree.action}>
            <button className={styles.entrer} type="submit">
              {entree.libelle}
            </button>
          </form>
        )}

        <form className={styles.portes} method="post" action={sortie.action}>
          <button
            className={
              sortie.primaire && entree === null
                ? styles.entrer
                : `${styles.porte} ${styles.porteSecondaire}`
            }
            type="submit"
          >
            {sortie.libelle}
          </button>
        </form>
      </main>
    </div>
  );
}
