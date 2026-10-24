import type { AwsTopology } from './types';
import type { View } from '../ui/viewport';
import { importTopology } from './serialization';

export interface Project {
  format: 'trama-project/v1';
  id: string;
  name: string;
  savedAt: string;
  topology: AwsTopology;
  view: View;
}

const storageKey = 'trama.projects.v1';
const defaultView: View = { x: 24, y: 80, scale: 1 };

function parseProject(value: unknown): Project {
  if (!value || typeof value !== 'object') throw new Error('Arquivo de projeto inválido.');
  const data = value as Partial<Project>;
  if (data.format !== 'trama-project/v1' || typeof data.name !== 'string' || !data.name.trim() || typeof data.savedAt !== 'string' || !Number.isFinite(Date.parse(data.savedAt))) {
    throw new Error('Formato de projeto inválido ou não suportado.');
  }
  const view = data.view;
  if (!view || !Number.isFinite(view.x) || !Number.isFinite(view.y) || !Number.isFinite(view.scale) || view.scale < .25 || view.scale > 2) {
    throw new Error('Visão do projeto inválida.');
  }
  const topology = importTopology(JSON.stringify(data.topology));
  return { format: 'trama-project/v1', id: typeof data.id === 'string' ? data.id : '', name: data.name.trim(), savedAt: data.savedAt, topology, view: { ...view } };
}

export function importProject(text: string): Project {
  const parsed: unknown = JSON.parse(text);
  if (parsed && typeof parsed === 'object' && (parsed as { format?: string }).format === 'aws-queue-simulator/v1') {
    const topology = importTopology(text);
    return { format: 'trama-project/v1', id: '', name: topology.name || 'Projeto importado', savedAt: new Date().toISOString(), topology, view: { ...defaultView } };
  }
  return parseProject(parsed);
}

export function exportProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export function listProjects(storage: Storage = localStorage): Project[] {
  const raw = storage.getItem(storageKey);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Os projetos locais estão corrompidos.');
  return parsed.map(parseProject).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveProject(project: Project, storage: Storage = localStorage): void {
  const projects = listProjects(storage).filter(item => item.id !== project.id);
  projects.push(parseProject(project));
  storage.setItem(storageKey, JSON.stringify(projects));
}

export function deleteProject(id: string, storage: Storage = localStorage): void {
  storage.setItem(storageKey, JSON.stringify(listProjects(storage).filter(project => project.id !== id)));
}
