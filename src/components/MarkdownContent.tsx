import React, { useMemo } from 'react';
import { marked } from 'marked';

interface MarkdownContentProps {
  content: string;
  isTyping?: boolean;
}

export function MarkdownContent({ content, isTyping }: MarkdownContentProps) {
  // Configure marked for clean GFM parsing with breaks
  const htmlContent = useMemo(() => {
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

  return (
    <div className="relative">
      <div 
        className="claude-markdown text-[#EDE9DF] text-[17px] leading-[1.7] select-text tracking-[-0.01em]"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
      {isTyping && (
        <span 
          className="inline-block w-2.5 h-[1.15em] ml-1 bg-[#CC785C] animate-pulse align-middle rounded-xs"
          aria-hidden="true" 
        />
      )}
    </div>
  );
}
