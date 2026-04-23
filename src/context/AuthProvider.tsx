"use client"
import React, { useState, useCallback } from "react";
import { googleLogout } from "@react-oauth/google";
import { AuthContext } from "./AuthContext";
import type { GoogleUser } from "./AuthContext";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<GoogleUser | null>(() => {
        try {
            const stored = sessionStorage.getItem("sav_user");
            return stored ? JSON.parse(stored) : null;
        } catch {
            return null;
        }
    });

    const login = useCallback((u: GoogleUser) => {
        setUser(u);
        sessionStorage.setItem("sav_user", JSON.stringify(u));
    }, []);

    const logout = useCallback(() => {
        googleLogout();
        setUser(null);
        sessionStorage.removeItem("sav_user");
    }, []);

    return (
        <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
}
