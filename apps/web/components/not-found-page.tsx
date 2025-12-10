'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, ArrowLeft, Home } from 'lucide-react';

interface NotFoundPageProps {
  title?: string;
  description?: string;
  suggestions?: string[];
}

export function NotFoundPage({ 
  title = "Page non trouvée", 
  description = "Désolé, cette page n'existe pas encore.",
  suggestions = [
    "Retourner au dashboard",
    "Consulter vos conversations",
    "Voir vos groupes"
  ]
}: NotFoundPageProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-orange-600" />
          </div>
          <CardTitle className="text-xl font-bold text-gray-900">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600 text-center">
            {description}
          </p>
          
          <div className="space-y-2">
            <Button 
              onClick={() => router.push('/dashboard')}
              className="w-full"
            >
              <Home className="w-4 h-4 mr-2" />
              Retour au dashboard
            </Button>
            
            <Button 
              onClick={() => router.back()}
              variant="outline"
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Page précédente
            </Button>
          </div>

          <div className="pt-4 border-t">
            <p className="text-sm text-gray-500 mb-2">Suggestions :</p>
            <ul className="text-sm space-y-1">
              {suggestions.map((suggestion, index) => (
                <li key={index} className="text-gray-600">
                  • {suggestion}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
