import React from 'react';
import ReactDOM from 'react-dom/client';
import { createRouter, createRootRoute, createRoute, RouterProvider, createBrowserHistory } from '@tanstack/react-router';
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
  history: createBrowserHistory(),
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppAtomRegistryProvider>
      <RouterProvider router={router} />
    </AppAtomRegistryProvider>
  </React.StrictMode>
);
