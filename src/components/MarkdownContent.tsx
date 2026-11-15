import React, { memo, useMemo } from 'react';
import { Marked } from 'marked';
import hljs from 'highlight.js';

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

