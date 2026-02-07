'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function MetadataTest() {
  const [url, setUrl] = useState('http://localhost:3100/signup/affiliate/aff_1760904438255_6g0t8ovvkpc');
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testMetadata = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/metadata?type=affiliate&affiliate=aff_1760904438255_6g0t8ovvkpc`);
      const data = await response.json();
      setMetadata(data);
    } catch (error) {
      console.error('Erreur test métadonnées:', error);
    } finally {
      setLoading(false);
    }
  };

  const testPageMetadata = async () => {
    setLoading(true);
    try {
      // Simuler une requête pour récupérer les métadonnées de la page
      const response = await fetch(url);
      const html = await response.text();
      
      // Extraire les métadonnées Open Graph du HTML
      const ogTitle = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
      const ogDescription = html.match(/<meta property="og:description" content="([^"]*)"/)?.[1];
      const ogImage = html.match(/<meta property="og:image" content="([^"]*)"/)?.[1];
      
      setMetadata({
        title: ogTitle,
        description: ogDescription,
        image: ogImage,
        html: html.substring(0, 2000) + '...'
      });
    } catch (error) {
      console.error('Erreur test page:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    testMetadata();
  }, []);

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle>Test des Métadonnées Open Graph</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="url">URL à tester</Label>
          <Input
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3100/signup/affiliate/..."
          />
        </div>

        <div className="flex space-x-2">
          <Button onClick={testMetadata} disabled={loading}>
            {loading ? 'Test...' : 'Test API Métadonnées'}
          </Button>
          <Button onClick={testPageMetadata} disabled={loading} variant="outline">
            {loading ? 'Test...' : 'Test Page HTML'}
          </Button>
        </div>

        {metadata && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Résultats :</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <div className="p-2 bg-gray-100 rounded text-sm">
                  {metadata.title}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Description</Label>
                <div className="p-2 bg-gray-100 rounded text-sm">
                  {metadata.description}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Image</Label>
                <div className="p-2 bg-gray-100 rounded text-sm break-all">
                  {metadata.image}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>URL</Label>
                <div className="p-2 bg-gray-100 rounded text-sm">
                  {metadata.url}
                </div>
              </div>
            </div>

            {metadata.image && (
              <div className="space-y-2">
                <Label>Aperçu de l'image</Label>
                <div className="border rounded p-4">
                  <img 
                    src={metadata.image} 
                    alt="Aperçu OG" 
                    className="max-w-full h-auto"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              </div>
            )}

            {metadata.html && (
              <div className="space-y-2">
                <Label>HTML (preview)</Label>
                <div className="p-2 bg-gray-100 rounded text-xs overflow-auto max-h-40">
                  <pre>{metadata.html}</pre>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>JSON Complet</Label>
              <div className="p-2 bg-gray-100 rounded text-xs overflow-auto max-h-40">
                <pre>{JSON.stringify(metadata, null, 2)}</pre>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
