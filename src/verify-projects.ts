import { createPreset } from './ui/presets';
import { deleteProject, exportProject, importProject, listProjects, saveProject, type Project } from './domain/projects';
import { exportTopology } from './domain/serialization';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
} as Storage;

const topology = createPreset();
topology.producers[0].position = { x: -320, y: 144 };
const project: Project = {
  format: 'trama-project/v1', id: 'project-1', name: 'Meu fluxo',
  savedAt: new Date().toISOString(), topology, view: { x: -52, y: 118, scale: .75 },
};
saveProject(project, storage);
const reopened = listProjects(storage)[0];
assert(reopened.name === 'Meu fluxo' && reopened.view.scale === .75, 'Projeto local perdeu nome ou zoom');
assert(reopened.topology.producers[0].position.x === -320, 'Projeto local perdeu a posição do card');
assert(JSON.stringify(importProject(exportProject(project)).topology) === JSON.stringify(topology), 'Exportação perdeu o fluxo');
assert(importProject(exportTopology(topology)).topology.format === 'aws-queue-simulator/v1', 'Topologia anterior não foi aceita');
const broken = JSON.parse(exportProject(project));
broken.topology.producers[0].production = { intervalMs: -1 };
let rejected = false;
try { importProject(JSON.stringify(broken)); } catch { rejected = true; }
assert(rejected, 'Projeto inválido foi aceito');
assert(listProjects(storage).length === 1, 'Falha na importação alterou os projetos locais');
deleteProject(project.id, storage);
assert(listProjects(storage).length === 0, 'Projeto excluído ainda aparece na lista');
console.log('PASS projects: save, reopen, export, import, legacy topology, invalid file and delete');
