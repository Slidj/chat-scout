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
}

export interface Model {
  id: string;
  name: string;
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
      return data.data.map((m: any) => ({
        id: m.id,
        name: m.id
      }));
    }
    return [];
  } catch (error) {
    console.error("Помилка завантаження моделей:", error);
    throw error;
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

