import { COOKIE_DE_SESSION } from './authentification/remise';

/**
 * CE QUE LE SERVEUR SAIT D'UN LECTEUR — et ce n'est presque rien, à dessein.
 *
 * La session de Meeshy vit dans `localStorage` (voir
 * `app/authentification/remise.ts`) : le serveur ne la voit pas. Le seul indice
 * qui lui parvient est le cookie `meeshy_session`, que l'application écrit à
 * côté pour son propre middleware.
 *
 * IL N'AUTORISE RIEN, ET C'EST LA PROPRIÉTÉ IMPORTANTE. Ce cookie n'est pas
 * signé et n'est pas `HttpOnly` — n'importe qui peut le fabriquer. On ne s'en
 * sert donc QUE pour choisir quelle page servir à la racine, jamais pour
 * accorder un accès : la porte reste le jeton porteur, vérifié par la
 * passerelle à chaque appel. Le pire qu'un cookie forgé obtienne ici est une
 * redirection vers un écran qui le renverra se connecter.
 */
export const aUneSession = (requete: Request): boolean => {
  const entete = requete.headers.get('cookie');
  if (entete === null) return false;

  return entete
    .split(';')
    .map((morceau) => morceau.trim())
    .some((morceau) => morceau.startsWith(`${COOKIE_DE_SESSION}=`) && morceau.length > COOKIE_DE_SESSION.length + 1);
};
