/**
 * Composant de prévisualisation des polices
 * Affiche comment le texte apparaît avec différentes polices
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FontFamily, getFontConfig } from '@/lib/fonts';

interface FontPreviewProps {
  fontFamily: FontFamily;
  className?: string;
  showInfo?: boolean;
}

const previewTexts = {
  fr: "Bonjour ! Comment ça va ? 😊",
  en: "Hello! How are you doing? 😊",
  es: "¡Hola! ¿Cómo estás? 😊",
  ar: "مرحبا! كيف حالك؟ 😊",
  zh: "你好！你好吗？😊",
  emoji: "🌍📱💬🎉🚀"
};

export function FontPreview({ fontFamily, className, showInfo = false }: FontPreviewProps) {
  const fontConfig = getFontConfig(fontFamily);
  
  if (!fontConfig) {
    return null;
  }

  return (
    <Card className={className}>
      {showInfo && (
        <CardHeader className="pb-2">
          <CardTitle className={`text-lg ${fontConfig.cssClass}`}>
            {fontConfig.name}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {fontConfig.description}
          </p>
        </CardHeader>
      )}
      
      <CardContent className={`space-y-3 ${showInfo ? 'pt-2' : 'pt-6'}`}>
        {/* Texte principal */}
        <div className={`text-lg ${fontConfig.cssClass}`} 
             style={{ fontFamily: `var(${fontConfig.variable})` }}>
          {previewTexts.fr}
        </div>

        {/* Textes multilingues */}
        <div className="space-y-2 text-sm">
          <div className={`${fontConfig.cssClass}`} 
               style={{ fontFamily: `var(${fontConfig.variable})` }}>
            🇬🇧 {previewTexts.en}
          </div>
          <div className={`${fontConfig.cssClass}`} 
               style={{ fontFamily: `var(${fontConfig.variable})` }}>
            🇪🇸 {previewTexts.es}
          </div>
          <div className={`${fontConfig.cssClass}`} 
               style={{ fontFamily: `var(${fontConfig.variable})` }}>
            🇸🇦 {previewTexts.ar}
          </div>
          <div className={`${fontConfig.cssClass}`} 
               style={{ fontFamily: `var(${fontConfig.variable})` }}>
            🇨🇳 {previewTexts.zh}
          </div>
        </div>

        {/* Emojis et caractères spéciaux */}
        <div className={`text-lg ${fontConfig.cssClass}`} 
             style={{ fontFamily: `var(${fontConfig.variable})` }}>
          {previewTexts.emoji}
        </div>

        {/* Différentes tailles */}
        <div className="space-y-1">
          <div className={`text-xs ${fontConfig.cssClass}`} 
               style={{ fontFamily: `var(${fontConfig.variable})` }}>
            Texte très petit (12px)
          </div>
          <div className={`text-sm ${fontConfig.cssClass}`} 
               style={{ fontFamily: `var(${fontConfig.variable})` }}>
            Texte petit (14px)
          </div>
          <div className={`text-base ${fontConfig.cssClass}`} 
               style={{ fontFamily: `var(${fontConfig.variable})` }}>
            Texte normal (16px)
          </div>
          <div className={`text-lg ${fontConfig.cssClass}`} 
               style={{ fontFamily: `var(${fontConfig.variable})` }}>
            Texte large (18px)
          </div>
        </div>

        {/* Différents poids si disponibles */}
        <div className="space-y-1">
          <div className={`text-sm font-light ${fontConfig.cssClass}`} 
               style={{ fontFamily: `var(${fontConfig.variable})` }}>
            Texte léger - Message reçu
          </div>
          <div className={`text-sm font-normal ${fontConfig.cssClass}`} 
               style={{ fontFamily: `var(${fontConfig.variable})` }}>
            Texte normal - Message standard
          </div>
          <div className={`text-sm font-medium ${fontConfig.cssClass}`} 
               style={{ fontFamily: `var(${fontConfig.variable})` }}>
            Texte moyen - Nom d'utilisateur
          </div>
          <div className={`text-sm font-semibold ${fontConfig.cssClass}`} 
               style={{ fontFamily: `var(${fontConfig.variable})` }}>
            Texte semi-gras - Titre de conversation
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface FontComparisonProps {
  fonts: FontFamily[];
  className?: string;
}

export function FontComparison({ fonts, className }: FontComparisonProps) {
  return (
    <div className={`grid gap-4 ${className}`}>
      {fonts.map((font) => (
        <FontPreview 
          key={font} 
          fontFamily={font} 
          showInfo={true}
        />
      ))}
    </div>
  );
}
