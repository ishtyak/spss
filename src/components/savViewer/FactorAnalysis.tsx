import { useState, useMemo } from "react";
import type { DataRow, SavVariable } from "../../types";
import { correlationMatrix, pca } from "./statsUtils";
import SearchableSelect from "./SearchableSelect";

interface FactorAnalysisProps {
    data: DataRow[];
    variables: SavVariable[];
}

export default function FactorAnalysis({ data, variables }: FactorAnalysisProps) {
    const [selectedVars, setSelectedVars] = useState<string[]>([]);
    const [activeView, setActiveView] = useState("correlation");
    const [maxFactors, setMaxFactors] = useState(5);

    const numericVars = variables.filter((v) => v.type === "numeric");

    const toggleVar = (name: string) => {
        setSelectedVars((prev) => prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]);
    };

    const selectAll = () => setSelectedVars(numericVars.map((v) => v.name));
    const clearAll = () => setSelectedVars([]);

    const corrResult = useMemo(() => {
        if (selectedVars.length < 2) return null;
        return correlationMatrix(data, selectedVars);
    }, [data, selectedVars]);

    const pcaResult = useMemo(() => {
        if (selectedVars.length < 2) return null;
        try {
            return pca(data, selectedVars, maxFactors);
        } catch (e) {
            console.error("PCA error:", e);
            return null;
        }
    }, [data, selectedVars, maxFactors]);

    const getCorrelationColor = (r: number) => {
        const abs = Math.abs(r);
        if (r > 0) return `rgba(59, 130, 246, ${abs * 0.7})`;
        return `rgba(239, 68, 68, ${abs * 0.7})`;
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* Controls */}
            <div className="flex flex-wrap items-end gap-4 bg-gray-50 rounded-lg p-4">
                <div className="flex gap-2">
                    {["correlation", "pca"].map((view) => (
                        <button key={view} onClick={() => setActiveView(view)}
                            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeView === view ? "bg-sky-500 text-white" : "bg-white text-gray-600 border hover:bg-gray-100"}`}>
                            {view === "correlation" ? "📊 Correlation Matrix" : "🔬 Factor Analysis (PCA)"}
                        </button>
                    ))}
                </div>
                {activeView === "pca" && (
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-gray-500">Max Factors</label>
                        <SearchableSelect
                            options={[2, 3, 4, 5, 7, 10].map((n) => ({ value: String(n), label: String(n) }))}
                            value={String(maxFactors)}
                            onChange={(v) => setMaxFactors(Number(v))}
                            placeholder="Select…"
                            searchPlaceholder="Search…"
                            minWidth="100px"
                        />
                    </div>
                )}
            </div>

            <div className="flex gap-4 flex-1 overflow-hidden">
                {/* Variable selector */}
                <div className="w-56 flex-shrink-0 border rounded-lg overflow-auto">
                    <div className="sticky top-0 bg-gray-50 px-3 py-2 border-b flex justify-between items-center">
                        <span className="text-xs font-semibold text-gray-500">Numeric Variables ({selectedVars.length})</span>
                        <div className="flex gap-1">
                            <button onClick={selectAll} className="text-[10px] text-sky-500 hover:underline">All</button>
                            <span className="text-gray-300">|</span>
                            <button onClick={clearAll} className="text-[10px] text-sky-500 hover:underline">None</button>
                        </div>
                    </div>
                    {numericVars.map((v) => (
                        <label key={v.name} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 border-b">
                            <input type="checkbox" checked={selectedVars.includes(v.name)} onChange={() => toggleVar(v.name)} className="accent-sky-500" />
                            <span className="truncate" title={v.label}>{v.name}</span>
                        </label>
                    ))}
                </div>

                {/* Results */}
                <div className="flex-1 overflow-auto">
                    {selectedVars.length < 2 && (
                        <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                            Select at least 2 numeric variables.
                        </div>
                    )}

                    {/* Correlation Matrix */}
                    {selectedVars.length >= 2 && activeView === "correlation" && corrResult && (
                        <div className="border rounded-lg overflow-auto">
                            <table className="text-xs border-collapse">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th className="px-2 py-1.5 border-r border-b text-left font-semibold text-gray-600 sticky left-0 bg-gray-100 z-10"></th>
                                        {corrResult.varNames.map((v) => (
                                            <th key={v} className="px-2 py-1.5 border-r border-b font-semibold text-gray-600 whitespace-nowrap" style={{ writingMode: "vertical-rl" }}>
                                                {v}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {corrResult.varNames.map((rv, ri) => (
                                        <tr key={rv}>
                                            <td className="px-2 py-1.5 border-r border-b font-semibold text-gray-700 whitespace-nowrap sticky left-0 bg-white z-10">
                                                {rv}
                                            </td>
                                            {corrResult.varNames.map((cv, ci) => {
                                                const val = corrResult.matrix[ri][ci];
                                                return (
                                                    <td key={cv} className="px-2 py-1.5 border-r border-b text-center font-mono"
                                                        style={{ backgroundColor: ri === ci ? "#f3f4f6" : getCorrelationColor(val), color: Math.abs(val) > 0.5 ? "white" : "inherit" }}>
                                                        {val.toFixed(3)}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* PCA */}
                    {selectedVars.length >= 2 && activeView === "pca" && pcaResult && (
                        <div className="flex flex-col gap-4">
                            {/* Eigenvalue summary */}
                            <div className="border rounded-lg overflow-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b">Factor</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b">Eigenvalue</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-r border-b">% Variance</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b">Cumulative %</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pcaResult.eigenvalues.map((ev, i) => {
                                            const cumVar = pcaResult.varianceExplained.slice(0, i + 1).reduce((s, v) => s + v, 0);
                                            return (
                                                <tr key={i} className={`hover:bg-sky-50 ${ev >= 1 ? "" : "opacity-50"}`}>
                                                    <td className="px-3 py-1.5 text-xs font-medium text-gray-800 border-r border-b">Factor {i + 1}</td>
                                                    <td className="px-3 py-1.5 text-xs text-gray-600 border-r border-b font-mono">{ev.toFixed(4)}</td>
                                                    <td className="px-3 py-1.5 text-xs text-gray-600 border-r border-b">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                                                <div className="h-full bg-sky-500 rounded-full" style={{ width: `${pcaResult.varianceExplained[i] * 100}%` }} />
                                                            </div>
                                                            <span className="font-mono">{(pcaResult.varianceExplained[i] * 100).toFixed(1)}%</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-1.5 text-xs text-gray-600 border-b font-mono">{(cumVar * 100).toFixed(1)}%</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Factor loadings */}
                            <h3 className="text-sm font-semibold text-gray-700">Component Matrix (Factor Loadings)</h3>
                            <div className="border rounded-lg overflow-auto">
                                <table className="w-full text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="px-3 py-2 text-left font-semibold text-gray-600 border-r border-b sticky left-0 bg-gray-100 z-10">Variable</th>
                                            {pcaResult.eigenvalues.map((_, i) => (
                                                <th key={i} className="px-3 py-2 text-center font-semibold text-gray-600 border-r border-b">F{i + 1}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pcaResult.varNames.map((vn, vi) => (
                                            <tr key={vn} className="hover:bg-sky-50">
                                                <td className="px-3 py-1.5 font-medium text-gray-700 border-r border-b whitespace-nowrap sticky left-0 bg-white z-10">{vn}</td>
                                                {pcaResult.eigenvectors.map((vec, fi) => {
                                                    const loading = vec[vi] * Math.sqrt(pcaResult.eigenvalues[fi]);
                                                    const abs = Math.abs(loading);
                                                    return (
                                                        <td key={fi} className="px-3 py-1.5 text-center border-r border-b font-mono"
                                                            style={{
                                                                backgroundColor: abs > 0.4 ? (loading > 0 ? `rgba(59,130,246,${abs * 0.5})` : `rgba(239,68,68,${abs * 0.5})`) : "transparent",
                                                                fontWeight: abs > 0.4 ? 700 : 400,
                                                            }}>
                                                            {loading.toFixed(3)}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <p className="text-xs text-gray-400">
                                Eigenvalue ≥ 1.0 criterion (Kaiser rule) highlighted. Loadings &gt; 0.4 are highlighted.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
