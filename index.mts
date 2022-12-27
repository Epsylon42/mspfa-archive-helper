import * as path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';

import { fs, glob } from 'zx';
import mimedb from 'mime-db';

import * as bb from './bb/bbparser'

const FETCH_STUB = false;

async function fetchFile(
    url: string | URL,
    savePathHint: string,
    args: { mode?: 'sync' | 'overwrite', fetchArg?: RequestInit, fallbackName?: string } = {}
): Promise<string> {
    const mode = args.mode || 'sync';

    if (!(url instanceof URL)) {
        url = new URL(url);
    }

    let savePath: string;
    if (!savePathHint.endsWith('/')) {
        savePath = savePathHint;
    } else if (!url.pathname.endsWith('/')){
        savePath = path.join(savePathHint, decodeURI(url.pathname));
    } else if (args.fallbackName != null) {
        savePath = path.join(savePathHint, args.fallbackName);

        const globCheckExisting = await glob(`${savePath}.*`);
        if (mode != 'overwrite' && globCheckExisting.length == 1) {
            console.log(`${globCheckExisting[0]}: file exists - skipping download`)
            return globCheckExisting[0];
        }
    } else {
        throw new Error(`Could not determine name for ${url.href}`);
    }
    let determineExt = path.extname(savePath) == '';

    //
    // WARNING: a reasonable person would not have two files with the only difference in their
    // names being spaces replaced with underscores. But in cases where a fanventure was written
    // by an unreasonable person, or one that has to deal with cursed problems that necessitate 
    // such namimg, this line should be removed or edited to replace spaces with something else.
    //
    // Note that currently The Unofficial Homestuck Collection does not seem to understand assets
    // with spaces in their paths
    //
    savePath = savePath.replace(/ /g, '_');

    if (determineExt) {
        const urlExt = path.extname(url.pathname);
        if (urlExt != '') {
            savePath += urlExt;
            determineExt = false;
        }
    }

    if (mode != 'overwrite' && !determineExt && await fs.pathExists(savePath)) {
        console.log(`${savePath}: file exists - skipping download`);
        return savePath;
    }

    if (FETCH_STUB) {
        console.log(`${savePath}: DOWNLOAD STUB`);
        return savePath;
    }

    await fs.mkdir(path.dirname(savePath), { recursive: true });
    const response = await fetch(url.href, args.fetchArg);

    if (determineExt) {
        const ext = mimedb[response.headers.get('content-type').split(';')[0]].extensions[0];
        if (ext != null) {
            savePath += '.' + ext;
        }

        if (mode != 'overwrite' && await fs.pathExists(savePath)) {
            console.log(`${savePath}: file exists - skipping download`);
            response.body.cancel();
            return savePath;
        }
    }

    console.log(`downloading ${savePath}`);

    await (promisify(pipeline)(response.body as any, createWriteStream(savePath)));
    return savePath;
}

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

    await fs.copy('bb', 'archive/bb', { recursive: true });
}

run();
