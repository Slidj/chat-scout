const BASE_URLS = [
  'https://scout-ai.pp.ua/v1'
];

export const DEFAULT_SEARCH_URL = 'https://search-engine-el09.onrender.com/search';

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  searchQueries?: string[];
}

export interface Model {
  id: string;
  name: string;
}

export interface ChatRequestOptions {
  systemPrompt?: string;
  webSearchEnabled?: boolean;
  searchUrl?: string;
  onStatusChange?: (status: string | null) => void;
  onSearchQueries?: (queries: string[]) => void;
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

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Executes a web search request against the configured search service URL in JSON format.
 * Tries direct fetch first; falls back to /api/web-search proxy if browser CORS blocks direct access.
 */
export async function executeWebSearch(
  searchUrl: string,
  query: string,
  signal?: AbortSignal
): Promise<string> {
  const cleanBase = (searchUrl || DEFAULT_SEARCH_URL).trim();
  const separator = cleanBase.includes('?') ? '&' : '?';
  const targetUrl = `${cleanBase}${separator}q=${encodeURIComponent(query)}&format=json`;

  let rawData: any = null;

  // 1. Direct browser fetch
  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal
    });
    if (res.ok) {
      rawData = await res.json();
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (directErr: any) {
    if (directErr?.name === 'AbortError') {
      throw directErr;
    }
    // 2. Fallback via local backend proxy (handles CORS restrictions if any)
    try {
      const proxyRes = await fetch(`/api/web-search?url=${encodeURIComponent(targetUrl)}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal
      });
      if (!proxyRes.ok) {
        const errBody = await proxyRes.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${proxyRes.status}`);
      }
      rawData = await proxyRes.json();
    } catch (proxyErr: any) {
      if (proxyErr?.name === 'AbortError') {
        throw proxyErr;
      }
      return JSON.stringify({
        error: `Не вдалося виконати пошук: ${proxyErr?.message || directErr?.message || 'мережева помилка'}`,
        query
      });
    }
  }

  // Format search JSON concisely for optimal LLM context consumption
  try {
    if (rawData && Array.isArray(rawData.results)) {
      const compactResults = rawData.results.slice(0, 8).map((item: any) => ({
        title: item.title || '',
        url: item.url || item.link || '',
        content: item.content || item.snippet || item.description || '',
        ...(item.publishedDate ? { publishedDate: item.publishedDate } : {})
      }));
      return JSON.stringify({
        query,
        ...(Array.isArray(rawData.answers) && rawData.answers.length > 0 ? { answers: rawData.answers.slice(0, 3) } : {}),
        results: compactResults
      });
    }
    const serialized = typeof rawData === 'string' ? rawData : JSON.stringify(rawData);
    return serialized.slice(0, 12000);
  } catch {
    return JSON.stringify({ query, results: [] });
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

function buildInitialApiMessages(history: Message[], prompt: string, systemPrompt?: string): any[] {
  const conversation = sanitizeConversationHistory(history, prompt);
  const messages: any[] = [];
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({
      role: 'system',
      content: systemPrompt.trim()
    });
  }
  return [...messages, ...conversation];
}

function parseToolQuery(rawArgs: string): string {
  try {
    const parsed = JSON.parse(rawArgs || '{}');
    if (typeof parsed.query === 'string') return parsed.query;
    if (typeof parsed.q === 'string') return parsed.q;
    if (typeof parsed.search_query === 'string') return parsed.search_query;
    return String(Object.values(parsed)[0] || '');
  } catch {
    return (rawArgs || '').trim();
  }
}

/**
 * Transforms cryptic JSON/upstream rate-limit errors into clear Ukrainian messages
 */
export function formatApiError(rawError: any): string {
  if (!rawError) return 'Невідома помилка підключення до моделі';
  
  const str = typeof rawError === 'string' ? rawError : JSON.stringify(rawError);

  if (str.includes('rate-limited') || str.includes('429')) {
    return 'Модель тимчасово перевантажена запитами (ліміт запитів). Зачекайте 10–20 секунд і спробуйте знову, або перемкніться на іншу доступну модель.';
  }
  if (str.includes('Internal error encountered') || str.includes('INTERNAL') || str.includes('"code": 500')) {
    return 'Сервер моделі тимчасово повернув помилку (500). Спробуйте повторити запит або обрати іншу модель зі списку.';
  }
  if (str.includes('401') || str.includes('Invalid token')) {
    return 'Невірний API ключ або токен доступу. Перевірте налаштування ключа.';
  }
  if (str.includes('402')) {
    return 'Недостатньо коштів на балансі API ключа.';
  }

  if (typeof rawError === 'object') {
    return rawError?.error?.message || rawError?.message || str.slice(0, 200);
  }

  return str.slice(0, 250);
}

/**
 * Streams chat completion in real-time (stream: true) via SSE
 * Supports custom System Prompts and OpenAI-compatible Function/Tool Calling (web_search).
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
  const workingMessages: any[] = buildInitialApiMessages(history, prompt, options?.systemPrompt);
  const executedQueries: string[] = [];

  const MAX_TOOL_ROUNDS = 3;
  const MAX_RETRIES = 2;
  let lastError: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      if (signal?.aborted) throw new Error("Запит скасовано");
      const delayMs = attempt * 1250;
      await new Promise(r => setTimeout(r, delayMs));
    }

    for (const baseUrl of BASE_URLS) {
      try {
        const roundMessages = [...workingMessages];
        let totalAccumulatedText = '';

        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const enableToolsThisRound = !!options?.webSearchEnabled && round < MAX_TOOL_ROUNDS;

          const requestBody: Record<string, any> = {
            model: modelId,
            messages: roundMessages,
            stream: true
          };

          if (enableToolsThisRound) {
            requestBody.tools = [WEB_SEARCH_TOOL];
            requestBody.tool_choice = 'auto';
          }

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
            throw new Error("Невірний API ключ (помилка 401). Перевірте налаштування.");
          }
          if (response.status === 402) {
            throw new Error("Недостатньо коштів на балансі (помилка 402). Поповніть рахунок.");
          }
          if (!response.ok) {
            let errData: any = null;
            try {
              errData = await response.json();
            } catch {
              errData = await response.text();
            }
            const formattedMsg = formatApiError(errData);
            const err = new Error(formattedMsg);
            (err as any).statusCode = response.status;
            throw err;
          }

          if (!response.body) {
            throw new Error("Тіло відповіді порожнє");
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';
          let roundText = '';
          const toolCallsMap = new Map<number, OpenAIToolCall>();

          const processSsePayload = (jsonStr: string) => {
            const parsed = JSON.parse(jsonStr);
            if (parsed.error) {
              throw new Error(formatApiError(parsed.error));
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
              for (const tc of delta.tool_calls) {
                const idx = typeof tc.index === 'number' ? tc.index : 0;
                const existing = toolCallsMap.get(idx) || {
                  id: tc.id || `call_${Date.now()}_${idx}`,
                  type: 'function',
                  function: { name: '', arguments: '' }
                };
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.function.name += tc.function.name;
                if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                toolCallsMap.set(idx, existing);
              }
            }

            // 3. Collect full message.tool_calls if non-delta SSE chunk
            if (Array.isArray(messageObj?.tool_calls)) {
              messageObj.tool_calls.forEach((tc: any, idx: number) => {
                toolCallsMap.set(idx, {
                  id: tc.id || `call_${Date.now()}_${idx}`,
                  type: 'function',
                  function: {
                    name: tc.function?.name || 'web_search',
                    arguments: tc.function?.arguments || '{}'
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
                  signal
                );

                roundMessages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  name: tc.function.name,
                  content: searchResultJson
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

            options?.onStatusChange?.('Аналізую знайдені дані...');
            // Continue to next round so the model produces final answer with tool results
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
        if (err.name === 'AbortError') {
          throw err;
        }
        lastError = err;
        if (err.message && (err.message.includes("401") || err.message.includes("402"))) {
          throw err;
        }
        console.warn(`Спроба ${attempt + 1} не вдалася для ${baseUrl}:`, err.message);
      }
    }
  }

  // Graceful fallback attempt with non-streaming (also supports tool calling!)
  try {
    const nonStreamResult = await generateChatResponse(apiKey, modelId, prompt, history, options);
    onChunk(nonStreamResult, nonStreamResult);
    return nonStreamResult;
  } catch (fallbackErr: any) {
    throw lastError || fallbackErr;
  }
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
  const workingMessages: any[] = buildInitialApiMessages(history, prompt, options?.systemPrompt);
  const executedQueries: string[] = [];
  const MAX_TOOL_ROUNDS = 3;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const enableTools = !!options?.webSearchEnabled && round < MAX_TOOL_ROUNDS;
    const bodyPayload: Record<string, any> = {
      model: modelId,
      messages: workingMessages,
      stream: false
    };
    if (enableTools) {
      bodyPayload.tools = [WEB_SEARCH_TOOL];
      bodyPayload.tool_choice = 'auto';
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
            searchQuery
          );

          workingMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.function.name,
            content: searchResultJson
          });
        }
      }
      options?.onStatusChange?.('Аналізую знайдені дані...');
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

