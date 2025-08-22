const { nodeResolve } = require('@rollup/plugin-node-resolve');

exports.default = {
    input: './build/bb/bb2html.mjs',
    output: {
        file: './build/static/bb.js',
        format: 'cjs'
    },
    plugins: [nodeResolve()]
};
