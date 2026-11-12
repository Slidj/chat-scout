const BASE_URLS = [
  'https://scout-ai.pp.ua/v1',
  'https://ionic-5r01.onrender.com/v1'
];

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export interface Model {
  id: string;
  name: string;
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
      console.warn(`Запит не вдався для ${baseUrl}, пробуємо наступний...`, error);
      lastError = error;
      if (error.message && (error.message.includes("401") || error.message.includes("402"))) {
        throw error;
      }
    }
  }
  throw lastError || new Error("Всі сервери недоступні");
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
 * Streams chat completion in real-time (stream: true) via SSE
 * providing instant Time-to-First-Token and smooth live text rendering.
 */
/**
 * Sanitizes conversation history for strict LLM providers (Google AI Studio, Claude).
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

    // Merge consecutive messages of the same role (required by Google AI Studio)
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

/**
 * Transforms cryptic JSON/upstream rate-limit errors into clear Ukrainian messages
 */
export function formatApiError(rawError: any): string {
  if (!rawError) return 'Невідома помилка підключення до моделі';
  
  const str = typeof rawError === 'string' ? rawError : JSON.stringify(rawError);

  if (str.includes('rate-limited') || str.includes('429')) {
    return 'Модель тимчасово перевантажена запитами на стороні Google AI Studio / OpenRouter (ліміт запитів). Зачекайте 10–20 секунд і спробуйте знову, або перемкніться на іншу доступну модель.';
  }
  if (str.includes('Internal error encountered') || str.includes('INTERNAL') || str.includes('"code": 500')) {
    return 'Сервер моделі тимчасово повернув помилку перевантаження (Google AI Studio 500). Спробуйте повторити запит або обрати іншу модель зі списку.';
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
 * with automatic retry on transient 500/429 spikes and clean history sanitization.
 */
export async function streamChatResponse(
  apiKey: string,
  modelId: string,
  prompt: string,
  history: Message[],
  onChunk: (chunk: string, accumulatedText: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const sanitizedMessages = sanitizeConversationHistory(history, prompt);

  const MAX_RETRIES = 2;
  let lastError: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      if (signal?.aborted) throw new Error("Запит скасовано");
      // Backoff delay: 1.2s on first retry, 2.5s on second retry
      const delayMs = attempt * 1250;
      await new Promise(r => setTimeout(r, delayMs));
    }

    for (const baseUrl of BASE_URLS) {
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
          },
          body: JSON.stringify({
            model: modelId,
            messages: sanitizedMessages,
            stream: true
          }),
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
        let accumulatedText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // save incomplete fragment

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (trimmed === 'data: [DONE]') continue;

            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6);
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.error) {
                  throw new Error(formatApiError(parsed.error));
                }
                const delta = parsed.choices?.[0]?.delta;
                let deltaContent = '';
                if (typeof delta?.content === 'string') {
                  deltaContent = delta.content;
                } else if (Array.isArray(delta?.content)) {
                  deltaContent = delta.content.map((c: any) => (typeof c === 'string' ? c : c?.text || '')).join('');
                } else if (typeof parsed.choices?.[0]?.text === 'string') {
                  deltaContent = parsed.choices[0].text;
                } else if (typeof parsed.choices?.[0]?.message?.content === 'string') {
                  deltaContent = parsed.choices[0].message.content;
                }

                if (deltaContent) {
                  accumulatedText += deltaContent;
                  onChunk(deltaContent, accumulatedText);
                }
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
            const parsed = JSON.parse(buffer.trim().slice(6));
            const delta = parsed.choices?.[0]?.delta;
            const deltaContent = typeof delta?.content === 'string' ? delta.content : (parsed.choices?.[0]?.text || '');
            if (deltaContent) {
              accumulatedText += deltaContent;
              onChunk(deltaContent, accumulatedText);
            }
          } catch (e) {}
        }

        if (accumulatedText.length > 0) {
          return accumulatedText;
        }

        throw new Error("Отримано порожній потік тексту від моделі");
      } catch (err: any) {
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

  // Graceful fallback attempt with non-streaming
  try {
    const nonStreamResult = await generateChatResponse(apiKey, modelId, prompt, history);
    onChunk(nonStreamResult, nonStreamResult);
    return nonStreamResult;
  } catch (fallbackErr: any) {
    throw lastError || fallbackErr;
  }
}

/**
 * Generates chat completion in non-streaming mode (fallback)
 */
export async function generateChatResponse(
  apiKey: string,
  modelId: string,
  prompt: string,
  history: Message[]
): Promise<string> {
  const sanitizedMessages = sanitizeConversationHistory(history, prompt);

  const data = await fetchWithFallback('/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      messages: sanitizedMessages,
      stream: false
    })
  });

  if (data && data.choices && data.choices.length > 0) {
    return data.choices[0].message?.content || data.choices[0].text || "";
  }
  throw new Error("Некоректна відповідь від API");
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

