import * as path from 'path';

import { fs, glob } from 'zx';

import * as yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { fetchFile, FetchResult } from './fetch.mjs'
import { archiveStoryImages, archiveMiscImages } from './archiveStoryImages.mjs';
import { archiveStoryCss, applyCssScopeToFile } from './archiveCss.mjs'
import { archiveHtmlElements } from './archiveHtmlElements.mjs';

export const mspfaUrl = 'https://mspfa.com'
export const assetsDir = 'archive/assets';
export let storyId: string = '0';
export let story: any = null;

export function toAssetUrl(s: FetchResult): string {
    return s.path.replace(assetsDir, `assets://${story.urlTitle}`);
}

function parseArgs(argv: string[]): yargs.Argv<{}> {
    return yargs.default(hideBin(argv));
}

const argvParser = parseArgs(process.argv)
.usage(`npm start -- --story <ID>
Note the double dash after 'start'`)
.option('story', {
    alias: 's',
    type: 'number',
    description: 'MSPFA story id. If not specified and story.json is already downloaded - will read story id from there',
})
.option('jobs', {
    alias: 'j',
    type: 'number',
    description: 'Number of simultaneous download jobs. That many things will be downloaded simultaneously (currentry has effect only for story images)',
    default: 4,
})
.option('updateStory', {
    type: 'boolean',
    description: 'Download story.json even if it already exists. May be used to download new pages after a fanventure update',
    default: false
})

export const argv = argvParser.parseSync();

//////////////////////////////////////////////////////////////////////////////

async function run() {
    if (!argv.story && !fs.pathExistsSync('archive/story.json.orig')) {
        console.error('Specify a story id\n');
        argvParser.showHelp();
        process.exit(1);
    }

    if (argv.updateStory && argv.story == null) {
        argv.story = Number((await fs.readJson('archive/story.json.orig')).i);
    }

    story = await fetchFile(mspfaUrl, 'archive/story.json.orig', {
        mode: argv.updateStory ? 'overwrite' : 'keep',
        fetchArg: {
            method: 'POST',
            body: (() => {
                const params = new URLSearchParams();
                params.set('do', 'story');
                params.set('s', String(argv.story));
                return params;
            })(),
        }
    });

    story = await fs.readJson(story.path);
    storyId = String(story.i);

    try {
        story.urlTitle = require('../archive/title.js').urlTitle;
    } catch (e) {
        story.urlTitle = story.n.toLowerCase().replace(/ /g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
    }


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

async function generateIndex() {
    console.log('generating asset index');

    const index = (await glob(`${assetsDir}/**`))
        .map(asset => asset.replace(`${assetsDir}/`, ''))
        .join('\n');

    await fs.writeFile(`${assetsDir}/index`, index);
}

async function generateTitleFile() {
    const content = `
    exports.title = ${JSON.stringify('MSPFA: ' + story.n)};
    exports.urlTitle = ${JSON.stringify(story.urlTitle)};
    `;

    if (!await fs.pathExists('archive/title.js')) {
        await fs.writeFile('archive/title.js', content);
    } else {
        console.log('title file already exists - will not overwrite')
    }
}

run();
