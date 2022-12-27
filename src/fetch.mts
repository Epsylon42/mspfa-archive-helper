import * as path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';

import { glob, fs, $ } from 'zx';
import mimedb from 'mime-db';

export interface FetchResult {
    path: string;
    downloaded: boolean;
}

export async function fetchFile(
    url: string | URL,
    savePathHint: string,
    args: { mode?: 'sync' | 'overwrite', fetchArg?: RequestInit, fallbackName?: string, stub?: boolean } = {}
): Promise<FetchResult> {
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
            return { path: globCheckExisting[0], downloaded: false };
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
        return { path: savePath, downloaded: false };
    }

    if (args.stub) {
        console.log(`${savePath}: DOWNLOAD STUB`);
        return { path: savePath, downloaded: false };
    }

    await fs.mkdir(path.dirname(savePath), { recursive: true });
    const response = await fetch(url.href, args.fetchArg);

    if (determineExt) {
        let ext;
        const contentType = response.headers.get('content-type');
        if (contentType != null && mimedb[contentType] != null) {
            ext = (mimedb[contentType].extensions || [null])[0];
        }
        if (ext != null) {
            savePath += '.' + ext;
        }

        if (mode != 'overwrite' && await fs.pathExists(savePath)) {
            console.log(`${savePath}: file exists - skipping download`);
            response.body?.cancel();
            return { path: savePath, downloaded: false };
        }
    }

    console.log(`downloading ${savePath}`);

    await (promisify(pipeline)(response.body as any, createWriteStream(savePath)));
    return { path: savePath, downloaded: true };
}

export async function determineYtDownloader(): Promise<'yt-dlp' | 'youtube-dl' | null> {
    if ((await $`which yt-dlp`).exitCode == 0) {
        return 'yt-dlp';
    } else if ((await $`which youtube-dl`).exitCode == 0) {
        return 'youtube-dl';
    } else {
        return null;
    }
}

export async function fetchYtDlp(url: URL, savePath: string): Promise<FetchResult> {
    const downloader = await determineYtDownloader();
    if (downloader == null) {
        return { path: url.href, downloaded: false };
    }

    let candidates = await glob(`${savePath}.*`);
    if (candidates.length == 1) {
        console.log(`${savePath}: file exists - skipping download`);
        return { path: candidates[0], downloaded: false };
    } else if (candidates.length > 1) {
        throw new Error('This should not happen'); // TODO: better error message
    }

    await fs.mkdir(path.dirname(savePath), { recursive: true });
    await $`${downloader} ${url.href} -o ${savePath + '.%(ext)s'}`;

    candidates = await glob(`${savePath}.*`);
    if (candidates.length == 1) {
        return { path: candidates[0], downloaded: true };
    } else if (candidates.length > 1) {
        throw new Error('This should not happen');
    } else {
        throw new Error('Could not download');
    }
}
