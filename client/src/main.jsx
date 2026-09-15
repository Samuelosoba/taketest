import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import App from './App';
import {ToastProvider} from './ui';
import './styles.css';
const client=new QueryClient({defaultOptions:{queries:{retry:1,refetchOnWindowFocus:false,staleTime:15000}}});
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><BrowserRouter><ToastProvider><App/></ToastProvider></BrowserRouter></QueryClientProvider>);
