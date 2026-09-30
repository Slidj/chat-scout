export const getTierClasses = (tier?: string) => {
  switch (tier) {
    case 'legendary':
      return 'bg-gradient-to-r from-amber-200 dark:from-amber-900/60 to-white dark:to-[#1C2128] border-amber-300 dark:border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]';
    case 'epic':
      return 'bg-gradient-to-r from-red-200 dark:from-red-900/60 to-white dark:to-[#1C2128] border-red-300 dark:border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]';
    case 'rare':
      return 'bg-gradient-to-r from-purple-200 dark:from-purple-900/60 to-white dark:to-[#1C2128] border-purple-300 dark:border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]';
    case 'uncommon':
      return 'bg-gradient-to-r from-blue-200 dark:from-blue-900/60 to-white dark:to-[#1C2128] border-blue-300 dark:border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]';
    case 'common':
    default:
      return 'bg-white dark:bg-[#1C2128] border-gray-200 dark:border-gray-800 shadow-sm hover:border-gray-300 dark:hover:border-gray-600';
  }
};

export const getTierTextColor = (tier?: string) => {
  switch (tier) {
    case 'legendary': return 'text-amber-900 dark:text-amber-100';
    case 'epic': return 'text-red-900 dark:text-red-100';
    case 'rare': return 'text-purple-900 dark:text-purple-100';
    case 'uncommon': return 'text-blue-900 dark:text-blue-100';
    case 'common':
    default: return 'text-gray-900 dark:text-white';
  }
};

export const getTierSubtextColor = (tier?: string) => {
  switch (tier) {
    case 'legendary': return 'text-amber-700 dark:text-amber-200/70';
    case 'epic': return 'text-red-700 dark:text-red-200/70';
    case 'rare': return 'text-purple-700 dark:text-purple-200/70';
    case 'uncommon': return 'text-blue-700 dark:text-blue-200/70';
    case 'common':
    default: return 'text-gray-500 dark:text-gray-400';
  }
};

// Comprehensive Tailwind color map so any bg-{color}-{shade} resolves to true hex
const TAILWIND_COLOR_MAP: Record<string, string> = {
  // AI Brand Colors
  'openai': '#10A37F',
  'anthropic': '#D97757',
  'google': '#1A73E8',
  'deepseek': '#0EA5E9',
  'meta': '#0081FB',
  'mistral': '#FF7000',
  'grok': '#18181B',

  // Slate
  'slate-400': '#94A3B8', 'slate-500': '#64748B', 'slate-600': '#475569', 'slate-700': '#334155', 'slate-800': '#1E293B', 'slate-900': '#0F172A',
  // Gray
  'gray-400': '#9CA3AF', 'gray-500': '#6B7280', 'gray-600': '#4B5563', 'gray-700': '#374151', 'gray-800': '#1F2937', 'gray-900': '#111827',
  // Zinc
  'zinc-400': '#A1A1AA', 'zinc-500': '#71717A', 'zinc-600': '#52525B', 'zinc-700': '#3F3F46', 'zinc-800': '#27272A', 'zinc-900': '#18181B', 'zinc-950': '#09090B',
  // Neutral
  'neutral-500': '#737373', 'neutral-600': '#525252', 'neutral-700': '#404040', 'neutral-800': '#262626', 'neutral-900': '#171717',
  // Red
  'red-400': '#F87171', 'red-500': '#EF4444', 'red-600': '#DC2626', 'red-700': '#B91C1C', 'red-800': '#991B1B', 'red-900': '#7F1D1D',
  // Orange
  'orange-400': '#FB923C', 'orange-500': '#F97316', 'orange-600': '#EA580C', 'orange-700': '#C2410C', 'orange-800': '#9A3412',
  // Amber
  'amber-400': '#FBBF24', 'amber-500': '#F59E0B', 'amber-600': '#D97706', 'amber-700': '#B45309', 'amber-800': '#92400E',
  // Yellow
  'yellow-400': '#FACC15', 'yellow-500': '#EAB308', 'yellow-600': '#CA8A04', 'yellow-700': '#A16207',
  // Lime
  'lime-400': '#A3E635', 'lime-500': '#84CC16', 'lime-600': '#65A30D',
  // Green
  'green-400': '#4ADE80', 'green-500': '#22C55E', 'green-600': '#16A34A', 'green-700': '#15803D', 'green-800': '#166534',
  // Emerald
  'emerald-400': '#34D399', 'emerald-500': '#10B981', 'emerald-600': '#059669', 'emerald-700': '#047857', 'emerald-800': '#065F46',
  // Teal
  'teal-400': '#2DD4BF', 'teal-500': '#14B8A6', 'teal-600': '#0D9488', 'teal-700': '#0F766E',
  // Cyan
  'cyan-400': '#22D3EE', 'cyan-500': '#06B6D4', 'cyan-600': '#0891B2', 'cyan-700': '#0E7490',
  // Sky
  'sky-400': '#38BDF8', 'sky-500': '#0EA5E9', 'sky-600': '#0284C7', 'sky-700': '#0369A1',
  // Blue
  'blue-400': '#60A5FA', 'blue-500': '#3B82F6', 'blue-600': '#2563EB', 'blue-700': '#1D4ED8', 'blue-800': '#1E40AF',
  // Indigo
  'indigo-400': '#818CF8', 'indigo-500': '#6366F1', 'indigo-600': '#4F46E5', 'indigo-700': '#4338CA', 'indigo-800': '#3730A3',
  // Violet
  'violet-400': '#A78BFA', 'violet-500': '#8B5CF6', 'violet-600': '#7C3AED', 'violet-700': '#6D28D9',
  // Purple
  'purple-400': '#C084FC', 'purple-500': '#A855F7', 'purple-600': '#9333EA', 'purple-700': '#7E22CE', 'purple-800': '#6B21A8',
  // Fuchsia
  'fuchsia-400': '#E879F9', 'fuchsia-500': '#D946EF', 'fuchsia-600': '#C026D3', 'fuchsia-700': '#A21CAF',
  // Pink
  'pink-400': '#F472B6', 'pink-500': '#EC4899', 'pink-600': '#DB2777', 'pink-700': '#BE185D',
  // Rose
  'rose-400': '#FB7185', 'rose-500': '#F43F5E', 'rose-600': '#E11D48', 'rose-700': '#BE123C',
  // Black & White
  'black': '#000000',
  'white': '#FFFFFF',
};

/**
 * Resolves any color string (hex #123456, plain hex, rgb, or tailwind class like bg-blue-500 or bg-emerald-600)
 * into a valid CSS hex or color string that works 100% reliably in inline styles.
 */
export const resolveColorToHex = (rawColor?: string): string => {
  if (!rawColor || typeof rawColor !== 'string') return '#2563EB';
  const trimmed = rawColor.trim();
  if (!trimmed) return '#2563EB';

  // Already a hex color with #
  if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(trimmed)) {
    return trimmed;
  }

  // Hex color without #
  if (/^([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(trimmed)) {
    return `#${trimmed}`;
  }

  // rgb/rgba or hsl/hsla
  if (/^(rgb|rgba|hsl|hsla)\(/.test(trimmed)) {
    return trimmed;
  }

  // Strip 'bg-' prefix if present
  let cleanName = trimmed;
  if (cleanName.startsWith('bg-')) {
    cleanName = cleanName.slice(3);
  }

  // Direct lookup in tailwind map
  if (TAILWIND_COLOR_MAP[cleanName]) {
    return TAILWIND_COLOR_MAP[cleanName];
  }

  // Also check if user typed just color name like "blue" or "red" without shade (default to 600)
  if (TAILWIND_COLOR_MAP[`${cleanName}-600`]) {
    return TAILWIND_COLOR_MAP[`${cleanName}-600`];
  }
  if (TAILWIND_COLOR_MAP[`${cleanName}-500`]) {
    return TAILWIND_COLOR_MAP[`${cleanName}-500`];
  }

  return '#2563EB';
};

export interface ColorPreset {
  name: string;
  hex: string;
  tailwindClass: string;
  category: 'brands' | 'vibrant' | 'neutral';
}

export const COLOR_PRESETS: ColorPreset[] = [
  // AI Brands
  { name: 'OpenAI', hex: '#10A37F', tailwindClass: 'bg-emerald-600', category: 'brands' },
  { name: 'Anthropic', hex: '#D97757', tailwindClass: 'bg-orange-600', category: 'brands' },
  { name: 'Google', hex: '#1A73E8', tailwindClass: 'bg-blue-600', category: 'brands' },
  { name: 'DeepSeek', hex: '#0EA5E9', tailwindClass: 'bg-sky-500', category: 'brands' },
  { name: 'Mistral', hex: '#FF7000', tailwindClass: 'bg-orange-500', category: 'brands' },
  { name: 'Meta AI', hex: '#0081FB', tailwindClass: 'bg-blue-500', category: 'brands' },
  { name: 'xAI / Grok', hex: '#18181B', tailwindClass: 'bg-zinc-900', category: 'brands' },

  // Vibrant Rainbow
  { name: 'Синій 600', hex: '#2563EB', tailwindClass: 'bg-blue-600', category: 'vibrant' },
  { name: 'Синій 500', hex: '#3B82F6', tailwindClass: 'bg-blue-500', category: 'vibrant' },
  { name: 'Індиго 600', hex: '#4F46E5', tailwindClass: 'bg-indigo-600', category: 'vibrant' },
  { name: 'Фіолетовий 600', hex: '#9333EA', tailwindClass: 'bg-purple-600', category: 'vibrant' },
  { name: 'Віолет 600', hex: '#7C3AED', tailwindClass: 'bg-violet-600', category: 'vibrant' },
  { name: 'Фуксія 600', hex: '#C026D3', tailwindClass: 'bg-fuchsia-600', category: 'vibrant' },
  { name: 'Рожевий 600', hex: '#DB2777', tailwindClass: 'bg-pink-600', category: 'vibrant' },
  { name: 'Трояндовий 600', hex: '#E11D48', tailwindClass: 'bg-rose-600', category: 'vibrant' },
  { name: 'Червоний 600', hex: '#DC2626', tailwindClass: 'bg-red-600', category: 'vibrant' },
  { name: 'Червоний 500', hex: '#EF4444', tailwindClass: 'bg-red-500', category: 'vibrant' },
  { name: 'Помаранчевий 600', hex: '#EA580C', tailwindClass: 'bg-orange-600', category: 'vibrant' },
  { name: 'Бурштиновий 500', hex: '#F59E0B', tailwindClass: 'bg-amber-500', category: 'vibrant' },
  { name: 'Смарагдовий 600', hex: '#059669', tailwindClass: 'bg-emerald-600', category: 'vibrant' },
  { name: 'Зелений 600', hex: '#16A34A', tailwindClass: 'bg-green-600', category: 'vibrant' },
  { name: 'Бірюзовий 600', hex: '#0D9488', tailwindClass: 'bg-teal-600', category: 'vibrant' },
  { name: 'Морський 600', hex: '#0891B2', tailwindClass: 'bg-cyan-600', category: 'vibrant' },

  // Neutrals
  { name: 'Графіт 600', hex: '#475569', tailwindClass: 'bg-slate-600', category: 'neutral' },
  { name: 'Сірий 700', hex: '#374151', tailwindClass: 'bg-gray-700', category: 'neutral' },
  { name: 'Темний Цинк', hex: '#27272A', tailwindClass: 'bg-zinc-800', category: 'neutral' },
  { name: 'Чорний', hex: '#09090B', tailwindClass: 'bg-black', category: 'neutral' },
];

/**
 * Resizes and compresses an uploaded image file into a compact base64 data URL
 * so it fits cleanly into Firestore without bloat (~10-25KB).
 */
export const resizeImageFile = (file: File, maxDim = 256): Promise<string> => {
  return new Promise((resolve, reject) => {
    // If it's an SVG, read directly as data URL to keep vector precision
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        // Draw image cleanly with smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Check format: prefer WebP/PNG with transparency support
        try {
          const dataUrl = canvas.toDataURL('image/png');
          resolve(dataUrl);
        } catch {
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        }
      };
      img.onerror = () => reject(new Error('Не вдалося завантажити зображення'));
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
