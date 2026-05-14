import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier/recommended";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/out/**",
      "**/coverage/**",
      "**/*.d.ts",
      ".husky/_/**",
      "docs/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  prettierPlugin,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-expect-error": "allow-with-description",
          "ts-nocheck": true,
          "ts-check": false,
          minimumDescriptionLength: 10,
        },
      ],
      "no-throw-literal": "error",
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "no-undef": "error",
      "no-unreachable": "error",
      "no-const-assign": "error",
      "valid-typeof": "error",
      "constructor-super": "error",
      "no-this-before-super": "error",

      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/../*"],
              message:
                "Cross-package imports must use @bb/<package>; intra-package use src/* — never relative parent traversal.",
            },
          ],
        },
      ],

      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: "Read config via @bb/config (config.json), not process.env. There is no .env file in this project.",
        },
        {
          selector: "CallExpression[callee.name='require']",
          message: "ESM only — use static `import`, never require().",
        },
        {
          selector: "ImportExpression",
          message: "Dynamic import() forbidden — gate usage, not the import (Rule of Module Imports).",
        },
      ],
    },
  },

  {
    files: ["packages/config/**/*.{ts,tsx,js,mjs,cjs}"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },

  {
    files: ["scripts/**/*.{ts,tsx,js,mjs,cjs}"],
    rules: {
      "no-restricted-syntax": "off",
      "no-console": "off",
    },
  },

  {
    files: ["**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
];
