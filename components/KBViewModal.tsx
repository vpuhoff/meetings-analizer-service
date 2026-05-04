import React, { useState } from 'react';
import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import { KBDocument } from '../services/meetingService';

interface KBViewModalProps {
  doc: KBDocument;
  onClose: () => void;
  onEdit: () => void;
}

const syncBadge = (status: KBDocument['sync_status']) => {
  const map = {
    synced: { label: 'Synced', cls: 'bg-emerald-100 text-emerald-700' },
    pending: { label: 'Pending', cls: 'bg-yellow-100 text-yellow-700' },
    out_of_sync: { label: 'Out of sync', cls: 'bg-red-100 text-red-600' },
  };
  const s = map[status] ?? map.out_of_sync;
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.cls}`}>{s.label}</span>;
};

const KBViewModal: React.FC<KBViewModalProps> = ({ doc, onClose, onEdit }) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0 gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-slate-800 mb-2">{doc.title}</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {doc.project_name && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                  📁 {doc.project_name}
                </span>
              )}
              {doc.systems.map(s => (
                <span key={s} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-100 text-purple-700">{s}</span>
              ))}
              {doc.topics.map(t => (
                <span key={t} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700">{t}</span>
              ))}
              {syncBadge(doc.sync_status)}
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

        {/* Body — read-only MDXEditor */}
        <div className="flex-1 overflow-y-auto">
          <MDXEditor
            key={doc.id}
            markdown={doc.content}
            readOnly
            plugins={[
              headingsPlugin(),
              listsPlugin(),
              quotePlugin(),
              tablePlugin(),
              thematicBreakPlugin(),
            ]}
            contentEditableClassName="prose prose-slate max-w-none px-6 py-4 focus:outline-none"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0 rounded-b-2xl">
          <p className="text-xs text-slate-400">
            Updated: {new Date(doc.updated_at).toLocaleString('ru-RU')}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={onEdit}
              className="px-5 py-2 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KBViewModal;
