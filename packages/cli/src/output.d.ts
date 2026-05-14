export declare function success(line: string): void;
export declare function error(line: string, hint?: string): void;
export declare function list(label: string, items: readonly string[]): void;
export interface Spinner {
  update(text: string): void;
  stop(success: boolean, finalMsg?: string): void;
}
export declare function createSpinner(initialText: string): Spinner;
export interface ProgressBar {
  update(current: number, total: number, text?: string): void;
  stop(success: boolean, finalMsg?: string): void;
}
export declare function createProgressBar(initialText: string): ProgressBar;
export declare function table(headers: string[], rows: string[][]): void;
export declare function info(line: string): void;
//# sourceMappingURL=output.d.ts.map
