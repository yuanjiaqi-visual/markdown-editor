export interface OpenFileResult {
    path: string;
    content: string;
}
export interface SaveFileResult {
    path: string;
}
export interface SaveImageResult {
    /** Path as referenced from the Markdown document (relative when the document was saved). */
    ref: string;
    /** Absolute path on disk, used to build a display URL. */
    abs: string;
}
export declare const ASSET_SCHEME = "md-asset";
export declare function setCurrentFile(filePath: string | null): void;
/**
 * Serve local files to the renderer over a dedicated, allow-listed scheme.
 * This replaces the previous "webSecurity: false", which disabled the same-origin
 * policy for the whole window.
 */
export declare function registerAssetProtocol(): void;
export declare function registerFileHandlers(): void;
