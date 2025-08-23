import * as path from 'path';

import * as ytdlexec from 'youtube-dl-exec';

import { fs, glob } from 'zx';

import * as yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { fetchFile } from './fetch.mjs'
import { archiveStoryImages, archiveMiscImages } from './archiveStoryImages.mjs';
import { archiveStoryCss, applyCssScopeToFile } from './archiveCss.mjs'
import { archiveHtmlElements } from './archiveHtmlElements.mjs';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export const mspfaUrl = 'https://mspfa.com'
export let archiveDir: string;
export let assetsDir: string;
export let storyId: string;
export let story: any;

export let youtubedl = ytdlexec.default;

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
.option('updateStory', {
    alias: 'u',
    type: 'boolean',
    description: 'Download story.json even if it already exists. May be used to download new pages after a fanventure update',
    default: false
})
.option('jobs', {
    alias: 'j',
    type: 'number',
    description: 'Number of simultaneous download jobs. That many things will be downloaded simultaneously (currentry has effect only for story images)',
    default: 1,
})
.option('fetchRetries', {
    type: 'number',
    description: 'Number of times requests to a server will be retried in case of a failure. Has no effect on YouTube downloading',
    default: 3
})
.option('stopAfterErrors', {
    type: 'number',
    description: 'How many errors will cause the archiving process to stop. 0 means continue no matter what. Links that could not be downloaded will not be replaced, so the archive will not be completely offline.',
    default: 1
})
.option('ignoreErrors', {
    type: 'boolean',
    description: 'Same as --stopAfterErrors 0',
    default: false
})
.option('youtubeDownloader', {
    type: 'string',
    description: 'Name of a path to executable of a YouTube downloader (must be derived from youtube-dl). By default will use builtin from youtube-dl-exec'
})

export const argv = argvParser.parseSync();

//////////////////////////////////////////////////////////////////////////////

async function run() {
    // Determine story ID first
    let requestedStoryId: number | undefined = argv.story;
    
    // If no story specified, try to get it from existing archive
    if (!requestedStoryId) {
        const defaultPath = 'archive/story.json.orig';
        if (fs.pathExistsSync(defaultPath)) {
            requestedStoryId = Number((await fs.readJson(defaultPath)).i);
        } else {
            console.error('Specify a story id\n');
            argvParser.showHelp();
            process.exit(1);
        }
    }

    // Create temporary path based on the requested story ID
    let tempStoryPath = `temp_story_${requestedStoryId}.json.orig`;

    if (argv.ignoreErrors) {
        argv.stopAfterErrors = 0;
    }

    if (argv.youtubeDownloader != null) {
        youtubedl = ytdlexec.create(argv.youtubeDownloader) as any;
    }

    if (argv.updateStory && argv.story == null) {
        argv.story = requestedStoryId;
    }

    // Ensure we have a story ID
    if (!argv.story) {
        argv.story = requestedStoryId;
    }

    // Fetch story metadata to determine archive directory name
    story = await fetchFile(mspfaUrl, tempStoryPath, {
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

    // Generate sanitized story name for directory
    const sanitizedStoryName = story.n.replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '_').trim();
    archiveDir = sanitizedStoryName || `story_${storyId}`;
    assetsDir = `${archiveDir}/assets`;

    //
    // If the archive already exists, take url title from there, because a user might want to change it.
    // Otherwise, generate it from the story name
    //
    try {
        story.urlTitle = require(`../${archiveDir}/title.js`).urlTitle;
    } catch (e) {
        story.urlTitle = story.n.toLowerCase().replace(/ /g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
    }

    await fs.mkdir(assetsDir, { recursive: true });

    // Move temporary story file to final location and clean up temp file
    const finalStoryPath = `${archiveDir}/story.json.orig`;
    if (tempStoryPath !== finalStoryPath) {
        await fs.copy(tempStoryPath, finalStoryPath);
        await fs.remove(tempStoryPath).catch(() => {}); // Remove temp file
        
        // Also clean up old archive file if it exists and is different
        if (fs.pathExistsSync('archive/story.json.orig') && archiveDir !== 'archive') {
            console.log('Note: Old archive directory still exists. You may want to remove it manually.');
        }
    }

    await archiveStoryImages();
    await archiveMiscImages();
    await archiveStoryCss(story);
    await archiveHtmlElements();

    await fetchFile(`${mspfaUrl}/images/candyheart.png`, `${assetsDir}/candyheart.png`);

    await fs.writeFile(`${archiveDir}/story.json`, JSON.stringify(story, null, '  '));

    console.log('copying static resources');

    for (const staticFile of await glob('static/**/*')) {
        await fs.copy(
            staticFile,
            path.join(archiveDir, path.relative('static', staticFile)),
            { recursive: true }
        );
    }
    await applyCssScopeToFile(`${assetsDir}/mspfa.css`);
    await generateIndex();
    await generateTitleFile();

    await fs.copy('build/static/bb.js', `${archiveDir}/bb.js`);
}

///
/// Save all asset file paths to an index file,
/// which is used to generate asset routes when loading the archive into UHC. (see makeRoutes in static/mod.js)
/// This might not actually be necessary, but it's probably fine
///
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

    const titlePath = `${archiveDir}/title.js`;
    if (!await fs.pathExists(titlePath)) {
        await fs.writeFile(titlePath, content);
    } else {
        console.log('title file already exists - will not overwrite')
    }
}

run();
