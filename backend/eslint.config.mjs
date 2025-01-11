import globals from "globals";
import pluginJs from "@eslint/js";

/** @type {import('eslint').Linter.Config[]} */
export default [
  // 1) Config principal (reglas, env, etc.)
  {
    languageOptions: {
      globals: globals.node,
    },
  },

  // 2) Extender las configs recomendadas de @eslint/js
  pluginJs.configs.recommended,

  // 3) Si quieres ignorar archivos/carpeta, añade otro objeto
  {
    ignores: [
      "node_modules",  // suele ignorarse por defecto, pero lo incluimos por si acaso
      "users.db",      // ejemplo
      "*.log",         // ejemplo, archivos log
    ],
  },
];

