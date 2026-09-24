import { appelNatif, coqueCourante, type CoqueNative } from '@/lib/native-shell';

/**
 * **Partager Meeshy — le seul démarrage que la v3.1 sache VRAIMENT offrir.**
 *
 * L'état vide de la liste récite depuis toujours « Un message, une story, un
 * mood, un post — ou invitez vos amis » et n'offre AUCUN de ces gestes : la
 * v3.1 n'a ni composeur, ni contacts, ni découverte. Des quatre promesses, une
 * seule peut être tenue aujourd'hui sans route ni écran neuf, et c'est la
 * dernière — inviter quelqu'un.
 *
 * C'est exactement l'« effet minimal » que la revue #5559 avait nommé en
 * retirant les deux boutons sans porte de l'en-tête : « une copie
 * presse-papier avec retour visible ». On ne repeint donc pas un contrôle qui
 * ment : on lui donne sa porte.
 *
 * `navigator.share` d'abord (c'est le geste natif sur mobile, et il ouvre la
 * vraie feuille de partage du système), le presse-papier ensuite. **Une
 * annulation n'est pas un échec** : l'utilisateur qui ferme la feuille de
 * partage a décidé, et lui copier le lien dans le dos serait un effet qu'il
 * n'a pas demandé.
 */
export type ResultatInvitation = 'partage' | 'copie' | 'annule' | 'indisponible';

export type PortailPartage = {
  readonly share?: (donnees: { title: string; text: string; url: string }) => Promise<void>;
  readonly copier?: (texte: string) => Promise<void>;
};

export const TEXTE_INVITATION = 'Rejoins-moi sur Meeshy — on s’y écrit dans nos langues.';

type DonneesPartage = { title: string; text: string; url: string };

type NavigateurPartage = {
  readonly share?: (donnees: DonneesPartage) => Promise<void>;
  readonly clipboard?: { readonly writeText: (texte: string) => Promise<void> };
};

/**
 * Le pont de partage de la coque Android (#7710) — `MeeshySharePlugin.java`.
 * La WebView Android n'implémente pas l'API Web Share (`navigator.share`
 * absent, crbug 765923) : sans ce pont, « Partager » y copiait le lien là où
 * le web mobile et iOS ouvrent la feuille du système.
 */
const PONT_PARTAGE = 'MeeshyShare';

/**
 * La feuille Android fermée sans choix (#7822) : le pont rejette avec le code
 * `CANCELED`. Traduit en `AbortError`, il prend le chemin d'une annulation
 * web — ni copie, ni partage compté, ni annonce.
 */
const ANNULATION_PONT = 'CANCELED';

function annulationDuPont(erreur: unknown): unknown {
  const code = (erreur as { readonly code?: unknown } | null)?.code;
  return code === ANNULATION_PONT ? new DOMException('Partage annulé', 'AbortError') : erreur;
}

/**
 * Le portail se COMPOSE de ce que l'hôte offre : `navigator.share` d'abord,
 * le pont de la coque quand la WebView n'a pas l'API, le presse-papier
 * toujours en repli. Un refus du pont (aucune application pour partager) n'est
 * pas un `AbortError` : `partagerLien` retombe donc sur la copie. Sa seule
 * annulation, elle, en devient un.
 */
export function portailDe(hote: { readonly nav: NavigateurPartage; readonly coque: CoqueNative | undefined }): PortailPartage {
  const { nav, coque } = hote;
  const pont = appelNatif(coque, PONT_PARTAGE);
  // `exactOptionalPropertyTypes` : une clé optionnelle s'OMET, elle ne se pose
  // pas à `undefined` — d'où la composition par épandage conditionnel.
  const partage = typeof nav.share === 'function'
    ? { share: (d: DonneesPartage) => nav.share!(d) }
    : pont !== null
      ? {
          share: async (d: DonneesPartage) => {
            await pont('share', d).catch((erreur: unknown) => {
              throw annulationDuPont(erreur);
            });
          },
        }
      : {};
  const copie = nav.clipboard && typeof nav.clipboard.writeText === 'function'
    ? { copier: (t: string) => nav.clipboard!.writeText(t) }
    : {};
  return { ...partage, ...copie };
}

/**
 * Le portail est INJECTÉ plutôt que lu depuis `navigator` : c'est ce qui rend
 * les quatre issues mesurables sans navigateur, et ce qui empêche le témoin de
 * se contenter d'affirmer que la fonction existe.
 */
export function portailDuNavigateur(): PortailPartage {
  if (typeof navigator === 'undefined') return {};
  return portailDe({ nav: navigator as NavigateurPartage, coque: coqueCourante() });
}

export function partagerInvitation(
  lien: string,
  portail: PortailPartage = portailDuNavigateur(),
): Promise<ResultatInvitation> {
  return partagerLien({ title: 'Meeshy', text: TEXTE_INVITATION, url: lien }, portail);
}

/**
 * LE PARTAGE GÉNÉRIQUE (#6278) — l'invitation n'en est qu'un cas ; une
 * publication du fil en est un autre. Mêmes quatre issues, même règle : une
 * annulation (`AbortError`) est une décision, tout autre refus de la feuille
 * (Safari hors activation : `NotAllowedError`) retombe sur le presse-papier.
 * À appeler DANS le gestionnaire du geste, sans `await` préalable : la
 * feuille du système n'ouvre que pendant l'activation.
 */
export async function partagerLien(
  donnees: { readonly title: string; readonly text: string; readonly url: string },
  portail: PortailPartage = portailDuNavigateur(),
): Promise<ResultatInvitation> {
  const lien = donnees.url;
  if (portail.share) {
    try {
      await portail.share({ title: donnees.title, text: donnees.text, url: donnees.url });
      return 'partage';
    } catch (erreur) {
      // Fermer la feuille de partage est une DÉCISION, pas une panne : on ne
      // retombe pas sur le presse-papier, sinon annuler produirait quand même
      // un effet — le contraire de ce que le geste demandait.
      if (erreur instanceof Error && erreur.name === 'AbortError') return 'annule';
    }
  }
  if (portail.copier) {
    try {
      await portail.copier(lien);
      return 'copie';
    } catch {
      return 'indisponible';
    }
  }
  return 'indisponible';
}

/**
 * Ce que l'utilisateur DOIT s'entendre dire — et ce qu'il ne doit pas.
 *
 * `partage` et `annule` rendent `null` : la feuille du système a déjà parlé
 * dans les deux cas, et redoubler d'un message par-dessus est du bruit. Restent
 * les deux issues MUETTES, celles où rien n'a bougé à l'écran — c'est
 * exactement là qu'un retour est dû.
 */
export const RETOUR_INVITATION: Record<ResultatInvitation, string | null> = {
  partage: null,
  annule: null,
  copie: 'Lien copié — il ne reste qu’à le coller.',
  indisponible: 'Impossible de partager ici. Copiez l’adresse de cette page.',
};

/**
 * **INVITER AVEC SON CODE** (#6707) — l'invitation porte le lien de parrainage
 * du lecteur, jamais le site nu.
 *
 * Le lien vient d'un chargeur INJECTÉ (le port `lib/api/referral-link.ts`, que
 * ce module n'importe pas : il le laisserait tirer `zod` dans la liste des
 * conversations). **Sans lien, rien ne part** — ni feuille, ni presse-papier :
 * partager l'origine « faute de mieux » inviterait quelqu'un que personne ne
 * parraine, en le laissant croire du contraire.
 *
 * L'attente du réseau précède ici la feuille, contrairement à ce que
 * `partagerLien` demande : le jeton n'existe que côté passerelle. Safari refuse
 * alors la feuille ET le presse-papier (`decisions.md`, D-48) — d'où
 * `memoriserLienParLecteur`, qui fait partir le geste SUIVANT sans attente, et
 * un retour `indisponible` qui porte le lien lui-même.
 */
export type IssueInvitationParrainee =
  | { readonly resultat: 'lien-indisponible' }
  | { readonly resultat: ResultatInvitation; readonly lien: string };

type ChargeurDeLien = () => Promise<string | null>;

async function lienOuNull(chargerLien: ChargeurDeLien): Promise<string | null> {
  try {
    return await chargerLien();
  } catch {
    return null;
  }
}

export async function partagerInvitationParrainee(params: {
  readonly chargerLien: ChargeurDeLien;
  readonly portail?: PortailPartage;
}): Promise<IssueInvitationParrainee> {
  const lien = await lienOuNull(params.chargerLien);
  if (lien === null) return { resultat: 'lien-indisponible' };
  const resultat = await partagerInvitation(lien, params.portail ?? portailDuNavigateur());
  return { resultat, lien };
}

/**
 * Le retour d'une invitation parrainée. Il diffère de `RETOUR_INVITATION` sur
 * les deux issues où celui-ci inviterait à « copier l'adresse de cette page »
 * — une adresse SANS code : le lien manquant se dit, le lien impossible à
 * partager se donne, à copier à la main.
 */
export function retourInvitationParrainee(issue: IssueInvitationParrainee): string | null {
  if (issue.resultat === 'lien-indisponible') return 'Impossible de préparer votre lien d’invitation — réessayez dans un instant.';
  if (issue.resultat === 'indisponible') return `Partage impossible ici — copiez votre lien : ${issue.lien}`;
  return RETOUR_INVITATION[issue.resultat];
}

/**
 * **Le second geste part SANS attendre le réseau.** Le lien résolu est gardé
 * pour le lecteur courant, et pour lui seul : un autre compte dans le même
 * onglet efface la mémoire au lieu d'hériter du code précédent. Un échec n'est
 * jamais gardé, et deux gestes simultanés attendent le MÊME chargement — un
 * double tap ne crée pas deux jetons.
 */
export function memoriserLienParLecteur(chargerLien: ChargeurDeLien): (lecteurId: string | null) => Promise<string | null> {
  const memoire = new Map<string, Promise<string | null>>();
  return (lecteurId) => {
    if (lecteurId === null) return chargerLien();
    const connu = memoire.get(lecteurId);
    if (connu !== undefined) return connu;
    memoire.clear();
    const enVol = lienOuNull(chargerLien).then((lien) => {
      if (lien === null && memoire.get(lecteurId) === enVol) memoire.delete(lecteurId);
      return lien;
    });
    memoire.set(lecteurId, enVol);
    return enVol;
  };
}
