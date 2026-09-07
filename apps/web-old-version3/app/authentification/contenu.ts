import { catalogueDesPays, paysDuVisiteur } from '@/lib/contenu/pays';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { langueDuVisiteur, languesOffertes } from '@/lib/langue-du-visiteur';

/**
 * LES DEUX ÉCRANS D'AUTHENTIFICATION — leur copie vient de
 * `apps/web/locales/fr/auth.json`, mot pour mot, comme la vitrine et les cinq
 * pages institutionnelles. La v3 ne réécrit pas le produit ; elle le sert.
 *
 * CE QUI N'A PAS SUIVI, ET POURQUOI — trois contrôles du legacy sont absents,
 * chacun parce qu'il serait INERTE sur une page sans JavaScript, et qu'un
 * contrôle sans effet est pire qu'un contrôle absent :
 *
 *   • « Afficher le mot de passe » — une bascule qui ne bascule rien ;
 *   • « Se souvenir de l'appareil » — la case gouverne la durée du jeton, que
 *     la passerelle ne lit pas encore sur cette route ;
 *   • « Connexion par Magic Link » — un second parcours entier, qui a sa propre
 *     issue.
 *
 * « Mot de passe oublié ? » RESTE, lui : sa destination `/forgot-password` est
 * servie par le legacy (mesuré, 200 sur staging) et le lien franchit la zone
 * comme les cinq liens du pied.
 *
 * L'INSCRIPTION TIENT EN UN ÉCRAN (#5217). Elle demandait cinq champs —
 * prénom, nom, PSEUDONYME, e-mail, mot de passe : composer une identité
 * publique avant d'avoir vu le produit, et deviner ce qu'un « nom
 * d'utilisateur » veut dire. Il en reste UNE question par chose que la
 * passerelle ne peut pas savoir :
 *
 *   • comment vous appeler — le NOM AFFICHÉ, dont la passerelle DÉRIVE le
 *     pseudo, le prénom et le nom (dimension 12 : la complexité se paie dans
 *     le code, pas chez le lecteur) ;
 *   • où vous écrire — l'e-mail ;
 *   • où vous joindre — le téléphone, la SEULE réponse dont le vide en est
 *     une ;
 *   • un mot de passe ;
 *   • dans quelle langue vous LIREZ — pré-remplie, donc déjà répondue.
 *
 * `confirmPasswordLabel` n'entre pas : la passerelle ne demande qu'un mot de
 * passe, et un second champ à ressaisir sans vérification immédiate n'attrape
 * rien — il ajoute une frappe au chemin nominal (dimension 7).
 *
 * AUCUNE CASE À COCHER SOUS LE BOUTON. Les conditions se rappellent en une
 * phrase, et le geste qui les accepte est celui qui crée le compte : une case
 * de plus est un geste de plus pour une information que la phrase donne déjà.
 */

/** Ce qu'une option de `<select>` porte : sa valeur, et ce qu'elle affiche. */
export type Option = {
  readonly valeur: string;
  readonly libelle: string;
};

/**
 * UN SÉLECTEUR SE REMPLIT À L'EXÉCUTION, et se pré-remplit tout seul.
 *
 * `options` est une FONCTION parce que 245 pays et 83 langues ne sont pas de la
 * copie : ils se construisent au premier rendu et se mémoïsent (`lib/contenu/
 * pays.ts`). `propose` est le contrat qui rend la porte GÉNÉRIQUE — elle ne
 * sait ni ce qu'est un pays ni ce qu'est une langue, elle demande au sélecteur
 * ce qu'il propose à un visiteur dont on ne connaît que l'en-tête
 * `Accept-Language`.
 *
 * `propose` DOIT rendre une valeur qui figure dans `options()`. Sans quoi le
 * `<select>` n'aurait aucune option sélectionnée et le navigateur retiendrait
 * la première : la pré-sélection deviendrait un mensonge silencieux — un
 * lecteur nigérian se verrait proposer l'Afghanistan sans qu'aucun témoin ne
 * rougisse.
 */
export type Selecteur = {
  readonly nom: string;
  readonly libelle: string;
  readonly options: () => readonly Option[];
  readonly propose: (acceptLanguage: string | null) => string;
};

export type Champ = {
  readonly nom: string;
  readonly libelle: string;
  readonly type: 'text' | 'email' | 'tel' | 'password';
  readonly autocomplete: string;
  readonly aide?: string;
  readonly longueurMinimale?: number;
  /**
   * VRAI par défaut — un champ d'un formulaire d'accès est requis, sauf preuve
   * du contraire. Le téléphone est cette preuve : la passerelle l'accepte
   * absent, et le vide y est une RÉPONSE (« je n'en donne pas »), pas une
   * omission.
   */
  readonly requis?: boolean;
  /**
   * LE SÉLECTEUR POSÉ DEVANT LE CHAMP, sur la même ligne. Un indicatif n'est
   * pas un champ de plus : c'est la première moitié d'un numéro, et le
   * dissocier en deux lignes ferait deux questions d'une seule.
   */
  readonly devant?: Selecteur;
};

/**
 * UNE PHRASE DONT UN `<select>` EST UN MOT — « Vous lirez Meeshy en
 * [Français] ». Le même choix rendu en champ étiqueté demanderait au lecteur de
 * lire un libellé, de comprendre qu'il s'agit de SA langue de lecture et de
 * décider ; la phrase le dit et le montre d'un trait.
 */
export type Pastille = {
  readonly avant: string;
  readonly selecteur: Selecteur;
  readonly apres: string;
};

/**
 * UNE PHRASE À TROUS, dont les trous sont des liens. Un gabarit (« … {terms} …
 * ») demanderait un moteur de substitution et laisserait la ponctuation hors
 * du lien ou dedans selon l'humeur ; une suite de segments dit exactement ce
 * qui est cliquable, dans l'ordre où ça se lit.
 */
export type Segment = {
  readonly texte: string;
  readonly href?: string;
};

export type Bascule = {
  readonly texte: string;
  readonly libelle: string;
  readonly href: string;
};

export type Ecran = {
  readonly titre: string;
  readonly accroche: string;
  readonly action: string;
  readonly champs: readonly Champ[];
  readonly pastille?: Pastille;
  readonly bouton: string;
  readonly conditions?: readonly Segment[];
  readonly bascule: Bascule;
  readonly oubli?: Bascule;
};

/** `PASSWORD_MIN_LENGTH` de `packages/shared/utils/validation.ts`. */
const LONGUEUR_MINIMALE_DU_MOT_DE_PASSE = 6;

/**
 * TOUS les sélecteurs d'un écran, champs compris — UN site, pour que la porte
 * ne les cherche pas à deux endroits et n'en oublie pas un le jour où un
 * troisième arrive.
 */
export const selecteursDe = (ecran: Ecran): readonly Selecteur[] => [
  ...ecran.champs.flatMap(({ devant }) => (devant === undefined ? [] : [devant])),
  ...(ecran.pastille === undefined ? [] : [ecran.pastille.selecteur]),
];

const PAYS: Selecteur = {
  nom: 'pays',
  libelle: 'Indicatif du pays',
  options: () => catalogueDesPays().map(({ code, libelle }) => ({ valeur: code, libelle })),
  propose: paysDuVisiteur,
};

const OPTIONS_DE_LANGUE: readonly Option[] = languesOffertes([]).map(({ code, nom }) => ({
  valeur: code,
  libelle: nom,
}));

const LANGUE: Selecteur = {
  nom: 'langue',
  libelle: 'Langue de lecture',
  options: () => OPTIONS_DE_LANGUE,
  // Une langue que Meeshy ne SERT pas n'est pas une option : le repli est la
  // langue du document, jamais la première de la liste — qui serait l'anglais,
  // par ordre de table et non par choix.
  propose: (acceptLanguage) => {
    const souhaitee = langueDuVisiteur(acceptLanguage);
    return OPTIONS_DE_LANGUE.some(({ valeur }) => valeur === souhaitee) ? souhaitee : DOCUMENT_LANGUAGE;
  },
};

export const CONNEXION: Ecran = {
  titre: 'Connexion',
  accroche: 'Connectez-vous à votre compte',
  action: '/login',
  champs: [
    {
      nom: 'identifiant',
      libelle: 'Nom d’utilisateur, Email ou Téléphone',
      type: 'text',
      autocomplete: 'username',
      aide: 'Entrez votre nom d’utilisateur ou votre adresse email',
    },
    {
      nom: 'motDePasse',
      libelle: 'Mot de passe',
      type: 'password',
      autocomplete: 'current-password',
    },
  ],
  bouton: 'Se connecter',
  bascule: {
    texte: 'Vous n’avez pas de compte ?',
    libelle: 'Inscrivez-vous ici',
    href: '/signup',
  },
  oubli: { texte: '', libelle: 'Mot de passe oublié ?', href: '/forgot-password' },
};

export const INSCRIPTION: Ecran = {
  titre: 'Créer un compte',
  accroche: 'Créez votre compte Meeshy',
  action: '/signup',
  champs: [
    {
      nom: 'nomAffiche',
      libelle: 'Comment vous appeler ?',
      type: 'text',
      autocomplete: 'name',
    },
    {
      nom: 'courriel',
      libelle: 'E-mail',
      type: 'email',
      autocomplete: 'email',
      aide: 'Nous utiliserons cet email pour vous contacter',
    },
    {
      // `tel-national` et non `tel` : le numéro est saisi SANS son indicatif,
      // que le sélecteur d'à côté porte. Annoncer `tel` ferait proposer au
      // gestionnaire du navigateur un numéro international dans un champ qui
      // n'en attend pas.
      nom: 'telephone',
      libelle: 'Téléphone',
      type: 'tel',
      autocomplete: 'tel-national',
      requis: false,
      devant: PAYS,
    },
    {
      nom: 'motDePasse',
      libelle: 'Mot de passe',
      type: 'password',
      autocomplete: 'new-password',
      aide:
        'Minimum 6 caractères. Utilisez des lettres, chiffres et caractères spéciaux pour plus de sécurité.',
      longueurMinimale: LONGUEUR_MINIMALE_DU_MOT_DE_PASSE,
    },
  ],
  pastille: { avant: 'Vous lirez Meeshy en', selecteur: LANGUE, apres: '' },
  bouton: 'Créer mon compte',
  conditions: [
    { texte: 'En continuant, vous acceptez ' },
    { texte: 'les conditions d’utilisation', href: '/terms' },
    { texte: ' et ' },
    { texte: 'la politique de confidentialité', href: '/privacy' },
    { texte: '.' },
  ],
  bascule: {
    texte: 'Vous avez déjà un compte ?',
    libelle: 'Connectez-vous ici',
    href: '/login',
  },
};
