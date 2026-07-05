import { User, Bot } from 'lucide-react';
import { Message } from '../lib/api';

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
        <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${isUser ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
          {isUser ? <User size={16} /> : <Bot size={16} />}
        </div>
        
        <div className={`px-4 py-3 rounded-2xl ${
          isUser 
            ? 'bg-blue-600 text-white rounded-br-none' 
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-none'
        }`}>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {message.text}
          </div>
        </div>
      </div>
    </div>
  );
}
