"use client";

import React from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import AuthProvider from "@/context/AuthProvider";
import { SnackbarProvider } from "notistack";

// Keep your client id here — consider moving to an environment variable later
const GOOGLE_CLIENT_ID = "490932099209-sdd4j2gtaqc8td8ldq8rp1rd94gtksv8.apps.googleusercontent.com";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <SnackbarProvider anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
          {children}
        </SnackbarProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
