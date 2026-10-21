const { createTransformer } = require('ts-jest').default;

const transformer = createTransformer({
  diagnostics: false,
  tsconfig: {
    target: 'ES2022',
    module: 'commonjs',
    moduleResolution: 'node',
    jsx: 'react-jsx',
    strict: true,
    esModuleInterop: true,
    isolatedModules: true,
    skipLibCheck: true,
    resolveJsonModule: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    noImplicitOverride: true,
    noFallthroughCasesInSwitch: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
    types: ['jest', 'node'],
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  },
});

function rewriteImportMeta(source) {
  return source.replace(/import\.meta\.env/g, 'globalThis.__IMPORT_META_ENV__');
}

module.exports = {
  process(source, filename, config, options) {
    return transformer.process(rewriteImportMeta(source), filename, config, options);
  },
  getCacheKey(source, filename, config, options) {
    return transformer.getCacheKey(rewriteImportMeta(source), filename, config, options);
  },
};
