import React, { useState, useEffect } from 'react';
import { KBDocument, saveKBDocument } from '../services/meetingService';

interface KBDocumentDrawerProps {
  doc: KBDocument | null;
  onClose: () => void;
  onSaved: (doc: KBDocument) => void;
}

function parseTagInput(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

const KBDocumentDrawer: React.FC<KBDocumentDrawerProps> = ({ doc, onClose, onSaved }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [systems, setSystems] = useState('');
  const [topics, setTopics] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (doc) {
      setTitle(doc.title);
      setContent(doc.content);
      setSystems(doc.systems.join(', '));
      setTopics(doc.topics.join(', '));
      setError(null);
    }
  }, [doc]);

  if (!doc) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated: KBDocument = {
        ...doc,
        title,
        content,
        systems: parseTagInput(systems),
        topics: parseTagInput(topics),
        sync_status: 'out_of_sync',
        updated_at: Date.now(),
      };
      await saveKBDocument(updated);
      onSaved(updated);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-800 truncate pr-4">{doc.title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          {/* Systems */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Systems <span className="normal-case font-normal">(comma separated)</span></label>
            <input
              type="text"
              value={systems}
              onChange={e => setSystems(e.target.value)}
              placeholder="Jenkins, OneWork, Kafka..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          {/* Topics */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Topics <span className="normal-case font-normal">(comma separated)</span></label>
            <input
              type="text"
              value={topics}
              onChange={e => setTopics(e.target.value)}
              placeholder="Authorization, 503 errors, Deploy..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          {/* Content (markdown) */}
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Content <span className="normal-case font-normal">(Markdown)</span></label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={18}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-y"
            />
          </div>

          {/* Meta */}
          <div className="text-xs text-slate-400 space-y-0.5">
            <p>Meeting ID: <span className="font-mono">{doc.meeting_id || '—'}</span></p>
            <p>Created: {new Date(doc.created_at).toLocaleString()}</p>
            <p>Updated: {new Date(doc.updated_at).toLocaleString()}</p>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
};

export default KBDocumentDrawer;
