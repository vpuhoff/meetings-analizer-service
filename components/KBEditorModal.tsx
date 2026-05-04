import React, { useState } from 'react';
import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  InsertTable,
  ListsToggle,
  UndoRedo,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import { KBDocument } from '../services/meetingService';

interface KBEditorModalProps {
  doc: KBDocument;
  onClose: () => void;
  onSave: (updated: KBDocument) => Promise<void>;
}

function normalizeContent(s: string): string {
  return s.replace(/\\n/g, '\n');
}

const KBEditorModal: React.FC<KBEditorModalProps> = ({ doc, onClose, onSave }) => {
  const [markdown, setMarkdown] = useState(() => normalizeContent(doc.content));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...doc, content: markdown, sync_status: 'out_of_sync', updated_at: Date.now() });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-lg font-bold text-slate-800 truncate">{doc.title}</h2>
            <div className="flex flex-wrap gap-1 mt-1">
              {doc.systems.map(s => (
                <span key={s} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-100 text-purple-700">{s}</span>
              ))}
              {doc.topics.map(t => (
                <span key={t} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700">{t}</span>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — MDXEditor */}
        <div className="flex-1 overflow-y-auto">
          <MDXEditor
            key={doc.id}
            markdown={markdown}
            onChange={setMarkdown}
            plugins={[
              headingsPlugin(),
              listsPlugin(),
              quotePlugin(),
              tablePlugin(),
              thematicBreakPlugin(),
              toolbarPlugin({
                toolbarContents: () => (
                  <>
                    <UndoRedo />
                    <BoldItalicUnderlineToggles />
                    <BlockTypeSelect />
                    <ListsToggle />
                    <CreateLink />
                    <InsertTable />
                  </>
                ),
              }),
            ]}
            contentEditableClassName="prose prose-slate max-w-none px-6 py-4 min-h-[300px] focus:outline-none"
          />
        </div>

        {/* Footer */}
        {error && (
          <div className="px-6 py-2 text-sm text-red-600 bg-red-50 border-t border-red-100">{error}</div>
        )}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0 rounded-b-2xl">
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
    </div>
  );
};

export default KBEditorModal;
