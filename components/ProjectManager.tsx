import React, { useState, useRef } from 'react';
import { Project } from '../types';
import { importProjectsFromFile } from '../services/projectService';

interface ProjectManagerProps {
  projects: Project[];
  onAdd: (project: Project) => void;
  onUpdate: (project: Project) => void;
  onDelete: (id: string) => void;
  onImport: (projects: Project[]) => void;
  onExport: () => void;
  isOpen: boolean;
  onClose: () => void;
}

const ProjectManager: React.FC<ProjectManagerProps> = ({ 
  projects, onAdd, onUpdate, onDelete, onImport, onExport, isOpen, onClose 
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', context: '', team: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingId) {
      const existing = projects.find(p => p.id === editingId);
      if (existing) {
        onUpdate({ 
          ...existing, 
          name: formData.name, 
          context: formData.context,
          team: formData.team 
        });
      }
      setEditingId(null);
    } else {
      onAdd({
        id: crypto.randomUUID(),
        name: formData.name,
        context: formData.context,
        team: formData.team
      });
    }
    setFormData({ name: '', context: '', team: '' });
  };

  const handleEdit = (project: Project) => {
    setEditingId(project.id);
    setFormData({ 
      name: project.name, 
      context: project.context,
      team: project.team || '' 
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({ name: '', context: '', team: '' });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      try {
        const imported = await importProjectsFromFile(e.target.files[0]);
        onImport(imported);
        alert(`Successfully imported ${imported.length} projects.`);
      } catch (err) {
        alert("Failed to import projects. Check file format.");
        console.error(err);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-8 animate-fade-in">
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
        <h3 className="font-semibold text-slate-800 flex items-center">
          <svg className="w-5 h-5 mr-2 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Project Context Manager
        </h3>
        <div className="flex gap-2">
           <button 
             onClick={() => fileInputRef.current?.click()}
             className="text-xs px-3 py-1.5 bg-white border border-slate-300 text-slate-600 rounded hover:bg-slate-50 font-medium transition-colors shadow-sm"
           >
             Import JSON
           </button>
           <button 
             onClick={onExport}
             className="text-xs px-3 py-1.5 bg-white border border-slate-300 text-slate-600 rounded hover:bg-slate-50 font-medium transition-colors shadow-sm"
           >
             Export JSON
           </button>
           <button onClick={onClose} className="text-slate-400 hover:text-slate-600 ml-2">
             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
             </svg>
           </button>
        </div>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8 bg-slate-50/50">
        
        {/* Project List */}
        <div className="lg:col-span-1 space-y-4 max-h-96 overflow-y-auto custom-scrollbar pr-2">
           {projects.length === 0 ? (
               <p className="text-sm text-slate-400 italic text-center py-4">No projects defined.</p>
           ) : (
               projects.map(p => (
                   <div key={p.id} className={`p-3 rounded-lg border ${editingId === p.id ? 'border-brand-500 bg-brand-50 shadow-md' : 'border-slate-200 bg-white hover:border-brand-300 shadow-sm'} transition-all`}>
                       <div className="flex justify-between items-start mb-1">
                           <h4 className="font-semibold text-sm text-slate-800">{p.name}</h4>
                           <div className="flex space-x-1">
                               <button onClick={() => handleEdit(p)} className="text-slate-400 hover:text-brand-600 p-1">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                               </button>
                               <button onClick={() => onDelete(p.id)} className="text-slate-400 hover:text-red-600 p-1">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                               </button>
                           </div>
                       </div>
                       <p className="text-xs text-slate-500 line-clamp-2">{p.context}</p>
                       {p.team && <p className="text-xs text-slate-400 mt-1 truncate">Team: {p.team}</p>}
                   </div>
               ))
           )}
        </div>

        {/* Edit/Create Form */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4 pb-2 border-b border-slate-100">
                {editingId ? 'Edit Project' : 'Add New Project'}
            </h4>
            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Project Name</label>
                    <input 
                        type="text" 
                        required
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-transparent shadow-sm transition-all"
                        placeholder="e.g. Phoenix Redesign"
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Context & Terminology</label>
                      <textarea 
                          required
                          value={formData.context}
                          onChange={e => setFormData({...formData, context: e.target.value})}
                          className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-transparent shadow-sm transition-all h-32 resize-y"
                          placeholder="Define acronyms, tech stack details, or specific instructions here."
                      />
                  </div>
                  <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Team Members (Optional)</label>
                      <textarea 
                          value={formData.team}
                          onChange={e => setFormData({...formData, team: e.target.value})}
                          className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-transparent shadow-sm transition-all h-32 resize-y"
                          placeholder="List team members and their roles.&#10;e.g.&#10;Alice - Backend Lead&#10;Bob - PM&#10;Charlie - Frontend"
                      />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                    {editingId && (
                        <button 
                            type="button" 
                            onClick={handleCancelEdit}
                            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-md font-medium transition-colors"
                        >
                            Cancel
                        </button>
                    )}
                    <button 
                        type="submit"
                        className="px-6 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5"
                    >
                        {editingId ? 'Update Project' : 'Create Project'}
                    </button>
                </div>
            </form>
        </div>
      </div>
    </div>
  );
};

export default ProjectManager;