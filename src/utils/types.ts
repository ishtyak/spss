// ─── SPSS SAV Core Types ───────────────────────────────────────────

export interface SavVariable {
    name: string;
    label: string;
    type: "numeric" | "string";
    width: number;
    printFormat: number;
    writeFormat: number;
    missingValues: number[];
    measure: "nominal" | "ordinal" | "scale" | "";
    columnWidth: number;
    alignment: "left" | "right" | "center" | "";
}

export interface ValueLabelEntry {
    value: number;
    label: string;
}

export type ValueLabels = Record<string, ValueLabelEntry[]>;

export type DataRow = Record<string, string | number | null>;

export interface SavHeader {
    product: string;
    nominalCaseSize: number;
    nCases: number;
    created: string;
    time: string;
    fileLabel: string;
    encoding: string;
}

export interface SavParseResult {
    header: SavHeader;
    variables: SavVariable[];
    valueLabels: ValueLabels;
    data: DataRow[];
}

// ─── Statistical Utility Types ─────────────────────────────────────

export interface ContingencyTable {
    rowKeys: string[];
    colKeys: string[];
    observed: number[][];
    rowTotals: number[];
    colTotals: number[];
    grandTotal: number;
}

export interface ChiSquareResult {
    chiSquare: number;
    df: number;
    pValue: number;
    expected: number[][];
}

export interface CorrelationMatrixResult {
    varNames: string[];
    matrix: number[][];
}

export interface PCAResult {
    eigenvalues: number[];
    eigenvectors: number[][];
    varianceExplained: number[];
    varNames: string[];
}

// ─── Data QC Types ─────────────────────────────────────────────────

export interface QCIssue {
    type: "missing" | "out_of_range" | "duplicate" | "zero_variance";
    severity: "high" | "medium" | "low";
    variable: string;
    label: string;
    count: number;
    pct?: string;
    message: string;
    details?: number[];
}

export interface QCSummary {
    totalRows: number;
    totalVariables: number;
    numericVars: number;
    stringVars: number;
    totalMissing: number;
    duplicateRows: number;
    issueCount: number;
}

export interface QCResult {
    issues: QCIssue[];
    summary: QCSummary;
}

// ─── TURF / Driver Analysis Types ─────────────────────────────────

export interface TurfCombo {
    items: string[];
    reach: number;
    reachPct: number;
}

export interface TurfGroup {
    comboSize: number;
    top: TurfCombo[];
}

export interface DriverResult {
    variable: string;
    correlation: number;
    importance: number;
    importancePct?: number;
}

// ─── Weighting Types ───────────────────────────────────────────────

export interface WeightInfo {
    weights: number[];
    totalWeight: number;
    effectiveSampleSize: number;
    unweightedN: number;
}

export interface WeightedDescriptives {
    mean: number;
    variance: number;
    std: number;
    n: number;
    weightedN: number;
}
