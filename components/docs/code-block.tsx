'use client';

import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Highlight, themes } from 'prism-react-renderer';
import { JavaScriptIcon, TypeScriptIcon, PythonIcon } from '@/components/icons/language-icons';

interface CodeExample {
  language: 'javascript' | 'typescript' | 'python' | 'bash' | 'json';
  label: string;
  code: string;
}

interface CodeBlockProps {
  examples: CodeExample[];
  title?: string;
}

function BashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M4 20q-.825 0-1.412-.587T2 18V6q0-.825.588-1.412T4 4h16q.825 0 1.413.588T22 6v12q0 .825-.587 1.413T20 20zm0-2h16V8H4zm8-1.5l-1.4-1.4 2.1-2.1-2.1-2.1L12 9.5 15.5 13zm-5 .5v-2h3v2z"/>
    </svg>
  );
}

function JsonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M5.759 3.975h1.783V5.76H5.759v4.458A1.783 1.783 0 0 1 3.975 12a1.783 1.783 0 0 1 1.784 1.783v4.459h1.783v1.783H5.759c-.954-.24-1.784-.803-1.784-1.783v-3.567a1.783 1.783 0 0 0-1.783-1.783H1.3v-1.783h.892a1.783 1.783 0 0 0 1.783-1.784V5.76c0-.98.83-1.543 1.784-1.784zm12.482 0c.954.24 1.784.803 1.784 1.784v3.566a1.783 1.783 0 0 0 1.783 1.784h.892v1.783h-.892a1.783 1.783 0 0 0-1.783 1.783v3.567c0 .98-.83 1.543-1.784 1.783h-1.783v-1.783h1.783v-4.459A1.783 1.783 0 0 1 20.025 12a1.783 1.783 0 0 1-1.783-1.783V5.759h-1.783V3.975h1.783zM12 14.675a.892.892 0 1 1 0-1.783.892.892 0 0 1 0 1.783zm-3.566 0a.892.892 0 1 1 0-1.783.892.892 0 0 1 0 1.783zm7.133 0a.892.892 0 1 1 0-1.783.892.892 0 0 1 0 1.783z"/>
    </svg>
  );
}

function getLanguageIcon(language: string) {
  switch (language) {
    case 'javascript':
      return <JavaScriptIcon className="w-5 h-5 text-yellow-400" />;
    case 'typescript':
      return <TypeScriptIcon className="w-5 h-5 text-blue-400" />;
    case 'python':
      return <PythonIcon className="w-5 h-5 text-green-400" />;
    case 'bash':
      return <BashIcon className="w-5 h-5 text-zinc-400" />;
    case 'json':
      return <JsonIcon className="w-5 h-5 text-orange-400" />;
    default:
      return null;
  }
}

// Map our language names to Prism language names
function getPrismLanguage(language: string): string {
  switch (language) {
    case 'javascript':
      return 'javascript';
    case 'typescript':
      return 'typescript';
    case 'python':
      return 'python';
    case 'bash':
      return 'bash';
    case 'json':
      return 'json';
    default:
      return 'javascript';
  }
}

export function CodeBlock({ examples, title }: CodeBlockProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);

  const activeExample = examples[activeTab];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activeExample.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl overflow-hidden border border-zinc-800 bg-[#1a1a1a]">
      {/* Header with tabs */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-[#141414]">
        <div className="flex">
          {examples.map((example, i) => (
            <button
              key={example.label}
              onClick={() => setActiveTab(i)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors ${
                activeTab === i
                  ? 'text-white bg-[#1a1a1a] border-b-2 border-blue-500'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {getLanguageIcon(example.language)}
              {example.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleCopy}
          className="px-3 py-2 text-zinc-500 hover:text-white transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

      {/* Code content */}
      <div className="p-4 overflow-x-auto">
        <Highlight
          theme={themes.oneDark}
          code={activeExample.code.trim()}
          language={getPrismLanguage(activeExample.language)}
        >
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre className="text-sm font-mono leading-relaxed" style={{ ...style, background: 'transparent' }}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
}

// Simple single-language code block
export function SimpleCodeBlock({ code, language, title }: { code: string; language: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl overflow-hidden border border-zinc-800 bg-[#1a1a1a]">
      {title && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-[#141414]">
          <span className="text-xs text-zinc-500">{title}</span>
          <button
            onClick={handleCopy}
            className="text-zinc-500 hover:text-white transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      )}
      <div className="p-4 overflow-x-auto">
        <Highlight
          theme={themes.oneDark}
          code={code.trim()}
          language={getPrismLanguage(language)}
        >
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre className="text-sm font-mono leading-relaxed" style={{ ...style, background: 'transparent' }}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
}
