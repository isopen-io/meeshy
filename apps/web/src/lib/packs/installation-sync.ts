import type { QueryClient } from '@tanstack/react-query';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import { isPackDomain } from '@meeshy/shared/types/content-pack';

import { PACK_SHOP_QUERY_ROOT, packQueryKeys } from '../api/pack-query-keys';
import type { SocketClient } from '../net/socket';

/**
 * **MON ÉTAGÈRE DE PACKS SUIT MES APPAREILS** (#20354) —
 * `pack:installation-updated`, posé par la passerelle sur `user:<id>` après
 * CHAQUE voie d'acquisition : l'achat (`PackCatalog.purchase`) comme l'octroi
 * sans achat (`PackCatalog.award` — un rang, un trophée, une saison, un don).
 *
 * **Le web n'avait AUCUN écouteur de ce nom**, alors qu'iOS
 * (`PackPresence.swift`) et Android (`MessageSocketManager.kt`) en ont un
 * depuis toujours. La seule occurrence du dépôt était un COMMENTAIRE, dans
 * `stickers/library-sync.ts`, qui CITAIT la façon dont Android traite cet
 * événement pour justifier la conception de son VOISIN. Le web avait donc lu
 * ce que faisait Android, s'en était inspiré pour `sticker:library-updated`,
 * et ne l'avait jamais branché pour lui-même.
 *
 * Un pack acheté sur le téléphone, ou GAGNÉ par un trophée, restait affiché
 * « non possédé » dans le navigateur jusqu'à la péremption de sa requête — et
 * un pack gagné est le cas le plus désagréable, puisque rien de local ne
 * l'annonce.
 *
 * ## Pourquoi PÉRIMER, là où la bibliothèque de stickers APPLIQUE
 *
 * `library-sync.ts` applique sa charge au cache plutôt que de relire, et sa
 * raison est bonne : la charge porte le sticker entier, et relire ferait
 * clignoter une grille qu'on regarde. **Les deux raisons qui la fondent sont
 * fausses ici**, et c'est ce qui retourne la décision :
 *
 * 1. **La charge ne suffit pas.** Elle porte `{domain, slug, installed, owned?,
 *    at}` ; la vitrine affiche un PRIX, un compteur d'installations et un état
 *    d'offre que rien là-dedans ne reconstruit. Appliquer la charge
 *    fabriquerait une entrée appauvrie à la place d'une entrée juste.
 * 2. **L'événement ne porte AUCUN `userId`.** `library-sync.ts` peut comparer
 *    au profil en cache avant d'écrire ; ici c'est impossible, le contrat
 *    partagé ne le porte pas. Or les deux issues ne sont pas symétriques :
 *    une péremption déclenchée par un événement étranger coûte UNE relecture,
 *    faite sous les propres jetons du lecteur, donc juste ; une ÉCRITURE
 *    déclenchée par le même événement poserait le pack de quelqu'un d'autre
 *    dans mon étagère.
 *
 * > Une garde qu'on ne peut pas poser choisit le sens d'erreur à sa place :
 * > sans moyen de vérifier à qui appartient la charge, on relit, on n'écrit
 * > pas.
 *
 * C'est aussi EXACTEMENT ce que le chemin LOCAL fait déjà
 * (`unified-shop.tsx`, `markOwned` et `completeInstalled` : les deux clés du
 * domaine périmées à la confirmation) — ce module ne fait que donner au chemin
 * DISTANT ce que le chemin local avait depuis le début.
 *
 * ## Ce qui est périmé, et ce qui ne l'est pas
 *
 * Les trois surfaces qui montrent l'état d'un pack : l'étagère du domaine, le
 * catalogue du domaine, sa fiche, et la vitrine unifiée (par sa RACINE, car
 * chaque filtre y a son entrée et un pack paraît sous « Tout » comme sous son
 * domaine).
 *
 * Le SOLDE de Meeshes n'y est pas, et son absence est raisonnée : sa requête
 * est inerte (`enabled: false`, `staleTime: Infinity`), donc la périmer ne
 * déclencherait rien. `loadCatalogue` l'écrit à chaque relecture de la
 * vitrine — périmer la vitrine le rafraîchit, un achat fait ailleurs compris.
 */

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : null;

/**
 * Périme ce qu'un changement d'installation rend faux.
 *
 * Une charge dont le DOMAINE est inconnu est ignorée ENTIÈRE : sans lui, les
 * clés du domaine ne se calculent pas, et périmer la seule vitrine servirait
 * une moitié de correctif en silence. Un serveur plus récent qui ajouterait un
 * domaine se fait donc attendre plutôt que mal servir — et le `slug`, lui,
 * n'est exigé que pour la FICHE, la seule clé qui le nomme.
 */
export function applyPackInstallationEvent(queryClient: QueryClient, payload: unknown): void {
  const event = asRecord(payload);
  if (event === null) return;
  const domain = event['domain'];
  if (!isPackDomain(domain)) return;

  const keys = packQueryKeys(domain);
  void queryClient.invalidateQueries({ queryKey: keys.installed, exact: true });
  void queryClient.invalidateQueries({ queryKey: keys.catalogue, exact: true });
  void queryClient.invalidateQueries({ queryKey: PACK_SHOP_QUERY_ROOT, exact: false });

  const slug = event['slug'];
  if (typeof slug === 'string' && slug !== '') {
    void queryClient.invalidateQueries({ queryKey: keys.detail(slug), exact: true });
  }
}

/** Branche l'événement sur les caches de packs ; rend le débranchement. */
export function bindPackInstallationSync(params: { readonly socket: SocketClient; readonly queryClient: QueryClient }): () => void {
  const { socket, queryClient } = params;
  const onUpdated = (payload: unknown): void => applyPackInstallationEvent(queryClient, payload);
  socket.on(SERVER_EVENTS.PACK_INSTALLATION_UPDATED, onUpdated);
  return () => socket.off(SERVER_EVENTS.PACK_INSTALLATION_UPDATED, onUpdated);
}
