/**
 * Pure‑JS statistical utility functions for SAV Viewer analytics.
 * No external deps — runs entirely in the browser.
 */
import type {
    DataRow,
    SavVariable,
    ValueLabels,
    ContingencyTable,
    ChiSquareResult,
    CorrelationMatrixResult,
    PCAResult,
    QCIssue,
    QCResult,
    TurfGroup,
    DriverResult,
    WeightInfo,
    WeightedDescriptives,
} from "@/utils/types";

// ─── Basic helpers ─────────────────────────────────────────────────
export function sum(arr: number[]): number {
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return s;
}

export function mean(arr: number[]): number {
    if (!arr.length) return 0;
    return sum(arr) / arr.length;
}

export function variance(arr: number[], ddof = 0): number {
    if (arr.length <= ddof) return 0;
    const m = mean(arr);
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += (arr[i] - m) ** 2;
    return s / (arr.length - ddof);
}

export function std(arr: number[], ddof = 0): number {
    return Math.sqrt(variance(arr, ddof));
}

export function weightedMean(arr: number[], weights: number[]): number {
    let ws = 0, s = 0;
    for (let i = 0; i < arr.length; i++) {
        s += arr[i] * weights[i];
        ws += weights[i];
    }
    return ws === 0 ? 0 : s / ws;
}

// ─── Frequency table ───────────────────────────────────────────────
export function frequency(arr: (string | number | null)[]): Record<string, number> {
    const map: Record<string, number> = {};
    for (const v of arr) {
        const k = v == null ? "__NULL__" : String(v);
        map[k] = (map[k] || 0) + 1;
    }
    return map;
}

export function weightedFrequency(arr: (string | number | null)[], weights: number[]): Record<string, number> {
    const map: Record<string, number> = {};
    for (let i = 0; i < arr.length; i++) {
        const k = arr[i] == null ? "__NULL__" : String(arr[i]);
        map[k] = (map[k] || 0) + (weights[i] || 0);
    }
    return map;
}

// ─── Chi‑square & significance ─────────────────────────────────────
/**
 * Build a cross‑tab contingency table from two arrays.
 * Returns { rowKeys, colKeys, observed, rowTotals, colTotals, grandTotal }
 */
export function contingencyTable(
    rowArr: (string | number | null)[],
    colArr: (string | number | null)[],
    weights: number[] | null = null
): ContingencyTable {
    const rSet = new Set<string>(), cSet = new Set<string>();
    for (let i = 0; i < rowArr.length; i++) {
        if (rowArr[i] != null) rSet.add(String(rowArr[i]));
        if (colArr[i] != null) cSet.add(String(colArr[i]));
    }
    const rowKeys = [...rSet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const colKeys = [...cSet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const rIdx = Object.fromEntries(rowKeys.map((k, i) => [k, i]));
    const cIdx = Object.fromEntries(colKeys.map((k, i) => [k, i]));

    const observed = rowKeys.map(() => colKeys.map(() => 0));
    for (let i = 0; i < rowArr.length; i++) {
        if (rowArr[i] == null || colArr[i] == null) continue;
        const rk = String(rowArr[i]), ck = String(colArr[i]);
        const w = weights ? (weights[i] || 0) : 1;
        observed[rIdx[rk]][cIdx[ck]] += w;
    }

    const rowTotals = observed.map((r) => sum(r));
    const colTotals = colKeys.map((_, ci) => sum(observed.map((r) => r[ci])));
    const grandTotal = sum(rowTotals);

    return { rowKeys, colKeys, observed, rowTotals, colTotals, grandTotal };
}

/**
 * Chi‑square test for independence.
 * Returns { chiSquare, df, pValue, expected }
 */
export function chiSquareTest(ct: ContingencyTable): ChiSquareResult {
    const { rowKeys, colKeys, observed, rowTotals, colTotals, grandTotal } = ct;
    const expected = rowKeys.map((_, ri) =>
        colKeys.map((_, ci) => (rowTotals[ri] * colTotals[ci]) / (grandTotal || 1))
    );

    let chi2 = 0;
    for (let ri = 0; ri < rowKeys.length; ri++) {
        for (let ci = 0; ci < colKeys.length; ci++) {
            const e = expected[ri][ci];
            if (e > 0) {
                chi2 += (observed[ri][ci] - e) ** 2 / e;
            }
        }
    }
    const df = (rowKeys.length - 1) * (colKeys.length - 1);
    const pValue = 1 - chiSquareCDF(chi2, df);
    return { chiSquare: chi2, df, pValue, expected };
}

/**
 * Column‑proportion z‑test significance letters.
 * For each row, compare column pairs. Returns a 2D array of letter strings.
 * Column letters are A, B, C, ... corresponding to colKeys order.
 */
export function significanceLetters(ct: ContingencyTable, alpha = 0.05): string[][] {
    const { rowKeys, colKeys, observed, colTotals } = ct;
    const letters = rowKeys.map(() => colKeys.map(() => ""));
    const zCrit = normalInv(1 - alpha / 2);

    for (let ri = 0; ri < rowKeys.length; ri++) {
        for (let ci = 0; ci < colKeys.length; ci++) {
            const sigLetters = [];
            const pI = colTotals[ci] > 0 ? observed[ri][ci] / colTotals[ci] : 0;
            for (let cj = 0; cj < colKeys.length; cj++) {
                if (ci === cj) continue;
                const pJ = colTotals[cj] > 0 ? observed[ri][cj] / colTotals[cj] : 0;
                const nI = colTotals[ci];
                const nJ = colTotals[cj];
                if (nI < 2 || nJ < 2) continue;
                const se = Math.sqrt(pI * (1 - pI) / nI + pJ * (1 - pJ) / nJ);
                if (se === 0) continue;
                const z = (pI - pJ) / se;
                if (z > zCrit) {
                    sigLetters.push(String.fromCharCode(65 + cj));
                }
            }
            letters[ri][ci] = sigLetters.join("");
        }
    }
    return letters;
}

// ─── Correlation matrix ────────────────────────────────────────────
/**
 * Pearson correlation matrix for numeric columns.
 * Returns { varNames, matrix }
 */
export function correlationMatrix(data: DataRow[], varNames: string[]): CorrelationMatrixResult {
    const k = varNames.length;
    const cols = varNames.map((v) => data.map((r) => Number(r[v])).filter((x) => !isNaN(x)));

    const matrix = Array.from({ length: k }, () => Array(k).fill(0));
    for (let i = 0; i < k; i++) {
        matrix[i][i] = 1;
        for (let j = i + 1; j < k; j++) {
            const r = pearson(cols[i], cols[j]);
            matrix[i][j] = r;
            matrix[j][i] = r;
        }
    }
    return { varNames, matrix };
}

function pearson(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;
    const mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
        const a = x[i] - mx, b = y[i] - my;
        num += a * b;
        dx += a * a;
        dy += b * b;
    }
    const denom = Math.sqrt(dx * dy);
    return denom === 0 ? 0 : num / denom;
}

// ─── Pearson p-value (two-tailed) ─────────────────────────────────
// lgamma via Lanczos, betacf via continued fraction, betai regularised
// incomplete beta — all pure-JS, no deps.
function lgamma(z: number): number {
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
        771.32342877765313, -176.61502916214059, 12.507343278686905,
        -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
    let x = z - 1;
    let a = c[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function betacf(x: number, a: number, b: number): number {
    const MAX = 200, EPS = 3e-7, FM = 1e-30;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FM) d = FM;
    d = 1 / d; let h = d;
    for (let m = 1; m <= MAX; m++) {
        const m2 = 2 * m;
        let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
        d = 1 + aa * d; if (Math.abs(d) < FM) d = FM;
        c = 1 + aa / c; if (Math.abs(c) < FM) c = FM;
        d = 1 / d; h *= d * c;
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
        d = 1 + aa * d; if (Math.abs(d) < FM) d = FM;
        c = 1 + aa / c; if (Math.abs(c) < FM) c = FM;
        d = 1 / d; const del = d * c; h *= del;
        if (Math.abs(del - 1) < EPS) break;
    }
    return h;
}
function betai(x: number, a: number, b: number): number {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const lb = lgamma(a + b) - lgamma(a) - lgamma(b);
    const bt = Math.exp(lb + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2)
        ? bt * betacf(x, a, b) / a
        : 1 - bt * betacf(1 - x, b, a) / b;
}
/** Two-tailed p-value for Pearson r with n observations. */
export function pearsonPValue(r: number, n: number): number {
    if (n <= 2) return 1;
    if (Math.abs(r) >= 1) return 0;
    const t2 = (r * r * (n - 2)) / (1 - r * r);
    return betai((n - 2) / (n - 2 + t2), (n - 2) / 2, 0.5);
}
/** Significance stars: *** p<.001, ** p<.01, * p<.05 */
export function sigStars(p: number): string {
    if (p < 0.001) return "***";
    if (p < 0.01) return "**";
    if (p < 0.05) return "*";
    return "";
}

// ─── PCA / Factor Analysis (eigenvalue decomp via power iteration) ─
/**
 * Simple PCA via correlation matrix + Jacobi eigenvalue algorithm.
 * Returns { eigenvalues, eigenvectors, varianceExplained }
 */
export function pca(data: DataRow[], varNames: string[], maxFactors = 5): PCAResult {
    const cm = correlationMatrix(data, varNames);
    const k = varNames.length;
    const A = cm.matrix.map((r) => [...r]);

    const { eigenvalues, eigenvectors } = jacobiEigen(A, k);

    // sort descending
    const indices = eigenvalues.map((_v, i) => i).sort((a, b) => eigenvalues[b] - eigenvalues[a]);
    const sortedEV = indices.map((i) => eigenvalues[i]);
    const sortedVec = indices.map((i) => eigenvectors.map((row) => row[i]));
    const totalVar = sum(sortedEV.filter((v) => v > 0));
    const varianceExplained = sortedEV.map((v) => (v > 0 ? v / totalVar : 0));

    const nFactors = Math.min(maxFactors, k);
    return {
        eigenvalues: sortedEV.slice(0, nFactors),
        eigenvectors: sortedVec.slice(0, nFactors),
        varianceExplained: varianceExplained.slice(0, nFactors),
        varNames,
    };
}

/** Jacobi eigenvalue algorithm for symmetric matrices */
function jacobiEigen(A: number[][], n: number, maxIter = 100): { eigenvalues: number[]; eigenvectors: number[][] } {
    let V = Array.from({ length: n }, (_, i) => {
        const row = Array(n).fill(0);
        row[i] = 1;
        return row;
    });
    const M = A.map((r) => [...r]);

    for (let iter = 0; iter < maxIter; iter++) {
        let maxOff = 0, p = 0, q = 1;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                if (Math.abs(M[i][j]) > maxOff) {
                    maxOff = Math.abs(M[i][j]);
                    p = i;
                    q = j;
                }
            }
        }
        if (maxOff < 1e-10) break;

        const theta = M[p][p] === M[q][q]
            ? Math.PI / 4
            : 0.5 * Math.atan2(2 * M[p][q], M[p][p] - M[q][q]);
        const c = Math.cos(theta), s = Math.sin(theta);

        // Rotate M
        const newPP = c * c * M[p][p] + 2 * s * c * M[p][q] + s * s * M[q][q];
        const newQQ = s * s * M[p][p] - 2 * s * c * M[p][q] + c * c * M[q][q];
        M[p][q] = 0;
        M[q][p] = 0;
        M[p][p] = newPP;
        M[q][q] = newQQ;

        for (let i = 0; i < n; i++) {
            if (i === p || i === q) continue;
            const mip = c * M[i][p] + s * M[i][q];
            const miq = -s * M[i][p] + c * M[i][q];
            M[i][p] = mip;
            M[p][i] = mip;
            M[i][q] = miq;
            M[q][i] = miq;
        }

        for (let i = 0; i < n; i++) {
            const vip = c * V[i][p] + s * V[i][q];
            const viq = -s * V[i][p] + c * V[i][q];
            V[i][p] = vip;
            V[i][q] = viq;
        }
    }

    const eigenvalues = Array.from({ length: n }, (_, i) => M[i][i]);
    return { eigenvalues, eigenvectors: V };
}

// ─── TURF Analysis ─────────────────────────────────────────────────
/**
 * Total Unduplicated Reach & Frequency.
 * items = array of variable names (multi-select items)
 * data = array of row objects
 * Each item is "selected" if data[row][item] is truthy / == 1.
 * Returns sorted combos by reach for combo sizes 1..maxCombo.
 */
export function turfAnalysis(data: DataRow[], items: string[], maxCombo = 5, topN = 10): TurfGroup[] {
    const n = data.length;
    // Build binary masks for each item
    const masks = items.map((item) => {
        const mask = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            mask[i] = data[i][item] && data[i][item] != 0 ? 1 : 0;
        }
        return mask;
    });

    const results = [];

    for (let comboSize = 1; comboSize <= Math.min(maxCombo, items.length); comboSize++) {
        const combos: Array<{ items: string[]; reach: number; reachPct: number }> = [];
        const combo: number[] = [];

        function generate(start: number): void {
            if (combo.length === comboSize) {
                // compute reach
                let reached = 0;
                for (let i = 0; i < n; i++) {
                    let hit = false;
                    for (const idx of combo) {
                        if (masks[idx][i]) { hit = true; break; }
                    }
                    if (hit) reached++;
                }
                combos.push({
                    items: combo.map((idx) => items[idx]),
                    reach: reached,
                    reachPct: n > 0 ? (reached / n) * 100 : 0,
                });
                return;
            }
            // limit combos to avoid explosion
            if (combos.length >= topN * 50) return;
            for (let i = start; i < items.length; i++) {
                combo.push(i);
                generate(i + 1);
                combo.pop();
            }
        }
        generate(0);
        combos.sort((a, b) => b.reach - a.reach);
        results.push({
            comboSize,
            top: combos.slice(0, topN),
        });
    }
    return results;
}

// ─── Driver Analysis (Shapley‑like importance via correlation) ─────
/**
 * Simple driver analysis: correlation of each IV with DV.
 * Returns sorted array of { variable, correlation, importance }.
 */
export function driverAnalysis(data: DataRow[], ivNames: string[], dvName: string): DriverResult[] {
    const dvArr = data.map((r) => Number(r[dvName])).filter((v) => !isNaN(v));
    const results = ivNames.map((iv) => {
        const ivArr = data.map((r) => Number(r[iv]));
        const valid = [];
        const validDV = [];
        for (let i = 0; i < Math.min(ivArr.length, dvArr.length); i++) {
            if (!isNaN(ivArr[i]) && !isNaN(dvArr[i])) {
                valid.push(ivArr[i]);
                validDV.push(dvArr[i]);
            }
        }
        const r = pearson(valid, validDV);
        return { variable: iv, correlation: r, importance: Math.abs(r), importancePct: 0 };
    });
    results.sort((a, b) => b.importance - a.importance);

    // Normalize importance to 0-100
    const maxImp = results[0]?.importance || 1;
    results.forEach((r) => { r.importancePct = (r.importance / maxImp) * 100; });
    return results;
}

// ─── Data QC helpers ───────────────────────────────────────────────
export function dataQC(data: DataRow[], variables: SavVariable[], valueLabels: ValueLabels): QCResult {
    const n = data.length;
    const issues: QCIssue[] = [];

    // Completeness
    for (const v of variables) {
        let missing = 0;
        for (const row of data) {
            if (row[v.name] == null || row[v.name] === "" || row[v.name] === " ") missing++;
        }
        if (missing > 0) {
            issues.push({
                type: "missing",
                severity: missing / n > 0.5 ? "high" : missing / n > 0.1 ? "medium" : "low",
                variable: v.name,
                label: v.label,
                count: missing,
                pct: ((missing / n) * 100).toFixed(1),
                message: `${missing} missing values (${((missing / n) * 100).toFixed(1)}%)`,
            });
        }
    }

    // Out of range (numeric vars with value labels — check if value not in label set)
    for (const v of variables) {
        if (v.type !== "numeric") continue;
        const vl = valueLabels[v.name];
        if (!vl || vl.length === 0) continue;
        const validValues = new Set(vl.map((l) => Number(l.value)));
        let outOfRange = 0;
        for (const row of data) {
            const val = row[v.name];
            if (val == null || val === "") continue;
            if (!validValues.has(Number(val)) && !isNaN(Number(val))) {
                // Check if it's a missing value
                if (v.missingValues?.includes(Number(val))) continue;
                outOfRange++;
            }
        }
        if (outOfRange > 0) {
            issues.push({
                type: "out_of_range",
                severity: outOfRange / n > 0.1 ? "high" : "medium",
                variable: v.name,
                label: v.label,
                count: outOfRange,
                pct: ((outOfRange / n) * 100).toFixed(1),
                message: `${outOfRange} values not in defined value labels`,
            });
        }
    }

    // Duplicate rows
    const seen = new Set();
    let dupes = 0;
    const dupeIndices = [];
    for (let i = 0; i < n; i++) {
        const key = JSON.stringify(data[i]);
        if (seen.has(key)) {
            dupes++;
            if (dupeIndices.length < 100) dupeIndices.push(i + 1);
        }
        seen.add(key);
    }
    if (dupes > 0) {
        issues.push({
            type: "duplicate",
            severity: dupes > 10 ? "high" : "medium",
            variable: "ALL",
            label: "",
            count: dupes,
            pct: ((dupes / n) * 100).toFixed(1),
            message: `${dupes} duplicate rows detected`,
            details: dupeIndices,
        });
    }

    // Low variance (numeric)
    for (const v of variables) {
        if (v.type !== "numeric") continue;
        const vals = data.map((r) => Number(r[v.name])).filter((x) => !isNaN(x));
        if (vals.length < 2) continue;
        const s = std(vals, 1);
        if (s === 0) {
            issues.push({
                type: "zero_variance",
                severity: "medium",
                variable: v.name,
                label: v.label,
                count: vals.length,
                message: `Constant value across all cases`,
            });
        }
    }

    // Summary stats
    const summary = {
        totalRows: n,
        totalVariables: variables.length,
        numericVars: variables.filter((v) => v.type === "numeric").length,
        stringVars: variables.filter((v) => v.type === "string").length,
        totalMissing: issues.filter((i) => i.type === "missing").reduce((s, i) => s + i.count, 0),
        duplicateRows: dupes,
        issueCount: issues.length,
    };

    return { issues, summary };
}

// ─── Data weighting ────────────────────────────────────────────────
/**
 * Apply a weight variable to data and return weighted dataset info.
 */
export function getWeightInfo(data: DataRow[], weightVar: string): WeightInfo {
    const weights = data.map((r) => {
        const w = Number(r[weightVar]);
        return isNaN(w) || w < 0 ? 1 : w;
    });
    const totalWeight = sum(weights);
    const effN = totalWeight ** 2 / sum(weights.map((w) => w * w));
    return { weights, totalWeight, effectiveSampleSize: effN, unweightedN: data.length };
}

/**
 * Weighted descriptive stats for a numeric variable.
 */
export function weightedDescriptives(data: DataRow[], varName: string, weights: number[]): WeightedDescriptives {
    const vals = [], ws = [];
    for (let i = 0; i < data.length; i++) {
        const v = Number(data[i][varName]);
        if (!isNaN(v)) { vals.push(v); ws.push(weights[i]); }
    }
    const wMean = weightedMean(vals, ws);
    const wSum = sum(ws);
    let wVar = 0;
    for (let i = 0; i < vals.length; i++) {
        wVar += ws[i] * (vals[i] - wMean) ** 2;
    }
    wVar = wSum > 0 ? wVar / wSum : 0;
    return {
        mean: wMean,
        variance: wVar,
        std: Math.sqrt(wVar),
        n: vals.length,
        weightedN: wSum,
    };
}

// ─── Statistical distribution helpers ──────────────────────────────
/** Chi‑square CDF via regularized incomplete gamma function */
function chiSquareCDF(x: number, k: number): number {
    if (x <= 0 || k <= 0) return 0;
    return lowerIncompleteGamma(k / 2, x / 2) / gamma(k / 2);
}

function lowerIncompleteGamma(a: number, x: number): number {
    // Series expansion
    let sum = 0, term = 1 / a;
    for (let n = 0; n < 200; n++) {
        sum += term;
        term *= x / (a + n + 1);
        if (Math.abs(term) < 1e-12) break;
    }
    return Math.pow(x, a) * Math.exp(-x) * sum;
}

function gamma(z: number): number {
    // Lanczos approximation
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    z -= 1;
    const g = 7;
    const c = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028,
        771.32342877765313, -176.61502916214059, 12.507343278686905,
        -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ];
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/** Inverse normal (quantile) function — rational approximation */
function normalInv(p: number): number {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p < 0.5) return -normalInv(1 - p);
    const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
    const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0, -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0];
    const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0, 3.754408661907416e0];

    const pLow = 0.02425, pHigh = 1 - pLow;
    let q, r;
    if (p < pLow) {
        q = Math.sqrt(-2 * Math.log(p));
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else if (p <= pHigh) {
        q = p - 0.5;
        r = q * q;
        return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
            (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    } else {
        q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
}
