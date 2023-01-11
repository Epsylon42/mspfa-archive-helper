import { argv, assetsDir, story, mspfaUrl } from './index.mjs';

import * as path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';

import { $, glob, fs, fetch } from 'zx';
import mimedb from 'mime-db';

export interface FetchResult {
    /// Original url string passed as an argument to fetchFile/fetchYtDlp
    originalUrl: string,

    /// Path to the downloaded file. If none, it means that fetch has failed
    path?: string;

    /// Whether a file was downloaded. False means either download failure or that the requested file is already downloaded
    downloaded: boolean;

    /// If true, stopAfterErrors counter will not be incremented
    ignoreError?: boolean;
}

///
/// Downloads from an url into a file.
/// This function is an error handling wrapper for fetchInternal, which will retry several times in case of an error.
/// See fetchInternal for further docs
///
export async function fetchFile(
    url: string | URL,
    savePathHint: string,
    args: { mode?: 'keep' | 'overwrite', fetchArg?: RequestInit, fallbackName?: string } = {}
): Promise<FetchResult> {
    if (!(url instanceof URL)) {
        url = new URL(url, mspfaUrl); // FIXME: `mspfaUrl` might be incorrect in some situations. fetchFile should accept default domain name as an argument
    }

    let i = 0;
    while (true) {
        try {
            i += 1;
            return {
                originalUrl: url.href,
                ...await fetchInternal(url, savePathHint, args)
            };
        } catch (e: any) {
            // Check for 4XX http code.
            // That means client error so we probably won't get anywhere by repeating the same request
            if ('httpcode' in e && Math.floor(e.httpcode / 100) == 4) {
                console.error(`Server returned a ${e.httpcode} code - will not retry`)
                return { originalUrl: url.href, downloaded: false };
            }

            if (i <= argv.fetchRetries) {
                console.log(`${e} - retrying ${i}`);
            } else {
                console.error('failed to download');
                return { originalUrl: url.href, downloaded: false };
            }
        }
    }
}

///
/// This horrifying thing downloads data from an url into a file.
///
/// savePathHint: Hints where the file should be saved
///     * If it is a file path with an extension, file will be saved exactly there.
///     * If it is a file path without an extension, extension will be determined automatically
///       (from url or from mime type)
///     * If it ends with a slash, it will be treated as a directory path. File name will be determined from url.
///       If the file name cannot be determined, args.fallbackName will be used
///
/// args.mode:
///     * keep - if a file already exists, will skip downloading and return its path instead
///     * overwrite - will download no matter what
///
/// args.fetchArg: Will be passed directly to fetch. Request method and such
///
/// args.fallbackName: Fallback name for the file in case its name cannot be determined. See savePathHint
///
/// All spaces in paths will be replaced with underscores because spaces cause *problems*
///
async function fetchInternal(
    url: URL,
    savePathHint: string,
    args: { mode?: 'keep' | 'overwrite', fetchArg?: RequestInit, fallbackName?: string } = {}
): Promise<{ path: string, downloaded: boolean }> {
    const mode = args.mode || 'keep';

    let savePath: string;
    if (!savePathHint.endsWith('/')) {
        savePath = savePathHint;
    } else if (!url.pathname.endsWith('/')){
        savePath = path.join(savePathHint, decodeURIComponent(url.pathname));
    } else if (args.fallbackName != null) {
        savePath = path.join(savePathHint, args.fallbackName);
    } else {
        throw new Error(`Could not determine name for ${url.href}`);
    }

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

    const globCheckExisting = await glob(`${savePath}.*`);
    // globCheckExisting.length is to account for `*.css.orig` files
    // this might break something and then we'll need a real solution
    if (mode != 'overwrite' && (globCheckExisting.length == 1 || globCheckExisting.length == 2)) {
        console.log(`${globCheckExisting[0]}: file exists - skipping download`)
        return { path: globCheckExisting[0], downloaded: false };
    }

    let determineExt = path.extname(savePath) == '';

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

    await fs.mkdir(path.dirname(savePath), { recursive: true });
    const response = await fetch(url.href, args.fetchArg as any);
    if (!response.ok) {
        const e: any = new Error();
        e.httpcode = response.status;
        throw e;
    }

    if (determineExt) {
        let ext;
        const contentType = response.headers.get('content-type');
        if (contentType != null && mimedb[contentType.split(';')[0]] != null) {
            ext = (mimedb[contentType.split(';')[0]].extensions || [null])[0];
        }
        if (ext != null) {
            savePath += '.' + ext;
        }

        if (mode != 'overwrite' && await fs.pathExists(savePath)) {
            console.log(`${savePath}: file exists - skipping download`);
            return { path: savePath, downloaded: false };
        }
    }

    console.log(`downloading ${savePath}`);

    await (promisify(pipeline)(response.body as any, createWriteStream(savePath)));
    return { path: savePath, downloaded: true };
}

///
/// Similar to fetchFile, but for YouTube videos.
/// It's not required to be as versatile so it's simpler. savePath is assumed to be just a page number or a page number with a video index in case there's multiple on a single page
///
export async function fetchYtDlp(url: URL, savePath: string): Promise<FetchResult> {
    const originalUrl = url.href;

    const downloader = await determineYtDownloader();
    if (downloader == null) {
        return { originalUrl, downloaded: false, ignoreError: true };
    }

    let candidates = await glob(`${savePath}.*`);
    if (candidates.length == 1) {
        console.log(`${savePath}: file exists - skipping download`);
        return { originalUrl, path: candidates[0], downloaded: false };
    } else if (candidates.length > 1) {
        throw new Error('This should not happen'); // TODO: better error message
    }

    await fs.mkdir(path.dirname(savePath), { recursive: true });
    await $`${downloader} ${url.href} -o ${savePath + '.%(ext)s'}`;

    candidates = await glob(`${savePath}.*`);
    if (candidates.length == 1) {
        return { originalUrl, path: candidates[0], downloaded: true };
    } else if (candidates.length > 1) {
        throw new Error('This should not happen');
    } else {
        return { originalUrl, downloaded: false }
    }
}

type YtDownloader = 'yt-dlp' | 'youtube-dl' | string | null | undefined;
let ytDownloader: YtDownloader;
export async function determineYtDownloader(): Promise<YtDownloader> {
    if (argv.youtubeDownloader != null) {
        return argv.youtubeDownloader;
    }

    if (ytDownloader === undefined) {
        console.log('checking whether a YouTube downloader is present');
        if ((await $`which yt-dlp`).exitCode == 0) {
            ytDownloader = 'yt-dlp';
        } else if ((await $`which youtube-dl`).exitCode == 0) {
            ytDownloader = 'youtube-dl';
        } else {
            console.log('YouTube downloader not found - videos will not be archived')
            ytDownloader = null;
        }
    }

    return ytDownloader;
}

///
/// Converts fetch result into an asset url for the UHC.
/// Also does error counting
///
let fetchErrors = 0;
export function toAssetUrl(s: FetchResult): string {
    if (s.path != null) {
        return s.path.replace(assetsDir, `assets://${story.urlTitle}`);
    } else {
        if (!s.ignoreError) {
            fetchErrors += 1;
        }

        if (argv.stopAfterErrors == 0 || fetchErrors < argv.stopAfterErrors) {
            return s.originalUrl;
        } else {
            console.error('download error limit exceeded - stopping');
            process.exit(1);
        }
    }
}
