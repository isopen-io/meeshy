/**
 * Composant de sélection de police pour les paramètres utilisateur
 */

'use client';

import React, { useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Palette, RotateCcw, Check } from "lucide-react";
import { useFontPreference } from '@/hooks/use-font-preference';
import { availableFonts, FontFamily, getRecommendedFonts } from '@/lib/fonts';
import { useReducedMotion, SoundFeedback } from '@/hooks/use-accessibility';

interface FontSelectorProps {
  className?: string;
}

export function FontSelector({ className }: FontSelectorProps) {
  const reducedMotion = useReducedMotion();
  const {
    currentFont,
    changeFontFamily,
    resetToDefault,
    isLoading,
    error,
    fontConfig
  } = useFontPreference();

  const recommendedFonts = getRecommendedFonts();
  const otherFonts = availableFonts.filter(font => !font.recommended);

  const handleFontChange = useCallback((fontId: FontFamily) => {
    SoundFeedback.playClick();
    changeFontFamily(fontId);
  }, [changeFontFamily]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, fontId: FontFamily) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleFontChange(fontId);
    }
  }, [handleFontChange]);

  const FontCard = ({ font }: { font: typeof availableFonts[0] }) => {
    const isSelected = currentFont === font.id;

    return (
      <Card
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        aria-label={`${font.name} - ${font.description}`}
        className={`cursor-pointer transition-all ${reducedMotion ? '' : 'duration-200'} hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none ${
          isSelected ? 'ring-2 ring-primary shadow-md' : 'hover:ring-1 hover:ring-muted-foreground'
        }`}
        onClick={() => handleFontChange(font.id)}
        onKeyDown={(e) => handleKeyDown(e, font.id)}
      >
        <CardContent className="p-4">
          {/* En-tête de la carte */}
          <div className="flex items-center justify-between mb-3">
            <h4 className={`font-semibold text-base ${font.cssClass}`} style={{ fontFamily: `var(${font.variable})` }}>
              {font.name}
            </h4>
            {isSelected && <Check className="h-4 w-4 text-primary" />}
          </div>
          
          {/* Description */}
          <p className={`text-sm text-muted-foreground mb-4 ${font.cssClass}`} 
             style={{ fontFamily: `var(${font.variable})` }}>
            {font.description}
          </p>
          
          {/* Badges d'information */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            <Badge variant={font.category === 'friendly' ? 'default' : 'secondary'} className="text-xs px-2 py-1">
              {font.category === 'modern' && '🚀 Moderne'}
              {font.category === 'friendly' && '😊 Amical'}
              {font.category === 'professional' && '💼 Pro'}
              {font.category === 'educational' && '📚 Éducatif'}
              {font.category === 'technical' && '⚡ Tech'}
            </Badge>
            
            <Badge variant="outline" className="text-xs px-2 py-1">
              {font.ageGroup === 'kids' && '👶 Enfants'}
              {font.ageGroup === 'teens' && '🧑‍🎓 Ados'}
              {font.ageGroup === 'adults' && '👨‍💼 Adultes'}
              {font.ageGroup === 'all' && '👥 Tous'}
            </Badge>
            
            {font.accessibility === 'high' && (
              <Badge variant="outline" className="text-xs px-2 py-1 text-green-600 border-green-200">
                ♿ Accessible
              </Badge>
            )}
          </div>
          
          {/* Exemple de titre et contenu avec la police */}
          <div className={`${font.cssClass}`} 
               style={{ fontFamily: `var(${font.variable})` }}>
            {/* Exemple de titre */}
            <h5 className="text-lg font-semibold mb-2 text-foreground">
              Titre d'exemple
            </h5>
            
            {/* Exemple de contenu */}
            <div className="space-y-2">
              <p className="text-sm text-foreground">
                Bonjour ! Hello! ¡Hola! 👋
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Les messages se traduisent automatiquement dans votre langue préférée. 
                Choisissez la police qui vous convient le mieux !
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center" role="status" aria-label="Chargement des polices">
            <div className={`${reducedMotion ? '' : 'animate-spin'} rounded-full h-8 w-8 border-b-2 border-primary`}></div>
            <span className="sr-only">Chargement...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            <CardTitle>Police d'affichage</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={resetToDefault}
            className="flex items-center gap-1"
          >
            <RotateCcw className="h-3 w-3" />
            Par défaut
          </Button>
        </div>
        <CardDescription>
          Choisissez la police qui s'affiche dans toute l'application. 
          Police actuelle : <span className="font-medium">{fontConfig?.name}</span>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Polices recommandées */}
        <div>
          <Label className="text-base font-medium mb-4 block">
            🌟 Polices recommandées
          </Label>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {recommendedFonts.map((font) => (
              <FontCard key={font.id} font={font} />
            ))}
          </div>
        </div>

        {/* Autres polices */}
        {otherFonts.length > 0 && (
          <div>
            <Label className="text-base font-medium mb-4 block">
              📝 Autres polices disponibles
            </Label>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {otherFonts.map((font) => (
                <FontCard key={font.id} font={font} />
              ))}
            </div>
          </div>
        )}

        {/* Info et conseils */}
        <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
          <div className="flex items-start gap-3">
            <div className="text-blue-600 text-lg">💡</div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-blue-900">
                Conseils pour choisir votre police
              </p>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• <strong>Accessible</strong> : Optimisées pour la lisibilité</li>
                <li>• <strong>Amical</strong> : Parfaites pour les jeunes utilisateurs</li>
                <li>• <strong>Moderne</strong> : Design contemporain et élégant</li>
                <li>• <strong>Pro</strong> : Idéales pour un usage professionnel</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
