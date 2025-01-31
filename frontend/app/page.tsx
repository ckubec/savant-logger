'use client';

import { useState } from 'react';
import { FileUploader } from './components/FileUploader';
import { DeviceTable } from './components/DeviceTable';
import { ProjectSelector } from './components/ProjectSelector';

export default function Home() {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [selectedCapture, setSelectedCapture] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadSuccess = (projectId: number, projectName: string) => {
    // Trigger project list refresh
    setRefreshTrigger(prev => prev + 1);
    // Auto-select the uploaded project
    setSelectedProject(projectId);
    setSelectedCapture(null);
  };

  return (
    <main className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-8">Savant Log Analyzer</h1>
      
      <div className="mb-8">
        <FileUploader onUploadSuccess={handleUploadSuccess} />
      </div>

      <div className="mb-8">
        <ProjectSelector 
          onProjectSelect={setSelectedProject}
          onCaptureSelect={setSelectedCapture}
          selectedProjectId={selectedProject}
          refreshTrigger={refreshTrigger}
        />
      </div>

      {selectedProject && (
        <DeviceTable 
          projectId={selectedProject} 
          captureId={selectedCapture}
        />
      )}
    </main>
  );
} 