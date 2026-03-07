import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import sharp from 'sharp';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('banner') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Aucun fichier fourni' },
        { status: 400 }
      );
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Format d\'image non supporté' },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'La taille de l\'image ne doit pas dépasser 5MB' },
        { status: 400 }
      );
    }

    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `banner_${timestamp}_${random}.jpg`;

    const folderPath = join(process.cwd(), 'public', 'u', 'b', year, month);
    const filePath = join(folderPath, filename);

    if (!existsSync(folderPath)) {
      await mkdir(folderPath, { recursive: true });
    }

    const bytes = await file.arrayBuffer();
    const processed = await sharp(Buffer.from(bytes))
      .resize(1200, 400, { fit: 'cover' })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();

    await writeFile(filePath, processed);

    const staticDomain = process.env.NEXT_PUBLIC_STATIC_URL || 'https://static.meeshy.me';
    const imageUrl = `${staticDomain}/u/b/${year}/${month}/${filename}`;

    return NextResponse.json({
      success: true,
      data: {
        url: imageUrl,
        filename,
        path: `/u/b/${year}/${month}/${filename}`
      }
    });

  } catch (error) {
    console.error('Erreur lors de l\'upload de la bannière:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
