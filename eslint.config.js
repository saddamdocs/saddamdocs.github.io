/**
 * ESLint configuration (PLAN 3, "Quality gates"; PLAN 10, "Comments and maintainability").
 *
 * Besides the TypeScript and Svelte rules, two rules carry the plan's comment requirements:
 * - `jsdoc/require-jsdoc` with `publicOnly`: every exported function, class, type, interface and
 *   constant has a doc comment;
 * - `tamandua/file-header`, defined below: every source file starts with a header comment (a block
 *   comment in TypeScript and JavaScript, an HTML comment in Svelte).
 *
 * Talks to: nothing; read by `npm run lint`.
 */

import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

/** PLAN 10: "Every source file starts with a header comment". */
const fileHeader = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require a header comment at the top of every source file' },
    messages: {
      missing:
        'Start the file with a header comment: what the module is for, what it owns, and what it talks to (PLAN 10).',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        const text = context.sourceCode.text.replace(/^#!.*\n/, '').trimStart();
        const svelteFile = context.filename.endsWith('.svelte');
        const ok = svelteFile ? text.startsWith('<!--') : text.startsWith('/*');
        if (!ok) context.report({ node, messageId: 'missing' });
      },
    };
  },
};

export default ts.config(
  {
    ignores: [
      'dist/',
      'dist-emulator/',
      'node_modules/',
      'test-results/',
      'playwright-report/',
      'coverage/',
      'docs/reference/',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommendedTypeChecked,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },
    plugins: {
      jsdoc,
      tamandua: { rules: { 'file-header': fileHeader } },
    },
    rules: {
      'tamandua/file-header': 'error',
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
          },
          contexts: [
            'TSInterfaceDeclaration',
            'TSTypeAliasDeclaration',
            'TSEnumDeclaration',
            'ExportNamedDeclaration > VariableDeclaration',
          ],
        },
      ],
      'jsdoc/check-param-names': 'error',
      'jsdoc/no-types': 'error',
      // PLAN 10: no `any` without a comment that justifies it (an eslint-disable line with a reason).
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // PLAN 10: no swallowed errors.
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
  {
    // Plain JavaScript config files are not part of a TypeScript project.
    files: ['**/*.js'],
    ...ts.configs.disableTypeChecked,
  },
);
