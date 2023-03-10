import * as bb from './bb/bbparser.mjs'
import { story, assetsDir } from './index.mjs';
import { fetchFile, toAssetUrl } from './fetch.mjs';
import { runJobs } from './utils.mjs';

///
/// Traverses the pages and downloads images
///
export async function archiveStoryImages() {
    console.log('downloding images');

    const process = async (page: number) => {
        let imageIndex = 0;
        for (const key of ['b', 'c']) {
            const tokens = bb.parseAll(story.p[page][key], ['img']);
            for (const token of tokens) {
                if (bb.isBB(token)) {
                    const indexStr = imageIndex == 0 ? '' : `_${imageIndex}`;
                    const url = bb.reconstruct(token.content);
                    try {
                        const assetUrl = toAssetUrl(await fetchFile(url, `${assetsDir}/images/${page + 1}${indexStr}`))
                        token.content = [assetUrl];
                    } catch (e) {
                        console.error(e);
                    }
                    imageIndex += 1;
                }
            }

            story.p[page][key] = bb.reconstruct(tokens);
        }
    }

    await runJobs(story.p.length, process);
}

///
/// Downloads fanventure preview and header/footer image
///
export async function archiveMiscImages() {
    console.log('downloading miscellaneous images');

    const keys = ["o", "x"];
    for (let i = 0; i < keys.length; i++) {
        if (story[keys[i]] != '') {
            try {
                const assetUrl = toAssetUrl(await fetchFile(story[keys[i]], `${assetsDir}/images/misc/`, { fallbackName: String(i) }));
                story[keys[i]] = assetUrl;
            } catch (e) {
                console.error(e);
            }
        }
    }
}
