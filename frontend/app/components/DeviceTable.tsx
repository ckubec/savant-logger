'use client';

import { useEffect, useState, useMemo } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

interface DeviceData {
  id: number;
  device_id: string;
  current: {
    network_data: {
      ip: string;
      state: string;
      rssi: string;
      devicetype: string;
    };
    health_data: {
      deviceName: string;
      reason: string;
      overallHealthRate: string;
    };
    capture_timestamp: string;
  };
  previous?: {
    network_data: {
      ip: string;
      state: string;
      rssi: string;
      devicetype: string;
    };
    health_data: {
      deviceName: string;
      reason: string;
      overallHealthRate: string;
    };
    capture_timestamp: string;
  };
  related_crashes?: {
    process: string;
    timestamp: string;
    content: string;
  }[];
  lighting_history?: {
    state: string;
    timestamp: string;
  }[];
  system_stats?: string;
  wifi_data?: string;
}

interface DeviceTableProps {
  projectId: number;
  captureId: number | null;
}

export function DeviceTable({ projectId, captureId }: DeviceTableProps) {
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState<string>('');
  const [nameFilter, setNameFilter] = useState<string>('');
  const [sortField, setSortField] = useState<string>('state');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const url = `http://localhost:8000/project/${projectId}/devices${captureId ? `?capture_id=${captureId}` : ''}`;
    
    fetch(url)
      .then(response => response.json())
      .then(data => {
        setDevices(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching devices:', error);
        setLoading(false);
      });
  }, [projectId, captureId]);

  const filteredDevices = useMemo(() => {
    return devices.filter(device => {
      const matchesState = !stateFilter || 
        device.current.network_data.state.toLowerCase().includes(stateFilter.toLowerCase());
      const matchesName = !nameFilter || 
        device.current.health_data?.deviceName.toLowerCase().includes(nameFilter.toLowerCase());
      return matchesState && matchesName;
    });
  }, [devices, stateFilter, nameFilter]);

  const getDiffStyle = (current: string, previous?: string) => {
    if (!previous || current === previous) return {};
    return {
      backgroundColor: current === 'found' ? 'bg-green-100' : 'bg-red-100',
      position: 'relative' as const
    };
  };

  const renderDiffValue = (current: string, previous?: string) => {
    if (!previous || current === previous) return current;
    return (
      <div className="group relative">
        <span>{current}</span>
        <span className="absolute bottom-full left-0 hidden group-hover:block bg-gray-800 text-white p-2 rounded text-sm">
          Previous: {previous}
        </span>
      </div>
    );
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedDevices = useMemo(() => {
    return [...filteredDevices].sort((a, b) => {
      let aValue = '';
      let bValue = '';

      switch (sortField) {
        case 'state':
          aValue = a.current.network_data.state;
          bValue = b.current.network_data.state;
          break;
        case 'name':
          aValue = a.current.health_data?.deviceName || '';
          bValue = b.current.health_data?.deviceName || '';
          break;
        // Add more cases for other fields
      }

      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    });
  }, [filteredDevices, sortField, sortDirection]);

  if (loading) {
    return <div>Loading devices...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Filter by State</label>
          <input
            type="text"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            placeholder="Enter state..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Filter by Name</label>
          <input
            type="text"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            placeholder="Enter device name..."
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center">
                  Device Name
                  {sortField === 'name' && (
                    sortDirection === 'asc' ? <ChevronUpIcon className="w-4 h-4 ml-1" /> : <ChevronDownIcon className="w-4 h-4 ml-1" />
                  )}
                </div>
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('state')}
              >
                <div className="flex items-center">
                  State
                  {sortField === 'state' && (
                    sortDirection === 'asc' ? <ChevronUpIcon className="w-4 h-4 ml-1" /> : <ChevronDownIcon className="w-4 h-4 ml-1" />
                  )}
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">RSSI</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Health Rate</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedDevices.map((device) => (
              <tr key={device.id} className="group hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {device.current.health_data?.deviceName}
                </td>
                <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                  getDiffStyle(
                    device.current.network_data.state,
                    device.previous?.network_data.state
                  ).backgroundColor
                }`}>
                  {renderDiffValue(
                    device.current.network_data.state,
                    device.previous?.network_data.state
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {device.current.network_data.ip}
                </td>
                <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                  getDiffStyle(
                    device.current.network_data.rssi,
                    device.previous?.network_data.rssi
                  ).backgroundColor
                }`}>
                  {renderDiffValue(
                    device.current.network_data.rssi,
                    device.previous?.network_data.rssi
                  )}
                </td>
                <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                  getDiffStyle(
                    device.current.health_data?.overallHealthRate,
                    device.previous?.health_data?.overallHealthRate
                  ).backgroundColor
                }`}>
                  {renderDiffValue(
                    `${device.current.health_data?.overallHealthRate}%`,
                    device.previous?.health_data?.overallHealthRate && `${device.previous.health_data.overallHealthRate}%`
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {device.current.health_data?.reason}
                  {device.related_crashes && (
                    <CrashDetails crashes={device.related_crashes} />
                  )}
                  {device.lighting_history && device.current.network_data.state !== 'found' && (
                    <div className="mt-2 text-sm">
                      <div className="font-semibold text-gray-600">Recent History:</div>
                      <div className="space-y-1">
                        {device.lighting_history.slice(0, 5).map((entry, i) => (
                          <div key={i} className="text-gray-500">
                            {new Date(entry.timestamp).toLocaleString()}: {entry.state}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CrashDetails({ crashes }: { crashes: DeviceData['related_crashes'] }) {
  if (!crashes?.length) return null;

  return (
    <div className="mt-2 text-sm">
      <div className="font-semibold text-red-600">Related Crashes:</div>
      {crashes.map((crash, i) => (
        <div key={i} className="mt-1 p-2 bg-red-50 rounded">
          <div>Process: {crash.process}</div>
          <div>Time: {crash.timestamp}</div>
          <button
            className="text-blue-600 hover:text-blue-800"
            onClick={() => {
              const modal = document.createElement('div');
              modal.innerHTML = `<pre>${crash.content}</pre>`;
              modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;max-height:80vh;overflow:auto;';
              document.body.appendChild(modal);
              modal.onclick = () => modal.remove();
            }}
          >
            View Details
          </button>
        </div>
      ))}
    </div>
  );
} 