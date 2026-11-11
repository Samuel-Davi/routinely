import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Button, IconButton } from './button';
import { Badge, Banner, EmptyState, ErrorState } from './feedback';
import { Input, Select } from './field';
import { SegmentedControl } from './segmented-control';
import { Sheet } from './sheet';
import { ToastProvider, useToast } from './toast';

describe('Button', () => {
  it('fires onClick and defaults to type="button"', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);
    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('blocks clicks and announces busy while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Salvando
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Salvando' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('gives icon-only buttons an accessible name', () => {
    render(<IconButton icon="trash" label="Excluir tarefa" />);
    expect(screen.getByRole('button', { name: 'Excluir tarefa' })).toBeInTheDocument();
  });
});

describe('fields', () => {
  it('links the label, hint and error to the control', () => {
    const { rerender } = render(<Input label="Título" hint="Seja específico" />);
    const input = screen.getByLabelText('Título');
    expect(input).toHaveAccessibleDescription('Seja específico');
    expect(input).not.toHaveAttribute('aria-invalid');

    rerender(<Input label="Título" hint="Seja específico" error="Informe um título" />);
    expect(screen.getByLabelText('Título')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Título')).toHaveAccessibleDescription('Informe um título');
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um título');
  });

  it('renders a labelled select', async () => {
    const onChange = vi.fn();
    render(
      <Select label="Prioridade" defaultValue="LOW" onChange={onChange}>
        <option value="LOW">Baixa</option>
        <option value="HIGH">Alta</option>
      </Select>,
    );
    await userEvent.selectOptions(screen.getByLabelText('Prioridade'), 'HIGH');
    expect(onChange).toHaveBeenCalled();
  });
});

describe('feedback', () => {
  it('renders empty and error states with their actions', async () => {
    const onRetry = vi.fn();
    render(
      <>
        <EmptyState
          icon="checklist"
          title="Nenhuma tarefa"
          description="Crie a primeira."
          action={<button>Nova tarefa</button>}
        />
        <ErrorState message="Sem conexão" onRetry={onRetry} />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Nenhuma tarefa' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('renders badges and banners', () => {
    render(
      <>
        <Badge tone="red">Urgente</Badge>
        <Banner tone="warning" title="Rotina gerada sem IA" actions={<button>Replanejar</button>}>
          Limite atingido
        </Banner>
      </>,
    );
    expect(screen.getByText('Urgente')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Rotina gerada sem IA');
  });
});

describe('SegmentedControl', () => {
  function Example() {
    const [value, setValue] = useState<'week' | 'day'>('week');
    return (
      <SegmentedControl
        label="Modo de visão"
        value={value}
        onChange={setValue}
        options={[
          { value: 'week', label: 'Semana' },
          { value: 'day', label: 'Dia' },
        ]}
      />
    );
  }

  it('behaves as a radio group with arrow-key navigation', async () => {
    render(<Example />);
    expect(screen.getByRole('radiogroup', { name: 'Modo de visão' })).toBeInTheDocument();
    const week = screen.getByRole('radio', { name: 'Semana' });
    expect(week).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: 'Dia' }));
    expect(screen.getByRole('radio', { name: 'Dia' })).toBeChecked();

    screen.getByRole('radio', { name: 'Dia' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Semana' })).toBeChecked();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Dia' })).toBeChecked();
  });
});

describe('Sheet', () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Abrir</button>
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title="Nova tarefa"
          description="Preencha os campos"
          footer={<button>Salvar</button>}
        >
          <input aria-label="Título" />
        </Sheet>
      </>
    );
  }

  it('opens as a labelled modal dialog and moves focus inside', async () => {
    render(<Example />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));

    const dialog = screen.getByRole('dialog', { name: 'Nova tarefa' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Preencha os campos');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('traps focus, closes on Escape and restores focus to the trigger', async () => {
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Abrir' });
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog');

    for (let i = 0; i < 6; i += 1) {
      await userEvent.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await userEvent.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('closes from the close button', async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('toasts', () => {
  function Trigger() {
    const toast = useToast();
    return (
      <>
        <button onClick={() => toast.success('Tarefa criada')}>ok</button>
        <button onClick={() => toast.error('Falhou')}>erro</button>
      </>
    );
  }

  it('announces messages and removes them after a while', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'ok' }));
    await user.click(screen.getByRole('button', { name: 'erro' }));
    expect(screen.getByRole('status')).toHaveTextContent('Tarefa criada');
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou');

    act(() => vi.advanceTimersByTime(7000));
    await waitFor(() => expect(screen.queryByText('Falhou')).not.toBeInTheDocument());
    expect(screen.queryByText('Tarefa criada')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('requires the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Trigger />)).toThrow('useToast must be used inside <ToastProvider>');
    spy.mockRestore();
  });
});
