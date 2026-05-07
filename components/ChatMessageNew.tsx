import React from 'react';
import ReactMarkdown from 'react-markdown';
import { formatCitationsByIndex, CitationAnnotation, AnnotationsMapNew } from '../utils/formatCitationsNew';
import { ChatMessageNew as ChatMessageNewType } from '../hooks/useAssistantChatNew';

interface ChatMessageNewProps {
  message: ChatMessageNewType;
  annotations: CitationAnnotation[];
  annotationsMap: AnnotationsMapNew;
  onCitationClick: (fileId: string) => void;
}

const ChatMessageNew: React.FC<ChatMessageNewProps> = ({ message, annotations, annotationsMap, onCitationClick }) => {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm px-4 py-3 text-sm bg-brand-600 text-white">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  // Assistant: format citations then render markdown
  const processed = formatCitationsByIndex(message.content, annotations);

  // Build a set of unique file_ids for citation badges
  const fileIdToIndex = new Map<string, number>();
  let counter = 0;
  for (const ann of annotations) {
    if (!fileIdToIndex.has(ann.file_id)) {
      fileIdToIndex.set(ann.file_id, ++counter);
    }
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm bg-white border border-slate-200 text-slate-800 shadow-sm">
        {message.content ? (
          <div className="prose prose-sm prose-slate max-w-none">
            <ReactMarkdown
              components={{
                a({ href, children }) {
                  if (href?.startsWith('#file-')) {
                    const fileId = href.slice(6);
                    return (
                      <sup>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            onCitationClick(fileId);
                          }}
                          className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold rounded-full bg-brand-100 text-brand-700 hover:bg-brand-200 transition-colors border border-brand-300 cursor-pointer"
                          title={`Source: ${annotationsMap[fileId]?.[0]?.filename ?? fileId}`}
                        >
                          {children}
                        </button>
                      </sup>
                    );
                  }
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">
                      {children}
                    </a>
                  );
                },
              }}
            >
              {processed}
            </ReactMarkdown>
          </div>
        ) : (
          <span className="inline-flex gap-1 py-1">
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        )}
      </div>
    </div>
  );
};

export default ChatMessageNew;
