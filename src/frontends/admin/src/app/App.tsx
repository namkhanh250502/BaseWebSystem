import { AppProviders } from '@base/ui';
import { RouterProvider } from 'react-router';
import { api } from '@/lib/api';
import { i18n } from '@/lib/i18n';
import { router } from './router';

export function App() {
  return (
    <AppProviders api={api} i18n={i18n} requireAdmin>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
