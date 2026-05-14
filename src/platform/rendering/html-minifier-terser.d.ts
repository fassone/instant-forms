declare module "html-minifier-terser" {
  export type MinifyOptions = {
    collapseBooleanAttributes?: boolean;
    collapseWhitespace?: boolean;
    decodeEntities?: boolean;
    minifyCSS?: boolean | Record<string, unknown>;
    minifyJS?: boolean | Record<string, unknown>;
    removeAttributeQuotes?: boolean;
    removeComments?: boolean;
    removeEmptyAttributes?: boolean;
    removeOptionalTags?: boolean;
    removeRedundantAttributes?: boolean;
    sortAttributes?: boolean;
    sortClassName?: boolean;
  };

  export function minify(value: string, options?: MinifyOptions): Promise<string>;
}
