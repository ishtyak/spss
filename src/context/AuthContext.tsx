"use client"
import { createContext } from "react";

export interface GoogleUser {
    sub: string;
    name: string;
    email: string;
    picture: string;
    given_name: string;
    family_name: string;
}

export interface AuthContextValue {
    user: GoogleUser | null;
    login: (user: GoogleUser) => void;
    logout: () => void;
    isAuthenticated: boolean;
}

export const AuthContext = createContext<AuthContextValue>({
    user: null,
    login: () => {},
    logout: () => {},
    isAuthenticated: false,
});
