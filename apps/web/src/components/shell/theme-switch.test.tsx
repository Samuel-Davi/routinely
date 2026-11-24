import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { THEME_STORAGE_KEY } from '@/lib/theme';
import { ThemeSwitch } from './theme-switch';

describe('ThemeSwitch', () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('applies and remembers the chosen theme, and "system" forgets the choice', async () => {
    render(<ThemeSwitch />);
    expect(screen.getByRole('radio', { name: 'Tema do sistema' })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: 'Tema escuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Tema escuro' })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: 'Tema claro' }));
    expect(document.documentElement.dataset.theme).toBe('light');

    await userEvent.click(screen.getByRole('radio', { name: 'Tema do sistema' }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});
