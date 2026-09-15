/**
 * CE QUE LE PREMIER E-MAIL D'UN COMPTE DOIT DIRE (#6424).
 *
 * Directive porteur 2026-09-14 : « Dans l'e-mail de validation tu indiques le
 * display name, le pseudo et tu précises qu'il faut modifier avec un lien pour
 * modifier son pseudo, son display name si souhaité, et si souhaité mettre un
 * mot de passe […] À chaque e-mail de lien magique, si le mot de passe n'est
 * pas défini, indiquer les liens directs vers le profil pour modifier le mot
 * de passe. »
 *
 * ## Pourquoi ce bloc existe, et pourquoi il est PARTAGÉ
 *
 * Une inscription par e-mail seul ne demande rien à personne : le pseudo et le
 * nom affiché sont DÉRIVÉS de l'adresse (`registration-identity.ts`). La
 * personne ne les a donc jamais vus, et n'a jamais eu l'occasion de dire
 * qu'ils ne lui conviennent pas. Cet e-mail est le premier — et longtemps le
 * seul — endroit où elle les découvre. Ne pas les y écrire reviendrait à
 * nommer quelqu'un dans son dos.
 *
 * Deux gabarits en ont besoin, pour deux raisons distinctes :
 *
 * - la VALIDATION, parce que c'est là que l'identité se découvre ;
 * - le LIEN MAGIQUE, parce que tant qu'aucun mot de passe n'est posé, il est
 *   la SEULE porte du compte — et l'e-mail qui l'ouvre est le seul endroit où
 *   rappeler qu'on peut cesser d'en dépendre.
 *
 * Un bloc partagé, donc, et non deux rédactions : deux textes qui disent la
 * même chose divergent au premier lot qui n'en relit qu'un.
 *
 * ## Ce que ce module ne fait pas
 *
 * Il ne lit rien, n'envoie rien, ne connaît ni `this` ni base. Il rend deux
 * chaînes — HTML et texte — depuis des valeurs déjà résolues. Les URL lui sont
 * REMISES : composer une URL demande de connaître l'hôte du frontal, ce qui
 * est le métier de `EmailService`, pas celui d'un gabarit.
 *
 * @module services/email/account-identity-block
 */

/** L'échappement des valeurs INSÉRÉES — un pseudo dérivé n'est pas du HTML. */
function echapper(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type IdentiteDuCompte = {
  /** Le pseudo tel qu'il a été généré — celui que la personne découvre ici. */
  readonly username: string;
  /** Le nom affiché tel qu'il sera vu par les autres. */
  readonly displayName: string;
  /** Où modifier les deux. */
  readonly profileUrl: string;
  /** Où poser un mot de passe (ou en changer). */
  readonly passwordUrl: string;
  /**
   * `false` ⇒ le compte n'a QUE le lien magique. Gouverne la présence du
   * paragraphe qui invite à en poser un : le proposer à qui en a déjà un
   * serait du bruit, et l'omettre à qui n'en a pas le laisserait dépendre de
   * sa boîte mail sans savoir qu'il existe une autre porte.
   */
  readonly hasPassword: boolean;
};

type Libelles = {
  readonly titre: string;
  readonly pseudo: string;
  readonly nomAffiche: string;
  readonly modifiable: string;
  readonly boutonProfil: string;
  readonly sansMotDePasse: string;
  readonly boutonMotDePasse: string;
};

/**
 * Les six langues du catalogue d'e-mails (`email/translations.ts`). L'anglais
 * sert de repli — jamais le français : un repli sur la langue du dépôt
 * enverrait du français à un lecteur hispanophone dont la langue manque, ce
 * que la table voisine évite déjà par la même règle.
 */
const LIBELLES: Record<string, Libelles> = {
  fr: {
    titre: 'Votre identité sur Meeshy',
    pseudo: 'Pseudo',
    nomAffiche: 'Nom affiché',
    modifiable: "Nous les avons composés à partir de votre adresse. Ils ne vous conviennent pas ? Vous pouvez les changer à tout moment.",
    boutonProfil: 'Modifier mon pseudo et mon nom',
    sansMotDePasse: "Votre compte n'a pas encore de mot de passe : vous vous connectez par lien magique, envoyé à cette adresse. Vous pouvez en définir un pour vous connecter aussi avec votre e-mail, votre pseudo ou votre numéro.",
    boutonMotDePasse: 'Définir un mot de passe',
  },
  en: {
    titre: 'Your identity on Meeshy',
    pseudo: 'Username',
    nomAffiche: 'Display name',
    modifiable: 'We composed them from your address. Not quite right? You can change them at any time.',
    boutonProfil: 'Change my username and name',
    sansMotDePasse: 'Your account has no password yet: you sign in with a magic link sent to this address. You can set a password to sign in with your e-mail, username or phone number as well.',
    boutonMotDePasse: 'Set a password',
  },
  es: {
    titre: 'Tu identidad en Meeshy',
    pseudo: 'Usuario',
    nomAffiche: 'Nombre visible',
    modifiable: 'Los hemos compuesto a partir de tu dirección. ¿No te convencen? Puedes cambiarlos cuando quieras.',
    boutonProfil: 'Cambiar mi usuario y mi nombre',
    sansMotDePasse: 'Tu cuenta aún no tiene contraseña: inicias sesión con un enlace mágico enviado a esta dirección. Puedes definir una contraseña para entrar también con tu correo, tu usuario o tu número.',
    boutonMotDePasse: 'Definir una contraseña',
  },
  pt: {
    titre: 'A sua identidade no Meeshy',
    pseudo: 'Nome de utilizador',
    nomAffiche: 'Nome apresentado',
    modifiable: 'Compusemo-los a partir do seu endereço. Não lhe agradam? Pode alterá-los quando quiser.',
    boutonProfil: 'Alterar o meu nome de utilizador e o meu nome',
    sansMotDePasse: 'A sua conta ainda não tem palavra-passe: entra através de um link mágico enviado para este endereço. Pode definir uma palavra-passe para entrar também com o seu e-mail, o seu nome de utilizador ou o seu número.',
    boutonMotDePasse: 'Definir uma palavra-passe',
  },
  it: {
    titre: 'La tua identità su Meeshy',
    pseudo: 'Nome utente',
    nomAffiche: 'Nome visualizzato',
    modifiable: 'Li abbiamo composti a partire dal tuo indirizzo. Non ti convincono? Puoi cambiarli quando vuoi.',
    boutonProfil: 'Modifica nome utente e nome',
    sansMotDePasse: "Il tuo account non ha ancora una password: accedi con un link magico inviato a questo indirizzo. Puoi impostare una password per accedere anche con e-mail, nome utente o numero di telefono.",
    boutonMotDePasse: 'Imposta una password',
  },
  de: {
    titre: 'Deine Identität bei Meeshy',
    pseudo: 'Benutzername',
    nomAffiche: 'Anzeigename',
    modifiable: 'Wir haben sie aus deiner Adresse gebildet. Passt das nicht? Du kannst beides jederzeit ändern.',
    boutonProfil: 'Benutzernamen und Namen ändern',
    sansMotDePasse: 'Dein Konto hat noch kein Passwort: Du meldest dich über einen Magic Link an, der an diese Adresse geht. Du kannst ein Passwort festlegen, um dich auch mit E-Mail, Benutzernamen oder Telefonnummer anzumelden.',
    boutonMotDePasse: 'Passwort festlegen',
  },
};

export function identityBlockLabels(language?: string): Libelles {
  return LIBELLES[(language ?? 'en').toLowerCase()] ?? LIBELLES.en!;
}

/**
 * Le bloc HTML. Aucune classe nouvelle : il n'emploie que `.info`, `.button` et
 * `.link-text`, déjà définies par `getBaseStyles()` et déjà éprouvées en mode
 * sombre — un gabarit d'e-mail qui invente son style est un gabarit qui
 * s'affichera un jour en noir sur noir.
 */
export function accountIdentityBlockHtml(identite: IdentiteDuCompte, language?: string): string {
  const l = identityBlockLabels(language);

  const motDePasse = identite.hasPassword
    ? ''
    : `<p style="margin:16px 0 8px;font-size:14px">${l.sansMotDePasse}</p>`
      + `<div style="text-align:center;margin:8px 0 4px"><a href="${identite.passwordUrl}" class="button" style="font-size:15px;padding:12px 28px">🔑 ${l.boutonMotDePasse}</a></div>`;

  return `<div class="info" style="margin:24px 0">`
    + `<strong>👤 ${l.titre}</strong>`
    + `<ul style="margin:10px 0;padding-left:20px">`
    + `<li>${l.pseudo} : <strong>@${echapper(identite.username)}</strong></li>`
    + `<li>${l.nomAffiche} : <strong>${echapper(identite.displayName)}</strong></li>`
    + `</ul>`
    + `<p style="margin:8px 0;font-size:14px">${l.modifiable}</p>`
    + `<div style="text-align:center;margin:8px 0"><a href="${identite.profileUrl}" class="link-text" style="font-weight:bold">${l.boutonProfil} →</a></div>`
    + motDePasse
    + `</div>`;
}

/**
 * Le bloc TEXTE — jamais dérivé du HTML par retrait de balises. Les deux
 * versions sont SERVIES à des lecteurs différents (le texte l'est aux clients
 * qui refusent le HTML, et aux filtres anti-spam qui comparent les deux) : une
 * version composée par soustraction rend des puces sans marqueur et des liens
 * sans intitulé.
 */
export function accountIdentityBlockText(identite: IdentiteDuCompte, language?: string): string {
  const l = identityBlockLabels(language);

  const lignes = [
    l.titre,
    `${l.pseudo} : @${identite.username}`,
    `${l.nomAffiche} : ${identite.displayName}`,
    l.modifiable,
    `${l.boutonProfil} : ${identite.profileUrl}`,
  ];

  if (!identite.hasPassword) {
    lignes.push('', l.sansMotDePasse, `${l.boutonMotDePasse} : ${identite.passwordUrl}`);
  }

  return lignes.join('\n');
}

/**
 * Les DEUX destinations que ce bloc propose — site unique (#6424).
 *
 * Elles sont composées ici, et non chez chaque appelant, pour une raison
 * mesurée : les deux gabarits qui portent ce bloc vivent dans deux services
 * différents (`registration.service.ts`, `MagicLinkService.ts`) et un lien
 * recopié dans deux services survit à la disparition de sa page dans l'un des
 * deux. Le jour où l'onglet change de nom, il change ici.
 *
 * Les ancres visent les onglets de `/settings` du LEGACY (`getInitialTab` lit
 * `window.location.hash`) : `#profile` porte le pseudo et le nom affiché,
 * `#security` porte le mot de passe — ce dernier depuis #6424, qui y a monté
 * `PasswordSettings`, jusque-là écrit et monté nulle part.
 *
 * **À la bascule vers `apps/web-v2`, ces deux ancres doivent exister là-bas.**
 * Mesuré le 2026-09-14 : le `/settings` de la v2 n'a ni onglets par fragment
 * ni section de mot de passe. Un lien d'e-mail qui atterrit sur une page qui
 * ne parle pas de ce qu'il promet est un contrôle qui ment — et il ment dans
 * le seul message que reçoit quelqu'un qui vient d'ouvrir un compte. La
 * dépendance est notée ICI, au site qui compose les liens, parce que c'est le
 * seul endroit où on la relira au moment de les changer.
 */
export function profileEditUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/settings#profile`;
}

export function passwordSettingsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/settings#security`;
}
