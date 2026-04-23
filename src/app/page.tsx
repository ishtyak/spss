"use client"
import { useGoogleLogin } from "@react-oauth/google";
import {
    AreaChart, Area, BarChart, Bar, LineChart, Line,
    PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
    PolarAngleAxis, ResponsiveContainer, XAxis, YAxis,
    Tooltip, CartesianGrid, Legend,
} from "recharts";
import { useAuth } from "../context/useAuth";
import type { GoogleUser } from "../context/AuthContext";

// ─── Chart data ──────────────────────────────────────────────────────
const surveyData = [
    { month: "Jan", complete: 3800, partial: 400 },
    { month: "Feb", complete: 4600, partial: 500 },
    { month: "Mar", complete: 4300, partial: 400 },
    { month: "Apr", complete: 5700, partial: 500 },
    { month: "May", complete: 6500, partial: 600 },
    { month: "Jun", complete: 6200, partial: 600 },
    { month: "Jul", complete: 7600, partial: 700 },
];

 

const varTypeData = [
    { name: "Numeric", value: 54, color: "#2563eb" },
    { name: "String",  value: 28, color: "#60a5fa" },
    { name: "Date",    value: 10, color: "#93c5fd" },
    { name: "Other",   value:  8, color: "#bfdbfe" },
];

const corrData = [
    { var: "Q1", score: 0.82 },
    { var: "Q2", score: 0.71 },
    { var: "Q3", score: 0.65 },
    { var: "Q4", score: 0.88 },
    { var: "Q5", score: 0.59 },
    { var: "Q6", score: 0.76 },
];

const radarData = [
    { subject: "Data QC",   A: 90 },
    { subject: "Cross-Tab", A: 78 },
    { subject: "Factor",    A: 65 },
    { subject: "TURF",      A: 72 },
    { subject: "Weighting", A: 85 },
    { subject: "AI Assist", A: 95 },
];

const features = [
    { icon: "📋", title: "Data & Variable View",    desc: "Inspect raw rows and variable metadata with search and sorting." },
    { icon: "📊", title: "Cross-Tabulation",         desc: "Chi-square tests, significance letters, col & row percentages." },
    { icon: "🔬", title: "Factor Analysis / PCA",    desc: "Correlation heatmaps and principal component extraction." },
    { icon: "📡", title: "TURF & Driver Analysis",   desc: "Reach optimisation and key driver importance ranked automatically." },
    { icon: "⚖️", title: "Data Weighting",           desc: "Apply weights and compare weighted vs unweighted distributions." },
    { icon: "🛡️", title: "Data QC Panel",            desc: "Auto-detect missing data, duplicates, outliers and label issues." },
    { icon: "🤖", title: "AI Assistant",             desc: "Ask plain-English questions about your data and get instant insights." },
    { icon: "📤", title: "Excel Export",             desc: "Export any view to a formatted Excel file in one click." },
];

const TT = {
    contentStyle: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, color: "#1e293b" },
};

// ─── App mockup ───────────────────────────────────────────────────────
function AppMockup() {
    return (
        <div className="relative w-full max-w-140 mx-auto select-none">
            <div className="bg-[#1e2330] rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
                <div className="flex items-center gap-1.5 px-4 py-2.5 bg-[#2a3040]">
                    <span className="w-3 h-3 rounded-full bg-red-400" />
                    <span className="w-3 h-3 rounded-full bg-yellow-400" />
                    <span className="w-3 h-3 rounded-full bg-green-400" />
                    <span className="ml-3 text-[10px] text-gray-400 font-mono">SAVAnalyzer — Data Studio</span>
                </div>
                <div className="flex h-85">
                    <div className="w-30 shrink-0 bg-[#0f172a] flex flex-col py-3 gap-1 px-2">
                        {["Data View","Variable View","Cross-Tab","Factor","TURF","Data Ops","Data QC","AI Assist"].map((item, i) => (
                            <div key={item} className={`text-[10px] px-2 py-1.5 rounded-md truncate ${i === 1 ? "bg-sky-500/20 text-sky-300" : "text-slate-500"}`}>{item}</div>
                        ))}
                    </div>
                    <div className="flex-1 bg-white flex flex-col overflow-hidden">
                        <div className="flex items-center h-9 border-b border-gray-100 px-3 gap-4 bg-gray-50">
                            <span className="text-[10px] font-medium text-blue-600 border-b-2 border-blue-600 pb-1.75 pt-1">Variable View</span>
                            <span className="text-[10px] text-gray-400">Data View</span>
                        </div>
                        <div className="flex text-[9px] font-semibold text-gray-500 bg-gray-100 px-2 border-b border-gray-200">
                            {["#","Name","Type","Width","Label","Value Labels"].map((h) => (
                                <div key={h} className="flex-1 py-1.5 truncate">{h}</div>
                            ))}
                        </div>
                        {[
                            ["1","RespondentID","String","36","Respondent Unique ID","—"],
                            ["2","Country","String","20","Country","1=India..."],
                            ["3","Age","Numeric","8","Age of respondent","—"],
                            ["4","Gender","Numeric","8","Gender","1=Male..."],
                            ["5","Q1_Score","Numeric","8","Overall satisfaction","1–10"],
                            ["6","Q2_NPS","Numeric","8","Net Promoter Score","0–10"],
                            ["7","Region","String","15","Geographic region","—"],
                            ["8","Income","Numeric","8","Income bracket","1=Low..."],
                        ].map(([num,name,type,width,label,vl], ri) => (
                            <div key={ri} className={`flex text-[9px] text-gray-700 px-2 border-b border-gray-100 ${ri%2===0?"bg-white":"bg-sky-50/30"}`}>
                                <div className="flex-1 py-1.5 text-gray-400">{num}</div>
                                <div className="flex-1 py-1.5 font-medium truncate">{name}</div>
                                <div className="flex-1 py-1.5 text-gray-500">{type}</div>
                                <div className="flex-1 py-1.5 text-gray-500">{width}</div>
                                <div className="flex-1 py-1.5 text-gray-500 truncate">{label}</div>
                                <div className="flex-1 py-1.5 text-gray-400 truncate">{vl}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="absolute -top-6 -right-6 bg-white rounded-xl shadow-xl border border-gray-100 p-3 w-44">
                <p className="text-[9px] font-semibold text-gray-500 mb-2">Response volume</p>
                <ResponsiveContainer width="100%" height={70}>
                    <BarChart data={surveyData.slice(0,5)} barSize={8}>
                        <Bar dataKey="complete" fill="#2563eb" radius={[2,2,0,0]} />
                        <Bar dataKey="partial"  fill="#93c5fd" radius={[2,2,0,0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="absolute -bottom-4 -left-6 bg-white rounded-xl shadow-xl border border-gray-100 p-3 w-36">
                <p className="text-[9px] text-gray-400 mb-1">Variables found</p>
                <p className="text-2xl font-bold text-blue-600">1,668</p>
                <p className="text-[9px] text-green-500 mt-0.5">↑ 29 rows loaded</p>
            </div>
            <div className="mx-auto w-16 h-4 bg-gray-300 rounded-b-lg" />
            <div className="mx-auto w-28 h-2 bg-gray-200 rounded-lg mt-0.5" />
        </div>
    );
}

// ─── Google Sign-In Button ────────────────────────────────────────────
function GoogleSignInButton({ onSuccess, variant = "outline" }: { onSuccess: (u: GoogleUser) => void; variant?: "outline" | "solid" }) {
    const login = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            try {
                const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                });
                onSuccess(await res.json() as GoogleUser);
            } catch (e) {
                console.error("Failed to fetch user info", e);
            }
        },
        onError: (err) => console.error("Google login error", err),
    });

    const base = "flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 cursor-pointer";
    const cls = variant === "solid"
        ? `${base} bg-white hover:bg-gray-100 text-gray-800 shadow-md`
        : `${base} bg-white hover:bg-gray-50 border border-gray-300 hover:border-gray-400 text-gray-700 shadow-sm`;

    return (
        <button onClick={() => login()} className={cls}>
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign In
        </button>
    );
}

// ─── Landing Page ─────────────────────────────────────────────────────
export default function LandingPage() {
    const { login } = useAuth();

    return (
        <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>

            {/* ── Navbar ── */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100 shadow-sm">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                        <span className="font-bold text-gray-900 text-base tracking-tight">
                            SAV<span className="text-blue-600">ANALYZER</span>
                        </span>
                    </div>

                    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
                        <a href="#" className="text-gray-900 hover:text-blue-600 transition-colors">Home</a>
                        <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
                        <a href="#charts" className="hover:text-blue-600 transition-colors">Analytics</a>
                        <a href="#contact" className="hover:text-blue-600 transition-colors">Contact</a>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* <GoogleSignInButton onSuccess={login} variant="outline" /> */}
                        <button
                            onClick={() => login({ sub: "", name: "Demo User", email: "", picture: "", given_name: "Demo", family_name: "User" })}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
                        >
                            Get Started
                        </button>
                    </div>
                </div>
            </nav>

            {/* ── Hero ── */}
            <section className="pt-28 pb-24 px-6">
                <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    <div>
                        <div className="inline-flex items-center bg-blue-50 border border-blue-100 rounded-full px-4 py-1.5 text-blue-600 text-xs font-medium mb-7">
                            Professional Statistical Analysis Made Simple
                        </div>
                        <h1 className="text-4xl md:text-[52px] font-bold leading-tight mb-6 text-gray-900">
                            View &amp; Analyze Your{" "}
                            <span className="text-blue-600">SPSS,<br />STATA &amp; CSV</span>{" "}
                            Files Online
                        </h1>
                        <p className="text-gray-500 text-base md:text-lg leading-relaxed mb-10 max-w-lg">
                            Upload your data files and instantly access variable views, data views, and run frequencies and cross-tab analysis — all in your browser. No software installation required.
                        </p>
                        <div className="flex flex-col sm:flex-row items-start gap-4 mb-10">
                            <button
                                onClick={() => login({ sub: "", name: "Demo User", email: "", picture: "", given_name: "Demo", family_name: "User" })}
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-7 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 text-sm"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                Get Started
                            </button>
                            <a href="#charts" className="flex items-center gap-2 border border-blue-200 hover:border-blue-400 text-blue-600 font-medium px-7 py-3 rounded-xl text-sm transition-all duration-200">
                                Explore Demos →
                            </a>
                        </div>
                        <div className="flex items-center gap-6 text-sm text-gray-500">
                            {["No sign-up required","Instant results","Secure processing"].map((t) => (
                                <span key={t} className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />{t}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="hidden lg:block">
                        <AppMockup />
                    </div>
                </div>
            </section>

            {/* ── Stats strip ── */}
            <section className="py-12 bg-blue-600">
                <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                    {[
                        { value: "12,400+",   label: "Files Analyzed" },
                        { value: "980K+",     label: "Variables Processed" },
                        { value: "< 2s",      label: "Avg Parse Time" },
                        { value: "SPSS .sav", label: "Primary Format" },
                    ].map((s) => (
                        <div key={s.label}>
                            <div className="text-2xl font-bold text-white mb-1">{s.value}</div>
                            <div className="text-sm text-blue-200">{s.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Charts ── */}
            <section id="charts" className="py-24 px-6 bg-gray-50">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-14">
                        <h2 className="text-3xl font-bold text-gray-900 mb-3">Built-in analytics, visualized</h2>
                        <p className="text-gray-500">Every analysis updates live as you explore your data</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

                        <div className="md:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h3 className="text-sm font-semibold text-gray-800 mb-1">Survey Response Volume</h3>
                            <p className="text-xs text-gray-400 mb-5">Complete vs partial responses over time</p>
                            <ResponsiveContainer width="100%" height={220}>
                                <AreaChart data={surveyData} margin={{ top:5, right:10, left:-10, bottom:0 }}>
                                    <defs>
                                        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor="#93c5fd" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#93c5fd" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="month" tick={{ fill:"#94a3b8", fontSize:11 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill:"#94a3b8", fontSize:11 }} axisLine={false} tickLine={false} />
                                    <Tooltip {...TT} />
                                    <Legend wrapperStyle={{ fontSize:12, color:"#64748b" }} />
                                    <Area type="monotone" dataKey="complete" stroke="#2563eb" fill="url(#cg)" strokeWidth={2} name="Complete" />
                                    <Area type="monotone" dataKey="partial"  stroke="#93c5fd" fill="url(#pg)" strokeWidth={2} name="Partial" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h3 className="text-sm font-semibold text-gray-800 mb-1">Variable Type Distribution</h3>
                            <p className="text-xs text-gray-400 mb-5">Typical .sav breakdown</p>
                            <ResponsiveContainer width="100%" height={220}>
                                <PieChart>
                                    <Pie data={varTypeData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                                        {varTypeData.map((e, i) => <Cell key={i} fill={e.color} />)}
                                    </Pie>
                                    <Tooltip {...TT} />
                                    <Legend wrapperStyle={{ fontSize:12, color:"#64748b" }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h3 className="text-sm font-semibold text-gray-800 mb-1">Factor Correlation Scores</h3>
                            <p className="text-xs text-gray-400 mb-5">Sample variable loadings</p>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={corrData} margin={{ top:5, right:10, left:-20, bottom:0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="var" tick={{ fill:"#94a3b8", fontSize:11 }} axisLine={false} tickLine={false} />
                                    <YAxis domain={[0,1]} tick={{ fill:"#94a3b8", fontSize:11 }} axisLine={false} tickLine={false} />
                                    <Tooltip {...TT} />
                                    <Bar dataKey="score" name="Score" radius={[4,4,0,0]}>
                                        {corrData.map((_,i) => <Cell key={i} fill={`hsl(${215+i*8},85%,${50+i*4}%)`} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h3 className="text-sm font-semibold text-gray-800 mb-1">Module Coverage</h3>
                            <p className="text-xs text-gray-400 mb-5">Built-in analytical capabilities</p>
                            <ResponsiveContainer width="100%" height={220}>
                                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={80}>
                                    <PolarGrid stroke="#f1f5f9" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill:"#94a3b8", fontSize:10 }} />
                                    <Radar name="Coverage" dataKey="A" stroke="#2563eb" fill="#2563eb" fillOpacity={0.12} strokeWidth={2} />
                                    <Tooltip {...TT} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h3 className="text-sm font-semibold text-gray-800 mb-1">Parse Performance</h3>
                            <p className="text-xs text-gray-400 mb-5">Seconds vs file size</p>
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={[
                                    {size:"1MB",time:0.3},{size:"5MB",time:0.8},
                                    {size:"10MB",time:1.4},{size:"25MB",time:2.1},
                                    {size:"50MB",time:3.5},{size:"100MB",time:6.2},
                                ]} margin={{ top:5, right:10, left:-20, bottom:0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="size" tick={{ fill:"#94a3b8", fontSize:11 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill:"#94a3b8", fontSize:11 }} axisLine={false} tickLine={false} unit="s" />
                                    <Tooltip {...TT} />
                                    <Line type="monotone" dataKey="time" stroke="#2563eb" strokeWidth={2.5} dot={{ fill:"#2563eb", r:4 }} name="Parse time" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                    </div>
                </div>
            </section>

            {/* ── Features ── */}
            <section id="features" className="py-24 px-6 bg-white">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-14">
                        <h2 className="text-3xl font-bold text-gray-900 mb-3">Everything you need to analyze survey data</h2>
                        <p className="text-gray-500">No SPSS license required. No uploads to servers. All processing happens locally in your browser.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {features.map((f) => (
                            <div key={f.title} className="border border-gray-100 rounded-xl p-5 hover:border-blue-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group">
                                <div className="text-2xl mb-3">{f.icon}</div>
                                <h3 className="text-sm font-semibold text-gray-800 mb-2 group-hover:text-blue-600 transition-colors">{f.title}</h3>
                                <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA ── */}
            <section id="contact" className="py-20 px-6 bg-blue-600">
                <div className="max-w-2xl mx-auto text-center">
                    <h2 className="text-3xl font-bold text-white mb-4">Ready to explore your data?</h2>
                    <p className="text-blue-100 mb-10">Sign in with Google and drop your first .sav file in seconds.</p>
                    {/* <GoogleSignInButton onSuccess={login} variant="solid" /> */}
                    <p className="text-blue-200 text-xs mt-6">Your data never leaves your browser — all processing is local.</p>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="border-t border-gray-100 py-8 px-6 text-center text-gray-400 text-xs bg-white">
                <p>© {new Date().getFullYear()} SAVAnalyzer · SPSS Data Studio · All data processed locally in your browser.</p>
            </footer>
        </div>
    );
}
