import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@ui5/webcomponents-react';
import '@ui5/webcomponents-react/dist/Assets.js'; // temas, textos e CLDR do Fiori
import { setLanguage } from '@ui5/webcomponents-base/dist/config/Language.js';
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';
import '@ui5/webcomponents-fiori/dist/illustrations/EmptyList.js';
// ícones usados na tela (cada um é carregado à parte)
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/grid.js';
import '@ui5/webcomponents-icons/dist/it-system.js';
import '@ui5/webcomponents-icons/dist/accept.js';
import '@ui5/webcomponents-icons/dist/ai.js';
import '@ui5/webcomponents-icons/dist/clear-filter.js';
import '@ui5/webcomponents-icons/dist/close-command-field.js';
import '@ui5/webcomponents-icons/dist/comment.js';
import '@ui5/webcomponents-icons/dist/dark-mode.js';
import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/favorite.js';
import '@ui5/webcomponents-icons/dist/hide.js';
import '@ui5/webcomponents-icons/dist/history.js';
import '@ui5/webcomponents-icons/dist/light-mode.js';
import '@ui5/webcomponents-icons/dist/menu2.js';
import '@ui5/webcomponents-icons/dist/navigation-left-arrow.js';
import '@ui5/webcomponents-icons/dist/open-command-field.js';
import '@ui5/webcomponents-icons/dist/save.js';
import '@ui5/webcomponents-icons/dist/show.js';
import '@ui5/webcomponents-icons/dist/stop.js';
import '@ui5/webcomponents-icons/dist/undo.js';
import App, { temaGuardado } from './App.jsx';
import './estilo.css';

setLanguage('pt');
setTheme(temaGuardado());
createRoot(document.getElementById('raiz')).render(<ThemeProvider><App /></ThemeProvider>);
