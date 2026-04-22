import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SnackbarProvider } from 'notistack'
import { GoogleOAuthProvider } from '@react-oauth/google'
import AuthProvider from './context/AuthProvider.tsx'

// Replace with your actual Google OAuth Client ID from https://console.cloud.google.com/
const GOOGLE_CLIENT_ID = "490932099209-sdd4j2gtaqc8td8ldq8rp1rd94gtksv8.apps.googleusercontent.com"

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <SnackbarProvider anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
          <App />
        </SnackbarProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
)
