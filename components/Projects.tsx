import React, { useState, useEffect } from 'react';
import { Project } from '../types';
import { getProjects, saveProject, deleteProject } from '../services/meetingService';
import { v4 as uuidv4 } from 'uuid';

interface ProjectsProps {
  userId: string;
  onSelectProject: (project: Project | null) => void;
  selectedProjectId?: string;
}

const Projects: React.FC<ProjectsProps> = ({ userId, onSelectProject, selectedProjectId }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    context: '',
    team: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadProjects();
  }, [userId]);

  const loadProjects = async () => {
    setIsLoading(true);
    setError('');
    try {
      const loadedProjects = await getProjects(userId);
      setProjects(loadedProjects);
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setIsEditing(false);
    setEditingProject(null);
    setFormData({ name: '', description: '', context: '', team: '' });
  };

  const handleEdit = (project: Project) => {
    setIsEditing(true);
    setIsCreating(false);
    setEditingProject(project);
    setFormData({
      name: project.name,
      description: project.description || '',
      context: project.context,
      team: project.team || ''
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.context.trim()) {
      setError('Name and context are required');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const now = new Date().toISOString();
      const projectData: Partial<Project> & { id: string } = {
        id: isCreating ? uuidv4() : editingProject!.id,
        userId,
        name: formData.name,
        context: formData.context,
        createdAt: isCreating ? now : editingProject!.createdAt,
        updatedAt: now
      };

      // Only add optional fields if they have values
      if (formData.description) {
        (projectData as any).description = formData.description;
      }
      if (formData.team) {
        (projectData as any).team = formData.team;
      }

      await saveProject(projectData);
      setIsCreating(false);
      setIsEditing(false);
      setEditingProject(null);
      setFormData({ name: '', description: '', context: '', team: '' });
      await loadProjects();
    } catch (err: any) {
      setError(err.message || 'Failed to save project');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    
    setIsLoading(true);
    setError('');
    try {
      await deleteProject(projectId);
      if (selectedProjectId === projectId) {
        onSelectProject(null);
      }
      await loadProjects();
    } catch (err: any) {
      setError(err.message || 'Failed to delete project');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setIsCreating(false);
    setIsEditing(false);
    setEditingProject(null);
    setFormData({ name: '', description: '', context: '', team: '' });
    setError('');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Projects</h2>
        {!isCreating && !isEditing && (
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
          >
            + New Project
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {(isCreating || isEditing) && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">
            {isCreating ? 'Create New Project' : 'Edit Project'}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Project Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="My Project"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                rows={2}
                placeholder="Brief description of the project"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Context *</label>
              <textarea
                value={formData.context}
                onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                rows={3}
                placeholder="Project context, goals, background information..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Team</label>
              <input
                type="text"
                value={formData.team}
                onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="Team members (comma separated)"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={isLoading}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading && !isCreating && !isEditing && (
        <div className="text-center py-8 text-slate-500">Loading projects...</div>
      )}

      {!isLoading && projects.length === 0 && !isCreating && !isEditing && (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 mb-4">No projects yet. Create your first project to get started!</p>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
          >
            + Create Project
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {projects.map((project) => (
          <div
            key={project.id}
            className={`bg-white rounded-xl shadow-sm border-2 p-6 cursor-pointer transition-all hover:shadow-lg hover:scale-[1.01] ${
              selectedProjectId === project.id ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-200'
            }`}
            onClick={() => onSelectProject(project)}
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-bold text-slate-800 text-xl">{project.name}</h3>
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(project);
                  }}
                  className="text-brand-600 hover:text-brand-800 hover:bg-brand-50 px-3 py-1.5 rounded text-sm font-medium transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(project.id);
                  }}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded text-sm font-medium transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
            {project.description && (
              <p className="text-sm text-slate-600 mb-4 line-clamp-2">{project.description}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Context</p>
                <p className="text-sm text-slate-700 line-clamp-3">{project.context}</p>
              </div>
              {project.team && (
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Team</p>
                  <p className="text-sm text-slate-700">{project.team}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Projects;
