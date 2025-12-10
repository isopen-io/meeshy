#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont
import requests
from io import BytesIO
import time
import sys

def hex_to_rgb(hex_color):
    """Convertit une couleur hexadécimale en tuple RGB"""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def create_gradient_image(width, height, color1, color2):
    """Crée une image avec un dégradé linéaire diagonal"""
    base = Image.new('RGB', (width, height), color1)
    top = Image.new('RGB', (width, height), color2)
    mask = Image.new('L', (width, height))
    mask_data = []
    for y in range(height):
        for x in range(width):
            distance = ((x / width) + (y / height)) / 2
            mask_data.append(int(255 * distance))
    mask.putdata(mask_data)
    base.paste(top, (0, 0), mask)
    return base

def draw_chat_bubble_icon(draw, x, y, size, opacity=255):
    """Dessine l'icône de bulle de dialogue blanche"""
    bubble_width = int(size * 0.8)
    bubble_height = int(size * 0.6)
    corner_radius = int(size * 0.1)
    stroke_width = max(2, int(size * 0.075))
    
    color = (255, 255, 255, opacity)
    
    bubble_x = x
    bubble_y = y
    
    draw.rounded_rectangle(
        [(bubble_x, bubble_y), (bubble_x + bubble_width, bubble_y + bubble_height)],
        radius=corner_radius,
        outline=color,
        width=stroke_width
    )
    
    triangle_start_x = bubble_x + int(bubble_width * 0.15)
    triangle_y = bubble_y + bubble_height
    triangle_height = int(size * 0.15)
    triangle_width = int(size * 0.125)
    
    triangle_points = [
        (triangle_start_x, triangle_y),
        (triangle_start_x, triangle_y + triangle_height),
        (triangle_start_x + triangle_width, triangle_y)
    ]
    draw.polygon(triangle_points, fill=color)

def get_emoji_codepoint(emoji_char):
    """Obtient le codepoint Unicode d'un emoji"""
    try:
        # Pour les emojis simples
        if len(emoji_char) == 1:
            return hex(ord(emoji_char))[2:]
        # Pour les emojis composés (comme les skin tones)
        elif len(emoji_char) == 2:
            # Prendre seulement le premier caractère
            return hex(ord(emoji_char[0]))[2:]
        else:
            return None
    except Exception as e:
        print(f"    Erreur codepoint: {e}")
        return None

def download_emoji(emoji_char, size=140):
    """Télécharge un emoji depuis Twemoji"""
    try:
        emoji_code = get_emoji_codepoint(emoji_char)
        if not emoji_code:
            return None
            
        url = f"https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/{emoji_code}.png"
        
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            emoji_img = Image.open(BytesIO(response.content))
            emoji_img = emoji_img.resize((size, size), Image.Resampling.LANCZOS)
            return emoji_img
        else:
            print(f"    ⚠️  Code HTTP {response.status_code} pour emoji {emoji_code}")
            return None
    except Exception as e:
        print(f"    ⚠️  Erreur téléchargement: {str(e)[:50]}")
        return None

def create_emoji_placeholder(size=140):
    """Crée un placeholder circulaire blanc si l'emoji ne peut pas être téléchargé"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    margin = 10
    draw.ellipse([margin, margin, size-margin, size-margin], fill=(255, 255, 255, 200))
    return img

def create_og_image(filename, emoji, title, subtitle, gradient_colors, icon_style="small"):
    """Crée une image OG complète"""
    try:
        width, height = 1200, 630
        
        # Créer le dégradé de fond
        color1 = hex_to_rgb(gradient_colors[0])
        color2 = hex_to_rgb(gradient_colors[1])
        img = create_gradient_image(width, height, color1, color2)
        
        # Créer un calque RGBA pour les logos
        overlay = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        draw_overlay = ImageDraw.Draw(overlay)
        
        # Dessiner les logos selon le style
        if icon_style == "small":
            draw_chat_bubble_icon(draw_overlay, 50, 40, 100, 255)
        elif icon_style == "large_bg":
            draw_chat_bubble_icon(draw_overlay, width - 450, height - 400, 400, 40)
            draw_chat_bubble_icon(draw_overlay, 50, 40, 100, 255)
        elif icon_style == "multiple":
            draw_chat_bubble_icon(draw_overlay, 50, 40, 100, 255)
            draw_chat_bubble_icon(draw_overlay, width - 200, 50, 150, 60)
            draw_chat_bubble_icon(draw_overlay, width - 350, height - 300, 250, 50)
        elif icon_style == "centered_large":
            icon_size = 500
            draw_chat_bubble_icon(draw_overlay, (width - icon_size) // 2, (height - int(icon_size * 0.6)) // 2 - 50, icon_size, 30)
            draw_chat_bubble_icon(draw_overlay, 50, 40, 100, 255)
        
        # Fusionner l'overlay
        img = img.convert('RGBA')
        img = Image.alpha_composite(img, overlay)
        
        # Télécharger et ajouter l'emoji
        emoji_img = download_emoji(emoji, 140)
        if emoji_img:
            emoji_x = (width - 140) // 2
            emoji_y = 170
            if emoji_img.mode != 'RGBA':
                emoji_img = emoji_img.convert('RGBA')
            img.paste(emoji_img, (emoji_x, emoji_y), emoji_img)
            print(f"    ✓ Emoji téléchargé")
        else:
            # Utiliser un placeholder
            placeholder = create_emoji_placeholder(140)
            emoji_x = (width - 140) // 2
            emoji_y = 170
            img.paste(placeholder, (emoji_x, emoji_y), placeholder)
            print(f"    ⚠️  Placeholder utilisé")
        
        img = img.convert('RGB')
        
        # Charger les polices
        try:
            font_title = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 56)
            font_subtitle = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 32)
        except:
            print(f"    ⚠️  Polices non trouvées, utilisation des polices par défaut")
            font_title = ImageFont.load_default()
            font_subtitle = ImageFont.load_default()
        
        draw = ImageDraw.Draw(img)
        
        # Dessiner le titre
        title_bbox = draw.textbbox((0, 0), title, font=font_title)
        title_width = title_bbox[2] - title_bbox[0]
        title_x = (width - title_width) // 2
        title_y = 360
        draw.text((title_x, title_y), title, font=font_title, fill='white')
        
        # Dessiner le sous-titre
        subtitle_bbox = draw.textbbox((0, 0), subtitle, font=font_subtitle)
        subtitle_width = subtitle_bbox[2] - subtitle_bbox[0]
        subtitle_x = (width - subtitle_width) // 2
        subtitle_y = 430
        draw.text((subtitle_x, subtitle_y), subtitle, font=font_subtitle, fill='white')
        
        return img
    except Exception as e:
        print(f"    ❌ Erreur création image: {str(e)[:100]}")
        import traceback
        traceback.print_exc()
        return None

# Définition de toutes les images
images_data = [
    {'filename': 'meeshy-og-signin', 'emoji': '📝', 'title': 'Inscription Meeshy', 'subtitle': 'Créez votre compte', 'gradient': ['#06B6D4', '#3B82F6'], 'style': 'small'},
    {'filename': 'meeshy-og-affiliate', 'emoji': '👋', 'title': 'Rejoignez Meeshy', 'subtitle': "Invitation d'un ami", 'gradient': ['#10B981', '#3B82F6'], 'style': 'large_bg'},
    {'filename': 'meeshy-og-default', 'emoji': '💬', 'title': 'Meeshy', 'subtitle': 'Messagerie Multilingue', 'gradient': ['#3B82F6', '#8B5CF6'], 'style': 'centered_large'},
    {'filename': 'meeshy-og-join', 'emoji': '🚀', 'title': 'Rejoignez Meeshy', 'subtitle': 'Connectez-vous avec le monde', 'gradient': ['#10B981', '#3B82F6'], 'style': 'multiple'},
    {'filename': 'meeshy-og-conversation', 'emoji': '💬', 'title': 'Conversations Meeshy', 'subtitle': 'Échangez sans barrières', 'gradient': ['#3B82F6', '#8B5CF6'], 'style': 'large_bg'},
    {'filename': 'meeshy-og-community', 'emoji': '👥', 'title': 'Communauté Meeshy', 'subtitle': 'Rejoignez notre communauté mondiale', 'gradient': ['#8B5CF6', '#EC4899'], 'style': 'multiple'},
    {'filename': 'meeshy-og-group', 'emoji': '👨', 'title': 'Groupes Meeshy', 'subtitle': 'Créez et gérez vos groupes', 'gradient': ['#06B6D4', '#10B981'], 'style': 'small'},
    {'filename': 'meeshy-og-exchange', 'emoji': '🔄', 'title': 'Échanges Meeshy', 'subtitle': 'Partagez et communiquez', 'gradient': ['#F59E0B', '#EF4444'], 'style': 'large_bg'},
    {'filename': 'meeshy-og-translation', 'emoji': '🌍', 'title': 'Traduction Meeshy', 'subtitle': 'Parlez toutes les langues', 'gradient': ['#10B981', '#06B6D4'], 'style': 'centered_large'},
    {'filename': 'meeshy-og-login', 'emoji': '🔐', 'title': 'Connexion Meeshy', 'subtitle': 'Accédez à votre compte', 'gradient': ['#3B82F6', '#06B6D4'], 'style': 'small'},
    {'filename': 'meeshy-og-message', 'emoji': '✉', 'title': 'Messages Meeshy', 'subtitle': 'Messagerie instantanée multilingue', 'gradient': ['#8B5CF6', '#3B82F6'], 'style': 'multiple'},
    {'filename': 'meeshy-og-welcome', 'emoji': '👋', 'title': 'Bienvenue sur Meeshy', 'subtitle': 'Votre messagerie sans frontières', 'gradient': ['#06B6D4', '#8B5CF6'], 'style': 'large_bg'},
    {'filename': 'meeshy-og-profile', 'emoji': '👤', 'title': 'Profil Meeshy', 'subtitle': 'Personnalisez votre expérience', 'gradient': ['#EC4899', '#8B5CF6'], 'style': 'small'},
    {'filename': 'meeshy-og-settings', 'emoji': '⚙', 'title': 'Paramètres Meeshy', 'subtitle': 'Configurez votre compte', 'gradient': ['#64748B', '#3B82F6'], 'style': 'multiple'},
    {'filename': 'meeshy-og-notification', 'emoji': '🔔', 'title': 'Notifications Meeshy', 'subtitle': 'Restez informé en temps réel', 'gradient': ['#EF4444', '#F59E0B'], 'style': 'centered_large'}
]

print("🎨 Création de toutes les images Meeshy OG (version robuste)...\n")

success_count = 0
for i, img_data in enumerate(images_data, 1):
    print(f"[{i}/{len(images_data)}] Création de {img_data['filename']}...")
    
    img = create_og_image(
        img_data['filename'],
        img_data['emoji'],
        img_data['title'],
        img_data['subtitle'],
        img_data['gradient'],
        img_data['style']
    )
    
    if img:
        try:
            base_path = f"./og-meeshy-images/{img_data['filename']}"
            img.save(f"{base_path}.png", 'PNG', quality=95)
            img.save(f"{base_path}.jpg", 'JPEG', quality=95)
            print(f"  ✅ {img_data['filename']}.png et .jpg créés\n")
            success_count += 1
        except Exception as e:
            print(f"  ❌ Erreur sauvegarde: {e}\n")
    else:
        print(f"  ❌ Échec création\n")
    
    # Petit délai pour ne pas surcharger le serveur
    time.sleep(0.5)

print(f"\n{'='*60}")
print(f"✅ {success_count}/{len(images_data)} images créées avec succès!")
print(f"📁 Formats: PNG (1200x630), JPG (1200x630)")
print(f"🎨 Emojis colorés depuis Twemoji (ou placeholders)")
print(f"💬 Cadre blanc de la bulle en différentes variations")