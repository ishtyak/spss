import { useState, useMemo } from "react";
import type { DataRow, SavVariable, ValueLabels } from "../../types";
import { frequency, mean, std, weightedFrequency, weightedDescriptives } from "./statsUtils";

interface AIAssistantProps {
    data: DataRow[];
    variables: SavVariable[];
    valueLabels: ValueLabels;
    weights: number[] | null;
}

export default function AIAssistant({ data, variables, valueLabels, weights }: AIAssistantProps) {
    const [query, setQuery] = useState("");
    const [messages, setMessages] = useState([
        { role: "system", content: "👋 Hi! I'm your data assistant. Ask me about your dataset — e.g. \"What is the average of Q1?\" or \"Show frequency of Gender\" or \"How many missing values?\"" },
    ]);

    const numericVars = useMemo(() => variables.filter((v) => v.type === "numeric"), [variables]);

    const processQuery = () => {
        if (!query.trim()) return;
        const q = query.trim();
        setMessages((prev) => [...prev, { role: "user", content: q }]);

        const response = analyzeQuery(q, data, variables, valueLabels, numericVars, weights);
        setMessages((prev) => [...prev, { role: "assistant", content: response }]);
        setQuery("");
    };

    return (
        <div className="flex flex-col h-full">
            {/* Messages */}
            <div className="flex-1 overflow-auto p-4 space-y-3">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                            msg.role === "user"
                                ? "bg-sky-500 text-white"
                                : msg.role === "system"
                                    ? "bg-gray-100 text-gray-700 border"
                                    : "bg-white text-gray-700 border shadow-sm"
                        }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}
            </div>

            {/* Input */}
            <div className="border-t px-4 py-3 bg-gray-50">
                <div className="flex gap-2">
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && processQuery()}
                        placeholder="Ask about your data… (e.g. frequency of Q1, average of score, missing values)"
                        className="flex-1 border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                    />
                    <button onClick={processQuery}
                        className="bg-sky-500 hover:bg-sky-600 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors">
                        Send
                    </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                    {["Show summary", "List variables", "Missing values", "Frequency of"].map((suggestion) => (
                        <button key={suggestion} onClick={() => setQuery(suggestion)}
                            className="text-xs bg-white border rounded-full px-3 py-1 text-gray-500 hover:bg-gray-100 transition-colors">
                            {suggestion}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Local NLP query handler ───────────────────────────────────────
function analyzeQuery(
    q: string,
    data: import("../../types").DataRow[],
    variables: import("../../types").SavVariable[],
    valueLabels: import("../../types").ValueLabels,
    numericVars: import("../../types").SavVariable[],
    weights: number[] | null
): string {
    const lower = q.toLowerCase();
    const n = data.length;

    // Find variable mentioned in query
    const findVar = () => {
        // Try exact match first
        for (const v of variables) {
            if (lower.includes(v.name.toLowerCase())) return v;
        }
        // Try label match
        for (const v of variables) {
            if (v.label && lower.includes(v.label.toLowerCase())) return v;
        }
        return null;
    };

    // Summary / overview
    if (lower.includes("summary") || lower.includes("overview") || lower.includes("describe")) {
        const numVars = numericVars.length;
        const strVars = variables.length - numVars;
        let totalMissing = 0;
        for (const v of variables) {
            for (const row of data) {
                if (row[v.name] == null || row[v.name] === "") totalMissing++;
            }
        }
        return `📊 Dataset Summary:\n• Rows: ${n.toLocaleString()}\n• Variables: ${variables.length} (${numVars} numeric, ${strVars} string)\n• Total missing cells: ${totalMissing.toLocaleString()}\n• Missing rate: ${((totalMissing / (n * variables.length)) * 100).toFixed(1)}%`;
    }

    // List variables
    if (lower.includes("list var") || lower.includes("show var") || lower.includes("variables")) {
        const list = variables.slice(0, 30).map((v, i) => `${i + 1}. ${v.name}${v.label ? ` — ${v.label}` : ""} (${v.type})`).join("\n");
        const more = variables.length > 30 ? `\n… and ${variables.length - 30} more` : "";
        return `📋 Variables (${variables.length}):\n${list}${more}`;
    }

    // Missing values
    if (lower.includes("missing")) {
        const varMatch = findVar();
        if (varMatch) {
            let missing = 0;
            for (const row of data) {
                if (row[varMatch.name] == null || row[varMatch.name] === "") missing++;
            }
            return `🔍 Missing values for ${varMatch.name}:\n• Missing: ${missing} (${((missing / n) * 100).toFixed(1)}%)\n• Valid: ${n - missing}`;
        }
        // General missing
        const varMissing = variables.map((v) => {
            let m = 0;
            for (const row of data) { if (row[v.name] == null || row[v.name] === "") m++; }
            return { name: v.name, missing: m };
        }).filter((v) => v.missing > 0).sort((a, b) => b.missing - a.missing);
        if (varMissing.length === 0) return "✅ No missing values found in any variable!";
        const top = varMissing.slice(0, 10).map((v) => `  ${v.name}: ${v.missing} (${((v.missing / n) * 100).toFixed(1)}%)`).join("\n");
        return `🔍 Variables with missing values (top 10):\n${top}${varMissing.length > 10 ? `\n… and ${varMissing.length - 10} more` : ""}`;
    }

    // Frequency
    if (lower.includes("frequency") || lower.includes("freq") || lower.includes("distribution") || lower.includes("count")) {
        const varMatch = findVar();
        if (!varMatch) return "❓ Please specify a variable name. e.g. \"Frequency of Q1\"";
        const values = data.map((r) => r[varMatch.name]);
        const freqMap = weights ? weightedFrequency(values, weights) : frequency(values);
        const vl = valueLabels[varMatch.name];
        const sorted = Object.entries(freqMap).sort((a, b) => b[1] - a[1]);
        const total = sorted.reduce((s, [, c]) => s + c, 0);
        const lines = sorted.slice(0, 20).map(([val, count]) => {
            let label = val;
            if (vl) {
                const match = vl.find((l) => String(l.value) === val);
                if (match) label = `${val} (${match.label})`;
            }
            return `  ${label}: ${weights ? count.toFixed(1) : count} (${((count / total) * 100).toFixed(1)}%)`;
        });
        return `📊 Frequency of ${varMatch.name}${varMatch.label ? ` (${varMatch.label})` : ""}:\n${lines.join("\n")}${sorted.length > 20 ? `\n… and ${sorted.length - 20} more values` : ""}`;
    }

    // Average / Mean / Stats
    if (lower.includes("average") || lower.includes("mean") || lower.includes("std") || lower.includes("stats")) {
        const varMatch = findVar();
        if (!varMatch || varMatch.type !== "numeric") {
            // Show stats for all numeric
            if (!varMatch) {
                const stats = numericVars.slice(0, 15).map((v) => {
                    const vals = data.map((r) => Number(r[v.name])).filter((x) => !isNaN(x));
                    return `  ${v.name}: mean=${mean(vals).toFixed(2)}, std=${std(vals, 1).toFixed(2)}, n=${vals.length}`;
                });
                return `📊 Descriptive stats (first 15 numeric vars):\n${stats.join("\n")}`;
            }
            return "❓ That variable is not numeric. Try a numeric variable.";
        }
        const vals = data.map((r) => Number(r[varMatch.name])).filter((x) => !isNaN(x));
        if (vals.length === 0) return `❓ No valid numeric values found for ${varMatch.name}.`;

        if (weights) {
            const wd = weightedDescriptives(data, varMatch.name, weights);
            return `📊 Weighted stats for ${varMatch.name}:\n• Weighted Mean: ${wd.mean.toFixed(3)}\n• Weighted Std: ${wd.std.toFixed(3)}\n• Valid N: ${wd.n}\n• Weighted N: ${wd.weightedN.toFixed(1)}`;
        }
        const m = mean(vals);
        const s = std(vals, 1);
        const sorted = [...vals].sort((a, b) => a - b);
        const min = sorted[0], max = sorted[sorted.length - 1];
        const med = sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)];
        return `📊 Stats for ${varMatch.name}${varMatch.label ? ` (${varMatch.label})` : ""}:\n• Mean: ${m.toFixed(3)}\n• Std Dev: ${s.toFixed(3)}\n• Median: ${med.toFixed(3)}\n• Min: ${min}\n• Max: ${max}\n• Valid N: ${vals.length}\n• Missing: ${n - vals.length}`;
    }

    // Row count
    if (lower.includes("how many rows") || lower.includes("row count") || lower.includes("sample size") || lower.includes("how many cases")) {
        return `📋 Total rows/cases: ${n.toLocaleString()}`;
    }

    // Fallback
    return `❓ I'm not sure how to answer that. Try:\n• "Show summary"\n• "Frequency of [variable]"\n• "Average of [variable]"\n• "Missing values"\n• "List variables"`;
}
