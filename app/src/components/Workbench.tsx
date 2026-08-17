'use client';

import { useChat } from '@ai-sdk/react';
import { useRef, useState } from 'react';
import type { StoreFile, StoreInfo } from '@/lib/foundry';

type Props = {
  model: string;
  vectorStoreId: string;
  initialStore: StoreInfo | null;
  initialFiles: StoreFile[];
  initialError: string | null;
};

function formatBytes(n: number): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max).trimEnd()}…` : s;
}

const SUGGESTIONS = [
  'What provisions the vector store, and what provisions the model?',
  'How does file_search embed documents?',
  'What does OpenChoreo inject into the app as environment variables?',
];

export default function Workbench({
  model,
  vectorStoreId,
  initialStore,
  initialFiles,
  initialError,
}: Props) {
  const { messages, sendMessage, status, stop, error } = useChat();

  const [input, setInput] = useState('');
  const [store, setStore] = useState<StoreInfo | null>(initialStore);
  const [files, setFiles] = useState<StoreFile[]>(initialFiles);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ingestMsg, setIngestMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const busy = status === 'submitted' || status === 'streaming';
  const docCount = store?.counts.total ?? files.length;

  async function refreshConfig() {
    try {
      const r = await fetch('/api/config', { cache: 'no-store' });
      const j = await r.json();
      if (j.store) setStore(j.store);
      if (Array.isArray(j.files)) setFiles(j.files);
    } catch {
      /* leave last-known state */
    }
  }

  async function ingest(list: FileList | null) {
    if (!list || list.length === 0) return;
    const fd = new FormData();
    Array.from(list).forEach((f) => fd.append('files', f));
    setUploading(true);
    setIngestMsg(null);
    try {
      const r = await fetch('/api/ingest', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok || j.error) {
        setIngestMsg({ kind: 'err', text: j.error ?? `Upload failed (${r.status})` });
      } else {
        const n = j.files?.length ?? 0;
        setIngestMsg({ kind: 'ok', text: `Ingested ${n} file${n === 1 ? '' : 's'} · ${j.status}` });
        await refreshConfig();
      }
    } catch (e) {
      setIngestMsg({ kind: 'err', text: String((e as Error)?.message ?? e) });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput('');
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <div>
            <h1>Foundry RAG</h1>
            <p className="sub">Grounded chat on an OpenChoreo-provisioned Foundry stack</p>
          </div>
        </div>
        <div className="badges">
          <span className="badge model">
            <span className="pip" />
            <span className="k">model</span>&nbsp;<code>{model}</code>
          </span>
          <span className="badge">
            <span className="pip" />
            <span className="k">vector store</span>&nbsp;
            <code>{store?.name ?? vectorStoreId}</code>
            <span className="k">· {docCount} docs</span>
          </span>
        </div>
      </header>

      <div className="layout">
        {/* ---- Knowledge base ---- */}
        <section className="panel kb">
          <div className="panel-head">
            <h2>Knowledge base</h2>
            <div className="meta">
              {store ? `${store.counts.total} indexed · status ${store.status}` : 'unavailable'}
            </div>
          </div>

          <div
            className={`dropzone${dragOver ? ' drag' : ''}`}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              ingest(e.dataTransfer.files);
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4m0 0L7 9m5-5 5 5" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            <div className="big">{uploading ? 'Ingesting…' : 'Drop files to ingest'}</div>
            <div className="small">
              {uploading ? 'uploading + indexing' : 'or click to browse · txt, md, pdf, docx…'}
            </div>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => ingest(e.target.files)}
            />
          </div>

          {ingestMsg && (
            <div className={`ingest-status ${ingestMsg.kind}`}>{ingestMsg.text}</div>
          )}
          {initialError && !store && (
            <div className="ingest-status err">Knowledge base unavailable: {initialError}</div>
          )}

          <div className="filelist">
            {files.length === 0 && <div className="empty">No documents yet.</div>}
            {files.map((f) => (
              <div className="file" key={f.id} title={f.filename}>
                <span className="fi">{(f.filename.split('.').pop() ?? '?').slice(0, 4)}</span>
                <span className="name">{f.filename}</span>
                {f.bytes > 0 && <span className="fsize">{formatBytes(f.bytes)}</span>}
                <span className={`st ${f.status}`} title={f.status} />
              </div>
            ))}
          </div>
        </section>

        {/* ---- Chat ---- */}
        <section className="panel chat">
          <div className="panel-head">
            <h2>Chat</h2>
            <div className="meta">
              Answered by <code>{model}</code>, grounded on {docCount} document
              {docCount === 1 ? '' : 's'} via file_search
            </div>
          </div>

          <div className="messages">
            {messages.length === 0 && (
              <div className="empty-chat">
                <h3>Ask about your documents</h3>
                <div>
                  Every answer runs a file_search over the vector store and cites the chunks it
                  used.
                </div>
                <div className="suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => !busy && sendMessage({ text: s })}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <MessageView key={m.id} role={m.role} parts={m.parts as unknown[]} />
            ))}

            {status === 'submitted' && (
              <div className="msg assistant">
                <div className="avatar">AI</div>
                <div className="body">
                  <div className="typing">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && <div className="err-banner">Error: {error.message}</div>}

          <div className="composer">
            <textarea
              rows={1}
              placeholder="Ask about the ingested documents…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            {busy ? (
              <button className="stop" onClick={() => stop()}>
                Stop
              </button>
            ) : (
              <button onClick={submit} disabled={!input.trim()}>
                Send
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function MessageView({ role, parts }: { role: string; parts: unknown[] }) {
  const isUser = role === 'user';
  const sources: SourcePart[] = [];

  const rendered = parts.map((raw, i) => {
    const part = raw as AnyPart;
    if (part.type === 'text') {
      return part.text ? (
        <span className="bubble" key={i}>
          {part.text}
        </span>
      ) : null;
    }
    if (part.type === 'source-document' || part.type === 'source-url') {
      sources.push(part);
      return null;
    }
    if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
      return <ToolCall key={i} part={part} />;
    }
    return null;
  });

  return (
    <div className={`msg ${isUser ? 'user' : 'assistant'}`}>
      <div className="avatar">{isUser ? 'You' : 'AI'}</div>
      <div className="body">
        <div className="who">{isUser ? 'You' : 'Assistant'}</div>
        {rendered}
        {sources.length > 0 && <Sources items={sources} />}
      </div>
    </div>
  );
}

function ToolCall({ part }: { part: AnyPart }) {
  const searching = part.state === 'input-streaming' || part.state === 'input-available';

  if (part.state === 'output-error') {
    return (
      <div className="tool err">
        <div style={{ padding: '9px 12px' }}>Search failed: {part.errorText ?? 'unknown error'}</div>
      </div>
    );
  }

  if (searching) {
    return (
      <div className="tool">
        <div style={{ padding: '9px 12px', display: 'flex', gap: 9, alignItems: 'center' }}>
          <span className="spin" />
          <span className="tlabel">Searching the knowledge base…</span>
        </div>
      </div>
    );
  }

  const output = (part.output ?? {}) as { results?: FileSearchResult[]; queries?: string[] };
  const results = output.results ?? [];
  const queries = output.queries ?? [];

  return (
    <details className="tool">
      <summary>
        <SearchIcon />
        <span className="tlabel">Searched the knowledge base</span>
        <span className="tcount">
          · {results.length} result{results.length === 1 ? '' : 's'}
        </span>
        <span className="chev">›</span>
      </summary>
      <div className="results">
        {queries.length > 0 && (
          <div className="queries">
            <b>Queries:</b> {queries.join(' · ')}
          </div>
        )}
        {results.length === 0 && <div className="queries">No chunks returned.</div>}
        {results.map((r, i) => (
          <div className="result" key={i}>
            <div className="rhead">
              <span className="rname">{r.filename ?? r.fileId ?? 'chunk'}</span>
              {typeof r.score === 'number' && (
                <span className="rscore">score {r.score.toFixed(2)}</span>
              )}
            </div>
            {r.text && <div className="rtext">{truncate(r.text, 320)}</div>}
          </div>
        ))}
      </div>
    </details>
  );
}

function Sources({ items }: { items: SourcePart[] }) {
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const s of items) {
    const label = s.title ?? s.filename ?? s.url ?? s.sourceId ?? 'source';
    if (!seen.has(label)) {
      seen.add(label);
      uniq.push(label);
    }
  }
  if (uniq.length === 0) return null;
  return (
    <div className="sources">
      {uniq.map((label, i) => (
        <span className="cite" key={i}>
          <span className="num">{i + 1}</span>
          {label}
        </span>
      ))}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

type FileSearchResult = {
  fileId?: string;
  filename?: string;
  text?: string;
  score?: number;
};

type SourcePart = {
  type: string;
  title?: string;
  filename?: string;
  url?: string;
  sourceId?: string;
};

type AnyPart = {
  type: string;
  text?: string;
  state?: string;
  output?: unknown;
  errorText?: string;
  title?: string;
  filename?: string;
  url?: string;
  sourceId?: string;
};
