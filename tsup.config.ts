import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: false, // Remove source maps to reduce size
  clean: true,
  target: 'es2021',
  treeshake: true,
  minify: true, // Enable minification
  splitting: false,
  external: ['better-auth', 'zod'], // Mark dependencies as external
});
