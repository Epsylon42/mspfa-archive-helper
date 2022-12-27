import * as path from 'path';

import { fs, glob } from 'zx';

import { fetchFile, FetchResult } from './fetch.mjs'
import { archiveStoryImages, archiveMiscImages } from './archiveStoryImages.mjs';
import { archiveStoryCss, applyCssScopeToFile, archiveCssString } from './archiveCss.mjs'
import { archiveHtmlElements } from './archiveHtmlElements.mjs';

export const mspfaUrl = 'https://mspfa.com'
export const assetsDir = 'archive/assets';
export let storyId = '0';
export let story: any = null;

export function toAssetUrl(s: FetchResult): string {
    return s.path.replace(assetsDir, `assets://${story.urlTitle}`);
}

//////////////////////////////////////////////////////////////////////////////

function extractArg(i: number) {
    const zeroArgIndex = process.argv.findIndex(arg => arg.includes('index.mjs'));
    if (zeroArgIndex == -1) {
        throw new Error('Something went wrong. Could not read command line arguments');
    }

    return process.argv[zeroArgIndex + i];
}

async function generateIndex() {
    console.log('generating asset index');

    const index = (await glob(`${assetsDir}/**`))
        .map(asset => asset.replace(`${assetsDir}/`, ''))
        .join('\n');

    await fs.writeFile(`${assetsDir}/index`, index);
}

async function generateTitleFile() {
    const content = `
    exports.title = ${JSON.stringify(story.n)};
    exports.urlTitle = ${JSON.stringify(story.urlTitle)};
    `;

    await fs.writeFile('archive/title.js', content);
}

async function run() {
    storyId = extractArg(1);
    if (storyId == null) {
        throw new Error('Provide a story id');
    }

    story = await fetchFile(mspfaUrl, 'tmp/story.json', {
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

    story = await fs.readJson(story.path);
    storyId = String(story.i);
    story.urlTitle = story.n.toLowerCase().replace(/ /g, '-').replace(/[^a-zA-Z0-9_-]/g, '');

    await fs.mkdir(assetsDir, { recursive: true });

    await archiveStoryImages();
    await archiveMiscImages();
    await archiveStoryCss(story);
    await archiveHtmlElements();

    await fs.writeFile('archive/story.json', JSON.stringify(story, null, '  '));

    console.log('copying static resources');

    for (const staticFile of await glob('static/**/*')) {
        await fs.copy(
            staticFile,
            path.join('archive/', path.relative('static', staticFile)),
            { recursive: true }
        );
    }
    await applyCssScopeToFile('archive/assets/mspfa.css');
    await generateIndex();
    await generateTitleFile();

    await fs.copy('src/bb', 'archive/bb', { recursive: true });
}

run();
