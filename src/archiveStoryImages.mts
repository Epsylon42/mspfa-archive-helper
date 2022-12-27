const bb = require('./bb/bbparser');
import { toAssetUrl, story, assetsDir } from './index.mjs';
import { fetchFile } from './fetch.mjs';

export async function archiveStoryImages() {
    console.log('downloding images');

    for (let page = 0; page < story.p.length; page += 1) {
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
}

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
