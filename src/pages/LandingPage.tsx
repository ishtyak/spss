import { useGoogleLogin } from "@react-oauth/google";
import { useAuth } from "../context/useAuth";
import type { GoogleUser } from "../context/AuthContext";

function GoogleLoginButton() {
    const { login } = useAuth();

    const handleLogin = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            try {
                const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                });
                const user = await res.json() as GoogleUser;
                login(user);
            } catch (e) {
                console.error("Failed to fetch user info", e);
            }
        },
        onError: (err) => console.error("Google login error", err),
    });

    return (
        <button
            onClick={() => handleLogin()}
            className="flex items-center gap-3 bg-white border border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-700 font-medium text-sm px-6 py-3 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
        >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
        </button>
    );
}

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-[#f9fafb] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>

            {/* ── Navbar ── */}
            <nav className="bg-white border-b border-gray-100 px-8 h-14 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    </div>
                    <span className="font-bold text-gray-900 text-[15px] tracking-tight">
                        SAV<span className="text-blue-600">Studio</span>
                    </span>
                </div>
                <GoogleLoginButton />
            </nav>

            {/* ── Hero ── */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
                {/* Badge */}
                <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-600 text-xs font-semibold px-4 py-1.5 rounded-full mb-7 tracking-wide">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    SPSS · STATA · CSV — all in your browser
                </div>

                {/* Heading */}
                <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-5 max-w-2xl">
                    Analyze survey data<br />
                    <span className="text-blue-600">without SPSS</span>
                </h1>
                <p className="text-gray-500 text-base md:text-lg max-w-xl leading-relaxed mb-10">
                    Upload a <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">.sav</code> file and instantly run cross-tabs, factor analysis, correlation matrices, TURF, QC checks, and AI-powered insights — all processed locally.
                </p>

                {/* CTA card */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-md p-8 w-full max-w-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-gray-900 text-sm">SAVStudio</p>
                            <p className="text-gray-400 text-xs">Sign in to get started</p>
                        </div>
                    </div>

                    <GoogleLoginButton />

                    <p className="text-[11px] text-gray-400 mt-4 leading-snug">
                        Your data never leaves your browser. We only use Google to identify you.
                    </p>
                </div>

                {/* Feature pills */}
                <div className="flex flex-wrap justify-center gap-3 mt-10">
                    {[
                        "Cross-Tabulation",
                        "Correlation Matrix",
                        "Factor & PCA",
                        "TURF Analysis",
                        "Data QC",
                        "AI Assistant",
                        "Excel Export",
                        "Data Weighting",
                    ].map((f) => (
                        <span key={f} className="bg-white border border-gray-200 text-gray-600 text-xs font-medium px-3 py-1.5 rounded-full shadow-sm">
                            {f}
                        </span>
                    ))}
                </div>
            </div>

            {/* ── Footer ── */}
            <footer className="text-center py-5 text-xs text-gray-400 border-t border-gray-100 bg-white">
                © {new Date().getFullYear()} SAVStudio · All data processed locally in your browser
            </footer>
        </div>
    );
}
