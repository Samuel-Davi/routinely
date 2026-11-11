import {
  fromLocalDateTime,
  type Priority,
  type SchedulingCommitment,
  type SchedulingPreferences,
} from '@routinely/shared';
import type { EngineTask } from '../src/routines/engine';

const TZ = 'America/Manaus';
const at = (local: string) => fromLocalDateTime(local, TZ);

export interface Scenario {
  id: string;
  description: string;
  prefs: SchedulingPreferences;
  commitments: (SchedulingCommitment & { title: string })[];
  tasks: (EngineTask & { commitment?: string })[];
  now: number;
  rangeStart: string;
  rangeEnd: string;
  instruction?: string;
}

const basePrefs: SchedulingPreferences = {
  dayStart: '07:00',
  dayEnd: '22:00',
  maxFocusBlockMinutes: 90,
  minBreakMinutes: 15,
  lunchStart: '12:00',
  lunchEnd: '13:00',
  timezone: TZ,
  travelMinutes: 0,
};

let counter = 0;
function task(
  title: string,
  priority: Priority,
  deadline: string,
  minutes: number,
  complexity: number,
  splittable = true,
  commitment?: string,
): EngineTask & { commitment?: string } {
  counter += 1;
  return {
    id: `eval-${counter}`,
    title,
    priority,
    deadline: at(deadline),
    minutes,
    complexity,
    splittable,
    commitment,
  };
}

let nextId = 0;
const commitment = (
  title: string,
  daysOfWeek: number[],
  startTime: string,
  endTime: string,
): SchedulingCommitment & { title: string } => ({
  id: `c-${(nextId += 1)}`,
  title,
  daysOfWeek,
  startTime,
  endTime,
});

/** The author's real week (classes Mon–Sat, Web Academy, Jenkins / GitHub Actions deadlines). */
const real: Scenario = {
  id: 'real',
  description:
    'Semana real: aulas de seg a sáb, Web Academy, Jenkins/GitHub Actions, prazos próximos',
  prefs: { ...basePrefs, dayEnd: '23:00', lunchEnd: '14:00' },
  commitments: [
    commitment('Momento com Deus', [0, 1, 2, 3, 4, 5, 6], '07:00', '08:00'),
    commitment('Web Academy Remoto', [6], '08:15', '11:15'),
    commitment('ESI', [0], '09:00', '11:00'),
    commitment('Aula de Ciência de Dados', [2, 4], '14:00', '16:00'),
    commitment('Aula de Reforço', [6], '14:00', '16:00'),
    commitment('Aula de Ética', [5], '16:00', '18:00'),
    commitment('Aula de CiberSegurança', [2], '16:00', '18:00'),
    commitment('Aula de Empreendedorismo', [1, 3], '16:00', '18:00'),
    commitment('Piola', [5], '17:00', '19:00'),
    commitment('Culto', [0], '18:00', '21:00'),
    commitment('Web Academy', [2, 4], '18:15', '21:15'),
    commitment('Aula de Gerência de Configuração', [1, 3], '20:00', '22:00'),
  ],
  tasks: [
    task('Escrever artigo/desenvolver o grafolão', 'HIGH', '2026-11-12T12:00', 480, 5),
    task(
      'Configurar Consumer e analisar TVs ou telas para comprar (Trabalho)',
      'HIGH',
      '2026-11-13T10:00',
      480,
      5,
    ),
    task(
      'Atividade 1 de Gerenciamento de Estado',
      'HIGH',
      '2026-11-13T23:59',
      120,
      3,
      true,
      'Web Academy',
    ),
    task(
      'Atividade 2 de Gerenciamento de Estado',
      'HIGH',
      '2026-11-16T23:59',
      240,
      4,
      true,
      'Web Academy',
    ),
    task(
      'Atividade de GitHub Actions',
      'URGENT',
      '2026-11-15T23:59',
      120,
      3,
      true,
      'Aula de Gerência de Configuração',
    ),
    task(
      'Atividade de Jenkins',
      'URGENT',
      '2026-11-15T23:59',
      180,
      4,
      true,
      'Aula de Gerência de Configuração',
    ),
    task('Desenvolvimento de Projetos', 'MEDIUM', '2026-11-20T18:00', 1200, 5),
  ],
  now: at('2026-11-11T09:00'),
  rangeStart: '2026-11-09',
  rangeEnd: '2026-11-22',
};

const workWeek = [
  commitment('Trabalho', [1, 2, 3, 4, 5], '08:00', '12:00'),
  commitment('Trabalho', [1, 2, 3, 4, 5], '13:00', '17:00'),
];

const light: Scenario = {
  id: 'light',
  description: 'Semana leve: trabalho comercial e 4 tarefas com prazos folgados',
  prefs: basePrefs,
  commitments: [...workWeek, commitment('Academia', [1, 3, 5], '18:00', '19:00')],
  tasks: [
    task('Preparar apresentação do projeto', 'HIGH', '2026-11-13T18:00', 180, 4),
    task('Revisar relatório mensal', 'MEDIUM', '2026-11-18T18:00', 90, 2),
    task('Organizar documentos do imposto', 'LOW', '2026-11-20T18:00', 120, 2),
    task('Agendar consulta médica', 'LOW', '2026-11-20T18:00', 15, 1, false),
  ],
  now: at('2026-11-09T06:00'),
  rangeStart: '2026-11-09',
  rangeEnd: '2026-11-15',
};

const crowded: Scenario = {
  id: 'crowded',
  description: 'Semana lotada: 10 tarefas, prazos apertados e duas que não cabem',
  prefs: basePrefs,
  commitments: [
    ...workWeek,
    commitment('Aula', [2, 4], '18:30', '21:00'),
    commitment('Academia', [1, 3, 5], '18:00', '19:00'),
  ],
  tasks: [
    task('Entregar relatório trimestral', 'URGENT', '2026-11-11T22:00', 240, 4),
    task('Estudar para prova de estatística', 'HIGH', '2026-11-12T20:00', 300, 5),
    task('Lista de exercícios de cálculo', 'HIGH', '2026-11-13T18:00', 150, 3),
    task('Montar slides do seminário', 'MEDIUM', '2026-11-13T12:00', 120, 3),
    task('Responder e-mails acumulados', 'LOW', '2026-11-13T18:00', 60, 1),
    task('Ler capítulos 4 e 5', 'MEDIUM', '2026-11-14T22:00', 180, 3),
    task('Corrigir bug em produção', 'URGENT', '2026-11-10T18:00', 120, 4, false),
    task('Pagar contas e organizar finanças', 'LOW', '2026-11-12T22:00', 45, 1, false),
    task('Projeto final da disciplina', 'HIGH', '2026-11-15T22:00', 600, 5),
    task('Refatorar módulo antigo', 'MEDIUM', '2026-11-11T09:00', 480, 5),
  ],
  now: at('2026-11-09T06:00'),
  rangeStart: '2026-11-09',
  rangeEnd: '2026-11-15',
};

const impossible: Scenario = {
  id: 'deadlines',
  description: 'Prazos quase impossíveis, tarefa indivisível longa e instrução do usuário',
  prefs: basePrefs,
  commitments: workWeek,
  tasks: [
    task('Fechar proposta comercial', 'URGENT', '2026-11-09T20:00', 300, 4),
    task('Workshop de 2h indivisível', 'HIGH', '2026-11-12T18:00', 120, 3, false),
    task('Documentar API', 'MEDIUM', '2026-11-10T09:00', 240, 3),
    task('Estudo sobre Kubernetes', 'MEDIUM', '2026-11-14T22:00', 360, 4),
    task('Organizar arquivos', 'LOW', '2026-11-15T22:00', 60, 1),
  ],
  now: at('2026-11-09T06:00'),
  rangeStart: '2026-11-09',
  rangeEnd: '2026-11-15',
  instruction: 'priorize o estudo de Kubernetes e deixe as manhãs de sexta livres',
};

export const SCENARIOS: Scenario[] = [real, light, crowded, impossible];
