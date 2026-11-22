import React, { memo, useMemo } from 'react';
import { Marked, TokenizerAndRendererExtension } from 'marked';
import hljs from 'highlight.js';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MarkdownContentProps {
  content: string;
  isTyping?: boolean;
}

const STREAM_SAFE_LANGUAGES = [
  'javascript', 'typescript', 'python', 'bash', 'json', 'html', 'xml', 'css', 'sql', 'yaml', 'markdown'
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isLikelyCurrencyProse(inner: string): boolean {
  const trimmed = inner.trim();
  if (!trimmed) return true;
  // Explicit LaTeX commands or mathematical notation -> always render as math
  if (/[\\^_{}=<>|×÷≈≠≤≥±∞∑∏∫√]/.test(trimmed)) return false;
  // Plain currency numbers like "$50" or "$1,200.50"
  if (/^\d[\d,.\s]*$/.test(trimmed)) return true;
  // Numbers followed by regular words with spaces like "$50 and 100$"
  if (/^\d/.test(trimmed) && /\s/.test(trimmed) && !/[+\-*/()]/.test(trimmed)) return true;
  return false;
}

function renderKatexHtml(expr: string, displayMode: boolean): string {
  try {
    return katex.renderToString(expr.trim(), {
      displayMode,
      throwOnError: false,
      strict: false,
      output: 'htmlAndMathml',
    });
  } catch {
    return escapeHtml(expr);
  }
}

const blockMathExtension: TokenizerAndRendererExtension = {
  name: 'blockMath',
  level: 'block',
  start(src: string) {
    const match = src.match(/(?:^|\n)[ \t]{0,3}(?:\$\$|\\\[)/);
    if (!match || match.index === undefined) return undefined;
    return match[0].startsWith('\n') ? match.index + 1 : match.index;
  },
  tokenizer(src: string) {
    const dollarMatch = src.match(/^[ \t]{0,3}\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/);
    if (dollarMatch && dollarMatch[1].trim()) {
      return {
        type: 'blockMath',
        raw: dollarMatch[0],
        text: dollarMatch[1],
      };
    }

    const bracketMatch = src.match(/^[ \t]{0,3}\\\[([\s\S]+?)\\\][ \t]*(?:\n+|$)/);
    if (bracketMatch && bracketMatch[1].trim()) {
      return {
        type: 'blockMath',
        raw: bracketMatch[0],
        text: bracketMatch[1],
      };
    }

    return undefined;
  },
  renderer(token: any) {
    return `<div class="katex-block-wrapper my-3 overflow-x-auto">${renderKatexHtml(token.text || '', true)}</div>`;
  },
};

const inlineMathExtension: TokenizerAndRendererExtension = {
  name: 'inlineMath',
  level: 'inline',
  start(src: string) {
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '$') {
        if (i === 0 || src[i - 1] !== '\\') return i;
      } else if (ch === '\\' && (src[i + 1] === '(' || src[i + 1] === '[')) {
        if (i === 0 || src[i - 1] !== '\\') return i;
      }
    }
    return undefined;
  },
  tokenizer(src: string) {
    // 1. Inline $$...$$ fallback (when used mid-paragraph)
    if (src.startsWith('$$')) {
      const match = src.match(/^\$\$([\s\S]+?)\$\$/);
      if (match && match[1].trim()) {
        return {
          type: 'inlineMath',
          raw: match[0],
          text: match[1],
          displayMode: true,
        };
      }
      return undefined;
    }

    // 2. Inline \[...\] fallback
    if (src.startsWith('\\[')) {
      const match = src.match(/^\\\[([\s\S]+?)\\\]/);
      if (match && match[1].trim()) {
        return {
          type: 'inlineMath',
          raw: match[0],
          text: match[1],
          displayMode: true,
        };
      }
      return undefined;
    }

    // 3. Standard inline \(...\)
    if (src.startsWith('\\(')) {
      const match = src.match(/^\\\(([\s\S]+?)\\\)/);
      if (match && match[1].trim()) {
        return {
          type: 'inlineMath',
          raw: match[0],
          text: match[1],
          displayMode: false,
        };
      }
      return undefined;
    }

    // 4. Dollar inline math $...$
    if (!src.startsWith('$') || src.length < 3 || /\s/.test(src[1])) {
      return undefined;
    }

    for (let i = 1; i < src.length; i++) {
      // Stop at blank line
      if (src[i] === '\n' && src[i + 1] === '\n') {
        return undefined;
      }
      if (src[i] === '$' && src[i - 1] !== '\\') {
        // Ignore $$ inside scan
        if (src[i + 1] === '$') return undefined;
        // Closing $ must not be preceded by whitespace or immediately followed by a digit
        if (/\s/.test(src[i - 1]) || (i + 1 < src.length && /\d/.test(src[i + 1]))) {
          return undefined;
        }

        const inner = src.slice(1, i);
        // If it crosses a newline, only treat as math when explicit LaTeX commands exist
        if (inner.includes('\n') && !inner.includes('\\')) {
          return undefined;
        }
        if (isLikelyCurrencyProse(inner)) {
          return undefined;
        }

        return {
          type: 'inlineMath',
          raw: src.slice(0, i + 1),
          text: inner,
          displayMode: false,
        };
      }
    }

    return undefined;
  },
  renderer(token: any) {
    return renderKatexHtml(token.text || '', Boolean(token.displayMode));
  },
};

/**
 * Pre-cleans and balances unclosed markdown tokens to prevent flicker during live streaming
 */
function balanceMarkdown(text: string): string {
  if (!text) return '';

  // Format reasoning tags from models like DeepSeek R1 / QwQ (<think>...</think>)
  let processed = text.replace(/<think>([\s\S]*?)<\/think>/gi, (_, thought) => {
    return `\n> 💭 **Міркування:**\n> ${thought.trim().replace(/\n/g, '\n> ')}\n\n`;
  });
  // If still actively streaming inside <think>
  processed = processed.replace(/<think>([\s\S]*)$/gi, (_, thought) => {
    return `\n> 💭 **Міркування...**\n> ${thought.trim().replace(/\n/g, '\n> ')}\n\n`;
  });

  // Balance unclosed code blocks (```) while streaming
  const codeBlockMatches = processed.match(/```/g);
  if (codeBlockMatches && codeBlockMatches.length % 2 === 1) {
    processed += '\n```';
  }

  // Balance unclosed inline code (`) outside fenced code blocks
  const withoutFences = processed.replace(/```[\s\S]*?```/g, '');
  const backtickCount = (withoutFences.match(/`/g) || []).length;
  if (backtickCount % 2 === 1) {
    processed += '`';
  }

  return processed;
}

function createCodeBlockHtml(codeText: string, lang: string, skipAutoHighlight: boolean): string {
  const validLang = (lang || '').trim().toLowerCase();
  let highlighted = '';

  if (codeText.length > 8000) {
    highlighted = escapeHtml(codeText);
  } else if (validLang && hljs.getLanguage(validLang)) {
    try {
      highlighted = hljs.highlight(codeText, { language: validLang, ignoreIllegals: true }).value;
    } catch {
      highlighted = escapeHtml(codeText);
    }
  } else if (!skipAutoHighlight) {
    try {
      highlighted = hljs.highlightAuto(codeText, STREAM_SAFE_LANGUAGES).value;
    } catch {
      highlighted = escapeHtml(codeText);
    }
  } else {
    highlighted = escapeHtml(codeText);
  }

  const displayLang = validLang || 'code';

  return `<div class="code-block-wrapper my-4 rounded-2xl overflow-hidden border border-[#383632] bg-[#161513] shadow-md group">
        <div class="flex items-center justify-between px-4 py-2 bg-[#1F1E1B] border-b border-[#2C2A26] text-xs select-none">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-[#CC785C]/70 inline-block"></span>
            <span class="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#B8B4AA]">${escapeHtml(displayLang)}</span>
          </div>
          <button type="button" class="code-copy-btn flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#282723] hover:bg-[#34322D] text-[#D8D4CA] hover:text-[#FFFFFF] transition-all cursor-pointer text-xs active:scale-95" title="Скопіювати код">
            <svg class="w-3.5 h-3.5 copy-icon shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span class="copy-btn-text font-sans font-medium">Скопіювати</span>
          </button>
        </div>
        <pre class="p-4 overflow-x-auto text-[14px] font-mono leading-[1.65] text-[#EDE9DF]"><code>${highlighted}</code></pre>
      </div>`;
}

function buildMarkedInstance(skipAutoHighlight: boolean): Marked {
  const instance = new Marked({
    gfm: true,
    breaks: true,
  });

  instance.use({
    extensions: [blockMathExtension, inlineMathExtension],
    renderer: {
      code({ text, lang }) {
        return createCodeBlockHtml(text || '', lang || '', skipAutoHighlight);
      },
      link({ href, text, title }) {
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-[#CC785C] underline underline-offset-3 hover:text-[#E08A6E] transition-colors" title="${escapeHtml(title || '')}">${text}</a>`;
      },
      image({ href, text, title }) {
        return `<div class="my-4">
        <img src="${href}" alt="${escapeHtml(text || '')}" class="rounded-2xl border border-[#383632] max-w-full h-auto shadow-md mx-auto" loading="lazy" />
        ${title ? `<span class="block text-xs text-[#9E9A92] mt-1.5 text-center font-serif italic">${escapeHtml(title)}</span>` : ''}
      </div>`;
      }
    }
  });

  return instance;
}

const streamingMarked = buildMarkedInstance(true);
const finalMarked = buildMarkedInstance(false);

export const MarkdownContent = memo(function MarkdownContent({ content, isTyping }: MarkdownContentProps) {
  const renderedHtml = useMemo(() => {
    if (!content) return '';

    try {
      const balanced = balanceMarkdown(content);
      const parser = isTyping ? streamingMarked : finalMarked;
      let html = parser.parse(balanced, { async: false }) as string;

      // Wrap tables in responsive horizontal scroll wrapper with styling
      html = html
        .replace(/<table>/g, '<div class="table-container my-4 overflow-x-auto rounded-xl border border-[#383632] shadow-sm"><table class="w-full text-left border-collapse text-[15px]">')
        .replace(/<\/table>/g, '</table></div>');

      // Inject inline cursor cleanly only inside inline text blocks (never inside <pre>/<code>/<table>)
      if (isTyping) {
        const cursorHtml = '<span class="claude-cursor" aria-hidden="true"></span>';
        const trimmedHtml = html.trimEnd();
        const match = trimmedHtml.match(/(<\/(?:p|li|h[1-6]|blockquote)>)$/i);
        if (match && match.index !== undefined) {
          html = trimmedHtml.slice(0, match.index) + cursorHtml + trimmedHtml.slice(match.index);
        } else {
          html = trimmedHtml + cursorHtml;
        }
      }

      return html;
    } catch (e) {
      console.error("Markdown parse error:", e);
      return escapeHtml(content).replace(/\n/g, '<br/>');
    }
  }, [content, isTyping]);

  // Delegated click handler for code block copy buttons
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const copyBtn = target.closest('.code-copy-btn') as HTMLButtonElement | null;
    if (copyBtn) {
      e.stopPropagation();
      const codeWrapper = copyBtn.closest('.code-block-wrapper');
      const codeElement = codeWrapper?.querySelector('code');
      if (codeElement) {
        const rawCode = codeElement.textContent || '';
        navigator.clipboard.writeText(rawCode).then(() => {
          const textSpan = copyBtn.querySelector('.copy-btn-text');
          const originalText = textSpan?.textContent || 'Скопіювати';
          if (textSpan) {
            textSpan.textContent = 'Скопійовано!';
          }
          copyBtn.classList.add('text-emerald-400', 'bg-emerald-950/60', 'border', 'border-emerald-700/50');
          setTimeout(() => {
            if (textSpan) textSpan.textContent = originalText;
            copyBtn.classList.remove('text-emerald-400', 'bg-emerald-950/60', 'border', 'border-emerald-700/50');
          }, 2000);
        });
      }
    }
  };

  return (
    <div className="relative" onClick={handleContainerClick}>
      <div 
        className="claude-markdown text-[#EDE9DF] text-[17px] leading-[1.7] select-text tracking-[-0.01em]"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  );
});

