const globals = require('globals');

module.exports = [
    { ignores: ['node_modules/**', 'coverage/**', 'storage/**'] },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: { ...globals.node, ...globals.jest },
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
        },
    },
];
