/**
 * QUAND LE TRANSPORT S'OUVRE — la règle, sortie de la fermeture qui la portait.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * L'engagement se gardait sur deux faits — « déjà ouvert » et « la place est
 * refusée » — et JAMAIS sur le réseau. Toucher le composeur pendant une coupure
 * — c'est-à-dire le chemin que le lot met en avant, « ce qu'on écrit dans le
 * métro n'est pas perdu » — lançait donc le chargement de `socket.io-client`
 * (12 796 octets mesurés) puis, une fois le module en cache, une boucle de
 * reconnexion 1 s → 30 s pour toute la durée de la coupure, sur un téléphone en
 * 3G. Le § 6.2 et la barre « 0 requête » l'interdisent, et le même fichier
 * écrivait déjà « une connexion tenue est une requête de fond ».
 *
 * La suspension ne rattrapait rien : `perte-du-reseau` est émise AVANT
 * l'engagement, donc `participation.current` valait `null` au moment du
 * `suspend()`, et plus rien ne le rappelait avant la prochaine `reprise`.
 *
 * Et l'écran DISAIT deux choses pour un seul fait : le point d'état passait à
 * « Reconnexion en cours » sous une bannière annonçant « Hors ligne ».
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE RÈGLE VIT ICI, ET PAS DANS LA FERMETURE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Parce qu'elle doit être GAGEABLE, et qu'elle ne l'était pas.
 *
 * Le témoin naturel — « hors-ligne, toucher le composeur n'ouvre rien » — ne
 * discrimine pas dans un navigateur piloté : `context.setOffline(true)` coupe
 * TOUT, y compris le chunk asynchrone du transport, si bien que l'import échoue
 * de lui-même et que l'écran retombe au même état avec ou sans la garde
 * (mesuré : le cas D passe dans les deux sens). Le défaut réel apparaît quand le
 * module est DÉJÀ en cache — le cas nominal d'une seconde coupure —, ce qu'un
 * `setOffline` ne sait pas mettre en scène.
 *
 * Une règle dont le seul témoin possible est vert des deux côtés n'est pas
 * gardée. Sortie en fonction PURE, elle l'est.
 */

export type EtatDeLEngagement = {
  /** Le transport est déjà ouvert, ou son chargement est déjà parti. */
  readonly dejaEngage: boolean;
  /** La place est refusée (401 / 410) — plus rien à ouvrir, jamais. */
  readonly refuse: boolean;
  /** Le réseau est tombé (§ 6.2, transition `perte-du-reseau`). */
  readonly horsLigne: boolean;
};

/**
 * Ouvre-t-on le transport MAINTENANT ?
 *
 * Trois refus, et ils ne veulent pas dire la même chose : « déjà » (rien à
 * faire), « refusé » (plus jamais), « hors ligne » (pas maintenant). Seul le
 * troisième laisse un souhait à rejouer — c'est `engagementARejouer` qui le dit.
 */
export const peutOuvrirLeTransport = (etat: EtatDeLEngagement): boolean =>
  !etat.dejaEngage && !etat.refuse && !etat.horsLigne;

/**
 * Le souhait de participer survit-il à la coupure ?
 *
 * Il n'est pas ANNULÉ, il est REPORTÉ : quelqu'un qui a écrit dans le métro
 * veut évidemment que son message parte au retour du réseau — la file s'en
 * charge par REST — et veut recevoir la suite dans la seconde, ce qui demande
 * le transport. Le rejouer À LA REPRISE est donc le comportement juste ; ne
 * jamais le rejouer transformerait la garde ci-dessus en perte de fonction.
 */
export const engagementARejouer = ({
  voulu,
  dejaEngage,
}: {
  readonly voulu: boolean;
  readonly dejaEngage: boolean;
}): boolean => voulu && !dejaEngage;
