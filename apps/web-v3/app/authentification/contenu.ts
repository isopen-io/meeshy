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
 * `confirmPasswordLabel` n'entre pas non plus : la passerelle ne demande qu'un
 * mot de passe, et un second champ à ressaisir sans vérification immédiate
 * n'attrape rien — il ajoute une frappe au chemin nominal (dimension 7).
 *
 * POURQUOI PRÉNOM ET NOM PORTENT UNE AIDE. Mesuré contre la passerelle de
 * staging : un nom écrit « V3 » est refusé, et le message qui remonte est
 * `body/lastName must match pattern "^(?=.*\p{L})…"`. La règle est juste ; sa
 * formulation ne s'adresse à personne. L'aide la DIT avant la soumission, avec
 * la phrase que le legacy emploie déjà (`register.nameInvalidChars`).
 *
 * Elle est posée en AIDE et non en `pattern=` : un attribut `pattern` serait la
 * copie d'une règle de `packages/shared/utils/validation.ts` — une jumelle,
 * dont la dérive rejetterait des saisies que le serveur accepte. La contrainte
 * reste au seul endroit qui la décide.
 */

export type Champ = {
  readonly nom: string;
  readonly libelle: string;
  readonly type: 'text' | 'email' | 'password';
  readonly autocomplete: string;
  readonly aide?: string;
  readonly longueurMinimale?: number;
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
  readonly bouton: string;
  readonly bascule: Bascule;
  readonly oubli?: Bascule;
};

/** `PASSWORD_MIN_LENGTH` de `packages/shared/utils/validation.ts`. */
const LONGUEUR_MINIMALE_DU_MOT_DE_PASSE = 6;

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
      nom: 'prenom',
      libelle: 'Prénom',
      type: 'text',
      autocomplete: 'given-name',
      aide: 'Le nom doit contenir au moins une lettre',
    },
    {
      nom: 'nom',
      libelle: 'Nom',
      type: 'text',
      autocomplete: 'family-name',
      aide: 'Le nom doit contenir au moins une lettre',
    },
    {
      nom: 'identifiant',
      libelle: 'Nom d’utilisateur (Pseudonyme)',
      type: 'text',
      autocomplete: 'username',
      aide:
        'C’est votre pseudonyme. Uniquement lettres, chiffres, tirets (-) et underscores (_). Utilisé dans l’URL de votre profil.',
    },
    {
      nom: 'courriel',
      libelle: 'Email',
      type: 'email',
      autocomplete: 'email',
      aide: 'Nous utiliserons cet email pour vous contacter',
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
  bouton: 'Créer un compte',
  bascule: {
    texte: 'Vous avez déjà un compte ?',
    libelle: 'Connectez-vous ici',
    href: '/login',
  },
};
