import { Project } from '../types';

const STORAGE_KEY = 'meeting-intel-projects';

export const getProjects = (): Project[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Failed to load projects", e);
    return [];
  }
};

export const saveProjects = (projects: Project[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error("Failed to save projects", e);
  }
};

export const exportProjectsToFile = (projects: Project[]) => {
  const dataStr = JSON.stringify(projects, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `meeting-intel-projects-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const importProjectsFromFile = (file: File): Promise<Project[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (Array.isArray(json)) {
            // Basic validation
            const valid = json.every(p => 
              p.id && 
              p.name && 
              typeof p.context === 'string' &&
              (p.team === undefined || typeof p.team === 'string')
            );
            if(valid) resolve(json);
            else reject(new Error("Invalid project format"));
        } else {
          reject(new Error("File content is not an array"));
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
};