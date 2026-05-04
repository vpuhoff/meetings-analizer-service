import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams, ValueFormatterParams, ValueGetterParams } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { KBDocument, subscribeKBDocuments, saveKBDocument, deleteKBDocument } from '../services/meetingService';
import KBViewModal from './KBViewModal';
import KBEditorModal from './KBEditorModal';
import { v4 as uuidv4 } from 'uuid';

ModuleRegistry.registerModules([AllCommunityModule]);

// ── Cell Renderers ────────────────────────────────────────────────

const TagsPillRenderer = ({ value, color }: { value: string[]; color: 'purple' | 'blue' }) => {
  const colorClass = color === 'purple'
    ? 'bg-purple-100 text-purple-700'
    : 'bg-blue-100 text-blue-700';
  const shown = value?.slice(0, 2) ?? [];
  const extra = (value?.length ?? 0) - shown.length;
  return (
    <div className="flex flex-wrap gap-1 items-center h-full py-1">
      {shown.map(tag => (
        <span key={tag} className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${colorClass}`}>{tag}</span>
      ))}
      {extra > 0 && (
        <span title={value.slice(2).join(', ')} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 cursor-default">
          +{extra}
        </span>
      )}
    </div>
  );
};

const SyncStatusRenderer = ({ value }: { value: KBDocument['sync_status'] }) => {
  const map = {
    synced: { label: 'Synced', cls: 'bg-emerald-100 text-emerald-700' },
    pending: { label: 'Pending', cls: 'bg-yellow-100 text-yellow-700' },
    out_of_sync: { label: 'Out of sync', cls: 'bg-red-100 text-red-600' },
  };
  const s = map[value] ?? map.out_of_sync;
  return (
    <div className="flex items-center h-full">
      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────

interface KnowledgeBaseProps {
  userId: string;
}

const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({ userId }) => {
  const [rows, setRows] = useState<KBDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDoc, setViewDoc] = useState<KBDocument | null>(null);
  const [editingDoc, setEditingDoc] = useState<KBDocument | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const gridRef = useRef<AgGridReact>(null);

  useEffect(() => {
    const unsub = subscribeKBDocuments(userId, (docs) => {
      setRows(docs);
      setLoading(false);
    });
    return unsub;
  }, [userId]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this KB document?')) return;
    await deleteKBDocument(id);
  }, []);

  const handleSync = useCallback(async (doc: KBDocument) => {
    setSyncing(doc.id);
    try {
      await saveKBDocument({ ...doc, sync_status: 'pending', updated_at: Date.now() });
      // TODO: call OpenAI Vector Store push here
      await saveKBDocument({ ...doc, sync_status: 'synced', updated_at: Date.now() });
    } finally {
      setSyncing(null);
    }
  }, []);

  const ActionsRenderer = useCallback((params: ICellRendererParams) => {
    const doc: KBDocument = params.data;
    return (
      <div className="flex items-center gap-1.5 h-full">
        <button
          onClick={() => setViewDoc(doc)}
          title="View"
          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-brand-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
        <button
          onClick={() => setEditingDoc(doc)}
          title="Edit"
          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-brand-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
        <button
          onClick={() => handleSync(doc)}
          title="Push to OpenAI"
          disabled={doc.sync_status === 'synced' || syncing === doc.id}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-emerald-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </button>
        <button
          onClick={() => handleDelete(doc.id)}
          title="Delete"
          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-red-500 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    );
  }, [handleDelete, handleSync, syncing, setViewDoc, setEditingDoc]);

  const colDefs: ColDef<KBDocument>[] = [
    {
      field: 'title',
      headerName: 'Title',
      pinned: 'left',
      minWidth: 220,
      flex: 2,
      filter: 'agTextColumnFilter',
      cellRenderer: (params: ICellRendererParams) => (
        <button
          onClick={() => setViewDoc(params.data)}
          className="text-brand-600 hover:text-brand-800 font-medium text-left truncate w-full"
        >
          {params.value}
        </button>
      ),
    },
    {
      field: 'project_name',
      headerName: 'Project',
      minWidth: 140,
      flex: 1,
      filter: 'agTextColumnFilter',
    },
    {
      field: 'systems',
      headerName: 'Systems',
      minWidth: 180,
      flex: 1.5,
      filter: 'agTextColumnFilter',
      valueGetter: (params: ValueGetterParams<KBDocument>) => (params.data?.systems ?? []).join(', '),
      cellRenderer: (params: ICellRendererParams) => (
        <TagsPillRenderer value={params.data?.systems ?? []} color="purple" />
      ),
    },
    {
      field: 'topics',
      headerName: 'Topics',
      minWidth: 200,
      flex: 1.5,
      filter: 'agTextColumnFilter',
      valueGetter: (params: ValueGetterParams<KBDocument>) => (params.data?.topics ?? []).join(', '),
      cellRenderer: (params: ICellRendererParams) => (
        <TagsPillRenderer value={params.data?.topics ?? []} color="blue" />
      ),
    },
    {
      field: 'updated_at',
      headerName: 'Updated',
      minWidth: 130,
      sort: 'desc',
      filter: 'agDateColumnFilter',
      valueFormatter: (params: ValueFormatterParams) =>
        params.value ? new Date(params.value).toLocaleDateString('ru-RU') : '—',
    },
    {
      field: 'sync_status',
      headerName: 'Sync Status',
      minWidth: 130,
      filter: 'agTextColumnFilter',
      cellRenderer: (params: ICellRendererParams) => <SyncStatusRenderer value={params.value} />,
    },
    {
      headerName: 'Actions',
      pinned: 'right',
      minWidth: 150,
      maxWidth: 150,
      sortable: false,
      filter: false,
      cellRenderer: ActionsRenderer,
    },
  ];

  const handleAddNew = () => {
    const blank: KBDocument = {
      id: uuidv4(),
      userId,
      meeting_id: '',
      project_id: '',
      project_name: '',
      title: 'New Document',
      content: '',
      systems: [],
      topics: [],
      sync_status: 'out_of_sync',
      openai_file_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    setEditingDoc(blank);
  };

  return (
    <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 13rem)' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Knowledge Base</h2>
          <p className="text-sm text-slate-500">{rows.length} document{rows.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => gridRef.current?.api?.setGridOption('quickFilterText', '')}
            className="px-3 py-1.5 text-sm text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Clear Filters
          </button>
          <button
            onClick={handleAddNew}
            className="px-4 py-1.5 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
          >
            + New Document
          </button>
        </div>
      </div>

      {/* AG Grid */}
      <div className="ag-theme-alpine flex-1 rounded-xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: '100%' }}>
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-400">Loading...</div>
        ) : (
          <AgGridReact
            ref={gridRef}
            rowData={rows}
            columnDefs={colDefs}
            defaultColDef={{ sortable: true, resizable: true }}
            rowHeight={48}
            headerHeight={44}
            pagination
            paginationPageSize={25}
            paginationPageSizeSelector={[25, 50, 100]}
            suppressCellFocus
          />
        )}
      </div>

      {/* View Modal */}
      {viewDoc && !editingDoc && (
        <KBViewModal
          doc={viewDoc}
          onClose={() => setViewDoc(null)}
          onEdit={() => { setEditingDoc(viewDoc); setViewDoc(null); }}
        />
      )}

      {/* Editor Modal */}
      {editingDoc && (
        <KBEditorModal
          doc={editingDoc}
          onClose={() => setEditingDoc(null)}
          onSave={async (updated) => {
            await saveKBDocument(updated);
            setEditingDoc(null);
          }}
        />
      )}
    </div>
  );
};

export default KnowledgeBase;
