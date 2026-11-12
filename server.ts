import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function resolveMediaUrl(rawUrl: string): Promise<{
  success: boolean;
  mediaUrl?: string;
  mediaType?: 'video' | 'gif' | 'image';
  title?: string;
  posterUrl?: string;
  error?: string;
}> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { success: false, error: 'URL не вказано' };
  }

  let cleanUrl = rawUrl.trim();

  // If already a direct media link
  const lower = cleanUrl.toLowerCase().split('?')[0];
  if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') || lower.endsWith('.m4v')) {
    return { success: true, mediaUrl: cleanUrl, mediaType: 'video' };
  }
  if (lower.endsWith('.gif')) {
    return { success: true, mediaUrl: cleanUrl, mediaType: 'gif' };
  }
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) {
    return { success: true, mediaUrl: cleanUrl, mediaType: 'image' };
  }

  try {
    const res = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,uk;q=0.8',
      },
      redirect: 'follow',
    });

    const finalUrl = res.url || cleanUrl;
    const contentType = res.headers.get('content-type') || '';

    // Direct stream returned
    if (contentType.includes('video/')) {
      return { success: true, mediaUrl: finalUrl, mediaType: 'video' };
    }
    if (contentType.includes('image/gif')) {
      return { success: true, mediaUrl: finalUrl, mediaType: 'gif' };
    }
    if (contentType.includes('image/')) {
      return { success: true, mediaUrl: finalUrl, mediaType: 'image' };
    }

    const html = await res.text();

    // 1. Pinterest parsing
    const isPinterest = finalUrl.includes('pinterest.com') || cleanUrl.includes('pin.it') || html.includes('pinimg.com');
    if (isPinterest) {
      // Find all MP4 candidates
      const mp4Regex = /https?:\/\/[a-zA-Z0-9.\-_/]+(?:\.pinimg\.com\/videos\/[a-zA-Z0-9.\-_/]+|\.mp4)/g;
      const matches = Array.from(new Set(html.match(mp4Regex) || []));

      // Filter for valid video files
      const validVideos = matches.filter(url => url.includes('.mp4'));

      if (validVideos.length > 0) {
        // Preference ranking:
        // 1. Standard H.264 (expMp4 or 720p or h264) - highest browser compatibility
        // 2. High quality (_t4 > _t3 > _t2 > _t1)
        // 3. Fallback to any valid mp4
        const expMp4 = validVideos.find(u => u.includes('expMp4') && u.includes('_t4.mp4'))
          || validVideos.find(u => u.includes('expMp4'))
          || validVideos.find(u => u.includes('720p'))
          || validVideos.find(u => !u.includes('hevc'))
          || validVideos[0];

        // Find poster/thumbnail
        const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/i) 
          || html.match(/content="([^"]+)"\s+property="og:image"/i)
          || html.match(/name="twitter:image"\s+content="([^"]+)"/i);

        return {
          success: true,
          mediaUrl: expMp4,
          mediaType: 'video',
          posterUrl: ogImage ? ogImage[1] : undefined,
          title: 'Pinterest Відео'
        };
      }
    }

    // 2. OpenGraph / Twitter video tags
    const ogVideoMatch = html.match(/property="og:video(?::secure_url)?"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+property="og:video(?::secure_url)?"/i)
      || html.match(/name="twitter:player:stream"\s+content="([^"]+)"/i);

    if (ogVideoMatch && ogVideoMatch[1]) {
      const vid = ogVideoMatch[1];
      return {
        success: true,
        mediaUrl: vid,
        mediaType: vid.endsWith('.gif') ? 'gif' : 'video'
      };
    }

    // 3. Look for standard <video ... src="..."> or <source src="...">
    const videoTagMatch = html.match(/<(?:video|source)[^>]+src=["'](https?:\/\/[^"']+\.(?:mp4|webm|mov))["']/i);
    if (videoTagMatch && videoTagMatch[1]) {
      return {
        success: true,
        mediaUrl: videoTagMatch[1],
        mediaType: 'video'
      };
    }

    // 4. Any direct .mp4 in the page source
    const generalMp4 = html.match(/https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/i);
    if (generalMp4 && generalMp4[0]) {
      return {
        success: true,
        mediaUrl: generalMp4[0].replace(/\\u002F/g, '/'),
        mediaType: 'video'
      };
    }

    // 5. Check if it's a static image page (og:image)
    const ogImageMatch = html.match(/property="og:image"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+property="og:image"/i);
    if (ogImageMatch && ogImageMatch[1]) {
      return {
        success: true,
        mediaUrl: ogImageMatch[1],
        mediaType: 'image'
      };
    }

    return {
      success: false,
      error: 'Не вдалося автоматично знайти відео-потік на цій сторінці. Переконайтеся, що це публічний Pin або скопіюйте пряме посилання.'
    };
  } catch (err: any) {
    return {
      success: false,
      error: 'Помилка підключення до посилання: ' + (err.message || 'Мережева помилка')
    };
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // Resolver API Endpoint
  app.get('/api/resolve-media', async (req: Request, res: Response) => {
    const targetUrl = (req.query.url as string) || '';
    if (!targetUrl) {
      res.status(400).json({ success: false, error: 'Параметр url обов’язковий' });
      return;
    }
    const result = await resolveMediaUrl(targetUrl);
    res.json(result);
  });

  app.post('/api/resolve-media', async (req: Request, res: Response) => {
    const targetUrl = req.body?.url || '';
    if (!targetUrl) {
      res.status(400).json({ success: false, error: 'Поле url обов’язкове' });
      return;
    }
    const result = await resolveMediaUrl(targetUrl);
    res.json(result);
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  startServer();
}
