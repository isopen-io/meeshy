import { NextResponse } from 'next/server';
import { resolveBuildInfo } from '@meeshy/shared/utils/build-info';

export async function GET() {
  try {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'meeshy-web',
      version: process.env.npm_package_version || '1.0.0',
      // Identifie le code réellement servi. Sans lui, savoir si un correctif
      // est en production imposait un `docker inspect` sur l'hôte, ou une
      // corrélation entre l'uptime du container et l'horodatage des tags
      // `sha-<short>` du registre.
      build: resolveBuildInfo(),
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      api_url: process.env.NEXT_PUBLIC_API_URL,
      ws_url: process.env.NEXT_PUBLIC_WS_URL,
      translation_url: process.env.NEXT_PUBLIC_TRANSLATION_URL,
    };

    return NextResponse.json(healthData, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
