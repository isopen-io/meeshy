import { montreLeBandeau } from './bandeau';

/**
 * LES TROIS FENTES DE STATUT DE `/notifications/preferences` — site UNIQUE,
 * partagé par les treize bascules (`lib/realtime/prefs.ts`) et par la rangée
 * push (`lib/realtime/push-abonnement.ts`, restante FLUIDITÉ de #5391).
 *
 * L'ÉCRAN N'A QU'UNE `.avis`, QU'UNE `.echec` ET QU'UN BANDEAU — servis même
 * vides par `app/connecte/prefs-vue.ts` (§ 12.4 : un module ne CRÉE jamais
 * une région de statut, il révèle celle que la vue a déjà servie). Quatorze
 * rangées écrivent dedans : ce sont donc trois ÉTATS EXCLUSIFS de l'écran,
 * pas trois nœuds indépendants — « réussi », « échoué », « session morte ».
 * Deux d'entre eux affichés en même temps est un état que le lecteur ne peut
 * pas lire, et c'est le défaut que la duplication produisait.
 *
 * POURQUOI CE FICHIER EXISTE (défaut relevé en revue). Ces trois gestes
 * étaient écrits DEUX FOIS — `montreLaReussite`/`montreLEchec`/
 * `montreLaSessionExpiree` dans `prefs.ts` (#4899), `montreLEchec`/
 * `montreLAvis` dans `push-abonnement.ts` — et les deux copies avaient déjà
 * DIVERGÉ : la copie push ne masquait NI `.avis` NI `.echec` avant de lever
 * le bandeau de session expirée. Un lecteur dont le retrait venait d'échouer
 * (500, ou un POST sans JavaScript re-rendu `echec: true` par
 * `app/connecte/prefs-porte.ts`) lisait donc « réessayez » SOUS un bandeau
 * qui lui disait de se reconnecter — les deux conseils à la fois, le second
 * étant le seul vrai. C'est exactement la leçon de #4899 (« un 401 n'est pas
 * un échec réseau »), perdue à la copie.
 *
 * POURQUOI PAS EXPORTÉ DEPUIS `prefs.ts` : `prefs.ts` exécute `demarre()` à
 * l'IMPORT et importe déjà `push-abonnement.ts` — l'importer depuis
 * `push-abonnement.ts` ferait un cycle. Ce module ne fait que PEINDRE des
 * fentes déjà servies, comme `prefs-peinture.ts` et `bandeau.ts` à côté de
 * lui.
 *
 * LES TEXTES RESTENT CHEZ L'APPELANT : `PREFS.regle(libelle)` / `PREFS.echec`
 * pour les treize bascules, `PREFS.push.*` pour la rangée push
 * (`lib/contenu/prefs-de-notif.ts`, site unique des chaînes). Rien n'est en
 * dur ici.
 */

const IDENTIFIANT_DU_BANDEAU = 'bandeau-session-expiree';

const fente = (racine: ParentNode, classe: string): HTMLElement | null => racine.querySelector<HTMLElement>(`.${classe}`);

const peins = (racine: ParentNode, classe: string, texte: string): void => {
  const noeud = fente(racine, classe);
  if (noeud === null) return;
  noeud.hidden = false;
  noeud.textContent = texte;
};

const masque = (racine: ParentNode, classe: string): void => {
  const noeud = fente(racine, classe);
  if (noeud !== null) noeud.hidden = true;
};

/** RÉUSSI — `.avis` (`role="status"`) porte le libellé servi, `.echec` disparaît. */
export const montreLaReussite = (racine: ParentNode, libelle: string): void => {
  masque(racine, 'echec');
  peins(racine, 'avis', libelle);
};

/** ÉCHOUÉ — `.echec` (`role="alert"`) porte le motif servi, `.avis` disparaît. */
export const montreLEchec = (racine: ParentNode, motif: string): void => {
  masque(racine, 'avis');
  peins(racine, 'echec', motif);
};

/**
 * SESSION MORTE — le bandeau à BOUTON remplace les DEUX autres fentes : sur
 * une session qui n'est plus valide, « réessayez » ferait réessayer un
 * lecteur indéfiniment sans jamais lui apprendre qu'il doit se reconnecter
 * (#4899). Le nœud est celui que la vue a déjà servi caché
 * (`app/connecte/bandeau-vue.ts`), révélé par le site unique de ce geste
 * (`lib/realtime/bandeau.ts`).
 */
export const montreLaSessionExpiree = (racine: ParentNode): void => {
  masque(racine, 'avis');
  masque(racine, 'echec');
  montreLeBandeau(racine, IDENTIFIANT_DU_BANDEAU, true);
};
