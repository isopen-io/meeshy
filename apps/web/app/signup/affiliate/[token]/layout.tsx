import { Metadata } from 'next';
import { ReactNode } from 'react';
import { getServerLocale } from '@/lib/i18n/server-locale';
import { composeMetadata, getMetadataPage, pageArray, pageString } from '@/lib/i18n/metadata';

interface AffiliateLayoutProps {
  children: ReactNode;
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: AffiliateLayoutProps): Promise<Metadata> {
  const { token } = await params;
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3100';
  const locale = await getServerLocale();
  const meta = getMetadataPage(locale, 'affiliate');

  const imageParams = new URLSearchParams({
    type: 'affiliate',
    title: pageString(meta, 'imageTitle'),
    subtitle: pageString(meta, 'imageSubtitle'),
    userName: pageString(meta, 'imageUserName'),
  });

  const dynamicImageUrl = `${frontendUrl}/api/og-image-dynamic?${imageParams.toString()}`;

  return composeMetadata({
    locale,
    title: pageString(meta, 'title'),
    description: pageString(meta, 'description'),
    url: `${frontendUrl}/signup/affiliate/${token}`,
    image: dynamicImageUrl,
    imageAlt: pageString(meta, 'ogImageAlt'),
    canonical: `${frontendUrl}/signup/affiliate/${token}`,
    keywords: pageArray(meta, 'keywords'),
  });
}

export default function AffiliateLayout({ children }: AffiliateLayoutProps) {
  return <>{children}</>;
}
