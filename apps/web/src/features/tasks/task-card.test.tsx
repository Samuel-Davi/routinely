import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTask } from '@/test/fixtures';
import { TaskCard } from './task-card';

const handlers = () => ({
  onToggleDone: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onReestimate: vi.fn(),
});
const renderCard = (task = makeTask(), props = handlers()) => {
  render(<TaskCard task={task} timezone="America/Manaus" {...props} />);
  return props;
};

describe('TaskCard', () => {
  it('shows the task, its priority, status and local deadline', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: 'Preparar apresentação' })).toBeInTheDocument();
    expect(screen.getByText('Alta')).toBeInTheDocument();
    expect(screen.getByText('A fazer')).toBeInTheDocument();
    // 22:00Z is 18:00 in Manaus
    expect(screen.getByText(/18:00/)).toBeInTheDocument();
  });

  it('shows the AI estimate with its rationale', () => {
    renderCard();
    expect(screen.getByText('3h')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Complexidade 4 de 5' })).toBeInTheDocument();
    expect(screen.getByText('Divisível')).toBeInTheDocument();
    expect(screen.getByText('Estimado por IA')).toBeInTheDocument();
    expect(screen.getByText('Exige pesquisa e revisão.')).toBeInTheDocument();
  });

  it('shows a loading state while the AI is estimating', () => {
    renderCard(
      makeTask({
        estimationStatus: 'PENDING',
        complexity: null,
        estimatedMinutes: null,
        estimationSource: null,
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Estimando com IA…');
    expect(screen.queryByText('Estimado por IA')).not.toBeInTheDocument();
  });

  it('labels manual and heuristic estimates', () => {
    renderCard(makeTask({ estimationSource: 'MANUAL', aiRationale: null, splittable: false }));
    expect(screen.getByText('Ajustado por você')).toBeInTheDocument();
    expect(screen.getByText('Bloco único')).toBeInTheDocument();
  });

  it('offers a retry when the estimate failed', async () => {
    const task = makeTask({ estimationStatus: 'FAILED', complexity: null, estimatedMinutes: null });
    const props = renderCard(task);
    expect(screen.getByText('Não foi possível estimar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(props.onReestimate).toHaveBeenCalledWith(task);
  });

  it('toggles completion from an accessible checkbox', async () => {
    const task = makeTask();
    const props = renderCard(task);
    const checkbox = screen.getByRole('checkbox', { name: 'Concluir Preparar apresentação' });
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(props.onToggleDone).toHaveBeenCalledWith(task);
  });

  it('renders a completed task without the estimate', () => {
    renderCard(makeTask({ status: 'DONE' }));
    expect(screen.getByRole('checkbox', { name: 'Reabrir Preparar apresentação' })).toBeChecked();
    expect(screen.getByText('Concluída')).toBeInTheDocument();
    expect(screen.queryByText('Estimado por IA')).not.toBeInTheDocument();
  });

  it('flags an overdue deadline', () => {
    renderCard(makeTask({ deadline: '2020-01-01T12:00:00.000Z' }));
    expect(screen.getByText(/atrasada há/)).toBeInTheDocument();
  });

  it('exposes edit and delete actions by name', async () => {
    const task = makeTask();
    const props = renderCard(task);
    await userEvent.click(screen.getByRole('button', { name: 'Editar Preparar apresentação' }));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir Preparar apresentação' }));
    expect(props.onEdit).toHaveBeenCalledWith(task);
    expect(props.onDelete).toHaveBeenCalledWith(task);
  });
});
