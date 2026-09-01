import { documentDeLaVitrine } from './vitrine/vue';

/**
 * `/` — la vitrine publique.
 *
 * ELLE NE PARTAGE PAS `rendDocument` AVEC LES ÉCRANS DE LIEN, et c'est une
 * différence de CONTRAT, pas un oubli. Celui-là pose `cache-control: no-store`,
 * juste pour une réponse composée autour d'un jeton : la mettre en cache la
 * servirait au lecteur suivant. Cette page-ci ne dépend d'aucun lecteur, ne
 * porte aucune donnée, et une politique `no-store` lui ferait payer un
 * aller-retour complet à chaque visite — sur la surface même qui vante la
 * légèreté. Partager la fonction aurait donc partagé la MAUVAISE moitié.
 */
export function GET(): Response {
  return new Response(documentDeLaVitrine(), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    },
  });
}
