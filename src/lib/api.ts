import { MediaAttachment, ModelMediaType } from '../types';
import { createTinyImageThumbnail, saveTempMediaBlob } from './mediaCache';

const BASE_URLS = [
  'https://scout-ai.pp.ua/v1'
];

export const DEFAULT_SEARCH_URL = 'https://search-engine-el09.onrender.com/search';

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  searchQueries?: string[];
  readUrls?: string[];
  mediaItems?: MediaAttachment[];
}

export interface Model {
  id: string;
  name: string;
  modelType?: ModelMediaType;
  supportedEndpoints?: string[];
}

export interface ChatRequestOptions {
  systemPrompt?: string;
  webSearchEnabled?: boolean;
  webReaderEnabled?: boolean;
  searchUrl?: string;
  onStatusChange?: (status: string | null) => void;
  onSearchQueries?: (queries: string[]) => void;
  onReadUrls?: (urls: string[]) => void;
}

export const WEB_SEARCH_TOOL = {
  type: 'function' as const,
  function: {
    name: 'web_search',
    description: 'Пошук актуальної інформації в інтернеті у форматі JSON. Використовуй цей інструмент для пошуку новин, свіжих даних, курсів валют, погоди та будь-яких фактів в інтернеті.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Пошуковий запит (рядок пошуку)'
        }
      },
      required: ['query']
    }
  }
};

export const READ_WEBPAGE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'read_webpage',
    description: 'Читає та повертає повний текстовий вміст веб-сторінки за вказаним URL-посиланням. Обов’язково використовуй цей інструмент, коли користувач просить прочитати новину/статтю, переказати деталі чи розділ із сайту або дає URL (після web_search відкривай найкраще посилання з results через read_webpage).',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Повна адреса веб-сторінки (наприклад, https://example.com/article)'
        }
      },
      required: ['url']
    }
  }
};

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

function createFetchSignal(timeoutMs: number, externalSignal?: AbortSignal): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Час очікування запиту вичерпано')), timeoutMs);

  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  };
}

function getCurrentDateTimeContext() {
  const now = new Date();
  let kyivDateTime = now.toISOString();
  try {
    kyivDateTime = new Intl.DateTimeFormat('uk-UA', {
      timeZone: 'Europe/Kyiv',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(now);
  } catch {}
  return {
    kyivDateTime,
    isoDate: now.toISOString().split('T')[0],
    year: now.getFullYear()
  };
}

function isCurrencyRelatedQuery(query: string): boolean {
  return /(курс|валют|нбу|долар|євро|злотий|злотих|фунт|гривн|usd|eur|pln|gbp|uah|chf|czk|jpy|nbu|exchange|rate)/i.test(query);
}

async function fetchLiveNbuRates(externalSignal?: AbortSignal): Promise<{
  exchangeDate?: string;
  rates: Array<{ code: string; name: string; rate: number }>;
} | null> {
  const { signal, cleanup } = createFetchSignal(6000, externalSignal);
  try {
    const res = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json', {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const priorityCodes = new Set(['USD', 'EUR', 'PLN', 'GBP', 'CHF', 'CZK', 'CAD', 'TRY', 'JPY']);
    const filtered = data
      .filter((item: any) => priorityCodes.has(String(item.cc || '').toUpperCase()))
      .map((item: any) => ({
        code: String(item.cc),
        name: String(item.txt || item.cc),
        rate: Number(item.rate)
      }));

    return {
      exchangeDate: data[0]?.exchangedate,
      rates: filtered.length > 0 ? filtered : data.slice(0, 10).map((item: any) => ({
        code: String(item.cc),
        name: String(item.txt || item.cc),
        rate: Number(item.rate)
      }))
    };
  } catch {
    return null;
  } finally {
    cleanup();
  }
}

async function fetchTargetSearchJson(targetUrl: string, externalSignal?: AbortSignal): Promise<any> {
  // 1. Direct browser fetch (succeeds if the search service sends CORS headers)
  {
    const { signal, cleanup } = createFetchSignal(8000, externalSignal);
    try {
      const res = await fetch(targetUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal
      });
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (res.ok && contentType.includes('application/json')) {
        return await res.json();
      }
      if (res.ok) {
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch {}
      }
    } catch (err: any) {
      if (externalSignal?.aborted) throw err;
    } finally {
      cleanup();
    }
  }

  // 2. Local Node/Vite backend proxy (/api/web-search) when hosted on a server
  {
    const { signal, cleanup } = createFetchSignal(22000, externalSignal);
    try {
      const proxyRes = await fetch(`/api/web-search?url=${encodeURIComponent(targetUrl)}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal
      });
      const contentType = (proxyRes.headers.get('content-type') || '').toLowerCase();
      // Ignore static hosting HTML 404/SPA fallback responses (e.g. GitHub Pages)
      if (proxyRes.ok && contentType.includes('application/json')) {
        const parsed = await proxyRes.json();
        if (parsed && !parsed.error) {
          return parsed;
        }
      }
    } catch (err: any) {
      if (externalSignal?.aborted) throw err;
    } finally {
      cleanup();
    }
  }

  // 3. CORS-enabled Jina Reader proxy (works on static hosts like GitHub Pages in Telegram Mini App)
  {
    const { signal, cleanup } = createFetchSignal(22000, externalSignal);
    try {
      const jinaRes = await fetch(`https://r.jina.ai/${targetUrl}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal
      });
      if (jinaRes.ok) {
        const wrapped = await jinaRes.json();
        const innerContent = wrapped?.data?.content;
        if (typeof innerContent === 'string' && innerContent.trim()) {
          try {
            return JSON.parse(innerContent);
          } catch {
            return { rawContent: innerContent.slice(0, 8000) };
          }
        }
      }
    } catch (err: any) {
      if (externalSignal?.aborted) throw err;
    } finally {
      cleanup();
    }
  }

  // 4. Emergency CORS-enabled fallback (DuckDuckGo HTML via Jina + Wikipedia) if custom search endpoint is down
  {
    const urlObj = new URL(targetUrl);
    const q = urlObj.searchParams.get('q') || '';
    if (q) {
      const { signal, cleanup } = createFetchSignal(12000, externalSignal);
      try {
        const ddgRes = await fetch(`https://r.jina.ai/https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal
        });
        if (ddgRes.ok) {
          const wrapped = await ddgRes.json();
          if (typeof wrapped?.data?.content === 'string' && wrapped.data.content.trim()) {
            return { fallbackSource: 'duckduckgo', rawContent: wrapped.data.content.slice(0, 8000) };
          }
        }
      } catch (err: any) {
        if (externalSignal?.aborted) throw err;
      } finally {
        cleanup();
      }
    }
  }

  throw new Error('Пошуковий сервіс тимчасово недоступний');
}

/**
 * Executes a web search request against the configured search service URL in JSON format.
 * Supports direct fetch, /api/web-search backend proxy, and CORS-enabled static-host proxy fallback,
 * plus live official NBU exchange rate enrichment for currency queries.
 */
export async function executeWebSearch(
  searchUrl: string,
  query: string,
  signal?: AbortSignal,
  includeReaderHint?: boolean
): Promise<string> {
  const cleanBase = (searchUrl || DEFAULT_SEARCH_URL).trim();
  const separator = cleanBase.includes('?') ? '&' : '?';
  const targetUrl = `${cleanBase}${separator}q=${encodeURIComponent(query)}&format=json`;
  const { kyivDateTime, isoDate } = getCurrentDateTimeContext();

  const shouldEnrichNbu = isCurrencyRelatedQuery(query);
  const nbuPromise = shouldEnrichNbu ? fetchLiveNbuRates(signal) : Promise.resolve(null);

  let rawData: any = null;
  let searchError: string | null = null;

  try {
    rawData = await fetchTargetSearchJson(targetUrl, signal);
  } catch (err: any) {
    if (err?.name === 'AbortError' && signal?.aborted) {
      throw err;
    }
    searchError = err?.message || 'мережева помилка';
  }

  const nbuData = await nbuPromise;

  // Format search JSON concisely for optimal LLM context consumption
  try {
    if (rawData && Array.isArray(rawData.results)) {
      const mappedResults = rawData.results.slice(0, 10).map((item: any) => ({
        title: String(item.title || '').slice(0, 160),
        url: item.url || item.link || '',
        content: String(item.content || item.snippet || item.description || '').slice(0, 360),
        ...(item.publishedDate ? { publishedDate: item.publishedDate } : {})
      }));
      const isLowPriorityUrl = (u: string) =>
        /(youtube\.com|youtu\.be|instagram\.com|facebook\.com|tiktok\.com|twitter\.com|x\.com|\/video\/|\/reel\/)/i.test(u);
      const sortedResults = includeReaderHint
        ? [
            ...mappedResults.filter((r: any) => r.url && !isLowPriorityUrl(r.url)),
            ...mappedResults.filter((r: any) => !r.url || isLowPriorityUrl(r.url))
          ]
        : mappedResults;
      const compactResults = sortedResults.slice(0, 6);
      return JSON.stringify({
        query,
        currentDateTime: kyivDateTime,
        isoDate,
        ...(Array.isArray(rawData.answers) && rawData.answers.length > 0 ? { answers: rawData.answers.slice(0, 3) } : {}),
        ...(Array.isArray(rawData.infoboxes) && rawData.infoboxes.length > 0 ? { infoboxes: rawData.infoboxes.slice(0, 2) } : {}),
        ...(nbuData ? { officialNbuRates: nbuData } : {}),
        ...(includeReaderHint && compactResults.length > 0
          ? {
              note: 'Поля content містять лише короткі фрагменти. Щоб прочитати повний текст новини чи статті — виклич read_webpage(url) для текстової статті з results (оминай соцмережі, YouTube та /video/ сторінки; якщо сайт поверне помилку 403/404 — спробуй інше посилання або зроби точніший пошук без зайвих років).'
            }
          : {}),
        results: compactResults
      });
    }

    if (rawData && typeof rawData === 'object') {
      return JSON.stringify({
        query,
        currentDateTime: kyivDateTime,
        isoDate,
        ...(nbuData ? { officialNbuRates: nbuData } : {}),
        ...rawData
      }).slice(0, 12000);
    }

    if (nbuData) {
      return JSON.stringify({
        query,
        currentDateTime: kyivDateTime,
        isoDate,
        officialNbuRates: nbuData,
        results: []
      });
    }

    return JSON.stringify({
      error: `Не вдалося виконати пошук: ${searchError || 'порожня відповідь'}`,
      query,
      currentDateTime: kyivDateTime,
      isoDate
    });
  } catch {
    return JSON.stringify({
      query,
      currentDateTime: kyivDateTime,
      isoDate,
      ...(nbuData ? { officialNbuRates: nbuData } : {}),
      results: []
    });
  }
}

async function fetchWithFallback(path: string, options: RequestInit) {
  let lastError = null;
  for (const baseUrl of BASE_URLS) {
    try {
      const response = await fetch(`${baseUrl}${path}`, options);
      if (response.status === 401) {
        throw new Error("Невірний API ключ (помилка 401). Перевірте налаштування.");
      }
      if (response.status === 402) {
        throw new Error("Недостатньо коштів на балансі (помилка 402). Поповніть рахунок.");
      }
      if (!response.ok) {
        throw new Error(`HTTP помилка ${response.status} від ${baseUrl}`);
      }
      return await response.json();
    } catch (error: any) {
      console.warn(`Запит не вдався для ${baseUrl}:`, error);
      lastError = error;
      if (error.message && (error.message.includes("401") || error.message.includes("402"))) {
        throw error;
      }
    }
  }
  throw lastError || new Error("Сервер API тимчасово недоступний");
}

/**
 * Infers whether a New API model is for text chat, image generation, or video generation.
 * Respects explicit admin overrides first, then New API `supported_endpoint_types`, then model ID patterns.
 */
export function inferModelMediaType(
  modelId: string,
  explicitType?: ModelMediaType,
  supportedEndpoints?: string[]
): ModelMediaType {
  if (explicitType === 'image' || explicitType === 'video' || explicitType === 'text') {
    return explicitType;
  }

  const endpoints = Array.isArray(supportedEndpoints)
    ? supportedEndpoints.map((e) => String(e).toLowerCase())
    : [];

  if (endpoints.length > 0) {
    const hasVideoEndpoint = endpoints.some((e) =>
      /(video|openai-video|kling|jimeng|vidu|sora|veo|runway|luma|minimax-video)/.test(e)
    );
    const hasImageEndpoint = endpoints.some((e) =>
      /(image-generation|images|dall-e|midjourney|mj|flux)/.test(e)
    );
    const hasChatEndpoint = endpoints.some((e) =>
      e === 'openai' || e === 'openai-response' || e === 'anthropic' || e === 'gemini'
    );

    if (hasVideoEndpoint && !hasChatEndpoint) return 'video';
    if (hasImageEndpoint && !hasChatEndpoint) return 'image';
  }

  const id = (modelId || '').toLowerCase();
  if (
    /(sora|veo|kling|runway|gen-?[34]|luma|dream-?machine|pika|hailuo|minimax-?video|wanx?|seedance|vidu|jimeng|cogvideo|hunyuan-?video|grok-?(?:imagine-)?video)/i.test(
      id
    )
  ) {
    return 'video';
  }
  if (
    /(dall-?e|gpt-image|gpt-4o-image|imagen|flux|sdxl|sd3|stable-diffusion|midjourney|mj-|ideogram|recraft|seedream|kolors|qwen-?image|grok-?2-?image|grok-?imagine|nano-?banana|gemini-[^/]*-image)/i.test(
      id
    )
  ) {
    return 'image';
  }

  return 'text';
}

export async function fetchModels(apiKey: string): Promise<Model[]> {
  try {
    const data = await fetchWithFallback('/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (data && data.data) {
      return data.data.map((m: any) => {
        const endpoints = Array.isArray(m.supported_endpoint_types)
          ? m.supported_endpoint_types.map(String)
          : undefined;
        return {
          id: m.id,
          name: m.id,
          supportedEndpoints: endpoints,
          modelType: inferModelMediaType(m.id, undefined, endpoints)
        };
      });
    }
    return [];
  } catch (error) {
    console.error("Помилка завантаження моделей:", error);
    throw error;
  }
}

export const SCOUT_QUOTA_PER_UNIT = 500000;
export const SCOUT_UAH_EXCHANGE_RATE = 44.37;

export interface ApiBalanceInfo {
  remainingUsd: number | null;
  remainingUah: number | null;
  usedUsd?: number;
  usedUah?: number;
  source: 'user_quota' | 'subscription' | 'token_quota' | 'usage_only';
  updatedAt: number;
}

/**
 * Fetches live remaining balance for the user's personal API key from scout-ai.pp.ua (New API).
 * Note: New API /api/usage/token/ returns raw internal quota units (500,000 = $1 USD).
 * When a token has unlimited_quota enabled, that only disables the per-key cap ("fuse")
 * so requests draw directly from the user's real account balance (d.user_quota.total_available).
 * We always extract the actual numeric balance and never report "unlimited".
 */
export async function fetchApiBalance(apiKey: string): Promise<ApiBalanceInfo | null> {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) return null;

  const baseRoot = BASE_URLS[0].replace(/\/v1\/?$/, '');
  const authHeaders = {
    'Authorization': `Bearer ${cleanKey}`,
    'Accept': 'application/json'
  };

  const quotaToUsd = (quota: number) => Math.max(0, quota / SCOUT_QUOTA_PER_UNIT);
  const usdToUah = (usd: number) => Math.max(0, usd * SCOUT_UAH_EXCHANGE_RATE);

  // Helper for OpenAI-compatible /v1/dashboard/billing/subscription + /usage
  // Note: New API returns `hard_limit_usd = 100000000` sentinel when DisplayTokenStatEnabled=true & token.UnlimitedQuota=true.
  const fetchOpenAiStyleBilling = async (): Promise<{
    remainingUsd: number | null;
    usedUsd: number;
  } | null> => {
    const subRes = await fetch(`${baseRoot}/v1/dashboard/billing/subscription`, {
      method: 'GET',
      headers: authHeaders
    });
    if (subRes.status === 401) {
      throw new Error('Невірний API ключ');
    }
    if (!subRes.ok) return null;

    const subData = await subRes.json();
    if (subData?.error) return null;

    const hardLimit = Number(subData?.hard_limit_usd ?? subData?.system_hard_limit_usd);
    if (!Number.isFinite(hardLimit)) return null;

    const end = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    let usedUsd = 0;
    try {
      const usageRes = await fetch(
        `${baseRoot}/v1/dashboard/billing/usage?start_date=${fmt(start)}&end_date=${fmt(end)}`,
        { method: 'GET', headers: authHeaders }
      );
      if (usageRes.ok) {
        const usageData = await usageRes.json();
        const totalCents = Number(usageData?.total_usage);
        if (Number.isFinite(totalCents)) {
          usedUsd = Math.max(0, totalCents / 100);
        }
      }
    } catch {}

    // 100000000 is New API's hardcoded sentinel when token.UnlimitedQuota hides real balance on subscription endpoint
    if (hardLimit >= 10000000) {
      return {
        remainingUsd: null,
        usedUsd
      };
    }

    return {
      remainingUsd: Math.max(0, hardLimit - usedUsd),
      usedUsd
    };
  };

  // 1. Primary: New API /api/usage/token/ (CORS-enabled, TokenAuthReadOnly)
  try {
    const res = await fetch(`${baseRoot}/api/usage/token/`, {
      method: 'GET',
      headers: authHeaders
    });
    if (res.status === 401) {
      throw new Error('Невірний API ключ');
    }
    if (res.ok) {
      const json = await res.json();
      const d = json?.data ?? json;

      const userAvailRaw = Number(d?.user_quota?.total_available);
      const userUsedRaw = Number(d?.user_quota?.total_used);
      const tokenAvailRaw = Number(d?.total_available);
      const tokenUsedRaw = Number(d?.total_used ?? 0);
      const isUnlimitedFlag = Boolean(d?.unlimited_quota);

      const usedUsd = Number.isFinite(userUsedRaw)
        ? quotaToUsd(userUsedRaw)
        : (Number.isFinite(tokenUsedRaw) ? quotaToUsd(tokenUsedRaw) : 0);

      // Prefer user_quota.total_available — this is the real account balance even when token has unlimited_quota=true
      if (d?.user_quota && Number.isFinite(userAvailRaw)) {
        const remainingUsd = quotaToUsd(userAvailRaw);
        return {
          remainingUsd,
          remainingUah: usdToUah(remainingUsd),
          usedUsd,
          usedUah: usdToUah(usedUsd),
          source: 'user_quota',
          updatedAt: Date.now()
        };
      }

      // If token lacks user_quota (AllowUserQuotaQuery disabled), try subscription endpoint
      const subBilling = await fetchOpenAiStyleBilling().catch(() => null);
      if (subBilling && subBilling.remainingUsd !== null) {
        const remainingUsd = subBilling.remainingUsd;
        const effectiveUsed = subBilling.usedUsd > 0 ? subBilling.usedUsd : usedUsd;
        return {
          remainingUsd,
          remainingUah: usdToUah(remainingUsd),
          usedUsd: effectiveUsed,
          usedUah: usdToUah(effectiveUsed),
          source: 'subscription',
          updatedAt: Date.now()
        };
      }

      // If key has a finite token cap and user_quota wasn't exposed
      if (!isUnlimitedFlag && Number.isFinite(tokenAvailRaw)) {
        const remainingUsd = quotaToUsd(tokenAvailRaw);
        return {
          remainingUsd,
          remainingUah: usdToUah(remainingUsd),
          usedUsd,
          usedUah: usdToUah(usedUsd),
          source: 'token_quota',
          updatedAt: Date.now()
        };
      }

      // Key is unlimited AND server withheld user_quota from this token: show real spent amount instead of "Unlimited"
      const finalUsed = subBilling ? Math.max(usedUsd, subBilling.usedUsd) : usedUsd;
      return {
        remainingUsd: null,
        remainingUah: null,
        usedUsd: finalUsed,
        usedUah: usdToUah(finalUsed),
        source: 'usage_only',
        updatedAt: Date.now()
      };
    }
  } catch (err: any) {
    if (err?.message?.includes('Невірний API ключ')) {
      throw err;
    }
  }

  // 2. Fallback: OpenAI-compatible billing endpoints
  try {
    const subBilling = await fetchOpenAiStyleBilling();
    if (!subBilling) return null;
    if (subBilling.remainingUsd !== null) {
      return {
        remainingUsd: subBilling.remainingUsd,
        remainingUah: usdToUah(subBilling.remainingUsd),
        usedUsd: subBilling.usedUsd,
        usedUah: usdToUah(subBilling.usedUsd),
        source: 'subscription',
        updatedAt: Date.now()
      };
    }
    return {
      remainingUsd: null,
      remainingUah: null,
      usedUsd: subBilling.usedUsd,
      usedUah: usdToUah(subBilling.usedUsd),
      source: 'usage_only',
      updatedAt: Date.now()
    };
  } catch (err: any) {
    if (err?.message?.includes('Невірний API ключ')) {
      throw err;
    }
    return null;
  }
}

/**
 * Sanitizes conversation history for strict LLM providers (Google AI Studio, Claude, OpenAI).
 * - Strips error messages so failed requests don't poison subsequent prompts
 * - Removes empty messages
 * - Enforces strict alternation (merges consecutive user or assistant messages)
 * - Limits context length to avoid token overflow
 */
export function sanitizeConversationHistory(history: Message[], currentPrompt: string) {
  const sanitized: { role: 'user' | 'assistant'; content: string }[] = [];

  for (const msg of history) {
    const text = (msg.text || '').trim();
    // Exclude empty messages and error messages
    if (!text || text.startsWith('Помилка:') || text.startsWith('Error:') || text.includes('Provider returned error')) {
      continue;
    }

    const role = msg.role === 'model' ? 'assistant' : 'user';

    // Merge consecutive messages of the same role
    if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === role) {
      sanitized[sanitized.length - 1].content += '\n\n' + text;
    } else {
      sanitized.push({ role, content: text });
    }
  }

  const cleanPrompt = currentPrompt.trim();
  if (cleanPrompt) {
    if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === 'user') {
      sanitized[sanitized.length - 1].content += '\n\n' + cleanPrompt;
    } else {
      sanitized.push({ role: 'user', content: cleanPrompt });
    }
  }

  // Ensure history starts with user message
  while (sanitized.length > 0 && sanitized[0].role !== 'user') {
    sanitized.shift();
  }

  // Keep last 14 turns
  const trimmed = sanitized.slice(-14);
  if (trimmed.length > 0 && trimmed[0].role !== 'user') {
    trimmed.shift();
  }

  return trimmed;
}

const MAX_WEBPAGE_CHARS = 9500;

function normalizeTargetUrl(rawUrl: string): string | null {
  const trimmed = (rawUrl || '').trim().replace(/^["'<]+|["'>]+$/g, '');
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Fetches clean readable text/markdown of any web page via Jina Reader API (https://r.jina.ai/<url>),
 * truncates to MAX_WEBPAGE_CHARS to stay within model context limits, and returns friendly errors on blocks.
 */
export async function executeReadWebpage(
  rawUrl: string,
  signal?: AbortSignal
): Promise<string> {
  const normalizedUrl = normalizeTargetUrl(rawUrl);
  if (!normalizedUrl) {
    return 'Помилка: не вдалося завантажити вміст сторінки (некоректне або порожнє URL-посилання).';
  }

  const jinaEndpoint = `https://r.jina.ai/${normalizedUrl}`;
  const { signal: fetchSignal, cleanup } = createFetchSignal(22000, signal);

  try {
    const res = await fetch(jinaEndpoint, {
      method: 'GET',
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'markdown'
      },
      signal: fetchSignal
    });

    if (!res.ok) {
      const errDetail = await res.text().catch(() => '');
      return `Помилка: не вдалося завантажити вміст сторінки (HTTP ${res.status}${errDetail ? `: ${errDetail.slice(0, 140)}` : ''}).`;
    }

    const rawText = (await res.text()).trim();
    if (!rawText) {
      return 'Помилка: не вдалося завантажити вміст сторінки (сервіс повернув порожню відповідь).';
    }

    const targetErrorMatch = rawText.match(/Warning:\s*Target URL returned error\s+(\d{3})[^\n]*/i);
    if (targetErrorMatch) {
      return `Помилка: не вдалося прочитати сторінку ${normalizedUrl} (сайт повернув ${targetErrorMatch[1]} або обмежив доступ). Спробуй інше посилання з результатів пошуку або знайди іншу статтю.`;
    }

    const headSample = rawText.slice(0, 600);
    if (
      rawText.length < 1800 &&
      /(Title:\s*(Access Denied|404|Page Not Found)|#\s*Access Denied|The page you are looking for can['’]?t be found|404\s+Not\s+Found)/i.test(headSample)
    ) {
      return `Помилка: сторінка ${normalizedUrl} недоступна (403 Access Denied або 404 Not Found). Спробуй відкрити інше посилання з результатів пошуку.`;
    }

    const header = `Джерело: ${normalizedUrl}\n\n`;
    const remainingLimit = Math.max(2000, MAX_WEBPAGE_CHARS - header.length);
    if (rawText.length > remainingLimit) {
      return `${header}${rawText.slice(0, remainingLimit)}\n\n[...Текст сторінки скорочено до ${MAX_WEBPAGE_CHARS} символів для економії контексту...]`;
    }

    return `${header}${rawText}`;
  } catch (err: any) {
    if (signal?.aborted) {
      throw err;
    }
    const reason = err?.message || 'мережева помилка або сайт заблокував доступ';
    return `Помилка: не вдалося завантажити вміст сторінки (${reason}).`;
  } finally {
    cleanup();
  }
}

function buildInitialApiMessages(
  history: Message[],
  prompt: string,
  options?: ChatRequestOptions
): any[] {
  const conversation = sanitizeConversationHistory(history, prompt);
  const messages: any[] = [];
  const systemParts: string[] = [];

  if (options?.systemPrompt && options.systemPrompt.trim()) {
    systemParts.push(options.systemPrompt.trim());
  }

  if (options?.webSearchEnabled || options?.webReaderEnabled || (options?.systemPrompt && options.systemPrompt.trim())) {
    const { kyivDateTime, isoDate, year } = getCurrentDateTimeContext();
    let contextBlock = `[Системний контекст актуальності]\nПоточна дата та час (Київ): ${kyivDateTime} (ISO: ${isoDate}).`;
    if (options?.webSearchEnabled && options?.webReaderEnabled) {
      contextBlock +=
        `\nУ тебе активні два інструменти: \`web_search\` (пошук посилань і коротких сніпетів) та \`read_webpage\` (читання повного тексту сторінки за URL).` +
        `\n- Якщо користувач запитує сьогоднішню дату або час — відповідай за вказаною вище датою (${kyivDateTime}).` +
        `\n- Для пошуку фактів, новин, курсів валют чи подій викликай \`web_search\` (формулюй чіткий запит без переліку кількох років на кшталт "2024 2025 2026" — за потреби вказуй лише ${year}).` +
        `\n- ВАЖЛИВО: \`web_search\` повертає лише короткі уривки (1–2 речення). Якщо користувач просить прочитати новину/статтю/розділ або переказати деталі — НЕ роби повторний \`web_search\` зі словами "details", а виклич \`read_webpage(url)\` для текстової статті з \`results\` (оминай YouTube, Instagram, Facebook та посилання з \`/video/\`).` +
        `\n- Якщо \`read_webpage\` повернув помилку 403/404, спробуй інше посилання з \`results\` або уточни запит у \`web_search\`, щоб знайти відкриту статтю; якщо жодну сторінку прочитати не вдалося, чесно скажи про це і не вигадуй текст.`;
    } else if (options?.webSearchEnabled) {
      contextBlock +=
        `\nУ тебе активний інструмент веб-пошуку \`web_search\`.` +
        `\n- Якщо користувач запитує сьогоднішню дату, день тижня або поточний час — відповідай точно за вказаною вище датою (${kyivDateTime}).` +
        `\n- Для актуальних фактів, новин, курсів валют, погоди чи подій викликай \`web_search\` (за потреби додавай у пошуковий запит ${year} рік).` +
        `\n- Отримавши відповідь \`web_search\`, спирайся на її реальні дані (\`results\`, \`answers\`, \`officialNbuRates\`, \`currentDateTime\`) і наводь конкретні цифри та факти.`;
    } else if (options?.webReaderEnabled) {
      contextBlock +=
        `\nУ тебе активний інструмент читання веб-сторінок \`read_webpage\`.` +
        `\n- Викликай \`read_webpage(url)\`, коли користувач надає посилання або просить прочитати чи переказати вміст веб-сторінки.` +
        `\n- Якщо \`read_webpage\` повернув повідомлення про помилку, чесно повідом користувача, що сторінку не вдалося прочитати, і не вигадуй її вміст.`;
    }
    systemParts.push(contextBlock);
  }

  if (systemParts.length > 0) {
    messages.push({
      role: 'system',
      content: systemParts.join('\n\n')
    });
  }

  return [...messages, ...conversation];
}

function mergeStreamToolCalls(toolCallsMap: Map<number, OpenAIToolCall>, deltaToolCalls: any[]) {
  for (const tc of deltaToolCalls) {
    let targetIdx: number = typeof tc.index === 'number' ? tc.index : 0;

    if (tc.id) {
      // Check if an entry with this exact id already exists
      let matchedById: number | null = null;
      for (const [k, v] of toolCallsMap.entries()) {
        if (v.id === tc.id) {
          matchedById = k;
          break;
        }
      }
      if (matchedById !== null) {
        targetIdx = matchedById;
      } else if (toolCallsMap.has(targetIdx)) {
        const existingAtIdx = toolCallsMap.get(targetIdx)!;
        if (existingAtIdx.function.name && existingAtIdx.id !== tc.id) {
          // Provider reused index 0 for a new tool call — allocate a fresh slot
          targetIdx = Math.max(-1, ...Array.from(toolCallsMap.keys())) + 1;
        }
      }
    }

    const existing = toolCallsMap.get(targetIdx) || {
      id: tc.id || `call_${Date.now()}_${targetIdx}`,
      type: 'function',
      function: { name: '', arguments: '' }
    };
    if (tc.id) existing.id = tc.id;
    if (tc.function?.name) {
      if (!existing.function.name) {
        existing.function.name = tc.function.name;
      } else if (
        existing.function.name !== tc.function.name &&
        !existing.function.name.endsWith(tc.function.name)
      ) {
        existing.function.name += tc.function.name;
      }
    }
    if (tc.function?.arguments !== undefined) {
      const argChunk = typeof tc.function.arguments === 'string'
        ? tc.function.arguments
        : JSON.stringify(tc.function.arguments);
      existing.function.arguments += argChunk;
    }
    toolCallsMap.set(targetIdx, existing);
  }
}

function parseToolQuery(rawArgs: string): string {
  try {
    const parsed = JSON.parse(rawArgs || '{}');
    if (typeof parsed.query === 'string') return parsed.query;
    if (typeof parsed.q === 'string') return parsed.q;
    if (typeof parsed.search_query === 'string') return parsed.search_query;
    return String(Object.values(parsed)[0] || '');
  } catch {
    const match = (rawArgs || '').match(/"(?:query|q|search_query)"\s*:\s*"([^"]+)"/);
    if (match?.[1]) return match[1];
    return (rawArgs || '').trim();
  }
}

function parseToolUrl(rawArgs: string): string {
  try {
    const parsed = JSON.parse(rawArgs || '{}');
    if (typeof parsed.url === 'string') return parsed.url;
    if (typeof parsed.link === 'string') return parsed.link;
    if (typeof parsed.href === 'string') return parsed.href;
    if (typeof parsed.page_url === 'string') return parsed.page_url;
    return String(Object.values(parsed)[0] || '');
  } catch {
    const match = (rawArgs || '').match(/"(?:url|link|href|page_url)"\s*:\s*"([^"]+)"/);
    if (match?.[1]) return match[1];
    return (rawArgs || '').trim();
  }
}

function getEnabledTools(options?: ChatRequestOptions): any[] {
  const tools: any[] = [];
  if (options?.webSearchEnabled) tools.push(WEB_SEARCH_TOOL);
  if (options?.webReaderEnabled) tools.push(READ_WEBPAGE_TOOL);
  return tools;
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException('Запит скасовано', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason || new DOMException('Запит скасовано', 'AbortError'));
    };
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function isRateLimitError(rawError: any, statusCode?: number): boolean {
  if (statusCode === 429) return true;
  const str = typeof rawError === 'string' ? rawError : JSON.stringify(rawError || '');
  return /(rate-?limit|429|too many requests|resource_exhausted|quota)/i.test(str);
}

/**
 * Transforms cryptic JSON/upstream rate-limit errors into clear Ukrainian messages
 */
export function formatApiError(rawError: any, statusCode?: number): string {
  if (!rawError && !statusCode) return 'Невідома помилка підключення до моделі';
  
  const str = typeof rawError === 'string' ? rawError : JSON.stringify(rawError || '');

  if (isRateLimitError(str, statusCode)) {
    return 'Модель тимчасово перевантажена запитами (ліміт запитів). Зачекайте 10–20 секунд і спробуйте знову, або перемкніться на іншу доступну модель.';
  }
  if (statusCode && statusCode >= 500 || str.includes('Internal error encountered') || str.includes('INTERNAL') || str.includes('"code": 500')) {
    return 'Сервер моделі тимчасово повернув помилку (500). Спробуйте повторити запит або обрати іншу модель зі списку.';
  }
  if (statusCode === 401 || str.includes('401') || str.includes('Invalid token')) {
    return 'Невірний API ключ або токен доступу. Перевірте налаштування ключа.';
  }
  if (statusCode === 402 || str.includes('402')) {
    return 'Недостатньо коштів на балансі API ключа.';
  }

  if (typeof rawError === 'object') {
    return rawError?.error?.message || rawError?.message || str.slice(0, 200);
  }

  return str.slice(0, 250);
}

/**
 * Streams chat completion in real-time (stream: true) via SSE
 * Supports custom System Prompts and OpenAI-compatible Function/Tool Calling (web_search, read_webpage).
 * Uses per-round retry with backoff so collected tool results are preserved across transient 429/5xx errors.
 */
export async function streamChatResponse(
  apiKey: string,
  modelId: string,
  prompt: string,
  history: Message[],
  onChunk: (chunk: string, accumulatedText: string) => void,
  signal?: AbortSignal,
  options?: ChatRequestOptions
): Promise<string> {
  const roundMessages: any[] = buildInitialApiMessages(history, prompt, options);
  const executedQueries: string[] = [];
  const executedReadUrls: string[] = [];
  const activeTools = getEnabledTools(options);

  const MAX_TOOL_ROUNDS = 5;
  const MAX_ROUND_RETRIES = 2;
  const baseUrl = BASE_URLS[0];
  let totalAccumulatedText = '';
  let lastApiCallAt = 0;
  let lastError: any = null;

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const enableToolsThisRound = activeTools.length > 0 && round < MAX_TOOL_ROUNDS;

      const requestBody: Record<string, any> = {
        model: modelId,
        messages: roundMessages,
        stream: true
      };

      if (enableToolsThisRound) {
        requestBody.tools = activeTools;
        requestBody.tool_choice = 'auto';
      }

      let roundText = '';
      const toolCallsMap = new Map<number, OpenAIToolCall>();

      for (let roundAttempt = 0; roundAttempt <= MAX_ROUND_RETRIES; roundAttempt++) {
        // Gentle spacing between consecutive tool-calling rounds to respect strict per-second RPM limits
        const elapsedSinceLastCall = Date.now() - lastApiCallAt;
        if (lastApiCallAt > 0 && elapsedSinceLastCall < 900) {
          await sleepWithAbort(900 - elapsedSinceLastCall, signal);
        }

        try {
          lastApiCallAt = Date.now();
          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'X-Accel-Buffering': 'no'
            },
            body: JSON.stringify(requestBody),
            signal
          });

          if (response.status === 401) {
            const authErr: any = new Error("Невірний API ключ (помилка 401). Перевірте налаштування.");
            authErr.statusCode = 401;
            throw authErr;
          }
          if (response.status === 402) {
            const payErr: any = new Error("Недостатньо коштів на балансі (помилка 402). Поповніть рахунок.");
            payErr.statusCode = 402;
            throw payErr;
          }
          if (!response.ok) {
            let errData: any = null;
            try {
              errData = await response.json();
            } catch {
              errData = await response.text();
            }
            const formattedMsg = formatApiError(errData, response.status);
            const err: any = new Error(formattedMsg);
            err.statusCode = response.status;
            err.isRateLimit = isRateLimitError(errData, response.status);
            const retryAfterSec = Number(response.headers.get('retry-after'));
            if (Number.isFinite(retryAfterSec) && retryAfterSec > 0 && retryAfterSec <= 15) {
              err.retryAfterMs = retryAfterSec * 1000;
            }
            throw err;
          }

          if (!response.body) {
            throw new Error("Тіло відповіді порожнє");
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';
          roundText = '';
          toolCallsMap.clear();

          const processSsePayload = (jsonStr: string) => {
            const parsed = JSON.parse(jsonStr);
            if (parsed.error) {
              const formatted = formatApiError(parsed.error);
              const sseErr: any = new Error(formatted);
              sseErr.isRateLimit = isRateLimitError(parsed.error);
              throw sseErr;
            }
            const choice = parsed.choices?.[0];
            if (!choice) return;

            const delta = choice.delta;
            const messageObj = choice.message;

            // 1. Collect streamed text content
            let deltaContent = '';
            if (typeof delta?.content === 'string') {
              deltaContent = delta.content;
            } else if (Array.isArray(delta?.content)) {
              deltaContent = delta.content.map((c: any) => (typeof c === 'string' ? c : c?.text || '')).join('');
            } else if (typeof choice.text === 'string') {
              deltaContent = choice.text;
            } else if (typeof messageObj?.content === 'string') {
              deltaContent = messageObj.content;
            }

            if (deltaContent) {
              options?.onStatusChange?.(null);
              roundText += deltaContent;
              totalAccumulatedText += deltaContent;
              onChunk(deltaContent, totalAccumulatedText);
            }

            // 2. Collect streamed delta.tool_calls
            if (Array.isArray(delta?.tool_calls)) {
              mergeStreamToolCalls(toolCallsMap, delta.tool_calls);
            }

            // 3. Collect full message.tool_calls if non-delta SSE chunk
            if (Array.isArray(messageObj?.tool_calls)) {
              messageObj.tool_calls.forEach((tc: any, idx: number) => {
                const rawArgs = tc.function?.arguments;
                toolCallsMap.set(idx, {
                  id: tc.id || `call_${Date.now()}_${idx}`,
                  type: 'function',
                  function: {
                    name: tc.function?.name || 'web_search',
                    arguments: typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs || {})
                  }
                });
              });
            }
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith(':') || trimmed === 'data: [DONE]') continue;
              if (trimmed.startsWith('data: ')) {
                try {
                  processSsePayload(trimmed.slice(6));
                } catch (err: any) {
                  if (err.message && !err.message.includes('JSON')) {
                    throw err;
                  }
                }
              }
            }
          }

          // Trailing chunk check
          if (buffer.trim().startsWith('data: ') && buffer.trim() !== 'data: [DONE]') {
            try {
              processSsePayload(buffer.trim().slice(6));
            } catch {}
          }

          // Round succeeded — break retry loop
          break;
        } catch (err: any) {
          if (err?.name === 'AbortError' || signal?.aborted) {
            throw err;
          }
          lastError = err;

          if (err?.statusCode === 401 || err?.statusCode === 402 || err?.message?.includes('401') || err?.message?.includes('402')) {
            throw err;
          }

          const canRetryRound = roundAttempt < MAX_ROUND_RETRIES && roundText.length === 0;
          if (!canRetryRound) {
            throw err;
          }

          const isRateErr = Boolean(err?.isRateLimit || isRateLimitError(err?.message, err?.statusCode));
          const backoffMs = isRateErr
            ? Math.max(err?.retryAfterMs || 0, (roundAttempt + 1) * 3500)
            : (roundAttempt + 1) * 1500;

          options?.onStatusChange?.(
            isRateErr
              ? 'Модель тимчасово зайнята, очікую кілька секунд і повторюю...'
              : 'Тимчасова помилка зʼєднання, повторюю запит...'
          );
          console.warn(`Раунд ${round} спроба ${roundAttempt + 1} не вдалася (${err?.message}). Повтор через ${backoffMs}мс`);
          await sleepWithAbort(backoffMs, signal);
          options?.onStatusChange?.(round > 0 ? 'Аналізую отримані дані...' : null);
        }
      }

      // Check if the model requested any tool_calls in this round
      const toolCallsList = Array.from(toolCallsMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([, tc]) => tc)
        .filter(tc => !!tc.function.name);

      if (toolCallsList.length > 0 && round < MAX_TOOL_ROUNDS) {
        roundMessages.push({
          role: 'assistant',
          content: roundText || null,
          tool_calls: toolCallsList
        });

        for (const tc of toolCallsList) {
          if (tc.function.name === 'web_search') {
            const searchQuery = parseToolQuery(tc.function.arguments);
            options?.onStatusChange?.(`Шукаю в мережі: «${searchQuery || '...'}»`);

            if (searchQuery && !executedQueries.includes(searchQuery)) {
              executedQueries.push(searchQuery);
              options?.onSearchQueries?.([...executedQueries]);
            }

            const searchResultJson = await executeWebSearch(
              options?.searchUrl || DEFAULT_SEARCH_URL,
              searchQuery,
              signal,
              !!options?.webReaderEnabled
            );

            roundMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: searchResultJson
            });
          } else if (tc.function.name === 'read_webpage') {
            const targetUrl = parseToolUrl(tc.function.arguments);
            options?.onStatusChange?.(`Читаю сторінку: ${targetUrl || '...'}`);

            const pageContent = await executeReadWebpage(targetUrl, signal);

            if (targetUrl && !pageContent.startsWith('Помилка:') && !executedReadUrls.includes(targetUrl)) {
              executedReadUrls.push(targetUrl);
              options?.onReadUrls?.([...executedReadUrls]);
            }

            roundMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: pageContent
            });
          } else {
            roundMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: JSON.stringify({ error: `Невідомий інструмент: ${tc.function.name}` })
            });
          }
        }

        options?.onStatusChange?.('Аналізую отримані дані...');
        continue;
      }

      options?.onStatusChange?.(null);

      if (totalAccumulatedText.length > 0) {
        return totalAccumulatedText;
      }

      throw new Error("Отримано порожній потік тексту від моделі");
    }
  } catch (err: any) {
    options?.onStatusChange?.(null);
    if (err?.name === 'AbortError' || signal?.aborted) {
      throw err;
    }
    lastError = err;

    const skipNonStreamFallback =
      err?.statusCode === 401 ||
      err?.statusCode === 402 ||
      err?.isRateLimit ||
      isRateLimitError(err?.message, err?.statusCode) ||
      totalAccumulatedText.length > 0;

    if (skipNonStreamFallback) {
      throw err;
    }

    // Only attempt non-streaming fallback when streaming transport/parsing failed (never on 429/401/402)
    try {
      const nonStreamResult = await generateChatResponse(apiKey, modelId, prompt, history, options);
      onChunk(nonStreamResult, nonStreamResult);
      return nonStreamResult;
    } catch (fallbackErr: any) {
      throw lastError || fallbackErr;
    }
  }

  throw lastError || new Error("Перевищено кількість викликів інструментів пошуку");
}

/**
 * Generates chat completion in non-streaming mode (with full tool_calls support)
 */
export async function generateChatResponse(
  apiKey: string,
  modelId: string,
  prompt: string,
  history: Message[],
  options?: ChatRequestOptions
): Promise<string> {
  const workingMessages: any[] = buildInitialApiMessages(history, prompt, options);
  const executedQueries: string[] = [];
  const executedReadUrls: string[] = [];
  const activeTools = getEnabledTools(options);
  const MAX_TOOL_ROUNDS = 5;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const enableTools = activeTools.length > 0 && round < MAX_TOOL_ROUNDS;
    const bodyPayload: Record<string, any> = {
      model: modelId,
      messages: workingMessages,
      stream: false
    };
    if (enableTools) {
      bodyPayload.tools = activeTools;
      bodyPayload.tool_choice = 'auto';
    }

    if (round > 0) {
      await sleepWithAbort(900);
    }

    const data = await fetchWithFallback('/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyPayload)
    });

    const choice = data?.choices?.[0];
    const message = choice?.message;

    if (message?.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0 && round < MAX_TOOL_ROUNDS) {
      workingMessages.push({
        role: 'assistant',
        content: message.content || null,
        tool_calls: message.tool_calls
      });

      for (const tc of message.tool_calls) {
        if (tc.function?.name === 'web_search') {
          const searchQuery = parseToolQuery(tc.function.arguments || '{}');
          options?.onStatusChange?.(`Шукаю в мережі: «${searchQuery || '...'}»`);

          if (searchQuery && !executedQueries.includes(searchQuery)) {
            executedQueries.push(searchQuery);
            options?.onSearchQueries?.([...executedQueries]);
          }

          const searchResultJson = await executeWebSearch(
            options?.searchUrl || DEFAULT_SEARCH_URL,
            searchQuery,
            undefined,
            !!options?.webReaderEnabled
          );

          workingMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.function.name,
            content: searchResultJson
          });
        } else if (tc.function?.name === 'read_webpage') {
          const targetUrl = parseToolUrl(tc.function.arguments || '{}');
          options?.onStatusChange?.(`Читаю сторінку: ${targetUrl || '...'}`);

          const pageContent = await executeReadWebpage(targetUrl);

          if (targetUrl && !pageContent.startsWith('Помилка:') && !executedReadUrls.includes(targetUrl)) {
            executedReadUrls.push(targetUrl);
            options?.onReadUrls?.([...executedReadUrls]);
          }

          workingMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.function.name,
            content: pageContent
          });
        } else {
          workingMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.function?.name || 'unknown',
            content: JSON.stringify({ error: `Невідомий інструмент: ${tc.function?.name}` })
          });
        }
      }
      options?.onStatusChange?.('Аналізую отримані дані...');
      continue;
    }

    options?.onStatusChange?.(null);

    if (choice) {
      return message?.content || choice.text || "";
    }
    throw new Error("Некоректна відповідь від API");
  }

  options?.onStatusChange?.(null);
  throw new Error("Перевищено кількість викликів інструментів пошуку");
}

/**
 * Helper to package a generated image or video URL / base64 into a Firestore-safe MediaAttachment.
 * Heavy Base64 blobs are stored in IndexedDB (3-day TTL) while Firestore holds only a URL or tiny <65KB preview.
 */
async function buildSafeMediaAttachment(
  rawSource: string,
  type: 'image' | 'video',
  prompt: string,
  mimeHint?: string
): Promise<MediaAttachment> {
  const mediaId = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const trimmed = (rawSource || '').trim();

  if (trimmed.startsWith('data:') || (!/^https?:\/\//i.test(trimmed) && trimmed.length > 256)) {
    const mime =
      mimeHint ||
      (trimmed.match(/^data:([^;]+);/i)?.[1]) ||
      (type === 'video' ? 'video/mp4' : 'image/png');
    const dataUrl = trimmed.startsWith('data:') ? trimmed : `data:${mime};base64,${trimmed}`;
    const localRef = await saveTempMediaBlob(mediaId, dataUrl, mime);
    const tinyThumb = type === 'image' ? await createTinyImageThumbnail(dataUrl) : null;

    return {
      id: mediaId,
      type,
      url: tinyThumb || '',
      ...(localRef ? { localRef } : {}),
      mimeType: mime,
      prompt
    };
  }

  return {
    id: mediaId,
    type,
    url: trimmed,
    mimeType: mimeHint || (type === 'video' ? 'video/mp4' : 'image/png'),
    prompt
  };
}

/**
 * Extracts media URLs / base64 payloads from OpenAI / New API chat completion responses
 * (used as fallback when image/video models are routed via /v1/chat/completions).
 */
async function extractMediaFromChatCompletionData(
  data: any,
  preferredType: 'image' | 'video',
  prompt: string
): Promise<{ text: string; mediaItems: MediaAttachment[] }> {
  const choice = data?.choices?.[0];
  const msg = choice?.message;
  const mediaItems: MediaAttachment[] = [];
  let text = '';

  const rawContent = msg?.content ?? choice?.text ?? '';
  if (typeof rawContent === 'string') {
    text = rawContent;
  } else if (Array.isArray(rawContent)) {
    const textParts: string[] = [];
    for (const part of rawContent) {
      if (typeof part === 'string') {
        textParts.push(part);
      } else if (part?.type === 'text' && part.text) {
        textParts.push(part.text);
      } else if (part?.type === 'image_url' && part.image_url?.url) {
        mediaItems.push(await buildSafeMediaAttachment(part.image_url.url, 'image', prompt));
      } else if (part?.inline_data?.data) {
        const mime = part.inline_data.mime_type || 'image/png';
        mediaItems.push(
          await buildSafeMediaAttachment(`data:${mime};base64,${part.inline_data.data}`, 'image', prompt, mime)
        );
      }
    }
    text = textParts.join('\n').trim();
  }

  // Some New API channels attach images/videos in `message.images` or `data.data`
  const extraImages = msg?.images || data?.images;
  if (Array.isArray(extraImages)) {
    for (const img of extraImages) {
      const url = typeof img === 'string' ? img : (img?.url || img?.image_url?.url || img?.b64_json);
      if (url) {
        mediaItems.push(await buildSafeMediaAttachment(url, 'image', prompt));
      }
    }
  }

  // Extract Markdown image tags ![alt](url) or direct media links from text
  if (text) {
    const mdImgRegex = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = mdImgRegex.exec(text)) !== null) {
      const src = m[2];
      const isVid = /\.(mp4|webm|mov)(?:\?|$)/i.test(src) || preferredType === 'video';
      mediaItems.push(await buildSafeMediaAttachment(src, isVid ? 'video' : 'image', prompt));
    }
    if (mediaItems.length > 0) {
      text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '').trim();
    }

    // Extract raw data:image/ or direct .mp4/.webm URLs if no markdown tag was used
    if (mediaItems.length === 0) {
      const directMediaMatch =
        text.match(/(data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/i) ||
        text.match(/(https?:\/\/[^\s"'<>]+\.(?:mp4|webm|mov|png|jpe?g|webp)(?:\?[^\s"'<>]*)?)/i);
      if (directMediaMatch?.[1]) {
        const foundUrl = directMediaMatch[1];
        const isVid = /\.(mp4|webm|mov)(?:\?|$)/i.test(foundUrl) || preferredType === 'video';
        mediaItems.push(await buildSafeMediaAttachment(foundUrl, isVid ? 'video' : 'image', prompt));
        text = text.replace(foundUrl, '').trim();
      }
    }
  }

  return { text, mediaItems };
}

/**
 * Generates an image via New API v1.0.0 (`POST /v1/images/generations`),
 * automatically falling back to `/v1/chat/completions` for chat-wrapped image models (e.g. gemini-*-image).
 */
export async function generateMediaImage(
  apiKey: string,
  modelId: string,
  prompt: string,
  signal?: AbortSignal,
  options?: { systemPrompt?: string; onStatusChange?: (status: string | null) => void }
): Promise<{ text: string; mediaItems: MediaAttachment[] }> {
  const baseUrl = BASE_URLS[0];
  const effectivePrompt = options?.systemPrompt?.trim()
    ? `${options.systemPrompt.trim()}\n\n${prompt.trim()}`
    : prompt.trim();

  options?.onStatusChange?.('Генерую зображення...');

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  // 1. Primary: OpenAI / New API /v1/images/generations
  const imgRes = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelId,
      prompt: effectivePrompt,
      n: 1
    }),
    signal
  });

  if (imgRes.status === 401) {
    throw new Error('Невірний API ключ (помилка 401). Перевірте налаштування.');
  }
  if (imgRes.status === 402) {
    throw new Error('Недостатньо коштів на балансі (помилка 402). Поповніть рахунок.');
  }

  if (imgRes.ok) {
    const data = await imgRes.json();
    const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : [data]);
    const mediaItems: MediaAttachment[] = [];
    const notes: string[] = [];

    for (const item of list) {
      const src = item?.url || item?.image_url || item?.b64_json;
      if (src) {
        mediaItems.push(await buildSafeMediaAttachment(src, 'image', prompt));
      }
      if (item?.revised_prompt && typeof item.revised_prompt === 'string') {
        notes.push(item.revised_prompt);
      }
    }

    if (mediaItems.length > 0) {
      options?.onStatusChange?.(null);
      return {
        text: notes.length > 0 ? `*Промпт моделі:* ${notes[0]}` : '',
        mediaItems
      };
    }
  }

  // Check if error is unrecoverable (401/402/429) vs endpoint mismatch (400/404/405/501)
  let primaryErrData: any = null;
  if (!imgRes.ok) {
    try {
      primaryErrData = await imgRes.json();
    } catch {
      primaryErrData = await imgRes.text().catch(() => '');
    }
    if (isRateLimitError(primaryErrData, imgRes.status)) {
      throw new Error(formatApiError(primaryErrData, imgRes.status));
    }
  }

  // 2. Fallback: chat-wrapped image generation models (e.g. gpt-4o-image / gemini-2.5-flash-image)
  const chatRes = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: effectivePrompt }],
      stream: false
    }),
    signal
  });

  if (chatRes.ok) {
    const chatData = await chatRes.json();
    const extracted = await extractMediaFromChatCompletionData(chatData, 'image', prompt);
    if (extracted.mediaItems.length > 0 || extracted.text) {
      options?.onStatusChange?.(null);
      return extracted;
    }
  }

  options?.onStatusChange?.(null);
  throw new Error(formatApiError(primaryErrData, imgRes.status) || 'Не вдалося згенерувати зображення');
}

/**
 * Generates video via New API v1.0.0 async task endpoints:
 * Primary: `POST /v1/video/generations` -> poll `GET /v1/video/generations/{task_id}`
 * Secondary: `POST /v1/videos` -> poll `GET /v1/videos/{video_id}` (+ auth `/content` fetch fallback)
 */
export async function generateMediaVideo(
  apiKey: string,
  modelId: string,
  prompt: string,
  signal?: AbortSignal,
  options?: { systemPrompt?: string; onStatusChange?: (status: string | null) => void }
): Promise<{ text: string; mediaItems: MediaAttachment[] }> {
  const baseUrl = BASE_URLS[0];
  const effectivePrompt = options?.systemPrompt?.trim()
    ? `${options.systemPrompt.trim()}\n\n${prompt.trim()}`
    : prompt.trim();

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  options?.onStatusChange?.('Надсилаю завдання на генерацію відео...');

  let submitRoute: 'video/generations' | 'videos' = 'video/generations';
  let submitRes = await fetch(`${baseUrl}/video/generations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: modelId, prompt: effectivePrompt }),
    signal
  });

  // If gateway routes OpenAI Sora-style /v1/videos instead of /v1/video/generations
  if (submitRes.status === 404 || submitRes.status === 405 || submitRes.status === 501) {
    submitRoute = 'videos';
    submitRes = await fetch(`${baseUrl}/videos`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: modelId, prompt: effectivePrompt }),
      signal
    });
  }

  if (submitRes.status === 401) {
    throw new Error('Невірний API ключ (помилка 401). Перевірте налаштування.');
  }
  if (submitRes.status === 402) {
    throw new Error('Недостатньо коштів на балансі (помилка 402). Поповніть рахунок.');
  }

  // Fallback for chat-wrapped video models if neither video endpoint matched
  if (submitRes.status === 404 || submitRes.status === 405 || submitRes.status === 501) {
    options?.onStatusChange?.('Генерую відео...');
    const chatRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: effectivePrompt }],
        stream: false
      }),
      signal
    });
    if (chatRes.ok) {
      const chatData = await chatRes.json();
      const extracted = await extractMediaFromChatCompletionData(chatData, 'video', prompt);
      if (extracted.mediaItems.length > 0 || extracted.text) {
        options?.onStatusChange?.(null);
        return extracted;
      }
    }
  }

  if (!submitRes.ok) {
    let errData: any = null;
    try {
      errData = await submitRes.json();
    } catch {
      errData = await submitRes.text().catch(() => '');
    }
    options?.onStatusChange?.(null);
    throw new Error(formatApiError(errData, submitRes.status));
  }

  const submitData = await submitRes.json();
  const payloadObj = submitData?.data && typeof submitData.data === 'object' ? submitData.data : submitData;

  const immediateUrl =
    payloadObj?.url ||
    payloadObj?.video_url ||
    payloadObj?.output?.url ||
    payloadObj?.result?.url;

  if (immediateUrl && typeof immediateUrl === 'string') {
    options?.onStatusChange?.(null);
    const attachment = await buildSafeMediaAttachment(immediateUrl, 'video', prompt);
    return { text: '', mediaItems: [attachment] };
  }

  const taskId = payloadObj?.task_id || payloadObj?.id || submitData?.task_id || submitData?.id;
  if (!taskId) {
    options?.onStatusChange?.(null);
    throw new Error('Сервер не повернув ідентифікатор відео-завдання');
  }

  // Poll task status up to ~6 minutes (100 attempts x 3.5s)
  const MAX_POLLS = 100;
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await sleepWithAbort(attempt === 0 ? 2500 : 3500, signal);

    const statusRes = await fetch(`${baseUrl}/${submitRoute}/${encodeURIComponent(taskId)}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal
    });

    if (!statusRes.ok) {
      if (statusRes.status === 401 || statusRes.status === 402) {
        throw new Error(formatApiError(null, statusRes.status));
      }
      continue;
    }

    const statusJson = await statusRes.json();
    const taskObj = statusJson?.data && typeof statusJson.data === 'object' ? statusJson.data : statusJson;
    const rawStatus = String(taskObj?.status || '').toLowerCase();
    const progressStr = taskObj?.progress ? ` (${String(taskObj.progress).replace(/%+$/, '')}%)` : '';

    if (rawStatus === 'failed' || rawStatus === 'error' || rawStatus === 'cancelled' || rawStatus === 'canceled') {
      const reason =
        taskObj?.error?.message ||
        taskObj?.fail_reason ||
        taskObj?.message ||
        statusJson?.message ||
        'Не вдалося згенерувати відео';
      options?.onStatusChange?.(null);
      throw new Error(typeof reason === 'string' ? reason : JSON.stringify(reason));
    }

    if (rawStatus === 'succeeded' || rawStatus === 'completed' || rawStatus === 'success' || rawStatus === 'done') {
      const finalVideoUrl =
        taskObj?.url ||
        taskObj?.video_url ||
        taskObj?.output?.url ||
        taskObj?.result?.url ||
        taskObj?.outputs?.[0]?.url ||
        taskObj?.data?.url;

      if (finalVideoUrl && typeof finalVideoUrl === 'string') {
        options?.onStatusChange?.(null);
        const attachment = await buildSafeMediaAttachment(finalVideoUrl, 'video', prompt);
        return { text: '', mediaItems: [attachment] };
      }

      // OpenAI /v1/videos/{id}/content binary endpoint (requires Bearer header -> fetch to local IndexedDB Blob)
      if (submitRoute === 'videos') {
        options?.onStatusChange?.('Завантажую готове відео...');
        const contentRes = await fetch(`${baseUrl}/videos/${encodeURIComponent(taskId)}/content`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal
        });
        if (contentRes.ok) {
          const videoBlob = await contentRes.blob();
          const mediaId = `video_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const localRef = await saveTempMediaBlob(mediaId, videoBlob, videoBlob.type || 'video/mp4');
          options?.onStatusChange?.(null);
          return {
            text: '',
            mediaItems: [
              {
                id: mediaId,
                type: 'video',
                url: '',
                localRef,
                mimeType: videoBlob.type || 'video/mp4',
                prompt
              }
            ]
          };
        }
      }

      options?.onStatusChange?.(null);
      throw new Error('Відео готове, але сервер не повернув посилання на файл');
    }

    if (rawStatus === 'queued' || rawStatus === 'pending' || rawStatus === 'submitted') {
      options?.onStatusChange?.(`Відео в черзі на рендеринг${progressStr}...`);
    } else {
      options?.onStatusChange?.(`Генерую відео${progressStr}...`);
    }
  }

  options?.onStatusChange?.(null);
  throw new Error('Перевищено час очікування генерації відео. Перевірте статус пізніше.');
}

/**
 * Resolves Pinterest shortlinks (pin.it/...), Pinterest pins, Giphy,
 * or generic web pages containing video to extract the direct HD .mp4 stream.
 */
export async function resolveMediaLink(url: string): Promise<{
  success: boolean;
  mediaUrl?: string;
  mediaType?: 'video' | 'gif' | 'image';
  title?: string;
  posterUrl?: string;
  error?: string;
}> {
  if (!url || !url.trim()) {
    return { success: false, error: 'Вкажіть посилання' };
  }

  const cleanUrl = url.trim();

  // If already direct mp4/gif/image
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
    const res = await fetch(`/api/resolve-media?url=${encodeURIComponent(cleanUrl)}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err: any) {
    console.warn('Media resolution error:', err);
    return {
      success: false,
      error: err.message || 'Не вдалося розпізнати відео'
    };
  }
}

