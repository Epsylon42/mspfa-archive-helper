import { parse as parseHtml, HTMLElement } from 'node-html-parser'

import { toAssetUrl, story, assetsDir, mspfaUrl } from './index.mjs';
import { fetchFile, fetchYtDlp, determineYtDownloader } from './fetch.mjs';
import { archiveCssString } from './archiveCss.mjs'

export async function archiveHtmlElements() {
    console.log('fixing html');

    if ((await determineYtDownloader()) == null) {
        console.error('YouTube downloader not found - YouTube videos, if any, will be skipped');
    }

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
                    assetUrl = toAssetUrl(await fetchYtDlp(src, `${assetsDir}/videos/${page}${indexStr}`));
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
                try {
                    assetUrl = toAssetUrl(await fetchFile(src, `${assetsDir}/otherres/`, { fallbackName: String(otherResIndex) }));
                    el.setAttribute('src', assetUrl);
                } catch (e) {
                    console.error(e);
                }
                otherResIndex += 1;
            }
        }

        for (const el of html.querySelectorAll('[style]')) {
            let style = el.getAttribute('style') as string;
            style = await archiveCssString(style, { context: 'declarationList' });
            el.setAttribute('style', style);
        }

        story.p[page].b = html.toString();
    }
}
