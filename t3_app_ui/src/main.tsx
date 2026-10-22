import React from 'react';
import ReactDOM from 'react-dom/client';
import { createRouter, createRootRoute, createRoute, RouterProvider, createHashHistory } from '@tanstack/react-router';
import { AppAtomRegistryProvider } from '~/rpc/atomRegistry';
import { App } from './App';

const rootRoute = createRootRoute({
  component: App,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
});

const wildcardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '*',
});

const routeTree = rootRoute.addChildren([indexRoute, wildcardRoute]);

const router = createRouter({
  routeTree,
  history: createHashHistory(),
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppAtomRegistryProvider>
      <RouterProvider router={router} />
    </AppAtomRegistryProvider>
  </React.StrictMode>
);

if (typeof window !== 'undefined') {
  const tokenMonitor = (window as unknown as { tokenMonitor?: { dashboard?: { ready?: () => void } } }).tokenMonitor;
  if (tokenMonitor?.dashboard?.ready) {
    tokenMonitor.dashboard.ready();
  }
}
