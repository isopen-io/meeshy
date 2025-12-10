/**
 * API Route pour gérer les préférences utilisateur
 * GET /api/users/preferences - Récupérer toutes les préférences
 * POST /api/users/preferences - Créer/Mettre à jour une préférence
 */

import { NextRequest, NextResponse } from 'next/server';

// Mock de la base de données - à remplacer par Prisma dans le vrai projet
interface UserPreference {
  id: string;
  userId: string;
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

// Mock storage (en production, utiliser Prisma)
const mockPreferences: UserPreference[] = [];

// Fonction helper pour extraire l'utilisateur du token JWT
function extractUserFromToken(request: NextRequest): { userId: string } | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  // En production, décoder le vrai JWT
  // Pour l'instant, mock avec un userId fixe
  return { userId: 'mock-user-123' };
}

export async function GET(request: NextRequest) {
  try {
    const user = extractUserFromToken(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      );
    }

    // En production, utiliser Prisma :
    /*
    const preferences = await prisma.userPreference.findMany({
      where: { userId: user.userId },
      orderBy: { updatedAt: 'desc' }
    });
    */

    // Mock pour le développement
    const userPreferences = mockPreferences.filter(
      pref => pref.userId === user.userId
    );

    return NextResponse.json(userPreferences);

  } catch (error) {
    console.error('Error fetching preferences:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = extractUserFromToken(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: 'Les champs key et value sont requis' },
        { status: 400 }
      );
    }

    // Validation spécifique pour les préférences de police
    if (key === 'font-family') {
      const validFonts = [
        'inter', 'nunito', 'poppins', 'open-sans', 'lato', 
        'comic-neue', 'lexend', 'roboto', 'geist-sans'
      ];
      
      if (!validFonts.includes(value)) {
        return NextResponse.json(
          { error: 'Police non valide' },
          { status: 400 }
        );
      }
    }

    // En production, utiliser Prisma :
    /*
    const preference = await prisma.userPreference.upsert({
      where: {
        userId_key: {
          userId: user.userId,
          key: key
        }
      },
      update: {
        value: value,
        updatedAt: new Date()
      },
      create: {
        userId: user.userId,
        key: key,
        value: value
      }
    });
    */

    // Mock pour le développement
    const existingIndex = mockPreferences.findIndex(
      pref => pref.userId === user.userId && pref.key === key
    );

    const now = new Date();
    let preference: UserPreference;

    if (existingIndex >= 0) {
      // Mettre à jour
      preference = {
        ...mockPreferences[existingIndex],
        value,
        updatedAt: now
      };
      mockPreferences[existingIndex] = preference;
    } else {
      // Créer
      preference = {
        id: `pref-${Date.now()}`,
        userId: user.userId,
        key,
        value,
        createdAt: now,
        updatedAt: now
      };
      mockPreferences.push(preference);
    }

    return NextResponse.json(preference);

  } catch (error) {
    console.error('Error saving preference:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
