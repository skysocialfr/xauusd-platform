import axios from 'axios';

/**
 * Instance axios configurée pour dev ET production.
 * - En dev  : baseURL vide → Vite proxy `/api` → localhost:3001
 * - En prod : VITE_API_URL = URL Railway du backend
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 15000,
});

export default api;
