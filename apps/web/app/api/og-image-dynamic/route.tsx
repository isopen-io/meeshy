/**
 * `GET /api/og-image-dynamic` — l'image d'aperçu que quatre pages ANNONCENT
 * depuis toujours, et que rien ne servait (#4338).
 *
 * Mesuré sur staging le 2026-08-30 : `404`. Les quatre balises `og:image` du
 * dépôt — invitation d'un lien de conversation, parrainage, profil public,
 * conversation partagée — pointaient donc vers rien, et tout lien Meeshy
 * collé dans une messagerie ou un réseau social s'y affichait **sans image**.
 *
 * Le correctif est de SERVIR ce que les pages annoncent, jamais de retirer
 * l'annonce : la règle du dépôt est qu'on ne retire pas un effet visuel, et
 * la complexité se paie dans le code plutôt que chez l'utilisateur. Retirer
 * les quatre balises aurait fermé l'issue en supprimant la fonctionnalité.
 *
 * Ce fichier ne porte QUE le rendu. Ce que l'URL a le droit de demander — les
 * quatre gabarits, les bornes, le sens de la panne — vit dans
 * `lib/og-image-params.ts`, qui est la moitié qu'un témoin peut atteindre.
 */

import { ImageResponse } from 'next/og';

import { parseOgImageParams, type OgImageType } from '@/lib/og-image-params';

/**
 * `nodejs`, pas `edge` : le déploiement est une image Docker `standalone`,
 * où le runtime edge n'a pas d'hôte.
 */
export const runtime = 'nodejs';

/** Les dimensions qu'attendent Open Graph et Twitter Cards. */
const LARGEUR = 1200;
const HAUTEUR = 630;

/**
 * La teinte d'accent par gabarit. Elle ne fait pas que décorer : c'est le
 * seul signal qui distingue d'un coup d'œil une invitation d'un profil dans
 * un fil de conversation où les vignettes s'empilent.
 */
const ACCENT: Record<OgImageType, string> = {
  invitation: '#4338CA',
  affiliate: '#0F766E',
  profile: '#7C3AED',
  conversation: '#1D4ED8',
};

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const { type, title, subtitle, userName, message } = parseOgImageParams(searchParams);
  const accent = ACCENT[type];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background: `linear-gradient(135deg, #0B1120 0%, ${accent} 100%)`,
          color: '#F8FAFC',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: '#F8FAFC',
              color: accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '34px',
              fontWeight: 700,
            }}
          >
            M
          </div>
          <div style={{ fontSize: '30px', fontWeight: 600, letterSpacing: '-0.5px' }}>Meeshy</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {title ? (
            <div style={{ fontSize: '64px', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-1.5px' }}>
              {title}
            </div>
          ) : null}
          {subtitle ? (
            <div style={{ fontSize: '32px', color: '#CBD5E1' }}>{subtitle}</div>
          ) : null}
          {message ? (
            <div style={{ fontSize: '28px', color: '#E2E8F0', lineHeight: 1.35 }}>{message}</div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '26px' }}>
          <div style={{ color: '#E2E8F0' }}>{userName}</div>
          <div style={{ color: '#94A3B8' }}>meeshy.me</div>
        </div>
      </div>
    ),
    {
      width: LARGEUR,
      height: HAUTEUR,
      headers: {
        // Une vignette d'aperçu est relue par chaque robot qui croise le lien :
        // elle se met en cache longtemps, et se revalide en arrière-plan.
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    }
  );
}
