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
export async function streamChatResponse(
  apiKey: string,
  modelId: string,
  prompt: string,
  history: Message[],
  onChunk: (chunk: string, accumulatedText: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const messages = history.map(msg => ({
    role: msg.role === 'model' ? 'assistant' : 'user',
    content: msg.text
  }));
  messages.push({ role: 'user', content: prompt });

  let lastError = null;

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
          messages: messages,
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
        let errMsg = '';
        try {
          const errData = await response.json();
          errMsg = errData?.error?.message || errData?.message || '';
        } catch {
          errMsg = await response.text();
        }
        throw new Error(errMsg || `HTTP помилка ${response.status} від ${baseUrl}`);
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
                throw new Error(parsed.error.message || 'Помилка провайдера ШІ');
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
      console.warn(`Стрімінг не вдався для ${baseUrl}, пробуємо наступний сервер...`, err);
      lastError = err;
      if (err.message && (err.message.includes("401") || err.message.includes("402") || err.message.includes("rate-limited"))) {
        throw err;
      }
    }
  }

  // Fallback to non-streaming only if SSE connection was rejected
  console.warn("Стрімінг не спрацював, викликаємо fallback non-streaming режим...");
  const nonStreamResult = await generateChatResponse(apiKey, modelId, prompt, history);
  onChunk(nonStreamResult, nonStreamResult);
  return nonStreamResult;
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
  const messages = history.map(msg => ({
    role: msg.role === 'model' ? 'assistant' : 'user',
    content: msg.text
  }));
  messages.push({ role: 'user', content: prompt });

  const data = await fetchWithFallback('/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      messages: messages,
      stream: false
    })
  });

  if (data && data.choices && data.choices.length > 0) {
    return data.choices[0].message?.content || data.choices[0].text || "";
  }
  throw new Error("Некоректна відповідь від API");
}

