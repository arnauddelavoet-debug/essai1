import { initApp } from './ui/app.js';

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
