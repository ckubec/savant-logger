'use client';

import { useEffect, useState } from 'react';

interface Project {
  id: number;
  name: string;
  created_at: string;
}

interface ProjectSelectorProps {
  onProjectSelect: (projectId: number | null) => void;
  onCaptureSelect: (captureId: number | null) => void;
  selectedProjectId?: number;
  refreshTrigger?: number;
}

export function ProjectSelector({ 
  onProjectSelect, 
  onCaptureSelect, 
  selectedProjectId,
  refreshTrigger = 0 
}: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:8000/projects')
      .then(response => response.json())
      .then(data => {
        setProjects(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching projects:', error);
        setLoading(false);
      });
  }, [refreshTrigger]);

  // Auto-select project when selectedProjectId changes
  useEffect(() => {
    if (selectedProjectId) {
      onProjectSelect(selectedProjectId);
    }
  }, [selectedProjectId, onProjectSelect]);

  if (loading) {
    return <div>Loading projects...</div>;
  }

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Select Project
      </label>
      <select
        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        onChange={(e) => {
          const projectId = e.target.value ? parseInt(e.target.value) : null;
          onProjectSelect(projectId);
          onCaptureSelect(null);
        }}
        value={selectedProjectId || ""}
      >
        <option value="">Select a project</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </div>
  );
} 