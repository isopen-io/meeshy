'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/use-i18n';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  onClose?: () => void;
  className?: string;
  maxHeight?: number;
}

/**
 * Composant EmojiPicker
 * 
 * Sélecteur d'emoji moderne et responsive avec:
 * - Emojis fréquents en haut pour accès rapide
 * - Catégories organisées
 * - Recherche par nom (optionnel)
 * - Animations fluides (Framer Motion)
 * - Design élégant avec Tailwind + shadcn/ui
 * - Performance optimisée (pas de bibliothèque externe lourde)
 */
export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  onEmojiSelect,
  onClose,
  className,
  maxHeight = 400
}) => {
  const { t } = useI18n('reactions');
  const { t: tCommon } = useI18n('common');
  const [activeCategory, setActiveCategory] = useState('frequent');
  const [searchQuery, setSearchQuery] = useState('');

  // Map emoji → keywords pour la recherche intelligente
  const EMOJI_KEYWORDS: Record<string, string[]> = useMemo(() => ({
    // Smileys
    '😀': ['smile', 'happy', 'sourire', 'heureux', 'content'],
    '😃': ['smile', 'happy', 'sourire', 'heureux', 'joyeux'],
    '😄': ['smile', 'laugh', 'sourire', 'rire', 'heureux'],
    '😁': ['grin', 'smile', 'sourire', 'grand', 'heureux'],
    '😆': ['laugh', 'haha', 'rire', 'mdr', 'hilarant'],
    '😅': ['sweat', 'relief', 'ouf', 'sueur', 'soulagé'],
    '😂': ['cry', 'laugh', 'lol', 'mdr', 'rire', 'pleurer', 'hilarant'],
    '🤣': ['rofl', 'laugh', 'mdr', 'mort', 'rire'],
    '😊': ['blush', 'happy', 'timide', 'sourire', 'heureux'],
    '😇': ['angel', 'innocent', 'ange', 'sage'],
    '🙂': ['smile', 'ok', 'sourire', 'bien'],
    '🙃': ['upside', 'silly', 'tête', 'bizarre'],
    '😉': ['wink', 'clin', 'oeil', 'complice'],
    '😌': ['relief', 'peace', 'paisible', 'calme', 'zen'],
    '😍': ['love', 'heart', 'eyes', 'amour', 'coeur', 'adore'],
    '🥰': ['love', 'hearts', 'amour', 'coeurs', 'mignon'],
    '😘': ['kiss', 'love', 'bisou', 'amour', 'baiser'],
    '😗': ['kiss', 'bisou', 'baiser'],
    '😙': ['kiss', 'bisou', 'baiser'],
    '😚': ['kiss', 'bisou', 'baiser'],
    '😋': ['yum', 'tongue', 'miam', 'langue', 'délicieux'],
    '😛': ['tongue', 'playful', 'langue', 'taquin'],
    '😝': ['tongue', 'crazy', 'langue', 'fou'],
    '😜': ['wink', 'tongue', 'clin', 'langue', 'taquin'],
    '🤪': ['crazy', 'wild', 'fou', 'dingue'],
    '🤨': ['skeptical', 'doubt', 'sceptique', 'doute'],
    '🧐': ['monocle', 'curious', 'curieux', 'investigation'],
    '🤓': ['nerd', 'geek', 'intelligent'],
    '😎': ['cool', 'sunglasses', 'lunettes', 'classe'],
    '🥸': ['disguise', 'déguisement', 'incognito'],
    '🤩': ['star', 'wow', 'étoile', 'impressionné'],
    '🥳': ['party', 'celebrate', 'fête', 'célébration'],
    
    // Gestures
    '👋': ['wave', 'hello', 'salut', 'bonjour', 'coucou'],
    '🤚': ['hand', 'stop', 'main', 'arrêt'],
    '🖐️': ['hand', 'five', 'main', 'cinq'],
    '✋': ['hand', 'stop', 'main', 'arrêt'],
    '🖖': ['vulcan', 'spock', 'star trek'],
    '👌': ['ok', 'perfect', 'parfait', 'bien'],
    '🤌': ['pinch', 'italian', 'italien', 'geste'],
    '🤏': ['pinch', 'small', 'petit', 'pincé'],
    '✌️': ['peace', 'victory', 'paix', 'victoire'],
    '🤞': ['fingers', 'crossed', 'chance', 'doigts', 'croisés'],
    '🤟': ['love', 'sign', 'amour', 'signe'],
    '🤘': ['rock', 'metal', 'musique'],
    '🤙': ['call', 'shaka', 'appel', 'téléphone'],
    '👈': ['left', 'point', 'gauche', 'pointer'],
    '👉': ['right', 'point', 'droite', 'pointer'],
    '👆': ['up', 'point', 'haut', 'pointer'],
    '🖕': ['middle', 'finger', 'majeur', 'doigt'],
    '👇': ['down', 'point', 'bas', 'pointer'],
    '☝️': ['up', 'one', 'haut', 'un', 'premier'],
    '👍': ['thumbs', 'up', 'pouce', 'ok', 'bien', 'like', 'approve', 'approuve'],
    '👎': ['thumbs', 'down', 'pouce', 'pas', 'bien', 'dislike'],
    '✊': ['fist', 'power', 'poing', 'force'],
    '👊': ['fist', 'bump', 'poing', 'tape'],
    '🤛': ['fist', 'left', 'poing', 'gauche'],
    '🤜': ['fist', 'right', 'poing', 'droit'],
    '👏': ['clap', 'applause', 'applaudir', 'bravo'],
    '🙌': ['hands', 'celebrate', 'mains', 'célébrer', 'youpi'],
    '👐': ['hands', 'open', 'mains', 'ouvertes'],
    '🤲': ['hands', 'prayer', 'mains', 'prière'],
    '🤝': ['handshake', 'deal', 'poignée', 'accord'],
    '🙏': ['pray', 'thanks', 'prière', 'merci', 'thank'],
    '✍️': ['write', 'écrire', 'writing'],
    
    // Emotions/Love
    '❤️': ['love', 'heart', 'red', 'amour', 'coeur', 'rouge'],
    '🧡': ['orange', 'heart', 'coeur'],
    '💛': ['yellow', 'heart', 'jaune', 'coeur'],
    '💚': ['green', 'heart', 'vert', 'coeur'],
    '💙': ['blue', 'heart', 'bleu', 'coeur'],
    '💜': ['purple', 'heart', 'violet', 'coeur'],
    '🖤': ['black', 'heart', 'noir', 'coeur'],
    '🤍': ['white', 'heart', 'blanc', 'coeur'],
    '🤎': ['brown', 'heart', 'marron', 'coeur'],
    '💔': ['broken', 'heart', 'brisé', 'coeur', 'rupture'],
    '❤️‍🔥': ['fire', 'heart', 'feu', 'coeur', 'passion'],
    '❤️‍🩹': ['healing', 'heart', 'guérison', 'coeur'],
    '💕': ['hearts', 'love', 'coeurs', 'amour'],
    '💞': ['hearts', 'revolving', 'coeurs', 'tournant'],
    '💓': ['beating', 'heart', 'coeur', 'battement'],
    '💗': ['growing', 'heart', 'coeur', 'grandit'],
    '💖': ['sparkling', 'heart', 'coeur', 'brillant'],
    '💘': ['arrow', 'heart', 'flèche', 'coeur', 'cupidon'],
    '💝': ['gift', 'heart', 'cadeau', 'coeur'],
    '💟': ['heart', 'decoration', 'coeur', 'décoration'],
    
    // Celebration
    '🎉': ['party', 'celebration', 'fête', 'célébration', 'confetti'],
    '🎊': ['confetti', 'party', 'fête'],
    '🎈': ['balloon', 'ballon', 'fête'],
    '🎂': ['cake', 'birthday', 'gâteau', 'anniversaire'],
    '🎁': ['gift', 'present', 'cadeau'],
    '🎀': ['ribbon', 'bow', 'ruban', 'noeud'],
    '🏆': ['trophy', 'win', 'trophée', 'victoire', 'champion'],
    '🥇': ['gold', 'medal', 'or', 'médaille', 'first', 'premier'],
    '🥈': ['silver', 'medal', 'argent', 'médaille', 'second'],
    '🥉': ['bronze', 'medal', 'médaille', 'third', 'troisième'],
    '⭐': ['star', 'étoile', 'favori'],
    '🌟': ['star', 'sparkle', 'étoile', 'brillant'],
    '✨': ['sparkles', 'étincelles', 'brillant', 'magic', 'magie'],
    '💫': ['dizzy', 'star', 'étoile', 'tournis'],
    '🔥': ['fire', 'hot', 'feu', 'chaud', 'top', 'excellent'],
    '💥': ['boom', 'explosion', 'bang'],
    '💢': ['anger', 'colère', 'angry'],
    '💨': ['dash', 'fast', 'rapide', 'vent'],
    '💦': ['sweat', 'drops', 'sueur', 'gouttes'],
    '💤': ['sleep', 'zzz', 'dormir', 'sommeil'],
    
    // Nature
    '🌸': ['flower', 'blossom', 'fleur', 'cerisier'],
    '🌺': ['hibiscus', 'flower', 'fleur'],
    '🌻': ['sunflower', 'flower', 'tournesol', 'fleur'],
    '🌷': ['tulip', 'flower', 'tulipe', 'fleur'],
    '🌹': ['rose', 'flower', 'fleur', 'love', 'amour'],
    '🥀': ['wilted', 'flower', 'fanée', 'fleur'],
    '💐': ['bouquet', 'flowers', 'fleurs'],
    '🌿': ['herb', 'leaf', 'herbe', 'feuille'],
    '☘️': ['shamrock', 'clover', 'trèfle', 'chance'],
    '🍀': ['clover', 'luck', 'trèfle', 'chance'],
    '🍁': ['maple', 'leaf', 'érable', 'feuille', 'autumn', 'automne'],
    '🍂': ['fallen', 'leaf', 'feuille', 'tombée', 'autumn', 'automne'],
    '🍃': ['leaf', 'wind', 'feuille', 'vent'],
    '🌳': ['tree', 'arbre'],
    '🌲': ['evergreen', 'tree', 'sapin', 'arbre'],
    '🌱': ['seedling', 'plant', 'pousse', 'plante'],
    '🌴': ['palm', 'tree', 'palmier', 'arbre'],
    '🌵': ['cactus', 'desert', 'désert'],
    
    // Objects/Sports
    '⚽': ['soccer', 'ball', 'football', 'ballon'],
    '🏀': ['basketball', 'ball', 'basket', 'ballon'],
    '🏈': ['football', 'american', 'américain', 'ballon'],
    '⚾': ['baseball', 'ball', 'ballon'],
    '🎾': ['tennis', 'ball', 'ballon'],
    '🏐': ['volleyball', 'volley', 'ball', 'ballon'],
    
    // Symbols
    '✅': ['check', 'yes', 'ok', 'oui', 'valide', 'correct'],
    '❌': ['cross', 'no', 'non', 'cancel', 'annuler', 'error', 'erreur'],
    '⭕': ['circle', 'o', 'rond', 'cercle'],
    '❗': ['exclamation', 'important', 'attention'],
    '❓': ['question', 'help', 'aide'],
    '🔴': ['red', 'circle', 'rouge', 'rond'],
    '🟠': ['orange', 'circle', 'rond'],
    '🟡': ['yellow', 'circle', 'jaune', 'rond'],
    '🟢': ['green', 'circle', 'vert', 'rond'],
    '🔵': ['blue', 'circle', 'bleu', 'rond'],
    '🟣': ['purple', 'circle', 'violet', 'rond'],
  }), []);

  // Catégories traduites
  const EMOJI_CATEGORIES = useMemo(() => [
    {
      id: 'frequent',
      label: t('picker.categories.frequent'),
      icon: '⏱️',
      emojis: ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '⭐']
    },
    {
      id: 'smileys',
      label: t('picker.categories.smileys'),
      icon: '😀',
      emojis: [
        '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
        '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰',
        '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜',
        '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳'
      ]
    },
    {
      id: 'gestures',
      label: t('picker.categories.gestures'),
      icon: '👋',
      emojis: [
        '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏',
        '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆',
        '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛',
        '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️'
      ]
    },
    {
      id: 'emotions',
      label: t('picker.categories.emotions'),
      icon: '❤️',
      emojis: [
        '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
        '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗',
        '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️'
      ]
    },
    {
      id: 'celebration',
      label: t('picker.categories.celebration'),
      icon: '🎉',
      emojis: [
        '🎉', '🎊', '🎈', '🎂', '🎁', '🎀', '🎗️', '🏆',
        '🥇', '🥈', '🥉', '⭐', '🌟', '✨', '💫', '🔥',
        '💥', '💢', '💨', '💦', '💤', '🕳️', '🎵', '🎶'
      ]
    },
    {
      id: 'nature',
      label: t('picker.categories.nature'),
      icon: '🌸',
      emojis: [
        '🌸', '🌺', '🌻', '🌷', '🌹', '🥀', '🏵️', '💐',
        '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃', '🌳',
        '🌲', '🌱', '🌴', '🌵', '🎋', '🎍', '🌾', '🌿'
      ]
    },
    {
      id: 'objects',
      label: t('picker.categories.objects'),
      icon: '⚽',
      emojis: [
        '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉',
        '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍',
        '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿'
      ]
    },
    {
      id: 'symbols',
      label: t('picker.categories.symbols'),
      icon: '✅',
      emojis: [
        '✅', '❌', '⭕', '❗', '❓', '❕', '❔', '‼️',
        '⁉️', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟤',
        '⚫', '⚪', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪'
      ]
    }
  ], [t]);

  // Filtrer les emojis selon la recherche intelligente
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return EMOJI_CATEGORIES;
    }

    const query = searchQuery.toLowerCase().trim();
    
    return EMOJI_CATEGORIES.map(category => ({
      ...category,
      emojis: category.emojis.filter(emoji => {
        // Vérifier si l'emoji a des keywords et si un keyword match la recherche
        const keywords = EMOJI_KEYWORDS[emoji];
        if (keywords) {
          return keywords.some(keyword => keyword.toLowerCase().includes(query));
        }
        // Fallback: si pas de keywords, pas de match
        return false;
      })
    })).filter(category => category.emojis.length > 0);
  }, [searchQuery, EMOJI_CATEGORIES, EMOJI_KEYWORDS]);

  const handleEmojiClick = (emoji: string) => {
    onEmojiSelect(emoji);
    // Enregistrer dans les fréquents (localStorage)
    try {
      const frequent = JSON.parse(localStorage.getItem('meeshy-frequent-emojis') || '[]');
      const updated = [emoji, ...frequent.filter((e: string) => e !== emoji)].slice(0, 8);
      localStorage.setItem('meeshy-frequent-emojis', JSON.stringify(updated));
    } catch (error) {
      console.error('Erreur sauvegarde emojis fréquents:', error);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'bg-popover text-popover-foreground',
        'rounded-lg border shadow-lg',
        'overflow-hidden',
        // Largeur responsive : réduite sur mobile pour rester visible
        'w-full max-w-[min(320px,calc(100vw-24px))]',
        className
      )}
      style={{ 
        maxHeight,
        maxWidth: 'min(320px, calc(100vw - 24px))'
      }}
    >
      {/* Header avec recherche et close */}
      <div className="p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              type="text"
              placeholder={t('picker.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-8 h-9 text-sm"
              aria-label={t('picker.search')}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={t('picker.clearSearch', 'Effacer la recherche')}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-secondary rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={tCommon('common.close')}
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Catégories tabs */}
        {!searchQuery && (
          <div className="flex items-center gap-1 mt-2 overflow-x-auto scrollbar-hide" role="tablist" aria-label={t('picker.categories.label', 'Catégories d\'emojis')}>
            {EMOJI_CATEGORIES.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                role="tab"
                aria-selected={activeCategory === category.id}
                aria-controls={`emoji-panel-${category.id}`}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium',
                  'transition-colors duration-200 flex-shrink-0',
                  'hover:bg-secondary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  activeCategory === category.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/50 text-muted-foreground'
                )}
              >
                <span className="mr-1.5" aria-hidden="true">{category.icon}</span>
                {category.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid d'emojis */}
      <ScrollArea className="h-full" style={{ maxHeight: maxHeight - 120 }}>
        <div className="p-3">
          {searchQuery ? (
            // Mode recherche: afficher toutes les catégories qui matchent
            filteredCategories.length > 0 ? (
              filteredCategories.map((category) => (
                <div key={category.id} className="mb-4 last:mb-0">
                  <h3 className="text-xs font-semibold text-muted-foreground mb-2 px-1">
                    {category.icon} {category.label}
                  </h3>
                  <div className="grid grid-cols-8 gap-1" role="grid">
                    {category.emojis.map((emoji, index) => (
                      <motion.button
                        key={`${category.id}-${emoji}-${index}`}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ scale: 1.2 }}
                        whileTap={{ scale: 0.9 }}
                        transition={{ duration: 0.1 }}
                        onClick={() => handleEmojiClick(emoji)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleEmojiClick(emoji);
                          }
                        }}
                        aria-label={`Sélectionner ${emoji}`}
                        className={cn(
                          'w-9 h-9 flex items-center justify-center',
                          'rounded-md text-xl',
                          'hover:bg-secondary transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
                        )}
                      >
                        {emoji}
                      </motion.button>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {t('picker.noResults', { query: searchQuery })}
              </div>
            )
          ) : (
            // Mode catégorie: afficher uniquement la catégorie active
            <AnimatePresence mode="wait">
              {filteredCategories
                .filter(cat => cat.id === activeCategory)
                .map((category) => (
                  <motion.div
                    key={category.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="grid grid-cols-8 gap-1" role="tabpanel" id={`emoji-panel-${category.id}`}>
                      {category.emojis.map((emoji, index) => (
                        <motion.button
                          key={`${category.id}-${emoji}-${index}`}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          whileHover={{ scale: 1.2 }}
                          whileTap={{ scale: 0.9 }}
                          transition={{
                            opacity: { delay: index * 0.01 },
                            scale: { duration: 0.1 }
                          }}
                          onClick={() => handleEmojiClick(emoji)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleEmojiClick(emoji);
                            }
                          }}
                          aria-label={`Sélectionner ${emoji}`}
                          className={cn(
                            'w-9 h-9 flex items-center justify-center',
                            'rounded-md text-xl',
                            'hover:bg-secondary transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
                          )}
                        >
                          {emoji}
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
    </motion.div>
  );
};

export default EmojiPicker;
