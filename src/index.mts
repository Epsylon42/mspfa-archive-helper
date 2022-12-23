import * as path from 'path';

import { fs, glob } from 'zx';

import { parse as parseHtml, HTMLElement } from 'node-html-parser'

import { fetchFile, fetchYtDlp } from './fetch.mjs'
import { fixStoryCss, applyCssScopeToFile, fixCssString } from './fixCss.mjs'
const bb = require('./bb/bbparser');

export const mspfaUrl = 'https://mspfa.com'
export const assetsDir = 'archive/assets';
export let storyId = '0';

//////////////////////////////////////////////////////////////////////////////

function extractArg(i: number) {
    const zeroArgIndex = process.argv.findIndex(arg => arg.includes('index.mjs'));
    if (zeroArgIndex == -1) {
        throw new Error('Something went wrong. Could not read command line arguments');
    }

    return process.argv[zeroArgIndex + i];
}

async function run() {
    storyId = extractArg(1);
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
    storyId = String(story.i);

    async function fixImages() {
        console.log('downloding images');

        for (let page = 0; page < story.p.length; page += 1) {
            const tokens = bb.parseAll(story.p[page].b, ['img']);
            let imageIndex = 0;
            for (const token of tokens) {
                if (bb.isBB(token)) {
                    const indexStr = imageIndex == 0 ? '' : `_${imageIndex}`;
                    const url = bb.reconstruct(token.content);
                    const assetUrl = (await fetchFile(url, `${assetsDir}/images/${page + 1}${indexStr}`))
                        .replace(assetsDir, '@@ASSETS@@');
                    token.content = [assetUrl];
                    imageIndex += 1;
                }
            }

            story.p[page].b = bb.reconstruct(tokens);
        }
    }

    async function fixHtml() {
        console.log('fixing html');

        let otherResIndex = 0;
        for (let page = 0; page < story.p.length; page += 1) {
            const html = parseHtml(story.p[page].b);
            let videoIndex = 0;

            for (const el of html.querySelectorAll('[src]')) {
                const src = new URL(el.getAttribute('src') as string, mspfaUrl);

                let assetUrl;
                if (el.tagName == 'IFRAME') {
                    if (src.hostname.includes('youtube.com') || src.hostname.includes('youtu.be')) {
                        const indexStr = videoIndex == 0 ? '' : `_${videoIndex}`;
                        assetUrl = (await fetchYtDlp(src, `${assetsDir}/videos/${page}${indexStr}`))
                            .replace(assetsDir, '@@ASSETS@@');
                        videoIndex += 1;

                        const newEl = new HTMLElement('video', {}, '', null, [0, 0]);
                        newEl.classList.add('major');
                        newEl.setAttribute('src', assetUrl);
                        newEl.setAttribute('controls', 'controls');
                        newEl.setAttribute('controlslist', 'nodownload');
                        newEl.setAttribute('disablepictureinpicture', '');
                        for (const attrKey of ['width', 'height']) {
                            const attr = el.getAttribute(attrKey);
                            if (attr != null) {
                                newEl.setAttribute(attrKey, attr);
                            }
                        }
                        el.replaceWith(newEl);
                    } else {
                        console.error(`Found iframe that is not a youtube video on page ${page}. Mirroring them is not supported`);
                        continue;
                    }
                } else {
                    assetUrl = (await fetchFile(src, `${assetsDir}/otherres/`, { fallbackName: String(otherResIndex) }))
                        .replace(assetsDir, '@@ASSETS@@');
                    otherResIndex += 1;
                    el.setAttribute('src', assetUrl);
                }
            }

            for (const el of html.querySelectorAll('[style]')) {
                let style = el.getAttribute('style') as string;
                style = await fixCssString(style, { context: 'declarationList' });
                el.setAttribute('style', style);
            }

            story.p[page].b = html.toString();
        }
    }

    async function fixOtherLinks() {
        console.log('downloading other resources');

        const keys = ["o", "x"];
        for (let i = 0; i < keys.length; i++) {
            const assetUrl = (await fetchFile(story[keys[i]], `${assetsDir}/res/`, { fallbackName: String(i) }))
                .replace(assetsDir, '@@ASSETS@@');
            story[keys[i]] = assetUrl;
        }
    }

    async function generateIndex() {
        console.log('generating asset index');

        const index = (await glob(`${assetsDir}/**`))
            .map(asset => asset.replace(`${assetsDir}/`, ''))
            .join('\n');

        await fs.writeFile(`${assetsDir}/index`, index);
    }

    await fixImages();
    await fixStoryCss(story);
    await fixOtherLinks();
    await fixHtml();

    await fs.mkdir(assetsDir, { recursive: true });
    await generateIndex();

    await fs.writeFile('archive/story.json', JSON.stringify(story, null, '  '));

    for (const staticFile of await glob('static/**/*')) {
        await fs.copy(
            staticFile,
            path.join('archive/', path.relative('static', staticFile)),
            { recursive: true }
        );
    }
    await applyCssScopeToFile('archive/assets/mspfa.css');

    await fs.copy('src/bb', 'archive/bb', { recursive: true });
}

run();
