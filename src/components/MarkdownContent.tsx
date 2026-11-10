import React, { useMemo } from 'react';
import { marked } from 'marked';

interface MarkdownContentProps {
  content: string;
  isTyping?: boolean;
}

export function MarkdownContent({ content, isTyping }: MarkdownContentProps) {
  // Configure marked for clean GFM parsing with breaks
  const rawHtml = useMemo(() => {
    if (!content) return '';
    try {
      return marked.parse(content, {
        gfm: true,
        breaks: true,
        async: false,
      }) as string;
    } catch {
      // Fallback in case of parsing issue
      return content.replace(/\n/g, '<br/>');
    }
  }, [content]);

  // Inject inline cursor seamlessly right inside the trailing tag (no layout jumps or orphan lines)
  const renderedHtml = useMemo(() => {
    if (!rawHtml) return '';
    if (!isTyping) return rawHtml;

    const cursorHtml = '<span class="claude-cursor" aria-hidden="true"></span>';
    
    // Find the last closing tag (e.g. </p>, </li>, </h1>, </code>, </blockquote>, etc.)
    const lastClosingIndex = rawHtml.lastIndexOf('</');
    if (lastClosingIndex !== -1) {
      return rawHtml.slice(0, lastClosingIndex) + cursorHtml + rawHtml.slice(lastClosingIndex);
    }
    return rawHtml + cursorHtml;
  }, [rawHtml, isTyping]);

  return (
    <div className="relative">
      <div 
        className="claude-markdown text-[#EDE9DF] text-[17px] leading-[1.7] select-text tracking-[-0.01em]"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  );
}
