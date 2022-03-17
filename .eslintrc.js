module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'standard-react',
    'prettier',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:react-hooks/recommended',
  ],
  plugins: ['react', 'promise', 'import', 'prettier', 'simple-import-sort', '@typescript-eslint'],
  env: {
    browser: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
    ecmaFeatures: {
      legacyDecorators: true,
      jsx: true,
    },
  },
  settings: {
    react: {
      version: 'detect',
    },
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
    },
  },
  rules: {
    'simple-import-sort/imports': [
      'warn',
      {
        groups: [['react'], ['^@?\\w'], ['^'], ['^\\.'], ['^\\u0000']],
      },
    ],
    'simple-import-sort/exports': 'warn',

    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',

    // Using any is sometimes necessary, especially when exposing function to
    // the consumer. Disabling it globally to not have deal with it inline.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',

    // To prevent annoying feedback everytime you create a function and think
    // for a second, it is disabled globally. This does mean empty functions
    // can be created, but they are easily identified and removed anyway.
    '@typescript-eslint/no-empty-function': 'off',

    // Specifically enable this because it did not show up in the console
    // for some reason.
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

    // Misc
    'react/jsx-fragments': 1,
  },
};
