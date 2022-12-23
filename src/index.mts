import * as path from 'path';

import { fs, glob } from 'zx';

import { fetchFile } from './fetch.mjs'
const bb = require('./bb/bbparser');

//////////////////////////////////////////////////////////////////////////////

async function run() {
    const mspfaUrl = 'https://mspfa.com'
    console.log(process.argv)
    const storyId = process.argv[process.argv.indexOf('index.mjs') + 1];
    if (storyId == null) {
        throw new Error('Provide a story id');
    }

    let story: any = await fetchFile(mspfaUrl, 'tmp/story.json', {
        fetchArg: {
            method: 'POST',
            body: (() => {
                const params = new URLSearchParams();
                params.set('do', 'story');
                params.set('s', storyId);
                return params;
            })(),
        }
    });

    story = await fs.readJson(story);

    async function fixImages() {
        console.log('downloding images');

        for (let page = 0; page < story.p.length; page += 1) {
            const tokens = bb.parseAll(story.p[page].b, ['img']);
            let imageIndex = 0;
            for (const token of tokens) {
                if (bb.isBB(token)) {
                    const indexStr = imageIndex == 0 ? '' : `_${imageIndex}`;
                    const url = bb.reconstruct(token.content);
                    const assetUrl = (await fetchFile(url, `archive/assets/images/${page + 1}${indexStr}`))
                        .replace('archive/assets', '@@ASSETS@@');
                    token.content = [assetUrl];
                    imageIndex += 1;
                }
            }

            story.p[page].b = bb.reconstruct(tokens);
        }
    }

    async function fixCss() {
        console.log('downloading css resources');

        let css = story.y;
        const urls1 = (css.match(/url\([^"].*\)/g) || [])
            .map((url: string) => [url, url.substring('url('.length, url.length - ')'.length)]);
        const urls2 = (css.match(/url\("[^\)]*\)/g) || [])
            .map((url: string) => [url, url.substring('url("'.length, url.length - '")'.length)]);
        const urls = urls1.concat(urls2);

        for (let i = 0; i < urls.length; i++) {
            const [replacementString, urlString] = urls[i];
            const url = new URL(urlString, mspfaUrl);
            if (url.pathname.includes('FONT_URL')) {
                continue;
            }

            const assetUrl = (await fetchFile(url, 'archive/assets/cssres/', { fallbackName: String(i) }))
                .replace('archive/assets', '@@ASSETS@@');
            if (replacementString.startsWith('url("')) {
                css = css.replace(replacementString, `url("${assetUrl}")`);
            } else {
                css = css.replace(replacementString, `url(${assetUrl})`);
            }
        }

        story.y = css;
    }

    async function fixOtherLinks() {
        console.log('downloading other resources');

        const keys = ["o", "x"];
        for (let i = 0; i < keys.length; i++) {
            const assetUrl = (await fetchFile(story[keys[i]], 'archive/assets/res/', { fallbackName: String(i) }))
                .replace('archive/assets', '@@ASSETS@@');
            story[keys[i]] = assetUrl;
        }
    }

    async function generateIndex() {
        console.log('generating asset index');

        const index = (await glob('archive/assets/**'))
            .map(asset => asset.replace('archive/assets/', ''))
            .join('\n');

        await fs.writeFile('archive/assets/index', index);
    }

    await fixImages();
    await fixCss();
    await fixOtherLinks();

    await fs.mkdir('archive/assets', { recursive: true });
    await generateIndex();

    await fs.writeFile('archive/story.json', JSON.stringify(story, null, '  '));

    for (const staticFile of await glob('static/*')) {
        await fs.copy(
            staticFile,
            path.join('archive/', path.relative('static', staticFile)),
            { recursive: true }
        );
    }

    await fs.copy('src/bb', 'archive/bb', { recursive: true });
}

run();
